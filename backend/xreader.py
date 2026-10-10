import asyncio
import html
import json
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from urllib.parse import unquote

import httpx

logger = logging.getLogger("xreader")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{1,15}$")
TAG_RE = re.compile(r"<[^>]+>")
URL_RE = re.compile(r"https?://\S+")
WS_RE = re.compile(r"\s+")


def normalize_handle(raw: str) -> str:
    h = (raw or "").strip()
    h = re.sub(r"^https?://(www\.)?(x|twitter)\.com/", "", h, flags=re.I)
    h = h.split("/")[0].split("?")[0]
    return h.lstrip("@").strip()


def is_valid_handle(h: str) -> bool:
    return bool(HANDLE_RE.match(h))


def clean_text(s: str) -> str:
    s = html.unescape(TAG_RE.sub(" ", s or ""))
    s = URL_RE.sub("", s)
    return WS_RE.sub(" ", s).strip()


_lock = asyncio.Lock()
_last = 0.0


async def polite():
    global _last
    async with _lock:
        wait = 1.0 - (time.monotonic() - _last)
        if wait > 0:
            await asyncio.sleep(wait)
        _last = time.monotonic()


def nitter_pic(url: str) -> str:
    if "/pic/" in url:
        raw = unquote(url.split("/pic/", 1)[1])
        if not raw.startswith("http"):
            raw = "https://" + raw
        return raw
    return url


def empty(handle: str, source=None) -> dict:
    return {"handle": handle, "name": handle, "bio": "", "avatar_url": None, "location": "",
            "followers": None, "posts": [], "source": source, "found": False, "protected": False}


async def from_nitter(client: httpx.AsyncClient, handle: str):
    base = os.environ["NITTER_BASE_URL"].rstrip("/")
    posts, meta, cursor = [], None, None
    for page in range(2):
        url = f"{base}/{handle}/rss" + (f"?cursor={cursor}" if cursor else "")
        await polite()
        r = await client.get(url)
        if r.status_code != 200:
            if page == 0:
                return None
            break
        root = ET.fromstring(r.content)
        ch = root.find("channel")
        if ch is None:
            return None
        if meta is None:
            title = ch.findtext("title") or ""
            name, _, cased = title.partition(" / @")
            desc = ch.findtext("description") or ""
            bio = desc.split("| Twitter feed for:")[0].strip() if "Twitter feed for:" in desc else ""
            img = ch.find("image/url")
            avatar = nitter_pic(img.text) if img is not None and img.text else None
            meta = {"name": name.strip() or handle, "bio": clean_text(bio), "avatar_url": avatar,
                    "handle": cased.strip() or handle}
        for item in ch.findall("item"):
            t = item.findtext("title") or ""
            if t.startswith("RT @") or t.startswith("R to @"):
                continue
            text = clean_text(item.findtext("description") or "")
            if not text or text.lower() in ("image", "video", "gif"):
                continue
            posts.append({"text": text[:500], "date": item.findtext("pubDate") or "", "pinned": t.startswith("Pinned:")})
        cursor = r.headers.get("min-id")
        if len(posts) >= 8 or not cursor:
            break
    if meta is None:
        return None
    return {**meta, "location": "", "followers": None, "posts": posts[:25], "source": "nitter",
            "found": True, "protected": False}


async def from_syndication(client: httpx.AsyncClient, handle: str):
    await polite()
    r = await client.get(f"https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}")
    if r.status_code != 200:
        return None
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', r.text, re.S)
    if not m:
        return None
    data = json.loads(m.group(1))
    entries = data["props"]["pageProps"]["timeline"]["entries"]
    posts, user = [], None
    for e in entries:
        tw = (e.get("content") or {}).get("tweet")
        if not tw:
            continue
        if user is None:
            user = tw.get("user") or {}
        if tw.get("retweeted_status") or tw.get("in_reply_to_screen_name"):
            continue
        text = clean_text(tw.get("full_text") or tw.get("text") or "")
        if text:
            posts.append({"text": text[:500], "date": tw.get("created_at", ""), "pinned": False})
    if user is None:
        return None
    av = (user.get("profile_image_url_https") or "").replace("_normal", "_400x400")
    return {"handle": user.get("screen_name") or handle, "name": user.get("name") or handle,
            "bio": clean_text(user.get("description", "")), "avatar_url": av or None,
            "location": user.get("location", ""), "followers": user.get("followers_count"),
            "posts": posts[:25], "source": "syndication", "found": True, "protected": False}


async def from_twitterapi(client: httpx.AsyncClient, handle: str):
    key = os.environ.get("TWITTERAPI_IO_KEY")
    if not key:
        return None
    headers = {"X-API-Key": key}
    r = await client.get("https://api.twitterapi.io/twitter/user/info", params={"userName": handle}, headers=headers)
    if r.status_code != 200:
        return None
    u = (r.json() or {}).get("data") or {}
    if not u.get("userName"):
        return None
    posts = []
    r2 = await client.get("https://api.twitterapi.io/twitter/user/last_tweets", params={"userName": handle}, headers=headers)
    if r2.status_code == 200:
        for tw in ((r2.json() or {}).get("data") or {}).get("tweets", []):
            if tw.get("isReply") or tw.get("retweeted_tweet"):
                continue
            text = clean_text(tw.get("text", ""))
            if text:
                posts.append({"text": text[:500], "date": tw.get("createdAt", ""), "pinned": False})
    av = (u.get("profilePicture") or "").replace("_normal", "_400x400")
    return {"handle": u["userName"], "name": u.get("name") or handle, "bio": clean_text(u.get("description", "")),
            "avatar_url": av or None, "location": u.get("location", ""), "followers": u.get("followers"),
            "posts": posts[:25], "source": "twitterapi", "found": True, "protected": False}


async def from_fxtwitter(client: httpx.AsyncClient, handle: str):
    await polite()
    r = await client.get(f"https://api.fxtwitter.com/{handle}")
    if r.status_code != 200:
        return None
    u = (r.json() or {}).get("user")
    if not u:
        return None
    if u.get("protected"):
        return {**empty(handle, "fxtwitter"), "protected": True}
    av = (u.get("avatar_url") or "").replace("_normal", "_400x400")
    return {"handle": u.get("screen_name") or handle, "name": u.get("name") or handle,
            "bio": clean_text(u.get("description", "")), "avatar_url": av or None,
            "location": u.get("location", ""), "followers": u.get("followers"), "posts": [],
            "source": "fxtwitter", "found": True, "protected": False}


SOURCES = (from_nitter, from_syndication, from_twitterapi, from_fxtwitter)


async def read_handle(handle: str) -> dict:
    async with httpx.AsyncClient(timeout=12, headers={"User-Agent": UA, "Accept": "*/*"}, follow_redirects=True) as client:
        for fn in SOURCES:
            try:
                res = await fn(client, handle)
            except Exception as e:
                logger.warning("%s failed for @%s: %s", fn.__name__, handle, e)
                res = None
            if res:
                logger.info("@%s read via %s (%d posts)", handle, res["source"], len(res["posts"]))
                return res
    return empty(handle)

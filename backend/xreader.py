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


X_API = "https://api.x.com"
X_BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
X_OP_USER = os.environ.get("X_GQL_USER_OP", "xc8f1g7BYqr6VTzTbvNlGw")
X_OP_TWEETS = os.environ.get("X_GQL_TWEETS_OP", "E3opETHurmVJflFsUBVuUQ")
X_FEATURES_USER = {
    "hidden_profile_subscriptions_enabled": True, "rweb_tipjar_consumption_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True, "verified_phone_label_enabled": False,
    "subscriptions_verification_info_is_identity_verified_enabled": True,
    "subscriptions_verification_info_verified_since_enabled": True, "highlights_tweets_tab_ui_enabled": True,
    "responsive_web_twitter_article_notes_tab_enabled": True, "subscriptions_feature_can_gift_premium": True,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
}
X_FEATURES_TWEETS = {
    "responsive_web_graphql_exclude_directive_enabled": True, "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True, "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "c9s_tweet_anatomy_moderator_badge_enabled": True, "tweetypie_unmention_optimization_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True, "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True, "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True, "tweet_awards_web_tipping_enabled": False,
    "freedom_of_speech_not_reach_fetch_enabled": True, "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "rweb_video_timestamps_enabled": True, "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": True, "responsive_web_media_download_video_enabled": False,
    "responsive_web_enhance_cards_enabled": False,
}
_guest = {"token": None, "ts": 0.0}


async def guest_token(client: httpx.AsyncClient, force: bool = False) -> str:
    if _guest["token"] and not force and time.monotonic() - _guest["ts"] < 2 * 3600:
        return _guest["token"]
    r = await client.post(f"{X_API}/1.1/guest/activate.json", headers={"Authorization": f"Bearer {X_BEARER}"}, timeout=8)
    r.raise_for_status()
    _guest.update(token=r.json()["guest_token"], ts=time.monotonic())
    return _guest["token"]


async def _gql(client: httpx.AsyncClient, token: str, op: str, name: str, variables: dict, features: dict):
    params = {"variables": json.dumps(variables, separators=(",", ":")),
              "features": json.dumps(features, separators=(",", ":"))}
    headers = {"Authorization": f"Bearer {X_BEARER}", "x-guest-token": token, "x-twitter-active-user": "yes",
               "x-twitter-client-language": "en", "Content-Type": "application/json"}
    return await client.get(f"{X_API}/graphql/{op}/{name}", params=params, headers=headers, timeout=10)


def _parse_timeline(data: dict, own_handle: str) -> list:
    instructions = ((((data.get("data") or {}).get("user") or {}).get("result") or {})
                    .get("timeline_v2") or {}).get("timeline", {}).get("instructions", [])
    entries = []
    for ins in instructions:
        if ins.get("type") == "TimelinePinEntry" and ins.get("entry"):
            entries.append((ins["entry"], True))
        for e in ins.get("entries") or []:
            entries.append((e, False))
    posts, own = [], own_handle.lower()
    for entry, pinned in entries:
        content = entry.get("content") or {}
        if content.get("entryType") == "TimelineTimelineItem":
            items = [content.get("itemContent") or {}]
        elif content.get("entryType") == "TimelineTimelineModule":
            items = [(x.get("item") or {}).get("itemContent") or {} for x in content.get("items") or []]
        else:
            continue
        for ic in items:
            tr = (ic.get("tweet_results") or {}).get("result") or {}
            if tr.get("__typename") == "TweetWithVisibilityResults":
                tr = tr.get("tweet") or {}
            leg = tr.get("legacy") or {}
            text = leg.get("full_text") or ""
            if not text or leg.get("retweeted_status_result") or text.startswith("RT @"):
                continue
            reply_to = (leg.get("in_reply_to_screen_name") or "").lower()
            if reply_to and reply_to != own:
                continue
            text = clean_text(text)
            if text:
                posts.append({"text": text[:500], "date": leg.get("created_at", ""), "pinned": pinned})
    return posts[:25]


async def from_xguest(client: httpx.AsyncClient, handle: str):
    token = await guest_token(client)
    variables = {"screen_name": handle, "withSafetyModeUserFields": True}
    r = await _gql(client, token, X_OP_USER, "UserByScreenName", variables, X_FEATURES_USER)
    if r.status_code in (401, 403, 429):
        token = await guest_token(client, force=True)
        r = await _gql(client, token, X_OP_USER, "UserByScreenName", variables, X_FEATURES_USER)
    if r.status_code != 200:
        logger.warning("x guest UserByScreenName HTTP %s for @%s", r.status_code, handle)
        return None
    result = (((r.json().get("data") or {}).get("user") or {}).get("result") or {})
    if not result or result.get("__typename") == "UserUnavailable" or not result.get("rest_id"):
        return None
    legacy, core = result.get("legacy") or {}, result.get("core") or {}
    name = core.get("name") or legacy.get("name") or handle
    screen = core.get("screen_name") or legacy.get("screen_name") or handle
    avatar = ((result.get("avatar") or {}).get("image_url") or legacy.get("profile_image_url_https") or "")
    base = {"handle": screen, "name": name, "bio": clean_text(legacy.get("description") or ""),
            "avatar_url": avatar.replace("_normal", "_400x400") or None,
            "location": (result.get("location") or {}).get("location") or legacy.get("location") or "",
            "followers": legacy.get("followers_count"), "posts": [], "source": "x", "found": True, "protected": False}
    if legacy.get("protected") or (result.get("privacy") or {}).get("protected"):
        return {**base, "found": False, "protected": True}
    tweets_vars = {"userId": result["rest_id"], "count": 40, "includePromotedContent": False,
                   "withQuickPromoteEligibilityTweetFields": False, "withVoice": True, "withV2Timeline": True}
    r2 = await _gql(client, token, X_OP_TWEETS, "UserTweets", tweets_vars, X_FEATURES_TWEETS)
    if r2.status_code == 200:
        base["posts"] = _parse_timeline(r2.json(), screen)
    else:
        logger.warning("x guest UserTweets HTTP %s for @%s (profile only)", r2.status_code, handle)
    return base


def nitter_instances() -> list:
    raw = os.environ.get("NITTER_INSTANCES") or os.environ["NITTER_BASE_URL"]
    return [u.strip().rstrip("/") for u in raw.split(",") if u.strip()]


def looks_blocked(r: httpx.Response) -> bool:
    if r.headers.get("cf-mitigated") == "challenge" or r.status_code in (403, 429, 451, 503):
        return True
    head = r.content[:400].lower()
    return b"<html" in head or b"<!doctype" in head


async def _nitter_pages(client: httpx.AsyncClient, base: str, handle: str):
    posts, meta, cursor = [], None, None
    for page in range(2):
        url = f"{base}/{handle}/rss" + (f"?cursor={cursor}" if cursor else "")
        await polite()
        r = await client.get(url, timeout=8)
        if r.status_code == 404 and page == 0:
            return "missing"
        if r.status_code != 200 or looks_blocked(r):
            if page == 0:
                logger.warning("nitter %s blocked/unavailable for @%s (HTTP %s)", base, handle, r.status_code)
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


async def from_nitter(client: httpx.AsyncClient, handle: str):
    for base in nitter_instances():
        try:
            res = await _nitter_pages(client, base, handle)
        except Exception as e:
            logger.warning("nitter %s failed for @%s: %s", base, handle, e)
            continue
        if res == "missing":
            return None
        if res:
            return res
    return None


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


SOURCES = (from_xguest, from_nitter, from_syndication, from_twitterapi, from_fxtwitter)


async def read_handle(handle: str) -> dict:
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": UA, "Accept": "*/*"}, follow_redirects=True) as client:
        for fn in SOURCES:
            try:
                res = await asyncio.wait_for(fn(client, handle), timeout=30)
            except Exception as e:
                logger.warning("%s failed for @%s: %s", fn.__name__, handle, e)
                res = None
            if res:
                if res.get("protected"):
                    logger.info("@%s is protected (via %s)", handle, res["source"])
                    return res
                logger.info("@%s read via %s (%d posts)", handle, res["source"], len(res["posts"]))
                return res
    logger.warning("@%s: every source failed or blocked", handle)
    return empty(handle)

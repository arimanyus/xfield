import asyncio
import html
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import storage  # noqa: E402
from generator import extract_labels, render_card_for_episode, write_episode  # noqa: E402
from predictions import CATEGORIES, PREDICTIONS  # noqa: E402
from safety import contains_blocked  # noqa: E402
from xreader import is_valid_handle, normalize_handle, read_handle  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
MEDIA_DIR = ROOT_DIR / "media"
MEDIA_DIR.mkdir(exist_ok=True)
EPISODES_PER_HOUR = int(os.environ["EPISODES_PER_HOUR"])
BOT_RE = re.compile(r"twitterbot|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|googlebot|"
                    r"bingbot|embedly|pinterest|redditbot|applebot|skypeuripreview|vkshare|iframely|quora link preview", re.I)

app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def public_base(request: Request) -> str:
    env = os.environ.get("PUBLIC_BASE_URL")
    if env:
        return env.rstrip("/")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    proto = "http" if host.startswith(("localhost", "127.")) else "https"
    return f"{proto}://{host}"


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


class ReadRequest(BaseModel):
    handle: str = Field(min_length=1, max_length=120)


class Labels(BaseModel):
    role: str = Field(min_length=1, max_length=40)
    vibe: str = Field(min_length=1, max_length=40)
    obsession: str = Field(min_length=1, max_length=40)


class CreateEpisodeRequest(BaseModel):
    handle: str = Field(min_length=1, max_length=120)
    found_by: Optional[str] = Field(default=None, max_length=120)
    spice: Literal["roast", "savage"] = "roast"
    labels: Labels
    posts_text: Optional[str] = Field(default=None, max_length=3000)


class ShareRequest(BaseModel):
    channel: str = Field(default="x", max_length=20)


class ReportRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=300)


def clean_handle(raw: str) -> str:
    h = normalize_handle(raw)
    if not is_valid_handle(h):
        raise HTTPException(400, "That doesn't look like an X handle (letters, numbers, underscore, max 15).")
    if contains_blocked(h):
        raise HTTPException(400, "That handle can't be used here.")
    return h


async def get_profile(handle: str, cache_only: bool = False) -> dict:
    key = handle.lower()
    doc = await db.profiles.find_one({"handle_lower": key}, {"_id": 0})
    if doc:
        if cache_only:
            return doc["data"]
        age = datetime.now(timezone.utc) - datetime.fromisoformat(doc["fetched_at"])
        ttl = timedelta(days=7) if doc["data"].get("found") else timedelta(hours=1)
        if age < ttl:
            return doc["data"]
    try:
        data = await asyncio.wait_for(read_handle(handle), timeout=55)
    except Exception as e:
        logger.warning("read_handle timed out/failed for @%s: %s", handle, e)
        from xreader import empty
        data = empty(handle)
    if data["found"] or not doc:
        await db.profiles.update_one({"handle_lower": key},
                                     {"$set": {"handle_lower": key, "data": data, "fetched_at": now_iso()}}, upsert=True)
        return data
    return doc["data"]


def ep_public(doc: dict, base: str) -> dict:
    text_status = doc.get("text_status", "ready")
    return {
        "id": doc["id"], "handle": doc["handle"], "display_name": doc.get("display_name"),
        "avatar_url": doc.get("avatar_url"), "found_by": doc.get("found_by"), "spice": doc["spice"],
        "labels": doc["labels"], "season": doc.get("season"), "episode": doc.get("episode"),
        "aired_date": doc.get("aired_date"), "aired_year": doc.get("aired_year"), "title": doc.get("title"),
        "already_happened": doc.get("already_happened"), "evidence": doc.get("evidence", ""),
        "coming_near": doc.get("coming_near"), "coming_far": doc.get("coming_far"), "subtitle": doc.get("subtitle"),
        "text_status": text_status, "image_status": doc["image_status"], "still_kind": doc.get("still_kind"),
        "image_url": f"{base}/api/episodes/{doc['id']}/image" if doc["image_status"] == "ready" else None,
        "share_url": f"{base}/api/s/{doc['id']}", "shares": doc.get("shares", 0),
        "source": doc.get("source"), "created_at": doc["created_at"],
    }


def ep_tile(doc: dict, base: str) -> dict:
    return {"id": doc["id"], "handle": doc["handle"], "display_name": doc.get("display_name"),
            "avatar_url": doc.get("avatar_url"), "found_by": doc.get("found_by"), "season": doc["season"],
            "episode": doc["episode"], "aired_year": doc["aired_year"], "title": doc["title"],
            "already_happened": doc["already_happened"], "shares": doc.get("shares", 0),
            "image_url": f"{base}/api/episodes/{doc['id']}/image" if doc["image_status"] == "ready" else None,
            "created_at": doc["created_at"]}


async def check_rate(ip: str):
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    n = await db.gen_events.count_documents({"ip": ip, "ts": {"$gte": since}})
    if n >= EPISODES_PER_HOUR:
        raise HTTPException(429, "The archive is closed for you for an hour — too many episodes pulled. Come back soon.")
    await db.gen_events.insert_one({"ip": ip, "ts": now_iso()})


PUBLIC = {"hidden": False, "text_status": {"$nin": ["pending", "failed"]}}


def parse_pasted(text) -> list:
    if not text:
        return []
    out = []
    for line in re.split(r"\n+", text):
        line = line.strip(" \t-•*>")
        if len(line) >= 4:
            out.append(line[:300])
    return out[:12]


def with_pasted(profile: dict, pasted: list) -> dict:
    if not pasted:
        return profile
    posts = [{"text": t, "date": "", "pinned": False} for t in pasted] + list(profile.get("posts") or [])
    return {**profile, "posts": posts, "found": True, "source": profile.get("source") or "pasted"}


async def episode_job(ep_id: str, profile: dict, labels: dict, spice: str, found_by):
    try:
        ep = await write_episode(profile, labels, spice, found_by)
    except Exception:
        logger.exception("episode writing failed for %s (@%s)", ep_id, profile.get("handle"))
        await db.episodes.update_one({"id": ep_id}, {"$set": {"text_status": "failed"}})
        return
    await db.episodes.update_one({"id": ep_id}, {"$set": {**ep, "text_status": "ready"}})
    doc = await db.episodes.find_one({"id": ep_id}, {"_id": 0})
    await image_job(ep_id, doc, profile.get("avatar_url"))


async def image_job(ep_id: str, ep: dict, avatar_url):
    try:
        card, kind = await render_card_for_episode(ep, avatar_url)
    except Exception:
        logger.exception("card render failed for %s", ep_id)
        await db.episodes.update_one({"id": ep_id}, {"$set": {"image_status": "failed"}})
        return
    path = f"{storage.APP_NAME}/cards/{ep_id}.jpg"
    store = "storage"
    try:
        await asyncio.to_thread(storage.put_object, path, card, "image/jpeg")
    except Exception as e:
        logger.warning("object storage failed (%s); saving locally", e)
        (MEDIA_DIR / f"{ep_id}.jpg").write_bytes(card)
        store = "local"
    await db.episodes.update_one({"id": ep_id}, {"$set": {"image_status": "ready", "image_path": path,
                                                          "image_store": store, "still_kind": kind}})


@api_router.get("/")
async def root():
    return {"message": "Already Aired archive is online"}


@api_router.post("/read")
async def read_profile(body: ReadRequest):
    handle = clean_handle(body.handle)
    profile = await get_profile(handle)
    labels = await extract_labels(profile) if profile["found"] else None
    posts = profile.get("posts") or []
    return {"found": profile["found"], "protected": profile.get("protected", False), "handle": profile["handle"],
            "name": profile.get("name"), "bio": profile.get("bio", ""), "avatar_url": profile.get("avatar_url"),
            "followers": profile.get("followers"), "post_count": len(posts), "source": profile.get("source"),
            "labels": labels, "sample_posts": [p["text"][:140] for p in posts[:3]]}


@api_router.post("/episodes")
async def create_episode(body: CreateEpisodeRequest, request: Request):
    handle = clean_handle(body.handle)
    found_by = clean_handle(body.found_by) if body.found_by else None
    if found_by and found_by.lower() == handle.lower():
        found_by = None
    labels = {k: v.strip().lower() for k, v in body.labels.model_dump().items()}
    if contains_blocked(*labels.values()):
        raise HTTPException(400, "Those answers can't be used here.")
    await check_rate(client_ip(request))
    pasted = parse_pasted(body.posts_text)
    if contains_blocked(*pasted):
        raise HTTPException(400, "Those pasted posts can't be used here.")
    profile = with_pasted(await get_profile(handle), pasted)
    ep_id = secrets.token_urlsafe(6)
    doc = {"id": ep_id, "handle": profile["handle"] if profile["found"] else handle,
           "handle_lower": handle.lower(), "display_name": profile.get("name") or handle,
           "avatar_url": profile.get("avatar_url"), "bio": profile.get("bio", ""), "found_by": found_by,
           "found_by_lower": found_by.lower() if found_by else None, "spice": body.spice, "labels": labels,
           "pasted_posts": pasted, "source": profile.get("source") or "taps", "text_status": "pending",
           "image_status": "pending", "shares": 0, "reports": 0, "hidden": False, "created_at": now_iso()}
    await db.episodes.insert_one(dict(doc))
    asyncio.create_task(episode_job(ep_id, profile, labels, body.spice, found_by))
    return ep_public(doc, public_base(request))


@api_router.post("/episodes/{ep_id}/retry")
async def retry_episode(ep_id: str, request: Request):
    doc = await db.episodes.find_one({"id": ep_id, "hidden": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "That episode isn't in the archive.")
    if doc.get("text_status") != "failed":
        return ep_public(doc, public_base(request))
    profile = with_pasted(await get_profile(doc["handle"], cache_only=True), doc.get("pasted_posts") or [])
    await db.episodes.update_one({"id": ep_id}, {"$set": {"text_status": "pending"}})
    doc["text_status"] = "pending"
    asyncio.create_task(episode_job(ep_id, profile, doc["labels"], doc["spice"], doc.get("found_by")))
    return ep_public(doc, public_base(request))


async def load_episode(ep_id: str) -> dict:
    doc = await db.episodes.find_one({"id": ep_id, "hidden": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "That episode isn't in the archive.")
    return doc


@api_router.get("/episodes/{ep_id}")
async def get_episode(ep_id: str, request: Request):
    return ep_public(await load_episode(ep_id), public_base(request))


@api_router.get("/episodes/{ep_id}/image")
async def episode_image(ep_id: str):
    doc = await db.episodes.find_one({"id": ep_id}, {"_id": 0, "image_status": 1, "image_path": 1, "image_store": 1})
    if not doc or doc.get("image_status") != "ready":
        raise HTTPException(404, "Still not ready")
    if doc.get("image_store") == "local":
        data = (MEDIA_DIR / f"{ep_id}.jpg").read_bytes()
    else:
        data, _ = await asyncio.to_thread(storage.get_object, doc["image_path"])
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@api_router.post("/episodes/{ep_id}/share")
async def share_episode(ep_id: str, body: ShareRequest):
    res = await db.episodes.update_one({"id": ep_id}, {"$inc": {"shares": 1}})
    if not res.matched_count:
        raise HTTPException(404, "That episode isn't in the archive.")
    doc = await db.episodes.find_one({"id": ep_id}, {"_id": 0, "shares": 1})
    return {"shares": doc["shares"]}


@api_router.post("/episodes/{ep_id}/report")
async def report_episode(ep_id: str, body: ReportRequest, request: Request):
    doc = await db.episodes.find_one({"id": ep_id}, {"_id": 0, "reports": 1})
    if not doc:
        raise HTTPException(404, "That episode isn't in the archive.")
    await db.reports.insert_one({"episode_id": ep_id, "ip": client_ip(request), "reason": body.reason, "ts": now_iso()})
    reports = doc.get("reports", 0) + 1
    await db.episodes.update_one({"id": ep_id}, {"$set": {"reports": reports, "hidden": reports >= 3}})
    return {"reports": reports, "hidden": reports >= 3}


@api_router.get("/recent")
async def recent(request: Request, limit: int = Query(20, ge=1, le=50)):
    base = public_base(request)
    docs = await db.episodes.find(PUBLIC, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [ep_tile(d, base) for d in docs]


@api_router.get("/handles/{handle}")
async def handle_page(handle: str, request: Request):
    h = clean_handle(handle)
    base = public_base(request)
    docs = await db.episodes.find({**PUBLIC, "handle_lower": h.lower()}, {"_id": 0}).sort("created_at", -1).to_list(100)
    cached = await db.profiles.find_one({"handle_lower": h.lower()}, {"_id": 0})
    data = (cached or {}).get("data") or {}
    found_for = await db.episodes.count_documents({**PUBLIC, "found_by_lower": h.lower()})
    return {"handle": data.get("handle") or (docs[0]["handle"] if docs else h),
            "name": data.get("name") or (docs[0]["display_name"] if docs else h),
            "bio": data.get("bio", ""), "avatar_url": data.get("avatar_url") or (docs[0].get("avatar_url") if docs else None),
            "followers": data.get("followers"), "episode_count": len(docs), "prophet_count": found_for,
            "episodes": [ep_tile(d, base) for d in docs]}


@api_router.get("/leaderboard")
async def leaderboard(request: Request, type: Literal["prophesied", "prophets", "shared"] = "prophesied",
                      period: Literal["today", "all"] = "all"):
    base = public_base(request)
    match = dict(PUBLIC)
    if period == "today":
        start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        match["created_at"] = {"$gte": start}
    if type == "shared":
        docs = await db.episodes.find(match, {"_id": 0}).sort([("shares", -1), ("created_at", -1)]).to_list(20)
        return [ep_tile(d, base) for d in docs]
    group_key = "$handle_lower" if type == "prophesied" else "$found_by_lower"
    if type == "prophets":
        match["found_by_lower"] = {"$ne": None}
    pipeline = [{"$match": match}, {"$sort": {"created_at": -1}},
                {"$group": {"_id": group_key, "count": {"$sum": 1},
                            "handle": {"$first": "$handle" if type == "prophesied" else "$found_by"},
                            "name": {"$first": "$display_name"}, "avatar_url": {"$first": "$avatar_url"},
                            "latest_id": {"$first": "$id"}, "latest_title": {"$first": "$title"}}},
                {"$sort": {"count": -1}}, {"$limit": 20}]
    rows = await db.episodes.aggregate(pipeline).to_list(20)
    return [{"handle": r["handle"], "name": r["name"] if type == "prophesied" else None,
             "avatar_url": r["avatar_url"] if type == "prophesied" else None, "count": r["count"],
             "latest_id": r["latest_id"], "latest_title": r["latest_title"]} for r in rows]


@api_router.get("/timeline")
async def timeline(request: Request):
    base = public_base(request)
    confirmed = [{**p, "gap": p["event"] - p["aired"], "status": "confirmed"} for p in PREDICTIONS]
    confirmed.sort(key=lambda p: (p["event"], p["aired"]))
    docs = await db.episodes.find(PUBLIC, {"_id": 0}).sort("created_at", -1).to_list(60)
    pending = []
    for d in docs:
        for key in ("coming_near", "coming_far"):
            p = d[key]
            pending.append({"year": p["year"], "text": p["text"], "handle": d["handle"], "episode_id": d["id"],
                            "code": f"S{d['season']:02d}E{d['episode']:02d}", "title": d["title"],
                            "image_url": f"{base}/api/episodes/{d['id']}/image" if d["image_status"] == "ready" else None,
                            "created_at": d["created_at"]})
    pending.sort(key=lambda p: (p["year"], p["created_at"]), reverse=False)
    return {"confirmed": confirmed, "pending": pending[:60], "categories": CATEGORIES,
            "pending_total": await db.episodes.count_documents(PUBLIC) * 2}


@api_router.get("/s/{ep_id}")
async def share_page(ep_id: str, request: Request):
    base = public_base(request)
    doc = await db.episodes.find_one({"id": ep_id, **PUBLIC}, {"_id": 0})
    if not doc:
        return RedirectResponse(f"{base}/", status_code=302)
    target = f"{base}/ep/{ep_id}"
    if not BOT_RE.search(request.headers.get("user-agent", "")):
        return RedirectResponse(target, status_code=302)
    title = html.escape(f"The show predicted @{doc['handle']} in {doc['aired_year']}")
    desc = html.escape(f"S{doc['season']:02d}E{doc['episode']:02d} “{doc['title']}” — {doc['already_happened']}")
    img = f"{base}/api/episodes/{ep_id}/image"
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>{title} · Already Aired</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Already Aired">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:url" content="{target}"><meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="675">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{img}">
<meta http-equiv="refresh" content="0;url={target}"></head>
<body><a href="{target}">{title}</a></body></html>"""
    return HTMLResponse(page)


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.episodes.create_index("id", unique=True)
    await db.episodes.create_index([("handle_lower", 1), ("created_at", -1)])
    await db.episodes.create_index([("found_by_lower", 1), ("created_at", -1)])
    await db.episodes.create_index("created_at")
    await db.profiles.create_index("handle_lower", unique=True)
    await db.gen_events.create_index("ts", expireAfterSeconds=7200)
    try:
        await asyncio.to_thread(storage.init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error("Storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

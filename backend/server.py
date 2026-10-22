import asyncio
import base64
import hashlib
import html
import json
import logging
import math
import os
import re
import secrets
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

import town  # noqa: E402
from census import build_census, snapshot_of  # noqa: E402
from census_card import render_census  # noqa: E402
from safety import contains_blocked  # noqa: E402
from signs import TONES, write_signs  # noqa: E402
from town_card import render_card  # noqa: E402
from xreader import is_valid_handle, normalize_handle, read_handle, read_profile_only  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
NAMING_MODEL = os.environ["TEXT_MODEL"]
ADMIN_KEY = os.environ["ADMIN_KEY"]
MOVEINS_PER_HOUR = int(os.environ["MOVEINS_PER_HOUR"])
TOWN_CAPACITY = int(os.environ["TOWN_CAPACITY"])
X_CLIENT_ID = os.environ.get("X_CLIENT_ID", "")
X_CLIENT_SECRET = os.environ.get("X_CLIENT_SECRET", "")
AUTH_ON = bool(X_CLIENT_ID and X_CLIENT_SECRET)
X_AUTHORIZE = "https://x.com/i/oauth2/authorize"
X_TOKEN = "https://api.x.com/2/oauth2/token"
X_ME = "https://api.x.com/2/users/me"
SESSION_COOKIE = "xf_session"
STATE_COOKIE = "xf_oauth_state"
WEBHOOK_CRON_SECRET = os.environ["WEBHOOK_CRON_SECRET"]
CARD_DIR = ROOT_DIR / "media" / "cards"
CARD_DIR.mkdir(parents=True, exist_ok=True)
CENSUS_DIR = ROOT_DIR / "media" / "census"
CENSUS_DIR.mkdir(parents=True, exist_ok=True)
CIRCLE_SIZE = 8
READ_TTL = timedelta(days=7)
REFRESH_AFTER = timedelta(days=6)
REFRESH_GAP_S = 5
STALE_RESERVED = timedelta(days=14)
ACTIVE_JOB = ("queued", "reading", "traffic", "building")
BOT_RE = re.compile(r"twitterbot|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|googlebot|"
                    r"bingbot|embedly|pinterest|redditbot|applebot|skypeuripreview|vkshare|iframely|quora link preview", re.I)
LANDMARKS = {
    "power_plant": ("Power Plant", "tech, AI, engineering, programming, science, hardware"),
    "moes": ("Moe's Tavern", "crypto, trading, betting, memes, shitposting, nightlife"),
    "kwik_e_mart": ("Kwik-E-Mart", "founders, startups, business, VC, marketing, indie hackers, e-commerce"),
    "krusty_studios": ("Krusty Studios", "media, entertainment, comedy, film, TV, music, creators, influencers"),
    "elementary": ("Springfield Elementary", "education, academia, research, books, writing, history, philosophy"),
    "stadium": ("Springfield Stadium", "sports, fitness, football, basketball, athletes"),
    "comic_shop": ("Android's Dungeon", "gaming, comics, anime, sci-fi, fandoms, nerd culture"),
    "lard_lad": ("Lard Lad Donuts", "food, lifestyle, travel, fashion, health, family, everything else"),
    "channel6": ("Channel 6 News", "news, politics, journalism, government, policy, geopolitics"),
}
FALLBACK_NAMES = ["Evergreen Terrace", "Spalding Way", "Pressboard Estates", "Sunny Shores", "Walnut Street",
                  "Little Bavaria", "Shelbyville Border", "Rich Texan Ranch", "Squidport", "Lower XField"]

app = FastAPI()
api = APIRouter(prefix="/api")
TOWN_LOCK = asyncio.Lock()
NAMING_LOCK = asyncio.Lock()
CENSUS_LOCK = asyncio.Lock()
REFRESH_LOCK = asyncio.Lock()
AVATAR_CACHE: dict = {}


class TownFull(Exception):
    pass


def now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now().isoformat()


def fresh(iso: Optional[str]) -> bool:
    return bool(iso) and now() - datetime.fromisoformat(iso) < READ_TTL


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


def clean_handle(raw: str) -> str:
    h = normalize_handle(raw)
    if not is_valid_handle(h):
        raise HTTPException(400, "That doesn't look like an X handle (letters, numbers, underscore, max 15).")
    if contains_blocked(h):
        raise HTTPException(400, "That handle can't move into XField.")
    return h


class MoveInRequest(BaseModel):
    handle: str = Field(min_length=1, max_length=120)


class HideRequest(BaseModel):
    hidden: bool = True


class SignRequest(BaseModel):
    tone: str


async def bump():
    await db.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}}, upsert=True)


async def town_version() -> int:
    doc = await db.meta.find_one({"_id": "town"})
    return (doc or {}).get("version", 0)


async def count_taken() -> int:
    return await db.residents.count_documents({"hidden": False})


# ---------- sessions ----------

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    return await db.sessions.find_one({"token_hash": _hash(token), "expires_at": {"$gt": now()}},
                                      {"_id": 0, "token_hash": 0})


# ---------- X reads (cached) ----------

async def get_profile(handle: str, force: bool = False) -> dict:
    key = handle.lower()
    doc = None if force else await db.profiles.find_one({"handle_lower": key}, {"_id": 0})
    if doc and "circle" in doc["data"]:
        age = now() - datetime.fromisoformat(doc["fetched_at"])
        if age < (READ_TTL if doc["data"].get("found") else timedelta(hours=1)):
            return doc["data"]
    try:
        data = await asyncio.wait_for(read_handle(handle), timeout=60)
    except Exception as e:
        logger.warning("read_handle failed for @%s: %s", handle, e)
        data = {"handle": handle, "found": False, "protected": False, "throttled": True, "circle": [], "posts": []}
    if not data.get("throttled"):
        await db.profiles.update_one({"handle_lower": key},
                                     {"$set": {"handle_lower": key, "data": data, "fetched_at": now_iso()}}, upsert=True)
    return data


async def get_profile_lite(handle: str) -> dict:
    key = handle.lower()
    doc = await db.profiles_lite.find_one({"k": key}, {"_id": 0})
    if doc and fresh(doc["fetched_at"]):
        return doc["data"]
    data = await read_profile_only(handle)
    if not data.get("throttled"):
        await db.profiles_lite.update_one({"k": key}, {"$set": {"k": key, "data": data, "fetched_at": now_iso()}}, upsert=True)
    return data


# ---------- move in ----------

async def set_job(k: str, state: str, code: str = None, **extra):
    await db.jobs.update_one({"k": k}, {"$set": {"state": state, "code": code, "updated_at": now_iso(), **extra}}, upsert=True)


def job_public(job: dict) -> dict:
    return {"handle": job["h"], "state": job["state"], "code": job.get("code")}


async def check_rate(ip: str):
    since = now() - timedelta(hours=1)
    if await db.movein_events.count_documents({"ip": ip, "ts": {"$gte": since}}) >= MOVEINS_PER_HOUR:
        raise HTTPException(429, "The moving trucks are all out. Try again in a bit.")
    await db.movein_events.insert_one({"ip": ip, "ts": now()})


async def prepare_circle(k: str, profile: dict) -> list:
    hidden = {d["k"] async for d in db.residents.find({"hidden": True}, {"_id": 0, "k": 1})}
    raw = []
    for c in profile.get("circle") or []:
        ck = c["handle"].lower()
        if ck == k or ck in hidden or not is_valid_handle(c["handle"]) or contains_blocked(c["handle"], c.get("name") or ""):
            continue
        raw.append(dict(c))
    raw = raw[:CIRCLE_SIZE + 4]
    existing = {d["k"]: d async for d in db.residents.find({"k": {"$in": [c["handle"].lower() for c in raw]}}, {"_id": 0})}
    sem = asyncio.Semaphore(3)

    async def fill(c):
        ck = c["handle"].lower()
        if ck in existing:
            c["avatar_url"] = c.get("avatar_url") or existing[ck].get("avatar_url")
            c["ok"] = True
            return
        if c.get("avatar_url"):
            c["ok"] = True
            return
        async with sem:
            p = await get_profile_lite(c["handle"])
        if p.get("throttled"):
            c["ok"] = True
        elif p.get("found"):
            c.update(handle=p["handle"], name=p.get("name") or c["handle"], avatar_url=p.get("avatar_url"), ok=True)
        else:
            c["ok"] = False

    await asyncio.gather(*[fill(c) for c in raw])
    return [c for c in raw if c.get("ok")][:CIRCLE_SIZE]


async def occupancy() -> tuple:
    docs = await db.residents.find({}, {"_id": 0, "k": 1, "x": 1, "y": 1}).to_list(None)
    occupied = {(d["x"], d["y"]) for d in docs} | {town.TOWN_HALL}
    pos = {d["k"]: (d["x"], d["y"]) for d in docs}
    async for nb in db.neighbourhoods.find({"active": True}, {"_id": 0, "bx": 1, "by": 1}):
        occupied.add((nb["bx"], nb["by"]))
    return occupied, pos


async def reserve_circle(k: str, h: str, ox: int, oy: int, circle: list, occupied: set, pos: dict, taken: int) -> int:
    added = 0
    for c in sorted(circle, key=lambda c: -c["weight"]):
        ck = c["handle"].lower()
        if ck in pos:
            if c.get("avatar_url"):
                await db.residents.update_one({"k": ck, "avatar_url": None}, {"$set": {"avatar_url": c["avatar_url"]}})
            continue
        if taken + added >= TOWN_CAPACITY:
            break
        p = town.nearest_free_lot(ox, oy, occupied)
        occupied.add(p)
        pos[ck] = p
        await db.residents.insert_one({
            "k": ck, "h": c["handle"], "name": c.get("name") or c["handle"], "avatar_url": c.get("avatar_url"),
            "bio": "", "status": "reserved", "verified": False, "hidden": False, "x": p[0], "y": p[1], "by": k,
            "by_h": h, "circle": [], "nb": None, "sign_tone": "pun", "created_at": now_iso()})
        added += 1
    return added


async def place_move_in(k: str, profile: dict, circle: list, by: Optional[str], verified: bool):
    occupied, pos = await occupancy()
    taken = await count_taken()
    owner = await db.residents.find_one({"k": k}, {"_id": 0})
    was_reserved = bool(owner and owner["status"] == "reserved")
    if owner:
        ox, oy = owner["x"], owner["y"]
    else:
        if taken >= TOWN_CAPACITY:
            raise TownFull()
        taken += 1
        placed = [(pos[c["handle"].lower()], c["weight"]) for c in circle if c["handle"].lower() in pos]
        if placed:
            tw = sum(w for _, w in placed)
            target = (sum(p[0] * w for p, w in placed) / tw, sum(p[1] * w for p, w in placed) / tw)
        else:
            target = town.frontier_target(k, occupied)
        ox, oy = town.nearest_free_lot(*target, occupied)
        occupied.add((ox, oy))
    lit = verified or bool(owner and owner["status"] == "finished")
    by_k = owner.get("by") if owner else (by if by and by != k else None)
    by_doc = await db.residents.find_one({"k": by_k}, {"_id": 0, "h": 1}) if by_k else None
    posts = [p["text"][:160] for p in (profile.get("posts") or [])[:8]]
    now_s = now_iso()
    lit_fields = {"verified": True, "finished_at": (owner or {}).get("finished_at") or now_s} if lit else {"verified": False}
    await db.residents.update_one({"k": k}, {"$set": {
        "h": profile["handle"], "name": profile.get("name") or profile["handle"], "avatar_url": profile.get("avatar_url"),
        "bio": profile.get("bio", ""), "followers": profile.get("followers"), "posts": posts,
        "status": "finished" if lit else "reserved", "circle": [{"k": c["handle"].lower(), "w": c["weight"]} for c in circle],
        "read_at": now_s, "x": ox, "y": oy, **lit_fields,
    }, "$setOnInsert": {"k": k, "hidden": False, "by": by_k, "by_h": (by_doc or {}).get("h"), "nb": None,
                        "sign_tone": "pun", "created_at": now_s}}, upsert=True)
    new_reserved = await reserve_circle(k, profile["handle"], ox, oy, circle, occupied, pos, taken)
    kind = ("lights_on" if was_reserved else "moved_in") if verified else "built"
    await db.events.insert_one({"type": kind, "h": profile["handle"],
                                "by_h": (owner or {}).get("by_h") or (by_doc or {}).get("h"), "n": new_reserved, "at": now_s})


async def refresh_neighbourhoods() -> list:
    docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "x": 1, "y": 1, "circle": 1, "nb": 1}).to_list(None)
    keys = {d["k"] for d in docs}
    pos = {d["k"]: (d["x"], d["y"]) for d in docs}
    edges, indeg = defaultdict(dict), Counter()
    for d in docs:
        for c in d.get("circle") or []:
            m = c["k"]
            if m in keys and m != d["k"]:
                w = float(c.get("w", 1))
                edges[d["k"]][m] = edges[d["k"]].get(m, 0) + w
                edges[m][d["k"]] = edges[m].get(d["k"], 0) + w
                indeg[m] += 1
    groups = town.clusters(sorted(keys), edges)
    active = await db.neighbourhoods.find({"active": True}, {"_id": 0}).to_list(None)
    active_by_id = {nb["id"]: nb for nb in active}
    cur_nb = {d["k"]: d.get("nb") for d in docs}
    occupied, _ = await occupancy()
    assign, sizes, created = {}, {}, []
    for g in sorted(groups, key=lambda g: (-len(g), min(g))):
        votes = Counter(cur_nb[k] for k in g if cur_nb.get(k) in active_by_id and cur_nb[k] not in sizes)
        if votes and len(g) >= town.DISSOLVE_BELOW:
            nb = active_by_id[min(votes, key=lambda i: (-votes[i], active_by_id[i]["created_at"]))]
        elif len(g) >= town.MIN_NEIGHBOURHOOD:
            anchor = max(g, key=lambda k: (indeg[k], -town.hval(k)))
            cx = sum(pos[k][0] for k in g) / len(g)
            cy = sum(pos[k][1] for k in g) / len(g)
            lot = town.nearest_free_lot(cx, cy, occupied)
            nb = {"id": secrets.token_urlsafe(5), "anchor": anchor, "bx": lot[0], "by": lot[1], "landmark": None,
                  "name": None, "named": False, "active": True, "size": len(g), "created_at": now_iso()}
            await db.neighbourhoods.insert_one(dict(nb))
            occupied.add(lot)
            created.append(nb["id"])
        else:
            continue
        sizes[nb["id"]] = len(g)
        for k in g:
            assign[k] = nb["id"]
    for nb in active:
        if nb["id"] not in sizes:
            await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {"active": False}})
            if nb.get("named"):
                await db.events.insert_one({"type": "nb_gone", "h": "", "name": nb["name"], "at": now_iso()})
    for nb_id, size in sizes.items():
        await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {"size": size}})
    changes = defaultdict(list)
    for d in docs:
        if d.get("nb") != assign.get(d["k"]):
            changes[assign.get(d["k"])].append(d["k"])
    for nb_id, ks in changes.items():
        await db.residents.update_many({"k": {"$in": ks}}, {"$set": {"nb": nb_id}})
    return created


NAMING_SYSTEM = (
    "You run the planning office of XField, a cartoon Simpsons-style town on X. A new neighbourhood formed from a group "
    "of X accounts who talk to each other. Pick the one landmark that fits what they post about, and invent a short, "
    "funny, Simpsons-flavoured neighbourhood name built around that landmark (e.g. 'Power Plant Heights', "
    "'Moe's Back Alley', 'Kwik-E Corners'). Max 3 words, max 24 characters, no handles, no real people's names, nothing "
    "mean or crude. Match the topic list literally: crypto, web3, DAOs and trading always get moes; AI and engineering "
    "get power_plant; only founders and business talk gets kwik_e_mart. Spread landmarks around town: avoid the ones "
    "already used a lot unless they are clearly the best fit. "
    "Reply with JSON only: {\"landmark\": \"<key>\", \"name\": \"<name>\"}.\nLandmark keys:\n"
    + "\n".join(f"- {k}: {label} ({topics})" for k, (label, topics) in LANDMARKS.items())
)


def _fallback_name(nb_id: str) -> str:
    return FALLBACK_NAMES[town.hval(nb_id) % len(FALLBACK_NAMES)]


async def name_neighbourhood(nb_id: str):
    async with NAMING_LOCK:
        await _name_neighbourhood(nb_id)


async def _name_neighbourhood(nb_id: str):
    members = await db.residents.find({"nb": nb_id, "hidden": False},
                                      {"_id": 0, "h": 1, "name": 1, "bio": 1, "posts": 1, "circle": 1}).to_list(40)
    members.sort(key=lambda m: not m.get("posts"))
    lines = []
    for m in members[:24]:
        line = f"@{m['h']} ({m.get('name') or ''}) bio: {(m.get('bio') or '')[:160]}"
        if m.get("posts"):
            line += " | posts: " + " / ".join(m["posts"][:4])
        lines.append(line[:700])
    landmark, name = "lard_lad", _fallback_name(nb_id)
    try:
        used = Counter([n["landmark"] async for n in db.neighbourhoods.find({"active": True, "named": True}, {"_id": 0, "landmark": 1})])
        used_line = ", ".join(f"{k} x{v}" for k, v in used.most_common()) or "none yet"
        prompt = f"Landmarks already in town: {used_line}\n\nResidents:\n" + "\n".join(lines)
        chat = LlmChat(api_key=LLM_KEY, session_id=f"nb-{uuid.uuid4()}", system_message=NAMING_SYSTEM).with_model("anthropic", NAMING_MODEL)
        raw = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=40)
        m = re.search(r"\{.*\}", raw, re.S)
        out = json.loads(m.group(0)) if m else {}
        if out.get("landmark") in LANDMARKS:
            landmark = out["landmark"]
        cand = re.sub(r"[^A-Za-z0-9 '\-&.]", "", str(out.get("name") or "")).strip()
        if cand and len(cand) <= 26 and "@" not in cand and not contains_blocked(cand):
            name = cand
    except Exception as e:
        logger.warning("neighbourhood naming failed for %s: %s", nb_id, e)
    res = await db.neighbourhoods.update_one({"id": nb_id, "named": False}, {"$set": {"landmark": landmark, "name": name, "named": True}})
    if res.modified_count:
        await db.events.insert_one({"type": "new_nb", "h": "", "name": name, "nb": nb_id, "at": now_iso()})
    await bump()


async def make_signs(k: str, profile: dict):
    try:
        signs = await write_signs(profile.get("name") or profile["handle"], profile.get("bio") or "",
                                  [p["text"] for p in profile.get("posts") or []])
    except Exception as e:
        logger.warning("lawn signs failed for @%s: %s", k, e)
        return
    await db.residents.update_one({"k": k}, {"$set": {"signs": signs}})
    await bump()


async def run_move_in(k: str, h: str, by: Optional[str], verified: bool, fallback: Optional[dict] = None):
    try:
        await set_job(k, "reading")
        profile = None
        for attempt in range(4):
            profile = await get_profile(h)
            if not profile.get("throttled"):
                break
            await set_job(k, "traffic")
            await asyncio.sleep(12 * (attempt + 1))
        if not profile.get("found") and verified and fallback and not profile.get("protected"):
            profile = {**fallback, "posts": [], "circle": [], "found": True}
        if not profile.get("found"):
            code = "protected" if profile.get("protected") else ("traffic" if profile.get("throttled") else "not_found")
            return await set_job(k, "error", code)
        if contains_blocked(profile["handle"], profile.get("name") or ""):
            return await set_job(k, "error", "blocked")
        await set_job(k, "building", h=profile["handle"])
        circle = await prepare_circle(k, profile)
        async with TOWN_LOCK:
            before = await tier_map()
            try:
                await place_move_in(k, profile, circle, by, verified)
            except TownFull:
                return await set_job(k, "error", "full")
            created = await refresh_neighbourhoods()
            await tower_events(before)
            await bump()
        for nb_id in created:
            asyncio.create_task(name_neighbourhood(nb_id))
        if profile.get("posts"):
            asyncio.create_task(make_signs(k, profile))
        await set_job(k, "done", "lit" if verified else "reserved")
    except Exception:
        logger.exception("move-in failed for @%s", h)
        await set_job(k, "error", "failed")


@api.get("/")
async def root():
    return {"message": "XField is open"}


@api.post("/move-in")
async def move_in(body: MoveInRequest, request: Request):
    h = clean_handle(body.handle)
    k = h.lower()
    user = await current_user(request)
    verified = bool(user and user["k"] == k)
    res = await db.residents.find_one({"k": k}, {"_id": 0})
    if res and res.get("hidden"):
        raise HTTPException(403, "That house isn't available.")
    if res and fresh(res.get("read_at")) and (res["status"] == "finished" or not verified):
        return {"handle": res["h"], "state": "done", "code": "already"}
    job = await db.jobs.find_one({"k": k}, {"_id": 0})
    if job and job["state"] in ACTIVE_JOB and now() - datetime.fromisoformat(job["updated_at"]) < timedelta(minutes=3):
        return job_public(job)
    if not res and await count_taken() >= TOWN_CAPACITY:
        raise HTTPException(409, f"XField is full. All {TOWN_CAPACITY} spots are taken.")
    await check_rate(client_ip(request))
    by = user["k"] if user and not verified else None
    await db.jobs.update_one({"k": k}, {"$set": {"k": k, "h": h, "state": "queued", "code": None, "updated_at": now_iso()}}, upsert=True)
    asyncio.create_task(run_move_in(k, h, by, verified))
    return {"handle": h, "state": "queued", "code": None}


@api.get("/move-in/{handle}")
async def move_in_status(handle: str):
    job = await db.jobs.find_one({"k": normalize_handle(handle).lower()}, {"_id": 0})
    if not job:
        raise HTTPException(404, "No move-in for that handle.")
    return job_public(job)


# ---------- town ----------

def sign_of(d: dict) -> Optional[str]:
    return (d.get("signs") or {}).get(d.get("sign_tone") or "pun")


TOWN_FIELDS = {"_id": 0, "k": 1, "h": 1, "name": 1, "avatar_url": 1, "status": 1, "x": 1, "y": 1, "by_h": 1, "nb": 1,
               "circle": 1, "signs": 1, "sign_tone": 1}


@api.get("/town")
async def get_town(v: Optional[int] = None):
    version = await town_version()
    if v is not None and v == version:
        return {"unchanged": True, "version": version}
    docs = await db.residents.find({"hidden": False}, TOWN_FIELDS).to_list(None)
    indeg = town.inbound_counts(docs)
    residents = [{"k": d["k"], "h": d["h"], "n": d.get("name") or d["h"], "a": d.get("avatar_url"),
                  "s": "f" if d["status"] == "finished" else "r", "x": d["x"], "y": d["y"],
                  "t": town.tier_of(indeg[d["k"]]), "by": d.get("by_h"), "nb": d.get("nb"), "sg": sign_of(d)} for d in docs]
    nbs = await db.neighbourhoods.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "landmark": 1, "bx": 1, "by": 1,
                                                          "size": 1, "named": 1}).to_list(None)
    events = await db.events.find({}, {"_id": 0}).sort("at", -1).to_list(12)
    nb_ids = list({e["nb"] for e in events if e.get("nb")})
    names = {n["id"]: n.get("name") async for n in db.neighbourhoods.find({"id": {"$in": nb_ids}}, {"_id": 0, "id": 1, "name": 1})}
    for e in events:
        if e.get("nb"):
            e["nb_name"] = names.get(e["nb"])
    finished = sum(1 for r in residents if r["s"] == "f")
    biggest = max(nbs, key=lambda n: n.get("size", 0), default=None)
    return {"version": version, "residents": residents, "neighbourhoods": nbs, "ticker": events,
            "town_hall": {"bx": town.TOWN_HALL[0], "by": town.TOWN_HALL[1]},
            "stats": {"taken": len(residents), "capacity": TOWN_CAPACITY, "finished": finished,
                      "reserved": len(residents) - finished, "neighbourhoods": len(nbs),
                      "biggest": {"name": biggest.get("name"), "size": biggest.get("size")} if biggest and biggest.get("name") else None}}


async def load_resident(handle: str) -> dict:
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Nobody lives there yet.")
    return doc


async def street(doc: dict) -> dict:
    all_docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "circle": 1}).to_list(None)
    indeg = town.inbound_counts(all_docs)
    own = [c["k"] for c in sorted(doc.get("circle") or [], key=lambda c: -c["w"])]
    inbound = [d["k"] for d in all_docs if any(c["k"] == doc["k"] for c in d.get("circle") or [])]
    order = list(dict.fromkeys(own + inbound))
    found = {d["k"]: d async for d in db.residents.find({"k": {"$in": order}, "hidden": False},
                                                        {"_id": 0, "k": 1, "h": 1, "name": 1, "avatar_url": 1, "status": 1})}
    neighbours = [{"k": k, "h": found[k]["h"], "n": found[k].get("name"), "a": found[k].get("avatar_url"),
                   "s": "f" if found[k]["status"] == "finished" else "r", "t": town.tier_of(indeg[k])}
                  for k in order if k in found][:8]
    tags = [n["h"] for n in neighbours if n["s"] == "r" and n["k"] in own][:3]
    nb = await db.neighbourhoods.find_one({"id": doc.get("nb"), "active": True}, {"_id": 0}) if doc.get("nb") else None
    return {"neighbours": neighbours, "tags": tags, "tier": town.tier_of(indeg[doc["k"]]), "inbound": indeg[doc["k"]], "nb": nb}


def card_payload(doc: dict, st: dict) -> dict:
    nb = st["nb"] or {}
    return {"k": doc["k"], "h": doc["h"], "tier": st["tier"], "status": doc["status"], "nb_name": nb.get("name"),
            "landmark": nb.get("landmark"), "tags": st["tags"], "sign": sign_of(doc),
            "neighbours": [{"k": n["k"], "h": n["h"], "tier": n["t"], "status": "reserved" if n["s"] == "r" else "finished"}
                           for n in st["neighbours"]],
            "avatars": {doc["k"]: doc.get("avatar_url"), **{n["k"]: n["a"] for n in st["neighbours"]}}}


def card_hash(payload: dict) -> str:
    return hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:10]


def share_text(doc: dict, st: dict) -> str:
    if doc["status"] != "finished":
        return f"@{doc['h']} your house in XField is ready. Only you can light it \u2192"
    if st["tags"]:
        return "I'm in XField. " + " ".join(f"@{t}" for t in st["tags"]) + " your houses are ready \u2192"
    return "I'm in XField. Come find your house \u2192"


@api.get("/residents/{handle}")
async def resident(handle: str, request: Request):
    doc = await load_resident(handle)
    st = await street(doc)
    user = await current_user(request)
    base = public_base(request)
    brought = await db.residents.count_documents({"by": doc["k"], "hidden": False})
    lit = await db.residents.count_documents({"by": doc["k"], "hidden": False, "status": "finished"})
    nb = st["nb"]
    v = card_hash(card_payload(doc, st))
    return {"k": doc["k"], "h": doc["h"], "name": doc.get("name"), "avatar_url": doc.get("avatar_url"),
            "status": "finished" if doc["status"] == "finished" else "reserved", "x": doc["x"], "y": doc["y"],
            "tier": st["tier"], "tier_name": town.TIERS[st["tier"]], "inbound": st["inbound"], "by_h": doc.get("by_h"),
            "neighbourhood": {"id": nb["id"], "name": nb.get("name"), "landmark": nb.get("landmark")} if nb else None,
            "neighbours": st["neighbours"], "brought": brought, "brought_lit": lit,
            "signs": doc.get("signs"), "sign_tone": doc.get("sign_tone") or "pun", "is_me": bool(user and user["k"] == doc["k"]),
            "share": {"text": share_text(doc, st), "url": f"{base}/api/s/{doc['h']}", "tags": st["tags"]},
            "card_url": f"{base}/api/residents/{doc['h']}/card.jpg?v={v}"}


async def fetch_avatar(url: Optional[str]) -> Optional[bytes]:
    if not url:
        return None
    if url in AVATAR_CACHE:
        return AVATAR_CACHE[url]
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True) as c:
            r = await c.get(url)
        data = r.content if r.status_code == 200 and r.headers.get("content-type", "").startswith("image") else None
    except Exception:
        data = None
    if len(AVATAR_CACHE) > 600:
        AVATAR_CACHE.pop(next(iter(AVATAR_CACHE)))
    AVATAR_CACHE[url] = data
    return data


@api.get("/residents/{handle}/card.jpg")
async def resident_card(handle: str, request: Request):
    doc = await load_resident(handle)
    st = await street(doc)
    payload = card_payload(doc, st)
    path = CARD_DIR / f"{doc['k']}-{card_hash(payload)}.jpg"
    if not path.exists():
        urls = payload.pop("avatars")
        blobs = await asyncio.gather(*[fetch_avatar(u) for u in urls.values()])
        host = public_base(request).split("://", 1)[-1]
        data = await asyncio.to_thread(render_card, payload, dict(zip(urls.keys(), blobs)), host)
        path.write_bytes(data)
    return Response(content=path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@api.post("/me/sign")
async def set_sign(body: SignRequest, request: Request):
    user = await current_user(request)
    if not user:
        raise HTTPException(401, "Sign in with X first.")
    if body.tone not in TONES:
        raise HTTPException(400, "Pick pun, roast or kind.")
    res = await db.residents.update_one({"k": user["k"], "status": "finished"}, {"$set": {"sign_tone": body.tone}})
    if not res.matched_count:
        raise HTTPException(404, "Light your house first.")
    await bump()
    return {"tone": body.tone}


@api.get("/s/{handle}")
async def share_page(handle: str, request: Request):
    base = public_base(request)
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False}, {"_id": 0})
    if not doc:
        return RedirectResponse(f"{base}/", status_code=302)
    target = f"{base}/h/{doc['h']}?arrive=1"
    if not BOT_RE.search(request.headers.get("user-agent", "")):
        return RedirectResponse(target, status_code=302)
    st = await street(doc)
    nb_name = (st["nb"] or {}).get("name") or "XField"
    if doc["status"] == "finished":
        title = f"@{doc['h']} lives in {nb_name}"
        tags = ", ".join(f"@{t}" for t in st["tags"])
        desc = f"Next to {tags}. Your house is ready." if tags else "XField: the town built from who talks to whom on X."
    else:
        title = f"@{doc['h']}, your house in XField is ready"
        desc = "Only you can light it. Sign in with X to move in."
    title, desc = html.escape(title), html.escape(desc)
    img = f"{base}/api/residents/{doc['h']}/card.jpg?v={card_hash(card_payload(doc, st))}"
    return og_page(title, desc, img, target)


def og_page(title: str, desc: str, img: str, target: str) -> HTMLResponse:
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>{title} · XField</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website"><meta property="og:site_name" content="XField">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:url" content="{target}"><meta property="og:image" content="{img}">
<meta property="og:image:width" content="1260"><meta property="og:image:height" content="1680">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{img}">
<meta http-equiv="refresh" content="0;url={target}"></head>
<body><a href="{target}">{title}</a></body></html>"""
    return HTMLResponse(page)


# ---------- Sign in with X (OAuth 2.0 + PKCE) ----------

def _safe_next(nxt: Optional[str]) -> str:
    return nxt if nxt and nxt.startswith("/") and not nxt.startswith("//") else "/"


@api.get("/auth/me")
async def auth_me(request: Request):
    return {"enabled": AUTH_ON, "user": await current_user(request)}


@api.get("/auth/x/login")
async def x_login(request: Request, next: Optional[str] = None):
    base = public_base(request)
    if not AUTH_ON:
        return RedirectResponse(f"{base}/?signin=off", status_code=302)
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    await db.oauth_states.insert_one({"state": state, "verifier": verifier, "next": _safe_next(next), "ts": now()})
    query = urlencode({"response_type": "code", "client_id": X_CLIENT_ID, "redirect_uri": f"{base}/api/auth/x/callback",
                       "scope": "tweet.read users.read", "state": state, "code_challenge": challenge,
                       "code_challenge_method": "S256"})
    resp = RedirectResponse(f"{X_AUTHORIZE}?{query}", status_code=302)
    resp.set_cookie(STATE_COOKIE, state, max_age=600, httponly=True, secure=True, samesite="lax", path="/api/auth")
    return resp


async def _x_identity(code: str, verifier: str, redirect_uri: str) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(X_TOKEN, auth=(X_CLIENT_ID, X_CLIENT_SECRET), data={
            "code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri,
            "code_verifier": verifier, "client_id": X_CLIENT_ID})
        if r.status_code != 200:
            logger.warning("X token exchange failed: HTTP %s %s", r.status_code, r.text[:200])
            return None
        me = await c.get(X_ME, params={"user.fields": "profile_image_url,name,username"},
                         headers={"Authorization": f"Bearer {r.json()['access_token']}"})
        if me.status_code != 200:
            logger.warning("X users/me failed: HTTP %s %s", me.status_code, me.text[:200])
            return None
    return me.json().get("data")


@api.get("/auth/x/callback")
async def x_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    base = public_base(request)

    def fail(reason: str):
        r = RedirectResponse(f"{base}/?signin={reason}", status_code=302)
        r.delete_cookie(STATE_COOKIE, path="/api/auth")
        return r

    if not AUTH_ON:
        return fail("off")
    if error or not code or not state:
        return fail("cancelled")
    if request.cookies.get(STATE_COOKIE) != state:
        return fail("expired")
    st = await db.oauth_states.find_one_and_delete({"state": state})
    if not st:
        return fail("expired")
    u = await _x_identity(code, st["verifier"], f"{base}/api/auth/x/callback")
    if not u or not u.get("username"):
        return fail("x_error")
    h, k = u["username"], u["username"].lower()
    avatar = (u.get("profile_image_url") or "").replace("_normal", "_400x400") or None
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({"token_hash": _hash(token), "x_id": u.get("id"), "k": k, "h": h, "name": u.get("name") or h,
                                  "avatar_url": avatar, "created_at": now_iso(), "expires_at": now() + timedelta(days=30)})
    res = await db.residents.find_one({"k": k}, {"_id": 0})
    if not (res and res.get("hidden")) and not (res and res["status"] == "finished" and fresh(res.get("read_at"))):
        await db.jobs.update_one({"k": k}, {"$set": {"k": k, "h": h, "state": "queued", "code": None, "updated_at": now_iso()}}, upsert=True)
        fallback = {"handle": h, "name": u.get("name") or h, "avatar_url": avatar, "bio": ""}
        asyncio.create_task(run_move_in(k, h, None, True, fallback))
    nxt = st.get("next") or "/"
    target = f"{base}/h/{h}?welcome=1" if nxt in ("/", f"/h/{h}", f"/h/{k}") else f"{base}{nxt}"
    resp = RedirectResponse(target, status_code=302)
    resp.set_cookie(SESSION_COOKIE, token, max_age=30 * 86400, httponly=True, secure=True, samesite="lax", path="/")
    resp.delete_cookie(STATE_COOKIE, path="/api/auth")
    return resp


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.sessions.delete_one({"token_hash": _hash(token)})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


# ---------- town life: weekly re-reads, moves and demolitions ----------

async def tier_map() -> dict:
    docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "circle": 1}).to_list(None)
    indeg = town.inbound_counts(docs)
    return {d["k"]: town.tier_of(indeg[d["k"]]) for d in docs}


async def tower_events(before: dict):
    after = await tier_map()
    new = sorted(k for k, t in after.items() if t == 3 and before.get(k, -1) < 3)[:3]
    async for d in db.residents.find({"k": {"$in": new}}, {"_id": 0, "h": 1, "nb": 1}):
        await db.events.insert_one({"type": "tower", "h": d["h"], "nb": d.get("nb"), "at": now_iso()})


async def apply_refresh(cur: dict, profile: dict, circle: list) -> tuple:
    k = cur["k"]
    occupied, pos = await occupancy()
    ox, oy = cur["x"], cur["y"]
    old_top = [c["k"] for c in sorted(cur.get("circle") or [], key=lambda c: -c["w"])][:town.TOP_N]
    new_top = [c["handle"].lower() for c in sorted(circle, key=lambda c: -c["weight"])][:town.TOP_N]
    moved = None
    if town.should_move(old_top, new_top):
        placed = [(pos[c["handle"].lower()], c["weight"]) for c in circle if c["handle"].lower() in pos]
        if placed:
            tw = sum(w for _, w in placed)
            target = (sum(p[0] * w for p, w in placed) / tw, sum(p[1] * w for p, w in placed) / tw)
            occupied.discard((ox, oy))
            lot = town.nearest_free_lot(*target, occupied)
            if math.dist(lot, (ox, oy)) >= town.MOVE_MIN_LOTS:
                moved, (ox, oy) = (cur["x"], cur["y"]), lot
            occupied.add((ox, oy))
    posts = [p["text"][:160] for p in (profile.get("posts") or [])[:8]]
    await db.residents.update_one({"k": k}, {"$set": {
        "h": profile["handle"], "name": profile.get("name") or profile["handle"],
        "avatar_url": profile.get("avatar_url") or cur.get("avatar_url"), "bio": profile.get("bio", ""),
        "followers": profile.get("followers"), "posts": posts, "read_at": now_iso(), "x": ox, "y": oy,
        "circle": [{"k": c["handle"].lower(), "w": c["weight"]} for c in circle]}})
    pos[k] = (ox, oy)
    added = await reserve_circle(k, profile["handle"], ox, oy, circle, occupied, pos, await count_taken())
    return moved, added, posts != (cur.get("posts") or [])


async def refresh_resident(d: dict):
    profile = await get_profile(d["h"], force=True)
    if profile.get("throttled") or not profile.get("found") or contains_blocked(profile["handle"], profile.get("name") or ""):
        return
    circle = await prepare_circle(d["k"], profile)
    async with TOWN_LOCK:
        cur = await db.residents.find_one({"k": d["k"], "hidden": False}, {"_id": 0})
        if not cur:
            return
        before = await tier_map()
        moved, added, posts_changed = await apply_refresh(cur, profile, circle)
        created = await refresh_neighbourhoods()
        await tower_events(before)
        if moved or added:
            nb = (await db.residents.find_one({"k": d["k"]}, {"_id": 0, "nb": 1})).get("nb")
            await db.events.insert_one({"type": "moved" if moved else "grew", "h": profile["handle"], "nb": nb, "n": added,
                                        "at": now_iso()})
        await bump()
    for nb_id in created:
        asyncio.create_task(name_neighbourhood(nb_id))
    if profile.get("posts") and (posts_changed or not cur.get("signs")):
        asyncio.create_task(make_signs(d["k"], profile))


async def demolish_stale():
    cutoff = (now() - STALE_RESERVED).isoformat()
    async with TOWN_LOCK:
        docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "h": 1, "status": 1, "verified": 1,
                                                           "created_at": 1, "circle": 1}).to_list(None)
        pointed = {c["k"] for d in docs for c in d.get("circle") or [] if c["k"] != d["k"]}
        stale = [d for d in docs if d["status"] == "reserved" and not d.get("verified")
                 and (d.get("created_at") or "") < cutoff and d["k"] not in pointed]
        if not stale:
            return
        gone = [d["k"] for d in stale]
        await db.residents.delete_many({"k": {"$in": gone}})
        await db.jobs.delete_many({"k": {"$in": gone}})
        created = await refresh_neighbourhoods()
        await db.events.insert_one({"type": "demolished", "h": stale[0]["h"], "n": len(stale), "at": now_iso()})
        await bump()
    for nb_id in created:
        asyncio.create_task(name_neighbourhood(nb_id))
    logger.info("demolished %d stale reserved houses", len(stale))


async def run_refresh():
    if REFRESH_LOCK.locked():
        return
    async with REFRESH_LOCK:
        total = await db.residents.count_documents({"hidden": False, "read_at": {"$exists": True}})
        cutoff = (now() - REFRESH_AFTER).isoformat()
        due = await db.residents.find({"hidden": False, "read_at": {"$lt": cutoff}}, {"_id": 0, "k": 1, "h": 1}) \
            .sort("read_at", 1).to_list(max(1, math.ceil(total / 7)))
        for d in due:
            try:
                await refresh_resident(d)
            except Exception:
                logger.exception("refresh failed for @%s", d["h"])
            await asyncio.sleep(REFRESH_GAP_S)
        await demolish_stale()
        logger.info("town refresh: %d of %d houses re-read", len(due), total)


# ---------- weekly census ----------

CENSUS_PUBLIC = {"_id": 0, "snapshot": 0}
CENSUS_CARD_KEYS = ("issue", "label", "capacity", "population", "fastest", "towers", "towers_total", "mover", "newest_lit",
                    "lit_week")


def next_census_at() -> str:
    n = now()
    t = (n + timedelta(days=(0 - n.weekday()) % 7)).replace(hour=9, minute=0, second=0, microsecond=0)
    return (t if t > n else t + timedelta(days=7)).isoformat()


def census_lead(c: dict) -> str:
    f = c.get("fastest")
    return f"{f['name']} grew +{f['gained']} {'house' if f['gained'] == 1 else 'houses'}" if f else "A quiet week in XField"


def census_share_text(c: dict) -> str:
    return (f"XField Census No. {c['issue']}: {census_lead(c)}. {c['population']['taken']}/{c['capacity']} spots taken. "
            "Find your house \u2192")


def census_card_payload(c: dict, host: str) -> dict:
    return {**{k: c.get(k) for k in CENSUS_CARD_KEYS}, "host": host}


def census_people(c: dict) -> dict:
    people = c["towers"] + c["newest_lit"] + ([c["mover"]] if c.get("mover") else [])
    return {p["k"]: p.get("a") for p in people}


async def load_census(issue: str) -> dict:
    if issue == "latest":
        doc = await db.census.find_one({}, CENSUS_PUBLIC, sort=[("issue", -1)])
    else:
        doc = await db.census.find_one({"issue": int(issue)}, CENSUS_PUBLIC) if issue.isdigit() else None
    if not doc:
        raise HTTPException(404, "No census yet.")
    return doc


async def publish_census():
    async with CENSUS_LOCK:
        last = await db.census.find_one({}, {"_id": 0}, sort=[("issue", -1)])
        end = now()
        if last and end - datetime.fromisoformat(last["published_at"]) < timedelta(days=6):
            logger.info("census skipped: issue %s is under 6 days old", last["issue"])
            return
        start = datetime.fromisoformat(last["published_at"]) if last else end - timedelta(days=7)
        docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "h": 1, "avatar_url": 1, "status": 1, "circle": 1,
                                                           "nb": 1, "created_at": 1, "finished_at": 1}).to_list(None)
        nbs = await db.neighbourhoods.find({"active": True}, {"_id": 0}).to_list(None)
        events = await db.events.find({"at": {"$gte": start.isoformat()}}, {"_id": 0}).to_list(None)
        data = build_census(docs, nbs, (last or {}).get("snapshot"), start.isoformat(), end.isoformat(), events)
        issue = (last or {}).get("issue", 0) + 1
        await db.census.insert_one({"issue": issue, "label": f"Week of {start:%b} {start.day}, {start:%Y}",
                                    "week_start": start.isoformat(), "week_end": end.isoformat(), "published_at": end.isoformat(),
                                    "capacity": TOWN_CAPACITY, **data, "snapshot": snapshot_of(docs)})
        await db.events.insert_one({"type": "census", "h": "", "issue": issue, "at": now_iso()})
        await bump()
        logger.info("census No. %s published", issue)


@api.get("/census")
async def census_list():
    issues = await db.census.find({}, {"_id": 0, "issue": 1, "label": 1}).sort("issue", -1).to_list(500)
    return {"issues": issues, "next_at": next_census_at()}


@api.get("/census/{issue}")
async def census_issue(issue: str, request: Request):
    c = await load_census(issue)
    base = public_base(request)
    v = card_hash(census_card_payload(c, base.split("://", 1)[-1]))
    return {**c, "card_url": f"{base}/api/census/{c['issue']}/card.jpg?v={v}",
            "share": {"text": census_share_text(c), "url": f"{base}/api/c/{c['issue']}"}}


@api.get("/census/{issue}/card.jpg")
async def census_card(issue: str, request: Request):
    c = await load_census(issue)
    host = public_base(request).split("://", 1)[-1]
    payload = census_card_payload(c, host)
    path = CENSUS_DIR / f"{c['issue']}-{card_hash(payload)}.jpg"
    if not path.exists():
        people = census_people(c)
        blobs = await asyncio.gather(*[fetch_avatar(u) for u in people.values()])
        data = await asyncio.to_thread(render_census, payload, dict(zip(people.keys(), blobs)), host)
        path.write_bytes(data)
    return Response(content=path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@api.get("/c/{issue}")
async def census_share_page(issue: str, request: Request):
    base = public_base(request)
    try:
        c = await load_census(issue)
    except HTTPException:
        return RedirectResponse(f"{base}/", status_code=302)
    target = f"{base}/census/{c['issue']}"
    if not BOT_RE.search(request.headers.get("user-agent", "")):
        return RedirectResponse(target, status_code=302)
    title = html.escape(f"XField Census No. {c['issue']}")
    desc = html.escape(f"{census_lead(c)}. {c['population']['taken']}/{c['capacity']} spots taken.")
    v = card_hash(census_card_payload(c, base.split("://", 1)[-1]))
    return og_page(title, desc, f"{base}/api/census/{c['issue']}/card.jpg?v={v}", target)


# ---------- platform crons ----------

async def accept_cron(request: Request, name: str) -> bool:
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or not secrets.compare_digest(token.encode(), WEBHOOK_CRON_SECRET.encode()):
        raise HTTPException(401, "Unauthorized")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid body")
    if not isinstance(body, dict):
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("x-webhook-id") or body.get("run_id")
    if not run_id:
        raise HTTPException(400, "Missing run id")
    try:
        await db.cron_runs.insert_one({"run_id": f"{name}:{run_id}", "ts": now()})
    except DuplicateKeyError:
        return False
    return True


@api.post("/cron/census")
async def cron_census(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not await accept_cron(request, "census"):
        return {"duplicate": True}
    asyncio.create_task(publish_census())
    return {"accepted": True}


@api.post("/cron/refresh")
async def cron_refresh(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not await accept_cron(request, "refresh"):
        return {"duplicate": True}
    asyncio.create_task(run_refresh())
    return {"accepted": True}


# ---------- owner-only ----------

async def require_admin(request: Request):
    ip = client_ip(request)
    if await db.admin_attempts.count_documents({"ip": ip, "ts": {"$gte": now() - timedelta(minutes=15)}}) >= 5:
        raise HTTPException(429, "Too many wrong keys. Try again in 15 minutes.")
    key = request.headers.get("x-admin-key", "")
    if not key or not secrets.compare_digest(key.encode(), ADMIN_KEY.encode()):
        await db.admin_attempts.insert_one({"ip": ip, "ts": now()})
        raise HTTPException(403, "Owner key required.")


@api.post("/admin/check")
async def admin_check(request: Request):
    await require_admin(request)
    return {"ok": True}


@api.post("/admin/residents/{handle}/hide")
async def admin_hide(handle: str, body: HideRequest, request: Request):
    await require_admin(request)
    k = normalize_handle(handle).lower()
    res = await db.residents.update_one({"k": k}, {"$set": {"hidden": body.hidden}})
    if not res.matched_count:
        raise HTTPException(404, "Nobody lives there.")
    async with TOWN_LOCK:
        created = await refresh_neighbourhoods()
        await bump()
    for nb_id in created:
        asyncio.create_task(name_neighbourhood(nb_id))
    return {"handle": handle, "hidden": body.hidden}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.residents.create_index("k", unique=True)
    await db.residents.create_index("by")
    await db.residents.create_index("nb")
    await db.neighbourhoods.create_index("id", unique=True)
    await db.events.create_index("at")
    await db.jobs.create_index("k", unique=True)
    await db.profiles.create_index("handle_lower", unique=True)
    await db.profiles_lite.create_index("k", unique=True)
    await db.movein_events.create_index("ts", expireAfterSeconds=3600)
    await db.admin_attempts.create_index("ts", expireAfterSeconds=900)
    await db.oauth_states.create_index("ts", expireAfterSeconds=600)
    await db.sessions.create_index("token_hash", unique=True)
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.census.create_index("issue", unique=True)
    await db.cron_runs.create_index("run_id", unique=True)
    await db.cron_runs.create_index("ts", expireAfterSeconds=30 * 86400)
    async for nb in db.neighbourhoods.find({"active": True, "named": False}, {"_id": 0, "id": 1}):
        asyncio.create_task(name_neighbourhood(nb["id"]))


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

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
from pymongo import ReturnDocument
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
DEV_MODE = os.environ.get("DEV_MODE") == "1"
DEV_CREWS = [
    ["ada_builds", "kernel_kat", "grace_ships", "turing_tim", "rustacean", "devops_dan", "lambda_liz", "byte_bob",
     "pixel_pam", "stack_sam", "null_nora", "async_al"],
    ["satoshi_jr", "hodl_hank", "degen_dee", "chart_chad", "yield_yan", "gas_gary", "mint_mia", "whale_wes",
     "alpha_ana", "bear_ben", "bull_bea", "ledger_lou"],
    ["goal_gabi", "dunk_dex", "sprint_sue", "lift_leo", "rally_rae", "pitch_pat", "serve_sky", "ace_amy",
     "slam_sid", "kick_kim", "race_rex", "coach_cal"],
    ["chef_coco", "umami_uma", "salt_sol", "brunch_bo", "taco_tia", "ramen_ray", "bake_bri", "spice_sid",
     "grill_gus", "vegan_viv", "sushi_sue", "pasta_pia"],
]
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
    "tech_campus": ("Tech Campus", "tech, AI, engineering, programming, science, startups building software"),
    "power_grid": ("Power Grid", "hardware, energy, climate, manufacturing, space, defense, robotics"),
    "stock_exchange": ("Stock Exchange", "crypto, trading, markets, finance, investing, betting"),
    "central_station": ("Central Station", "founders, business, VC, marketing, indie hackers, e-commerce"),
    "broadcast_tower": ("Broadcast Tower", "media, news, politics, journalism, entertainment, creators, music"),
    "university": ("University", "education, academia, research, books, writing, history, philosophy"),
    "stadium": ("Stadium", "sports, fitness, gaming, esports, athletes, fandoms"),
    "harbor": ("Harbor", "food, lifestyle, travel, fashion, health, family, everything else"),
}
FALLBACK_NAMES = ["North Quarter", "Harbor Point", "Midtown", "Eastgate", "Westfield Heights",
                  "Old Town", "Riverside", "Hilltop", "Uptown", "Southbank"]
CLAIM_EVERY = timedelta(minutes=1) if DEV_MODE else timedelta(hours=20)
MAYOR_TERM = timedelta(minutes=10) if DEV_MODE else timedelta(hours=24)
SHIFT_EVERY = timedelta(minutes=1) if DEV_MODE else timedelta(hours=8)
INVITE_COOKIE = "xf_invite"
TRUST_AGE = timedelta(days=30)
TRUST_FOLLOWERS = 10

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


class CharterRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=40)
    color: Optional[str] = None
    landmark: Optional[str] = None


class AmountRequest(BaseModel):
    amount: int = Field(ge=10, le=100000)


class ProjectRequest(BaseModel):
    project: str


class VoteRequest(BaseModel):
    candidate: str


class BoostRequest(BaseModel):
    nb_id: str


class WorkRequest(BaseModel):
    place: str


async def sync_floors():
    docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "x": 1, "y": 1, "floors": 1}).to_list(None)
    homes = Counter((d["x"], d["y"]) for d in docs)
    for d in docs:
        if d.get("floors") != homes[(d["x"], d["y"])]:
            await db.residents.update_one({"k": d["k"]}, {"$set": {"floors": homes[(d["x"], d["y"])]}})


async def bump():
    await sync_floors()
    await db.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}}, upsert=True)


async def town_version() -> int:
    doc = await db.meta.find_one({"_id": "town"})
    return (doc or {}).get("version", 0)


async def count_taken() -> int:
    return await db.residents.count_documents({"hidden": False})


# ---------- credits ----------

async def pay(k: str, amount: int, reason: str) -> bool:
    q = {"k": k} if amount >= 0 else {"k": k, "credits": {"$gte": -amount}}
    res = await db.residents.update_one(q, {"$inc": {"credits": amount}})
    if not res.modified_count:
        return False
    await db.ledger.insert_one({"k": k, "amount": amount, "reason": reason, "at": now_iso()})
    return True


async def mint_new_citizen(k: str, by_k: Optional[str], trusted: bool):
    res = await db.residents.update_one({"k": k, "minted": {"$ne": True}},
                                        {"$set": {"minted": True}, "$inc": {"credits": town.START_CREDITS}})
    if not res.modified_count:
        return
    await db.ledger.insert_one({"k": k, "amount": town.START_CREDITS, "reason": "lights_on", "at": now_iso()})
    if trusted and by_k and await db.residents.count_documents({"k": by_k, "status": "finished", "hidden": False}):
        await pay(by_k, town.RECRUIT_BOUNTY, f"recruit:{k}")
        await pay(k, town.RECRUIT_BOUNTY, f"recruited_by:{by_k}")


def is_trusted(u: dict) -> bool:
    created = u.get("created_at")
    if not created:
        return False
    age = now() - datetime.fromisoformat(created.replace("Z", "+00:00"))
    return age > TRUST_AGE and (u.get("public_metrics") or {}).get("followers_count", 0) >= TRUST_FOLLOWERS


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

def dev_avatar(k: str) -> str:
    return f"https://api.dicebear.com/9.x/notionists/png?seed={k}&backgroundColor=dbeafe&size=256"


def dev_profile(handle: str) -> dict:
    k = handle.lower()
    crew = next((c for c in DEV_CREWS if k in c), DEV_CREWS[town.hval(k) % len(DEV_CREWS)])
    mates = [m for m in crew if m != k]
    start = town.hval(k) % len(mates)
    circle = [{"handle": m, "name": m, "weight": CIRCLE_SIZE - i, "avatar_url": dev_avatar(m)}
              for i, m in enumerate((mates[start:] + mates[:start])[:CIRCLE_SIZE])]
    return {"handle": handle, "name": handle, "found": True, "protected": False, "avatar_url": dev_avatar(k),
            "bio": "Test citizen of XField.", "followers": 100, "posts": [], "circle": circle}


async def get_profile(handle: str, force: bool = False) -> dict:
    if DEV_MODE:
        return dev_profile(handle)
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
    occupied = {(d["x"], d["y"]) for d in docs} | town.civic_lots()
    pos = {d["k"]: (d["x"], d["y"]) for d in docs}
    async for nb in db.neighbourhoods.find({"active": True}, {"_id": 0, "bx": 1, "by": 1, "blocks": 1}):
        occupied.add((nb["bx"], nb["by"]))
        occupied.update(p for b in nb.get("blocks") or [] for p in town.block_lots(tuple(b)))
    return occupied, pos


def placed(d: dict) -> str:
    return d.get("placed_at") or d.get("created_at") or ""


async def home_of(x: int, y: int) -> list:
    """Everyone living on a lot, the person who built it first."""
    docs = await db.residents.find({"x": x, "y": y, "hidden": False}, {"_id": 0}).to_list(None)
    return sorted(docs, key=placed)


async def invite_home(by_k: str) -> Optional[tuple]:
    host = await db.residents.find_one({"k": by_k, "status": "finished", "hidden": False}, {"_id": 0})
    if not host:
        return None
    nb = await db.neighbourhoods.find_one({"id": host.get("nb"), "active": True}, {"_id": 0, "max_floors": 1}) if host.get("nb") else None
    cap = (nb or {}).get("max_floors") or town.DEFAULT_MAX_FLOORS
    return (host["x"], host["y"]) if len(await home_of(host["x"], host["y"])) < cap else None


async def leave_home(doc: dict) -> dict:
    """Housemates who join or found another district move out into a home of their own."""
    home = await home_of(doc["x"], doc["y"])
    if len(home) < 2 or home[0]["k"] == doc["k"]:
        return doc
    occupied, _ = await occupancy()
    x, y = town.nearest_free_lot(doc["x"], doc["y"], occupied)
    await db.residents.update_one({"k": doc["k"]}, {"$set": {"x": x, "y": y, "placed_at": now_iso()}})
    return {**doc, "x": x, "y": y}


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
            "by_h": h, "circle": [], "nb": None, "sign_tone": "pun", "floors": 1, "credits": 0, "created_at": now_iso()})
        added += 1
    return added


async def place_move_in(k: str, profile: dict, circle: list, by: Optional[str], verified: bool, trusted: bool):
    occupied, pos = await occupancy()
    taken = await count_taken()
    owner = await db.residents.find_one({"k": k}, {"_id": 0})
    was_reserved = bool(owner and owner["status"] == "reserved")
    home = await invite_home(by) if verified and by and by != k and not (owner and owner["status"] == "finished") else None
    if home:
        if not owner:
            if taken >= TOWN_CAPACITY:
                raise TownFull()
            taken += 1
        ox, oy = home
    elif owner:
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
    by_k = by if home else owner.get("by") if owner else (by if by and by != k else None)
    by_doc = await db.residents.find_one({"k": by_k}, {"_id": 0, "h": 1}) if by_k else None
    posts = [p["text"][:160] for p in (profile.get("posts") or [])[:8]]
    now_s = now_iso()
    lit_fields = {"verified": True, "finished_at": (owner or {}).get("finished_at") or now_s} if lit else {"verified": False}
    moved = {"placed_at": now_s, "by": by_k, "by_h": (by_doc or {}).get("h")} if home else {}
    await db.residents.update_one({"k": k}, {"$set": {
        "h": profile["handle"], "name": profile.get("name") or profile["handle"], "avatar_url": profile.get("avatar_url"),
        "bio": profile.get("bio", ""), "followers": profile.get("followers"), "posts": posts,
        "status": "finished" if lit else "reserved", "circle": [{"k": c["handle"].lower(), "w": c["weight"]} for c in circle],
        "read_at": now_s, "x": ox, "y": oy, **lit_fields, **moved,
    }, "$setOnInsert": {"k": k, "hidden": False, "nb": None, "sign_tone": "pun", "floors": 1, "credits": 0, "created_at": now_s,
                        **({} if home else {"by": by_k, "by_h": (by_doc or {}).get("h"), "placed_at": now_s})}}, upsert=True)
    if lit:
        await mint_new_citizen(k, by_k, trusted)
    new_reserved = await reserve_circle(k, profile["handle"], ox, oy, circle, occupied, pos, taken)
    kind = "home" if home else ("lights_on" if was_reserved else "moved_in") if verified else "built"
    await db.events.insert_one({"type": kind, "h": profile["handle"],
                                "by_h": (owner or {}).get("by_h") or (by_doc or {}).get("h"), "n": new_reserved, "at": now_s})


def new_district(anchor: str, lot: tuple, size: int, **extra) -> dict:
    nb_id = secrets.token_urlsafe(5)
    return {"id": nb_id, "anchor": anchor, "bx": lot[0], "by": lot[1], "landmark": None, "name": None, "named": False,
            "active": True, "size": size, "created_at": now_iso(), "claimed": False, "founder_k": None, "mayor_k": None,
            "color": town.color_for(nb_id), "plot_cap": town.DEFAULT_PLOT_CAP, "max_floors": town.DEFAULT_MAX_FLOORS,
            "treasury": 0, "project": "plots", "votes": {}, "contrib": {}, "highways": [], **extra}


async def refresh_neighbourhoods() -> list:
    docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "x": 1, "y": 1, "circle": 1, "nb": 1,
                                                       "member": 1, "placed_at": 1, "created_at": 1}).to_list(None)
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
    joined = {d["k"]: d["member"] for d in docs if d.get("member") in active_by_id}
    occupied, _ = await occupancy()
    assign, used, created = {}, set(), []
    for g in sorted(groups, key=lambda g: (-len(g), min(g))):
        free = [k for k in g if k not in joined]
        votes = Counter(cur_nb[k] for k in free if cur_nb.get(k) in active_by_id and cur_nb[k] not in used)
        if votes and len(free) >= town.DISSOLVE_BELOW:
            nb = active_by_id[min(votes, key=lambda i: (-votes[i], active_by_id[i]["created_at"]))]
        elif len(free) >= town.MIN_NEIGHBOURHOOD:
            anchor = max(free, key=lambda k: (indeg[k], -town.hval(k)))
            cx = sum(pos[k][0] for k in free) / len(free)
            cy = sum(pos[k][1] for k in free) / len(free)
            lot = town.nearest_free_lot(cx, cy, occupied)
            nb = new_district(anchor, lot, len(free), color=town.color_for(anchor, {n.get("color") for n in active}))
            active.append(nb)
            await db.neighbourhoods.insert_one(dict(nb))
            occupied.add(lot)
            created.append(nb["id"])
        else:
            continue
        used.add(nb["id"])
        for k in free:
            assign[k] = nb["id"]
    assign.update(joined)
    head = {}
    for d in sorted(docs, key=placed):
        head.setdefault((d["x"], d["y"]), d["k"])
    for d in docs:
        first = head[(d["x"], d["y"])]
        if first != d["k"] and d["k"] not in joined:
            assign[d["k"]] = assign.get(first)
    sizes = Counter(v for v in assign.values() if v)
    for nb in active:
        if nb["id"] in sizes or nb.get("claimed"):
            await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {"size": sizes.get(nb["id"], 0)}})
            continue
        await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {"active": False}})
        if nb.get("named"):
            await db.events.insert_one({"type": "nb_gone", "h": "", "name": nb["name"], "at": now_iso()})
    for nb_id in created:
        await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {"size": sizes[nb_id]}})
    changes = defaultdict(list)
    for d in docs:
        if d.get("nb") != assign.get(d["k"]):
            changes[assign.get(d["k"])].append(d["k"])
    for nb_id, ks in changes.items():
        await db.residents.update_many({"k": {"$in": ks}}, {"$set": {"nb": nb_id}})
    await tidy_blocks()
    return created


async def tidy_blocks():
    docs = await db.residents.find({}, {"_id": 0, "x": 1, "y": 1, "nb": 1, "placed_at": 1, "created_at": 1}).to_list(None)
    nbs = await db.neighbourhoods.find({"active": True}, {"_id": 0, "id": 1, "bx": 1, "by": 1, "blocks": 1,
                                                          "created_at": 1}).sort("created_at", 1).to_list(None)
    homes = {}
    for d in sorted(docs, key=placed):
        homes.setdefault((d["x"], d["y"]), d.get("nb"))
    moves, blocks, landmarks = town.plan_blocks(homes, nbs)
    for (ox, oy), (nx, ny) in moves.items():
        await db.residents.update_many({"x": ox, "y": oy}, {"$set": {"x": nx, "y": ny}})
    for nb in nbs:
        lx, ly = landmarks[nb["id"]]
        await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {"blocks": [list(b) for b in blocks[nb["id"]]],
                                                                       "bx": lx, "by": ly}})


NAMING_SYSTEM = (
    "You run the planning office of XField, a SimCity-style city on X. A new district formed from a group of X "
    "accounts who talk to each other. Pick the one landmark that fits what they post about, and invent a short district "
    "name that sounds like a real city district (e.g. 'Silicon Heights', 'Ledger Row', 'Founders Quarter'). Max 3 "
    "words, max 24 characters, no handles, no real people's names, nothing mean or crude. Match the topic list "
    "literally: crypto and trading get stock_exchange; AI and software get tech_campus. Spread landmarks around the "
    "city: avoid the ones already used a lot unless they are clearly the best fit. "
    "Reply with JSON only: {\"landmark\": \"<key>\", \"name\": \"<name>\"}.\nLandmark keys:\n"
    + "\n".join(f"- {k}: {label} ({topics})" for k, (label, topics) in LANDMARKS.items())
)


async def _fallback_name(nb_id: str) -> str:
    used = {n.get("name") async for n in db.neighbourhoods.find({"active": True}, {"_id": 0, "name": 1})}
    free = [n for n in FALLBACK_NAMES if n not in used] or FALLBACK_NAMES
    return free[town.hval(nb_id) % len(free)]


def clean_name(raw: Optional[str]) -> Optional[str]:
    cand = re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9 '\-&.]", "", str(raw or ""))).strip()
    return cand if cand and len(cand) <= 26 and not contains_blocked(cand) else None


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
    landmark, name = "harbor", await _fallback_name(nb_id)
    if DEV_MODE:
        used = {n.get("landmark") async for n in db.neighbourhoods.find({"active": True, "named": True}, {"_id": 0, "landmark": 1})}
        landmark = next((k for k in LANDMARKS if k not in used), "harbor")
        lines = []
    try:
        if not lines:
            raise RuntimeError("no residents to read")
        used = Counter([n["landmark"] async for n in db.neighbourhoods.find({"active": True, "named": True}, {"_id": 0, "landmark": 1})])
        used_line = ", ".join(f"{k} x{v}" for k, v in used.most_common()) or "none yet"
        prompt = f"Landmarks already in town: {used_line}\n\nResidents:\n" + "\n".join(lines)
        chat = LlmChat(api_key=LLM_KEY, session_id=f"nb-{uuid.uuid4()}", system_message=NAMING_SYSTEM).with_model("anthropic", NAMING_MODEL)
        raw = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=40)
        m = re.search(r"\{.*\}", raw, re.S)
        out = json.loads(m.group(0)) if m else {}
        if out.get("landmark") in LANDMARKS:
            landmark = out["landmark"]
        name = clean_name(out.get("name")) or name
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


async def run_move_in(k: str, h: str, by: Optional[str], verified: bool, fallback: Optional[dict] = None,
                      trusted: bool = False):
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
                await place_move_in(k, profile, circle, by, verified, trusted)
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
    asyncio.create_task(run_move_in(k, h, by, verified, trusted=bool(verified and user.get("trusted"))))
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
               "circle": 1, "signs": 1, "sign_tone": 1, "floors": 1, "placed_at": 1, "created_at": 1, "job": 1}
DISTRICT_PUBLIC = {"_id": 0, "votes": 0, "contrib": 0}


# ---------- city hall: a mayor elected by everyone, every term ----------

async def city_state() -> dict:
    c = await db.meta.find_one({"_id": "city"}, {"_id": 0})
    if not c:
        await db.meta.update_one({"_id": "city"}, {"$setOnInsert": {
            "term": 1, "ends_at": (now() + MAYOR_TERM).isoformat(), "mayor_k": None, "votes": {}, "candidates": [],
            "vault": 0, "boost": None}}, upsert=True)
        c = await db.meta.find_one({"_id": "city"}, {"_id": 0})
    if now() < datetime.fromisoformat(c["ends_at"]):
        return c
    lit = {d["k"] async for d in db.residents.find({"status": "finished", "hidden": False}, {"_id": 0, "k": 1})}
    running = lit & set(c.get("candidates") or [])
    tally = Counter(v for voter, v in (c.get("votes") or {}).items() if voter in lit and v in running)
    old = c.get("mayor_k")
    winner = max(tally, key=lambda k: (tally[k], k == old, k), default=old)
    ends = datetime.fromisoformat(c["ends_at"]) + MAYOR_TERM
    res = await db.meta.update_one({"_id": "city", "term": c["term"]}, {"$set": {
        "mayor_k": winner, "votes": {}, "candidates": [], "vault": 0, "boost": c.get("boost") if winner == old else None,
        "ends_at": (ends if ends > now() else now() + MAYOR_TERM).isoformat()}, "$inc": {"term": 1}})
    if res.modified_count:
        if old and c.get("vault"):
            await pay(old, c["vault"], "mayor_salary")
        if winner and winner != old:
            w = await db.residents.find_one({"k": winner}, {"_id": 0, "h": 1})
            await db.events.insert_one({"type": "city_mayor", "h": w["h"], "n": tally[winner], "at": now_iso()})
        await bump()
    return await db.meta.find_one({"_id": "city"}, {"_id": 0})


def city_public(c: dict, by_k: dict, nbs: list) -> dict:
    lit = {k for k, d in by_k.items() if d["status"] == "finished"}
    running = [k for k in c.get("candidates") or [] if k in lit]
    votes = {v: cand for v, cand in (c.get("votes") or {}).items() if v in lit and cand in running}
    tally = Counter(votes.values())
    boost = next((n for n in nbs if n["id"] == c.get("boost")), None)
    return {"term": c["term"], "ends_at": c["ends_at"], "mayor": person(by_k.get(c.get("mayor_k"))),
            "vault": c.get("vault", 0), "voters": len(votes), "citizens": len(lit), "tax": town.TAX_RATE,
            "term_hours": round(MAYOR_TERM.total_seconds() / 3600, 2), "run_fee": town.RUN_FEE,
            "boost": {"id": boost["id"], "name": boost.get("name"), "color": boost.get("color")} if boost else None,
            "race": sorted(({**person(by_k[k]), "votes": tally[k]} for k in running), key=lambda p: -p["votes"])}


@api.get("/town")
async def get_town(v: Optional[int] = None):
    c = await city_state()
    version = await town_version()
    if v is not None and v == version:
        return {"unchanged": True, "version": version}
    docs = sorted(await db.residents.find({"hidden": False}, TOWN_FIELDS).to_list(None), key=placed)
    residents = []
    for d in docs:
        f = town.floors_of(d)
        residents.append({"k": d["k"], "h": d["h"], "n": d.get("name") or d["h"], "a": d.get("avatar_url"),
                          "s": "f" if d["status"] == "finished" else "r", "x": d["x"], "y": d["y"], "f": f,
                          "t": town.tier_of(f), "by": d.get("by_h"), "nb": d.get("nb"), "sg": sign_of(d)})
    nbs = await db.neighbourhoods.find({"active": True}, DISTRICT_PUBLIC).to_list(None)
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
            "city": city_public(c, {d["k"]: d for d in docs}, nbs),
            "workers": Counter(d["job"] for d in docs if d.get("job")),
            "options": {"colors": town.FACTION_COLORS, "projects": town.PROJECTS,
                        "landmarks": {key: label for key, (label, _) in LANDMARKS.items()}},
            "stats": {"taken": len(residents), "capacity": TOWN_CAPACITY, "finished": finished,
                      "reserved": len(residents) - finished, "neighbourhoods": len(nbs),
                      "biggest": {"name": biggest.get("name"), "size": biggest.get("size")} if biggest and biggest.get("name") else None}}


async def load_resident(handle: str) -> dict:
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Nobody lives there yet.")
    return doc


LOT_FIELDS = {"_id": 0, "k": 1, "h": 1, "name": 1, "avatar_url": 1, "status": 1, "circle": 1, "x": 1, "y": 1,
              "floors": 1, "nb": 1}


async def street(doc: dict) -> dict:
    all_docs = await db.residents.find({"hidden": False}, LOT_FIELDS).to_list(None)
    by_k = {d["k"]: d for d in all_docs}
    indeg = town.inbound_counts(all_docs)
    own = [c["k"] for c in sorted(doc.get("circle") or [], key=lambda c: -c["w"])]
    inbound = [d["k"] for d in all_docs if any(c["k"] == doc["k"] for c in d.get("circle") or [])]
    order = [k for k in dict.fromkeys(own + inbound) if k in by_k]
    neighbours = []
    for k in order[:8]:
        d = by_k[k]
        f = town.floors_of(d)
        neighbours.append({"k": k, "h": d["h"], "n": d.get("name"), "a": d.get("avatar_url"), "f": f,
                           "s": "f" if d["status"] == "finished" else "r", "t": town.tier_of(f)})
    tags = [n["h"] for n in neighbours if n["s"] == "r" and n["k"] in own][:3]
    nb = await db.neighbourhoods.find_one({"id": doc.get("nb"), "active": True}, {"_id": 0}) if doc.get("nb") else None
    floors = town.floors_of(doc)
    return {"neighbours": neighbours, "tags": tags, "floors": floors, "tier": town.tier_of(floors),
            "inbound": indeg[doc["k"]], "nb": nb, "docs": all_docs, "indeg": indeg}


def card_payload(doc: dict, st: dict) -> dict:
    nb = st["nb"] or {}
    return {"k": doc["k"], "h": doc["h"], "floors": st["floors"], "status": doc["status"], "nb_name": nb.get("name"),
            "landmark": nb.get("landmark"), "color": nb.get("color"), "tags": st["tags"], "sign": sign_of(doc),
            "neighbours": [{"k": n["k"], "h": n["h"], "floors": n["f"], "status": "reserved" if n["s"] == "r" else "finished"}
                           for n in st["neighbours"]],
            "avatars": {doc["k"]: doc.get("avatar_url"), **{n["k"]: n["a"] for n in st["neighbours"]}}}


def card_hash(payload: dict) -> str:
    return hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:10]


def share_text(doc: dict, st: dict) -> str:
    if doc["status"] != "finished":
        return f"@{doc['h']} your lot in XField is reserved. Only you can claim it \u2192"
    where = f"I live in {st['nb']['name']} on XField." if st["nb"] and st["nb"].get("name") else "I'm building on XField."
    if st["tags"]:
        return f"{where} " + " ".join(f"@{t}" for t in st["tags"]) + " your lots are reserved \u2192"
    return f"{where} Come claim a lot \u2192"


@api.get("/residents/{handle}")
async def resident(handle: str, request: Request):
    doc = await load_resident(handle)
    st = await street(doc)
    user = await current_user(request)
    base = public_base(request)
    brought = await db.residents.count_documents({"by": doc["k"], "hidden": False})
    lit = await db.residents.count_documents({"by": doc["k"], "hidden": False, "status": "finished"})
    nb = st["nb"]
    max_floors = (nb or {}).get("max_floors") or town.DEFAULT_MAX_FLOORS
    home = await home_of(doc["x"], doc["y"])
    is_me = bool(user and user["k"] == doc["k"])
    v = card_hash(card_payload(doc, st))
    out = {"k": doc["k"], "h": doc["h"], "name": doc.get("name"), "avatar_url": doc.get("avatar_url"),
           "status": "finished" if doc["status"] == "finished" else "reserved", "x": doc["x"], "y": doc["y"],
           "tier": st["tier"], "tier_name": town.TIERS[st["tier"]], "inbound": st["inbound"], "by_h": doc.get("by_h"),
           "floors": st["floors"], "max_floors": max_floors, "land_value": town.land_value(st["floors"], st["inbound"]),
           "home": {"host": person(home[0]) if home else None, "mates": [person(d) for d in home]},
           "member": bool(doc.get("member")),
           "neighbourhood": {"id": nb["id"], "name": nb.get("name"), "landmark": nb.get("landmark"), "color": nb.get("color"),
                             "claimed": bool(nb.get("claimed")), "founder": nb.get("founder_k") == doc["k"],
                             "mayor": nb.get("mayor_k") == doc["k"]} if nb else None,
           "neighbours": st["neighbours"], "brought": brought, "brought_lit": lit,
           "signs": doc.get("signs"), "sign_tone": doc.get("sign_tone") or "pun", "is_me": is_me,
           "share": {"text": share_text(doc, st), "url": f"{base}/api/s/{doc['h']}", "tags": st["tags"]},
           "card_url": f"{base}/api/residents/{doc['h']}/card.jpg?v={v}"}
    if is_me:
        last = doc.get("last_claim_at")
        c = await city_state()
        out["economy"] = {"credits": doc.get("credits", 0),
                          "next_claim_at": (datetime.fromisoformat(last) + CLAIM_EVERY).isoformat() if last else None,
                          "rent": rent_of(doc, st["docs"], nb, c), "vote": (c.get("votes") or {}).get(doc["k"]),
                          "running": doc["k"] in (c.get("candidates") or []), "run_fee": town.RUN_FEE,
                          "job": doc.get("job"), "title": town.WORKPLACES.get(doc.get("job")), "shifts": doc.get("shifts", 0),
                          "wage": town.wage(doc.get("shifts", 0)), "wage_new": town.wage(0),
                          "next_shift_at": (datetime.fromisoformat(doc["shift_at"]) + SHIFT_EVERY).isoformat()
                          if doc.get("shift_at") else None,
                          "invite_url": f"{base}/api/i/{doc['h']}", "bounty": town.RECRUIT_BOUNTY,
                          "guests": sum(1 for d in home if d.get("by") == doc["k"] and d["status"] == "finished"),
                          "treasury": (nb or {}).get("treasury")}
    return out


def rent_of(doc: dict, docs: list, nb: Optional[dict], c: dict) -> dict:
    return town.rent(doc, docs, len((nb or {}).get("highways") or []), bool(nb) and c.get("boost") == nb["id"])


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
        desc = f"Next to {tags}. Your lot is reserved." if tags else "XField: a city on X, built by the people who talk to each other."
    else:
        title = f"@{doc['h']}, your lot in XField is reserved"
        desc = "Only you can claim it. Sign in with X to move in."
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
    user = await current_user(request)
    if user:
        doc = await db.residents.find_one({"k": user["k"], "hidden": False}, {"_id": 0, "credits": 1, "nb": 1})
        user = {**user, "credits": (doc or {}).get("credits", 0), "nb": (doc or {}).get("nb")}
    return {"enabled": AUTH_ON or DEV_MODE, "user": user}


@api.get("/auth/x/login")
async def x_login(request: Request, next: Optional[str] = None):
    base = public_base(request)
    if DEV_MODE:
        crews = "".join(f"<p>{', '.join(c[:9])}</p>" for c in DEV_CREWS)
        return HTMLResponse(f"""<!doctype html><html><body style="font:17px system-ui;max-width:560px;margin:12vh auto">
<h2>XField test mode</h2><form action="/api/dev/login"><input type="hidden" name="next" value="{html.escape(_safe_next(next))}">
<input name="handle" placeholder="any handle" autofocus required style="font:inherit;padding:8px">
<button style="font:inherit;padding:8px 16px">Sign in</button></form>
<p style="color:#64748b">Or sign in as a seeded citizen. The first handle in each crew is its district's founder.</p>{crews}</body></html>""")
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
        me = await c.get(X_ME, params={"user.fields": "profile_image_url,name,username,created_at,public_metrics"},
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
    trusted = is_trusted(u)
    await db.sessions.insert_one({"token_hash": _hash(token), "x_id": u.get("id"), "k": k, "h": h, "name": u.get("name") or h,
                                  "avatar_url": avatar, "trusted": trusted, "created_at": now_iso(),
                                  "expires_at": now() + timedelta(days=30)})
    res = await db.residents.find_one({"k": k}, {"_id": 0})
    if not (res and res.get("hidden")) and not (res and res["status"] == "finished" and fresh(res.get("read_at"))):
        await db.jobs.update_one({"k": k}, {"$set": {"k": k, "h": h, "state": "queued", "code": None, "updated_at": now_iso()}}, upsert=True)
        fallback = {"handle": h, "name": u.get("name") or h, "avatar_url": avatar, "bio": ""}
        asyncio.create_task(run_move_in(k, h, request.cookies.get(INVITE_COOKIE), True, fallback, trusted))
    nxt = st.get("next") or "/"
    target = f"{base}/?welcome=1" if nxt in ("/", f"/h/{h}", f"/h/{k}") else f"{base}{nxt}"
    resp = RedirectResponse(target, status_code=302)
    resp.set_cookie(SESSION_COOKIE, token, max_age=30 * 86400, httponly=True, secure=True, samesite="lax", path="/")
    resp.delete_cookie(STATE_COOKIE, path="/api/auth")
    resp.delete_cookie(INVITE_COOKIE, path="/")
    return resp


@api.get("/dev/login")
async def dev_login(handle: str, request: Request, next: Optional[str] = None):
    if not DEV_MODE:
        raise HTTPException(404)
    h = clean_handle(handle)
    k = h.lower()
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({"token_hash": _hash(token), "k": k, "h": h, "name": h, "avatar_url": dev_avatar(k),
                                  "trusted": True, "created_at": now_iso(), "expires_at": now() + timedelta(days=30)})
    res = await db.residents.find_one({"k": k}, {"_id": 0, "status": 1})
    target = _safe_next(next)
    if not res or res["status"] != "finished":
        await run_move_in(k, h, request.cookies.get(INVITE_COOKIE), True, trusted=True)
        target = "/?welcome=1"
    resp = RedirectResponse(target, status_code=302)
    resp.set_cookie(SESSION_COOKIE, token, max_age=30 * 86400, httponly=True, samesite="lax", path="/")
    resp.delete_cookie(INVITE_COOKIE, path="/")
    return resp


async def dev_seed():
    for crew in DEV_CREWS:
        for h in crew[:9]:
            await run_move_in(h, h, None, True, trusted=True)
    for crew in DEV_CREWS:
        for host, guests in ((crew[0], crew[1:4]), (crew[4], crew[5:6])):
            doc = await db.residents.find_one({"k": host}, {"_id": 0, "x": 1, "y": 1})
            await db.residents.update_many({"k": {"$in": guests}}, {"$set": {"x": doc["x"], "y": doc["y"], "placed_at": now_iso(),
                                                                          "by": host, "by_h": host}})
    await city_state()
    places = list(town.WORKPLACES)
    for i, k in enumerate(h for crew in DEV_CREWS for h in crew[:6]):
        await db.residents.update_one({"k": k}, {"$set": {"job": places[i % len(places)], "shifts": i % 7}})
    await db.meta.update_one({"_id": "city"}, {"$set": {"mayor_k": DEV_CREWS[1][0], "candidates": [
        DEV_CREWS[0][0], DEV_CREWS[2][0], DEV_CREWS[1][0]], "votes": {
        **{k: DEV_CREWS[0][0] for k in DEV_CREWS[0][1:6]}, **{k: DEV_CREWS[2][0] for k in DEV_CREWS[2][1:4]},
        **{k: DEV_CREWS[1][0] for k in DEV_CREWS[1][1:3]}}, "vault": 640}})
    await refresh_neighbourhoods()
    for crew in DEV_CREWS[:2]:
        doc = await db.residents.find_one({"k": crew[0]}, {"_id": 0, "nb": 1})
        if doc and doc.get("nb"):
            await db.neighbourhoods.update_one({"id": doc["nb"]}, {"$set": {
                "claimed": True, "founder_k": crew[0], "mayor_k": crew[0], "anchor": crew[0], "max_floors": 8, "treasury": 420}})
            await db.residents.update_one({"k": crew[0]}, {"$set": {"member": doc["nb"]}})
    await bump()
    logger.info("dev mode: seeded %d residents", await count_taken())


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.sessions.delete_one({"token_hash": _hash(token)})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


# ---------- town life: weekly re-reads, moves and demolitions ----------

async def tier_map() -> dict:
    docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "floors": 1}).to_list(None)
    return {d["k"]: town.tier_of(town.floors_of(d)) for d in docs}


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
    if not cur.get("member") and town.floors_of(cur) == 1 and town.should_move(old_top, new_top):
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


# ---------- districts ----------

async def regroup():
    for nb_id in await refresh_neighbourhoods():
        asyncio.create_task(name_neighbourhood(nb_id))


async def require_citizen(request: Request) -> dict:
    user = await current_user(request)
    if not user:
        raise HTTPException(401, "Sign in with X first.")
    doc = await db.residents.find_one({"k": user["k"], "hidden": False, "status": "finished"}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Light your house first.")
    return doc


async def load_district(nb_id: str) -> dict:
    nb = await db.neighbourhoods.find_one({"id": nb_id, "active": True}, {"_id": 0})
    if not nb:
        raise HTTPException(404, "That district doesn't exist.")
    return nb


def person(d: Optional[dict]) -> Optional[dict]:
    return {"k": d["k"], "h": d["h"], "a": d.get("avatar_url")} if d else None


def tally(nb: dict, lit: set) -> Counter:
    return Counter(c for v, c in (nb.get("votes") or {}).items() if v in lit and c in lit)


def charter_fields(body: CharterRequest) -> dict:
    out = {}
    if body.name is not None:
        name = clean_name(body.name)
        if not name:
            raise HTTPException(400, "District names use letters and numbers, max 26 characters.")
        out.update(name=name, named=True)
    if body.color is not None:
        if body.color not in town.FACTION_COLORS:
            raise HTTPException(400, "Pick one of the district colours.")
        out["color"] = body.color
    if body.landmark is not None:
        if body.landmark not in LANDMARKS:
            raise HTTPException(400, "Pick one of the landmarks.")
        out["landmark"] = body.landmark
    return out


async def nearest_unlinked(nb: dict) -> Optional[dict]:
    others = await db.neighbourhoods.find({"active": True, "id": {"$nin": [nb["id"], *(nb.get("highways") or [])]}},
                                          {"_id": 0, "id": 1, "name": 1, "bx": 1, "by": 1}).to_list(None)
    return min(others, key=lambda o: (math.dist((o["bx"], o["by"]), (nb["bx"], nb["by"])), o["id"]), default=None)


async def run_projects(nb: dict) -> list:
    built = []
    while nb["treasury"] >= town.expansion_cost(nb):
        inc = {"treasury": -town.expansion_cost(nb)}
        link = await nearest_unlinked(nb) if nb.get("project") == "highway" else None
        if link:
            await db.neighbourhoods.update_one({"id": link["id"]}, {"$addToSet": {"highways": nb["id"]}})
            upd = {"$inc": inc, "$addToSet": {"highways": link["id"]}}
            await db.events.insert_one({"type": "highway", "h": "", "nb": nb["id"], "name": link.get("name"), "at": now_iso()})
            built.append("highway")
        else:
            key, step, project = ("max_floors", 2, "height") if nb.get("project") == "height" else ("plot_cap", 6, "plots")
            inc[key] = step
            upd = {"$inc": inc}
            await db.events.insert_one({"type": "expanded", "h": "", "nb": nb["id"], "project": project, "n": step,
                                        "at": now_iso()})
            built.append(project)
        nb = await db.neighbourhoods.find_one_and_update({"id": nb["id"]}, upd, projection={"_id": 0},
                                                         return_document=ReturnDocument.AFTER)
    return built


@api.get("/districts/{nb_id}")
async def district(nb_id: str, request: Request):
    nb = await load_district(nb_id)
    user = await current_user(request)
    docs = await db.residents.find({"hidden": False}, LOT_FIELDS).to_list(None)
    by_k = {d["k"]: d for d in docs}
    members = [d for d in docs if d.get("nb") == nb_id]
    lit = {d["k"] for d in members if d["status"] == "finished"}
    contrib = sorted((nb.get("contrib") or {}).items(), key=lambda kv: -kv[1])[:5]
    links = await db.neighbourhoods.find({"id": {"$in": nb.get("highways") or []}, "active": True},
                                         {"_id": 0, "id": 1, "name": 1, "color": 1}).to_list(None)
    me = by_k.get(user["k"]) if user else None
    k = me["k"] if me else None
    return {
        **{f: nb.get(f) for f in ("id", "name", "landmark", "color", "claimed", "size", "plot_cap", "max_floors",
                                  "treasury", "project", "bx", "by")},
        "expansion_cost": town.expansion_cost(nb),
        "founder": person(by_k.get(nb.get("founder_k"))), "mayor": person(by_k.get(nb.get("mayor_k"))),
        "anchor": person(by_k.get(nb.get("anchor"))),
        "members": sorted(({**person(d), "s": "f" if d["status"] == "finished" else "r", "f": town.floors_of(d)}
                           for d in members), key=lambda m: (-m["f"], m["k"]))[:30],
        "lit": len(lit),
        "contributors": [{**person(by_k[c]), "amount": amount} for c, amount in contrib if c in by_k],
        "highways": links,
        "election": {"open": bool(nb.get("claimed")) and len(lit) >= town.ELECTION_MIN, "min": town.ELECTION_MIN,
                     "tally": [{**person(by_k[c]), "votes": n} for c, n in tally(nb, lit).most_common(5)]},
        "me": {"member": me.get("nb") == nb_id, "lit": me["status"] == "finished",
               "founder": k == nb.get("founder_k"), "mayor": k == nb.get("mayor_k"),
               "can_claim": not nb.get("claimed") and k == nb.get("anchor") and me["status"] == "finished",
               "vote": (nb.get("votes") or {}).get(k)} if me else None,
    }


@api.post("/districts/charter")
async def charter_district(body: CharterRequest, request: Request):
    doc = await require_citizen(request)
    if not body.name:
        raise HTTPException(400, "Name your district.")
    fields = charter_fields(body)
    async with TOWN_LOCK:
        if await db.neighbourhoods.count_documents({"active": True, "founder_k": doc["k"]}):
            raise HTTPException(409, "You already founded a district.")
        doc = await leave_home(doc)
        occupied, _ = await occupancy()
        lot = town.nearest_free_lot(doc["x"], doc["y"], occupied)
        nb = new_district(doc["k"], lot, 1, **{"claimed": True, "founder_k": doc["k"], "mayor_k": doc["k"],
                                               "landmark": "harbor", **fields})
        await db.neighbourhoods.insert_one(dict(nb))
        await db.residents.update_one({"k": doc["k"]}, {"$set": {"member": nb["id"], "nb": nb["id"]}})
        await regroup()
        await db.events.insert_one({"type": "chartered", "h": doc["h"], "nb": nb["id"], "at": now_iso()})
        await bump()
    return await district(nb["id"], request)


@api.post("/districts/{nb_id}/claim")
async def claim_district(nb_id: str, body: CharterRequest, request: Request):
    doc = await require_citizen(request)
    fields = charter_fields(body)
    async with TOWN_LOCK:
        nb = await load_district(nb_id)
        if nb.get("claimed") or nb.get("anchor") != doc["k"]:
            raise HTTPException(403, "Only the handle this district formed around can claim it.")
        await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {"claimed": True, "founder_k": doc["k"],
                                                                    "mayor_k": doc["k"], **fields}})
        await db.residents.update_one({"k": doc["k"]}, {"$set": {"member": nb_id, "nb": nb_id}})
        await regroup()
        await db.events.insert_one({"type": "claimed", "h": doc["h"], "nb": nb_id, "at": now_iso()})
        await bump()
    return await district(nb_id, request)


@api.post("/districts/{nb_id}/join")
async def join_district(nb_id: str, request: Request):
    doc = await require_citizen(request)
    async with TOWN_LOCK:
        nb = await load_district(nb_id)
        if doc.get("member") == nb_id:
            raise HTTPException(400, "You already live here.")
        if await db.neighbourhoods.count_documents({"active": True, "founder_k": doc["k"], "id": {"$ne": nb_id}}):
            raise HTTPException(409, "Founders stay in the district they founded.")
        if doc.get("nb") != nb_id and nb["size"] >= nb["plot_cap"]:
            raise HTTPException(409, f"{nb.get('name') or 'This district'} is full. Its citizens need to fund more plots.")
        await leave_home(doc)
        await db.residents.update_one({"k": doc["k"]}, {"$set": {"member": nb_id, "nb": nb_id}})
        await regroup()
        await db.events.insert_one({"type": "joined", "h": doc["h"], "nb": nb_id, "at": now_iso()})
        await bump()
        me = await db.residents.find_one({"k": doc["k"]}, {"_id": 0, "x": 1, "y": 1})
    return {"x": me["x"], "y": me["y"]}


@api.post("/districts/{nb_id}/contribute")
async def contribute(nb_id: str, body: AmountRequest, request: Request):
    doc = await require_citizen(request)
    async with TOWN_LOCK:
        await load_district(nb_id)
        if doc.get("nb") != nb_id:
            raise HTTPException(403, "Only citizens can fund this district.")
        if not await pay(doc["k"], -body.amount, f"treasury:{nb_id}"):
            raise HTTPException(400, "Not enough credits.")
        nb = await db.neighbourhoods.find_one_and_update(
            {"id": nb_id}, {"$inc": {"treasury": body.amount, f"contrib.{doc['k']}": body.amount}},
            projection={"_id": 0}, return_document=ReturnDocument.AFTER)
        built = await run_projects(nb)
        await bump()
    return {"built": built}


@api.post("/districts/{nb_id}/project")
async def set_project(nb_id: str, body: ProjectRequest, request: Request):
    doc = await require_citizen(request)
    if body.project not in town.PROJECTS:
        raise HTTPException(400, "Pick plots, height or highway.")
    res = await db.neighbourhoods.update_one({"id": nb_id, "active": True, "mayor_k": doc["k"]},
                                             {"$set": {"project": body.project}})
    if not res.matched_count:
        raise HTTPException(403, "Only the mayor picks the next project.")
    await bump()
    return {"project": body.project}


@api.post("/districts/{nb_id}/vote")
async def vote(nb_id: str, body: VoteRequest, request: Request):
    doc = await require_citizen(request)
    cand = normalize_handle(body.candidate).lower()
    async with TOWN_LOCK:
        nb = await load_district(nb_id)
        lit = {d["k"] async for d in db.residents.find({"nb": nb_id, "hidden": False, "status": "finished"}, {"_id": 0, "k": 1})}
        if not nb.get("claimed") or len(lit) < town.ELECTION_MIN:
            raise HTTPException(400, f"Elections open once {town.ELECTION_MIN} citizens have lit their houses.")
        if doc["k"] not in lit or cand not in lit:
            raise HTTPException(403, "Only lit citizens of this district can vote or run.")
        await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {f"votes.{doc['k']}": cand}})
        nb["votes"] = {**(nb.get("votes") or {}), doc["k"]: cand}
        leader, n = (tally(nb, lit).most_common(1) or [(None, 0)])[0]
        if leader and leader != nb.get("mayor_k") and n * 2 > len(lit):
            await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {"mayor_k": leader}})
            h = (await db.residents.find_one({"k": leader}, {"_id": 0, "h": 1}))["h"]
            await db.events.insert_one({"type": "new_mayor", "h": h, "nb": nb_id, "at": now_iso()})
        await bump()
    return await district(nb_id, request)


# ---------- citizen economy ----------

@api.post("/me/claim")
async def claim_yield(request: Request):
    doc = await require_citizen(request)
    last = doc.get("last_claim_at")
    if last and now() < datetime.fromisoformat(last) + CLAIM_EVERY:
        raise HTTPException(429, "Your next payout isn't ready yet.")
    docs = await db.residents.find({"hidden": False}, LOT_FIELDS).to_list(None)
    nb = await db.neighbourhoods.find_one({"id": doc.get("nb"), "active": True}, {"_id": 0}) if doc.get("nb") else None
    r = rent_of(doc, docs, nb, await city_state())
    res = await db.residents.update_one({"k": doc["k"], "last_claim_at": last}, {"$set": {"last_claim_at": now_iso()}})
    if not res.modified_count:
        raise HTTPException(429, "Your next payout isn't ready yet.")
    await pay(doc["k"], r["net"], "rent")
    await db.meta.update_one({"_id": "city"}, {"$inc": {"vault": r["tax"]}})
    await bump()
    return r


@api.post("/city/vote")
async def city_vote(body: VoteRequest, request: Request):
    doc = await require_citizen(request)
    cand = normalize_handle(body.candidate).lower()
    if cand == doc["k"]:
        raise HTTPException(400, "Vote for someone else. Mayors get picked by their neighbours.")
    if cand not in ((await city_state()).get("candidates") or []):
        raise HTTPException(404, "They aren't running this term.")
    await db.meta.update_one({"_id": "city"}, {"$set": {f"votes.{doc['k']}": cand}})
    await bump()
    return {"vote": cand}


@api.post("/city/run")
async def city_run(request: Request):
    doc = await require_citizen(request)
    if doc["k"] in ((await city_state()).get("candidates") or []):
        raise HTTPException(400, "You're already on the ballot.")
    if not await pay(doc["k"], -town.RUN_FEE, "campaign"):
        raise HTTPException(402, f"Running costs ₡{town.RUN_FEE}.")
    await db.meta.update_one({"_id": "city"}, {"$addToSet": {"candidates": doc["k"]}, "$inc": {"vault": town.RUN_FEE}})
    await db.events.insert_one({"type": "campaign", "h": doc["h"], "at": now_iso()})
    await bump()
    return {"running": True}


@api.post("/me/work")
async def work_shift(body: WorkRequest, request: Request):
    doc = await require_citizen(request)
    if body.place not in town.WORKPLACES:
        raise HTTPException(404, "That isn't a workplace.")
    last = doc.get("shift_at")
    if last and now() < datetime.fromisoformat(last) + SHIFT_EVERY:
        raise HTTPException(429, "You're still off shift. Come back later.")
    shifts = doc.get("shifts", 0) if doc.get("job") == body.place else 0
    w = town.wage(shifts)
    res = await db.residents.update_one({"k": doc["k"], "shift_at": last}, {"$set": {
        "shift_at": now_iso(), "job": body.place, "shifts": shifts + 1}})
    if not res.modified_count:
        raise HTTPException(429, "You're still off shift. Come back later.")
    await pay(doc["k"], w["net"], f"wage:{body.place}")
    await db.meta.update_one({"_id": "city"}, {"$inc": {"vault": w["tax"]}})
    await bump()
    return {**w, "place": body.place, "title": town.WORKPLACES[body.place], "shifts": shifts + 1}


@api.post("/city/boost")
async def city_boost(body: BoostRequest, request: Request):
    doc = await require_citizen(request)
    c = await city_state()
    if c.get("mayor_k") != doc["k"]:
        raise HTTPException(403, "Only the mayor picks the boosted district.")
    nb = await load_district(body.nb_id)
    await db.meta.update_one({"_id": "city"}, {"$set": {"boost": nb["id"]}})
    await db.events.insert_one({"type": "boost", "h": doc["h"], "nb": nb["id"], "at": now_iso()})
    await bump()
    return {"boost": nb["id"]}


@api.get("/i/{handle}")
async def invite(handle: str, request: Request):
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False, "status": "finished"},
                                      {"_id": 0, "k": 1, "h": 1})
    resp = RedirectResponse(f"{public_base(request)}/" + (f"?invite={doc['h']}" if doc else ""), status_code=302)
    if doc:
        resp.set_cookie(INVITE_COOKIE, doc["k"], max_age=7 * 86400, httponly=True, samesite="lax", path="/")
    return resp


# ---------- weekly census ----------

CENSUS_PUBLIC = {"_id": 0, "snapshot": 0}
CENSUS_CARD_KEYS = ("issue", "label", "capacity", "population", "fastest", "towers", "towers_total", "mover", "newest_lit",
                    "lit_week", "districts")


def next_census_at() -> str:
    n = now()
    t = (n + timedelta(days=(0 - n.weekday()) % 7)).replace(hour=9, minute=0, second=0, microsecond=0)
    return (t if t > n else t + timedelta(days=7)).isoformat()


def census_lead(c: dict) -> str:
    f = c.get("fastest")
    return f"{f['name']} grew +{f['gained']} {'lot' if f['gained'] == 1 else 'lots'}" if f else "A quiet week in XField"


def census_share_text(c: dict) -> str:
    return (f"XField City Ledger No. {c['issue']}: {census_lead(c)}. {c['population']['taken']}/{c['capacity']} lots taken. "
            "Claim yours \u2192")


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
                                                           "nb": 1, "floors": 1, "created_at": 1, "finished_at": 1}).to_list(None)
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
    title = html.escape(f"XField City Ledger No. {c['issue']}")
    desc = html.escape(f"{census_lead(c)}. {c['population']['taken']}/{c['capacity']} lots taken.")
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
    await db.ledger.create_index([("k", 1), ("at", -1)])
    async for nb in db.neighbourhoods.find({"color": {"$exists": False}}, {"_id": 0, "id": 1}):
        legacy = new_district(None, (0, 0), 0)
        await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {
            **{f: legacy[f] for f in ("claimed", "founder_k", "mayor_k", "plot_cap", "max_floors", "treasury", "project",
                                      "votes", "contrib", "highways")},
            "color": town.color_for(nb["id"]), "landmark": None, "name": None, "named": False}})
    async for nb in db.neighbourhoods.find({"active": True, "named": False}, {"_id": 0, "id": 1}):
        asyncio.create_task(name_neighbourhood(nb["id"]))
    if DEV_MODE and not await count_taken():
        asyncio.create_task(dev_seed())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

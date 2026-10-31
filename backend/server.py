import asyncio
import base64
import hashlib
import html
import io
import ipaddress
import json
import logging
import os
import random
import re
import secrets
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlencode

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image, ImageOps
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import arena  # noqa: E402
import mansions  # noqa: E402
import storage  # noqa: E402
import stacks  # noqa: E402
import town  # noqa: E402
from census import build_census, snapshot_of  # noqa: E402
from census_card import render_census  # noqa: E402
from mansion_card import render_mansion  # noqa: E402
from paper import write_paper  # noqa: E402
from paper_card import render_paper  # noqa: E402
from safety import contains_blocked  # noqa: E402
from share_card import render_share, widen  # noqa: E402
from tower_card import WHERE, render_tower  # noqa: E402
from xreader import is_valid_handle, normalize_handle, read_profile_only  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
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
    ["brush_bea", "ink_ivy", "clay_cole", "sketch_sam", "pixel_paz", "lens_lia", "frame_fin", "mural_max",
     "canvas_cy", "glaze_gia", "easel_eli", "hue_hal"],
    ["beat_bex", "synth_sy", "drum_dom", "bass_bo", "riff_rio", "vinyl_vi", "chord_cj", "remix_ren",
     "tempo_tai", "lyric_lu", "mic_mo", "encore_em"],
    ["quark_quin", "atom_ari", "helix_hu", "orbit_oz", "photon_pia", "nova_ned", "lab_lex", "data_dot",
     "prism_pru", "ion_ike", "fossil_fae", "comet_cass"],
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
PAPER_DIR = ROOT_DIR / "media" / "paper"
PAPER_DIR.mkdir(parents=True, exist_ok=True)
CIRCLE_SIZE = 8
INVITES = 3
SNAP_W, SNAP_H = 1200, 630
CARD_VERSION = 4
SNAP_GAP = timedelta(seconds=20)
MIN_PLAYERS = 3
READ_TTL = timedelta(days=7)
REFRESH_AFTER = timedelta(hours=20)
REFRESH_GAP_S = 5
TIE_FADE = 0.95
PAPER_EVERY = timedelta(hours=16)
AWAY_AFTER = timedelta(days=7)
STALE_RESERVED = timedelta(days=14)
ACTIVE_JOB = ("queued", "reading", "traffic", "building")
BOT_RE = re.compile(r"twitterbot|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|googlebot|"
                    r"bingbot|embedly|pinterest|redditbot|applebot|skypeuripreview|vkshare|iframely|quora link preview", re.I)
LANDMARKS = {"tech_campus": "Tech Campus", "power_grid": "Power Grid", "stock_exchange": "Stock Exchange",
             "central_station": "Central Station", "broadcast_tower": "Broadcast Tower", "university": "University",
             "stadium": "Stadium", "harbor": "Harbor"}
STREET_NAMES = ["Willow Lane", "Harbor Row", "Maple Court", "Juniper Hill", "Old Mill Road", "Lantern Street",
                "Cedar Walk", "Foundry Lane", "Orchard Rise", "Kingfisher Way", "Copper Street", "Ivy Gardens",
                "Station Row", "Bellwether Place", "Larkspur Lane", "Quarry Hill"]
POST_EVERY = timedelta(seconds=20)
NEWS_SIZE = 10
INVITE_COOKIE = "xf_invite"
DEV_LIT = 5
DEV_VOTE_EVERY_S = 6

app = FastAPI()
api = APIRouter(prefix="/api")
TOWN_LOCK = asyncio.Lock()
NAMING_LOCK = asyncio.Lock()
CENSUS_LOCK = asyncio.Lock()
PAPER_LOCK = asyncio.Lock()
REFRESH_LOCK = asyncio.Lock()
ARENA_LOCK = asyncio.Lock()
MANSION_LOCK = asyncio.Lock()
AVATAR_CACHE: dict = {}


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


# Cloudflare's edges sit in front of the load balancer; their hops are never the visitor.
PROXY_NETS = [ipaddress.ip_network(n) for n in (
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22", "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
    "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32")]


def client_ip(request: Request) -> str:
    """The visitor's address: the rightmost X-Forwarded-For hop that isn't ours. Hops on the left are whatever the
    caller sent, so they're never trusted; the last hop is the load balancer itself, then Cloudflare's edge."""
    hops = [h.strip() for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    for h in reversed(hops[:-1]):
        try:
            ip = ipaddress.ip_address(h)
        except ValueError:
            continue
        if not ip.is_private and not any(ip in n for n in PROXY_NETS):
            return h
    return hops[0] if hops else (request.client.host if request.client else "unknown")


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


class PickRequest(BaseModel):
    pick: int = Field(ge=0, le=1)


class PeopleRequest(BaseModel):
    handles: list[str] = Field(max_length=3)


class DoneRequest(BaseModel):
    step: Literal["tour", "share", "tag"]


class DesignRequest(BaseModel):
    design: str


class RankedRequest(BaseModel):
    ranked: bool


class CharterRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=40)
    color: Optional[str] = None
    landmark: Optional[str] = None


class VoteRequest(BaseModel):
    candidate: str


class PostRequest(BaseModel):
    text: str = Field(min_length=1, max_length=280)
    to: Optional[str] = None


async def bump():
    await db.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}}, upsert=True)


async def town_version() -> int:
    doc = await db.meta.find_one({"_id": "town"})
    return (doc or {}).get("version", 0)


GROUND = {"hidden": False, "$or": [{"lv": {"$exists": False}}, {"lv": 0}]}
STACK_FIELDS = {"_id": 0, "k": 1, "h": 1, "x": 1, "y": 1, "dock": 1, "lv": 1, "on": 1, "status": 1, "uptown": 1,
                "placed_at": 1, "created_at": 1, "avatar_url": 1}


async def count_taken() -> int:
    """Ground spots in use: one per building, however tall it has grown."""
    return await db.residents.count_documents(GROUND)


async def load_buildings() -> dict:
    return stacks.buildings(await db.residents.find({"hidden": False}, STACK_FIELDS).to_list(None))


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
    return {"handle": handle, "name": handle, "found": True, "protected": False, "avatar_url": dev_avatar(k), "circle": circle}


async def get_profile(handle: str, force: bool = False) -> dict:
    if DEV_MODE:
        return dev_profile(handle)
    return await get_profile_lite(handle)


async def get_profile_lite(handle: str, force: bool = False) -> dict:
    key = handle.lower()
    doc = None if force else await db.profiles_lite.find_one({"k": key}, {"_id": 0})
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


async def reserve_circle(k: str, h: str, ox: int, oy: int, circle: list, occupied: set, pos: dict, taken: int) -> int:
    """Each invitee not in XField yet gets a dark house next door, or, once the city is full, a dark floor on the
    inviter's building."""
    added, blds, ground = 0, None, 0
    for c in sorted(circle, key=lambda c: -c["weight"]):
        ck = c["handle"].lower()
        if ck in pos:
            if c.get("avatar_url"):
                await db.residents.update_one({"k": ck, "avatar_url": None}, {"$set": {"avatar_url": c["avatar_url"]}})
            continue
        if taken + ground < TOWN_CAPACITY:
            p = town.nearest_free_lot(ox, oy, occupied)
            occupied.add(p)
            spot = {"x": p[0], "y": p[1]}
            ground += 1
        else:
            if blds is None:
                blds = await load_buildings()
                inviter = await db.residents.find_one({"k": k}, STACK_FIELDS)
                home = stacks.key_of(inviter)
            key = stacks.with_room(blds, home) or stacks.shortest(blds, "docks")
            if not key:
                continue
            spot = stacks.floor_spot(key, blds[key])
            blds[key].append({"k": ck, **spot, "status": "reserved"})
        pos[ck] = (spot["x"], spot["y"])
        await db.residents.insert_one({
            "k": ck, "h": c["handle"], "name": c.get("name") or c["handle"], "avatar_url": c.get("avatar_url"),
            "status": "reserved", "verified": False, "hidden": False, "by": k, "by_h": h, "circle": [], "nb": None,
            "floors": 1, "elo": arena.START, "created_at": now_iso(), "placed_at": now_iso(), **spot})
        added += 1
    return added


async def floor_target(by_doc: Optional[dict]):
    """Where a newcomer goes once the ground is full: on top of the building of whoever's link brought them, else the
    shortest building on the Docks, else the shortest anywhere. With the handle of that building's ground owner."""
    blds = await load_buildings()
    key = stacks.with_room(blds, stacks.key_of(by_doc)) if by_doc else None
    key = key or stacks.shortest(blds, "docks") or stacks.shortest(blds, "uptown")
    return (stacks.floor_spot(key, blds[key]), blds[key][0]["h"]) if key else None


async def place_move_in(k: str, profile: dict, circle: list, by: Optional[str], verified: bool):
    occupied, pos = await occupancy()
    taken = await count_taken()
    owner = await db.residents.find_one({"k": k}, {"_id": 0})
    was_reserved = bool(owner and owner["status"] == "reserved")
    host = await db.residents.find_one({"k": by, "status": "finished", "hidden": False}, STACK_FIELDS) \
        if verified and by and by != k and not (owner and owner["status"] == "finished") else None
    spot, on_h = {}, None
    if owner:
        ox, oy = owner["x"], owner["y"]
    elif taken >= TOWN_CAPACITY and (target := await floor_target(host)):
        spot, on_h = target
        ox, oy = spot["x"], spot["y"]
    else:
        taken += 1
        placed = [(pos[c["handle"].lower()], c["weight"]) for c in circle if c["handle"].lower() in pos]
        if host:
            target = (host["x"], host["y"])
        elif placed:
            tw = sum(w for _, w in placed)
            target = (sum(p[0] * w for p, w in placed) / tw, sum(p[1] * w for p, w in placed) / tw)
        else:
            target = town.frontier_target(k, occupied)
        ox, oy = town.nearest_free_lot(*target, occupied)
        occupied.add((ox, oy))
    lit = verified or bool(owner and owner["status"] == "finished")
    by_k = by if host else owner.get("by") if owner else (by if by and by != k else None)
    by_doc = await db.residents.find_one({"k": by_k}, {"_id": 0, "h": 1}) if by_k else None
    credit = {"by": by_k, "by_h": (by_doc or {}).get("h")}
    now_s = now_iso()
    lit_fields = {"verified": True, "finished_at": (owner or {}).get("finished_at") or now_s, "seen_at": now_s} if lit \
        else {"verified": False}
    await db.residents.update_one({"k": k}, {"$set": {
        "h": profile["handle"], "name": profile.get("name") or profile["handle"],
        "avatar_url": profile.get("avatar_url") or (owner or {}).get("avatar_url"),
        "status": "finished" if lit else "reserved", "read_at": now_s, "x": ox, "y": oy, **lit_fields,
        **(credit if host else {}), **spot,
    }, "$setOnInsert": {"k": k, "hidden": False, "nb": None, "floors": 1, "elo": arena.START, "circle": [], "ties": {},
                        "created_at": now_s, "placed_at": now_s, **({} if host else credit)}}, upsert=True)
    new_reserved = await reserve_circle(k, profile["handle"], ox, oy, circle, occupied, pos, taken)
    kind = ("lights_on" if was_reserved else "moved_in") if verified else "built"
    await db.events.insert_one({"type": kind, "h": profile["handle"],
                                "by_h": (owner or {}).get("by_h") or (by_doc or {}).get("h"), "n": new_reserved, "at": now_s,
                                **({"on_h": on_h, "lv": spot["lv"]} if on_h else {})})


def new_district(anchor: str, lot: tuple, size: int, **extra) -> dict:
    nb_id = secrets.token_urlsafe(5)
    return {"id": nb_id, "anchor": anchor, "bx": lot[0], "by": lot[1], "landmark": None, "name": None, "named": False,
            "active": True, "size": size, "created_at": now_iso(), "claimed": False, "founder_k": None, "leader_k": None,
            "color": town.color_for(nb_id), "votes": {}, **extra}


def mutuals_of(docs: list) -> dict:
    """Two people are mutuals when each talks to the other. Someone we haven't read yet gets the benefit of the doubt."""
    keys = {d["k"] for d in docs}
    talks = {d["k"]: (set(d.get("ties") or {}) | {c["k"] for c in d.get("circle") or []}) & keys - {d["k"]} for d in docs}
    unread = {d["k"] for d in docs if not d.get("read_at")}
    mutual = defaultdict(set)
    for a in keys:
        for b in talks[a]:
            if a in talks[b] or b in unread:
                mutual[a].add(b)
                mutual[b].add(a)
    return mutual


async def refresh_neighbourhoods() -> list:
    docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "x": 1, "y": 1, "circle": 1, "ties": 1, "read_at": 1,
                                                       "nb": 1, "member": 1, "placed_at": 1, "created_at": 1}).to_list(None)
    pos = {d["k"]: (d["x"], d["y"]) for d in docs}
    groups = town.host_groups(sorted(pos), mutuals_of(docs))
    active = await db.neighbourhoods.find({"active": True}, {"_id": 0}).to_list(None)
    active_by_id = {nb["id"]: nb for nb in active}
    cur_nb = {d["k"]: d.get("nb") for d in docs}
    joined = {d["k"]: d["member"] for d in docs if d.get("member") in active_by_id}
    occupied, _ = await occupancy()
    assign, hosts, created = {}, {}, []
    for host, g in groups:
        free = [k for k in g if k not in joined]
        if not free:
            continue
        votes = Counter(cur_nb[k] for k in free if cur_nb.get(k) in active_by_id and cur_nb[k] not in hosts)
        if votes:
            nb = active_by_id[min(votes, key=lambda i: (-votes[i], active_by_id[i]["created_at"]))]
        else:
            cx = sum(pos[k][0] for k in free) / len(free)
            cy = sum(pos[k][1] for k in free) / len(free)
            lot = town.nearest_free_lot(cx, cy, occupied)
            nb = new_district(host, lot, len(free), color=town.color_for(host, {n.get("color") for n in active}))
            active.append(nb)
            await db.neighbourhoods.insert_one(dict(nb))
            occupied.add(lot)
            created.append(nb["id"])
        hosts[nb["id"]] = host
        for k in free:
            assign[k] = nb["id"]
    assign.update(joined)
    sizes = Counter(v for v in assign.values() if v)
    for nb in active:
        if nb["id"] in sizes or nb.get("claimed"):
            await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {"size": sizes.get(nb["id"], 0),
                                                                           "anchor": hosts.get(nb["id"], nb.get("anchor"))}})
            continue
        await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {"active": False}})
        if nb.get("named"):
            await db.events.insert_one({"type": "nb_gone", "h": "", "name": nb["name"], "at": now_iso()})
    changes = defaultdict(list)
    for d in docs:
        if d.get("nb") != assign.get(d["k"]):
            changes[assign.get(d["k"])].append(d["k"])
    for nb_id, ks in changes.items():
        await db.residents.update_many({"k": {"$in": ks}}, {"$set": {"nb": nb_id}})
    await tidy_blocks()
    await sync_floors()
    await sync_docks()
    await sync_stacks()
    return created


async def sync_docks():
    """Everyone who moves in starts on the Docks, and keeps their place there until they move uptown."""
    docs = await db.residents.find({}, {"_id": 0, "k": 1, "status": 1, "hidden": 1, "uptown": 1, "dock": 1, "lv": 1,
                                        "finished_at": 1}).to_list(None)

    def docked(d):
        return d["status"] == "finished" and not d.get("hidden") and not d.get("uptown") and not stacks.stacked(d)

    gone = [d["k"] for d in docs if d.get("dock") is not None and not stacks.stacked(d) and not docked(d)]
    if gone:
        await db.residents.update_many({"k": {"$in": gone}}, {"$unset": {"dock": ""}})
    taken = {d["dock"] for d in docs if d.get("dock") is not None and not d.get("hidden") and (docked(d) or stacks.stacked(d))}
    new = sorted((d for d in docs if docked(d) and d.get("dock") is None), key=lambda d: d.get("finished_at") or "")
    for d, slot in zip(new, arena.free_slots(taken, len(new))):
        await db.residents.update_one({"k": d["k"]}, {"$set": {"dock": slot}})


async def sync_stacks():
    """Floors close up when someone leaves or moves; a building whose ground owner left keeps standing."""
    for k, lv in stacks.renumber(await load_buildings()).items():
        await db.residents.update_one({"k": k}, {"$set": {"lv": lv}})


async def relocate(doc: dict, area: str):
    """A floor resident moving to the other side of town: their own lot if a ground spot is free, else the top of the
    shortest building there."""
    blds = await load_buildings()
    for ds in blds.values():
        ds[:] = [d for d in ds if d["k"] != doc["k"]]
    key = stacks.shortest({k: ds for k, ds in blds.items() if ds}, area, stacks.key_of(doc))
    up = area == "uptown"
    if key and await count_taken() >= TOWN_CAPACITY:
        spot = stacks.floor_spot(key, blds[key])
        unset = {} if spot["on"] == "dock" else {"dock": ""}
        await db.residents.update_one({"k": doc["k"]}, {"$set": {**spot, "uptown": up, "placed_at": now_iso()},
                                                        **({"$unset": unset} if unset else {})})
        return
    occupied, _ = await occupancy()
    x, y = town.nearest_free_lot(doc["x"], doc["y"], occupied)
    await db.residents.update_one({"k": doc["k"]}, {"$set": {"x": x, "y": y, "uptown": up, "placed_at": now_iso()},
                                                    "$unset": {"lv": "", "on": "", "dock": ""}})


async def go_docks(d: dict):
    """Back to the Docks: a floor uptown moves onto the shortest Docks building, a house keeps its lot for later."""
    if stacks.stacked(d) and d.get("on") == "lot":
        await relocate(d, "docks")
    else:
        await db.residents.update_one({"k": d["k"]}, {"$set": {"uptown": False}})


async def go_uptown(k: str):
    """A house that wins its way off the Docks. From a floor, its old floor goes and the ones above drop down."""
    doc = await db.residents.find_one({"k": k}, {"_id": 0})
    if stacks.stacked(doc):
        await relocate(doc, "uptown")
        await db.residents.update_one({"k": k}, {"$set": {"earned": True}})
    else:
        await db.residents.update_one({"k": k}, {"$set": {"uptown": True}, "$unset": {"dock": ""}})
    await sync_docks()
    await sync_stacks()


async def sync_floors():
    docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "status": 1, "circle": 1, "floors": 1}).to_list(None)
    floors = town.street_floors(docs)
    for d in docs:
        if town.floors_of(d) != floors[d["k"]]:
            await db.residents.update_one({"k": d["k"]}, {"$set": {"floors": floors[d["k"]]}})


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


def clean_name(raw: Optional[str]) -> Optional[str]:
    cand = re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9 '\-&.]", "", str(raw or ""))).strip()
    return cand if cand and len(cand) <= 26 and not contains_blocked(cand) else None


async def name_neighbourhood(nb_id: str):
    """A street name nobody else has, and the landmark the fewest districts have."""
    async with NAMING_LOCK:
        active = await db.neighbourhoods.find({"active": True, "named": True}, {"_id": 0, "name": 1, "landmark": 1}).to_list(None)
        used = Counter(n.get("landmark") for n in active)
        landmark = min(LANDMARKS, key=lambda k: (used[k], list(LANDMARKS).index(k)))
        free = [n for n in STREET_NAMES if n not in {a.get("name") for a in active}] or STREET_NAMES
        name = free[town.hval(nb_id) % len(free)]
        res = await db.neighbourhoods.update_one({"id": nb_id, "named": False}, {"$set": {"landmark": landmark, "name": name, "named": True}})
        if res.modified_count:
            nb = await db.neighbourhoods.find_one({"id": nb_id}, {"_id": 0, "anchor": 1})
            host = await db.residents.find_one({"k": nb.get("anchor")}, {"_id": 0, "h": 1})
            await db.events.insert_one({"type": "new_nb", "h": (host or {}).get("h", ""), "name": name, "nb": nb_id, "at": now_iso()})
        await bump()


async def run_move_in(k: str, h: str, by: Optional[str], verified: bool, fallback: Optional[dict] = None):
    """Your house goes up from your X name and face. Your people are the ones you pick, never guessed from posts."""
    try:
        await set_job(k, "reading")
        profile = {**fallback, "found": True} if verified and fallback else None
        for attempt in range(4):
            if profile:
                break
            profile = await get_profile(h)
            if not profile.get("throttled"):
                break
            profile = None
            await set_job(k, "traffic")
            await asyncio.sleep(12 * (attempt + 1))
        profile = profile or {"handle": h, "found": False, "throttled": True}
        if not profile.get("found"):
            code = "protected" if profile.get("protected") else ("traffic" if profile.get("throttled") else "not_found")
            return await set_job(k, "error", code)
        if contains_blocked(profile["handle"], profile.get("name") or ""):
            return await set_job(k, "error", "blocked")
        await set_job(k, "building", h=profile["handle"])
        async with TOWN_LOCK:
            await place_move_in(k, profile, [], by, verified)
            created = await refresh_neighbourhoods()
            await bump()
        for nb_id in created:
            asyncio.create_task(name_neighbourhood(nb_id))
        await set_job(k, "done", "lit" if verified else "reserved")
        if fallback:
            asyncio.create_task(warm_card(k, fallback.get("host") or ""))
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
    if not verified:
        raise HTTPException(403, "Sign in with X to move in. Your friends get houses when you pick them as your people.")
    if res and fresh(res.get("read_at")) and (res["status"] == "finished" or not verified):
        return {"handle": res["h"], "state": "done", "code": "already"}
    job = await db.jobs.find_one({"k": k}, {"_id": 0})
    if job and job["state"] in ACTIVE_JOB and now() - datetime.fromisoformat(job["updated_at"]) < timedelta(minutes=3):
        return job_public(job)
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

TOWN_FIELDS = {"_id": 0, "k": 1, "h": 1, "name": 1, "avatar_url": 1, "status": 1, "x": 1, "y": 1, "by_h": 1, "nb": 1,
               "circle": 1, "floors": 1, "finished_at": 1, "placed_at": 1, "created_at": 1, "elo": 1, "uptown": 1,
               "dock": 1, "design": 1, "ranked": 1, "seen_at": 1, "lv": 1, "on": 1}
DISTRICT_PUBLIC = {"_id": 0, "votes": 0}


def away(d: dict) -> bool:
    return (d.get("seen_at") or "") < (now() - AWAY_AFTER).isoformat()


def in_arena(d: dict) -> bool:
    """Lit houses whose owner still plays: someone who stops competing or stays away keeps their score as it is."""
    return d["status"] == "finished" and not d.get("hidden") and d.get("ranked", True) and not away(d)


def newest(docs: list) -> list:
    """The last six people to move in, for Arrivals."""
    lit = sorted((d for d in docs if d["status"] == "finished"), key=lambda d: d.get("finished_at") or "", reverse=True)
    return [person(d) for d in lit[:6]]


async def city_blocks() -> set:
    """The civic core, every home's block and each district's own blocks."""
    blocks = set(town.CIVIC_BLOCKS)
    async for d in db.residents.find({"hidden": False}, {"_id": 0, "x": 1, "y": 1}):
        blocks.add(town.block_of(d["x"], d["y"]))
    async for nb in db.neighbourhoods.find({"active": True}, {"_id": 0, "blocks": 1}):
        blocks.update(tuple(b) for b in nb.get("blocks") or [])
    return blocks


@api.get("/town")
async def get_town(v: Optional[int] = None):
    version = await town_version()
    if v is not None and v == version:
        return {"unchanged": True, "version": version}
    docs = sorted(await db.residents.find({"hidden": False}, TOWN_FIELDS).to_list(None), key=placed)
    residents = []
    for d in docs:
        f = town.floors_of(d)
        residents.append({"k": d["k"], "h": d["h"], "n": d.get("name") or d["h"], "a": d.get("avatar_url"),
                          "s": "f" if d["status"] == "finished" else "r", "x": d["x"], "y": d["y"], "f": f,
                          "t": town.tier_of(f), "by": d.get("by_h"), "nb": d.get("nb"), "d": d.get("dock"),
                          "m": arena.model_of(d, d.get("dock") is not None),
                          **({"lv": d["lv"], "on": d.get("on")} if stacks.stacked(d) else {}),
                          **({"e": arena.score(d), "u": bool(d.get("uptown")), "out": not in_arena(d)} if d["status"] == "finished" else {})})
    nbs = await db.neighbourhoods.find({"active": True}, DISTRICT_PUBLIC).to_list(None)
    handles = {d["k"]: d["h"] for d in docs}
    for nb in nbs:
        nb["host"] = handles.get(nb.get("anchor"))
    events = await db.events.find({}, {"_id": 0}).sort("at", -1).to_list(12)
    nb_ids = list({e["nb"] for e in events if e.get("nb")})
    names = {n["id"]: n.get("name") async for n in db.neighbourhoods.find({"id": {"$in": nb_ids}}, {"_id": 0, "id": 1, "name": 1})}
    for e in events:
        if e.get("nb"):
            e["nb_name"] = names.get(e["nb"])
    finished = sum(1 for r in residents if r["s"] == "f")
    floors = sum(1 for r in residents if r.get("lv"))
    biggest = max(nbs, key=lambda n: n.get("size", 0), default=None)
    row = await current_row()
    return {"version": version, "residents": residents, "neighbourhoods": nbs, "ticker": events, "billboards": await live_billboards(),
            "mansions": {"week": row["week"], "until": row["until"], "holders": [{"k": h["k"], "rank": h["rank"]} for h in row["holders"]]}
            if row else None, "next_handover": mansions.next_handover(now()).isoformat(),
            "town_hall": {"bx": town.TOWN_HALL[0], "by": town.TOWN_HALL[1]},
            "bounds": town.city_bounds(await city_blocks()), "newest": newest(docs),
            "paper": await db.papers.find_one({}, {"_id": 0, "issue": 1}, sort=[("issue", -1)]),
            "ladder": {"uptown_at": arena.UPTOWN_AT, "votes": arena.VOTES_PER_DAY},
            "options": {"colors": town.FACTION_COLORS, "landmarks": LANDMARKS},
            "stats": {"taken": len(residents) - floors, "capacity": TOWN_CAPACITY, "floors": floors, "finished": finished,
                      "reserved": len(residents) - finished, "neighbourhoods": len(nbs),
                      "biggest": {"name": biggest.get("name"), "size": biggest.get("size")} if biggest and biggest.get("name") else None}}


async def load_resident(handle: str) -> dict:
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Nobody lives there yet.")
    return doc


LOT_FIELDS = {"_id": 0, "k": 1, "h": 1, "name": 1, "avatar_url": 1, "status": 1, "circle": 1, "x": 1, "y": 1,
              "floors": 1, "finished_at": 1, "nb": 1}


def lot_of(d: dict) -> dict:
    f = town.floors_of(d)
    return {"k": d["k"], "h": d["h"], "n": d.get("name"), "a": d.get("avatar_url"), "f": f,
            "s": "f" if d["status"] == "finished" else "r", "t": town.tier_of(f)}


async def street(doc: dict) -> dict:
    """My street is the people I talk to most. My neighbours are them plus the people who talk to me."""
    all_docs = await db.residents.find({"hidden": False}, LOT_FIELDS).to_list(None)
    by_k = {d["k"]: d for d in all_docs}
    indeg = town.inbound_counts(all_docs)
    own = [c["k"] for c in sorted(doc.get("circle") or [], key=lambda c: -c["w"]) if c["k"] in by_k and c["k"] != doc["k"]]
    inbound = [d["k"] for d in all_docs if d["k"] != doc["k"] and any(c["k"] == doc["k"] for c in d.get("circle") or [])]
    near = list(dict.fromkeys(own + inbound))
    neighbours = [lot_of(by_k[k]) for k in near[:8]]
    tags = [by_k[k]["h"] for k in own if by_k[k]["status"] == "reserved"][:3]
    nb = await db.neighbourhoods.find_one({"id": doc.get("nb"), "active": True}, {"_id": 0}) if doc.get("nb") else None
    floors = town.floors_of(doc)
    return {"street": [lot_of(by_k[k]) for k in own], "neighbours": neighbours, "near": near, "tags": tags,
            "floors": floors, "tier": town.tier_of(floors), "inbound": indeg[doc["k"]], "nb": nb, "by_k": by_k}


def news_of(st: dict) -> list:
    """Neighbours who moved in, newest first."""
    by_k = st["by_k"]
    items = [{"kind": "in", "p": person(by_k[k]), "at": by_k[k]["finished_at"]} for k in st["near"]
             if by_k[k]["status"] == "finished" and by_k[k].get("finished_at")]
    return sorted(items, key=lambda i: i["at"], reverse=True)[:NEWS_SIZE]


def near(a: dict, b: dict) -> bool:
    """Two people are neighbours when either one talks to the other."""
    return any(c["k"] == b["k"] for c in a.get("circle") or []) or any(c["k"] == a["k"] for c in b.get("circle") or [])


def building_of(doc: dict, blds: dict) -> dict:
    """Who lives in a home's building, top floor first, and which floor is theirs (1 is the ground)."""
    b = stacks.info(doc, blds)
    people = [{**person(d), "s": "f" if d["status"] == "finished" else "r", "floor": i + 1} for i, d in enumerate(b["people"])]
    return {"floor": b["level"] + 1, "size": b["size"], "area": b["area"], "base": people[0], "people": people[::-1]}


async def card_payload(doc: dict, st: dict) -> dict:
    """What the share card shows, and which moment the house is in: just moved in, up for votes, uptown, or dark."""
    pool = await arena_pool()
    playing, mine = in_arena(doc), arena.score(doc)
    if doc["status"] != "finished":
        moment = "dark"
    elif doc.get("uptown"):
        moment = "uptown"
    elif playing and len(pool) >= MIN_PLAYERS:
        moment = "vote"
    else:
        moment = "join"
    nb = st["nb"] or {}
    snap = doc.get("snap") if doc["status"] == "finished" else None
    invites = st["street"][:INVITES]
    bld = building_of(doc, await load_buildings())
    by = st["by_k"].get(doc.get("by")) if doc["status"] != "finished" else None
    return {"rv": CARD_VERSION, "k": doc["k"], "h": doc["h"], "name": doc.get("name"), "moment": moment,
            "uptown": bool(doc.get("uptown")), "color": nb.get("color"),
            "invites": [{"k": p["k"], "h": p["h"], "s": p["s"]} for p in invites],
            "floor": bld["floor"], "size": bld["size"], "base_h": bld["base"]["h"], "full": await count_taken() >= TOWN_CAPACITY,
            "nb_name": nb.get("name"), "tags": st["tags"], "by_h": doc.get("by_h"), "by_k": by["k"] if by else None, "score": mine, "start": arena.START,
            "line": arena.UPTOWN_AT, "rank": 1 + sum(arena.score(d) > mine for d in pool) if playing else None, "of": len(pool),
            "neighbours": [{"k": n["k"], "status": "reserved" if n["s"] == "r" else "finished"} for n in st["neighbours"]],
            "snap": {"path": snap["path"], "me": snap["me"], "faces": snap["faces"]} if snap else None,
            "avatars": {doc["k"]: doc.get("avatar_url"), **{n["k"]: n["a"] for n in st["neighbours"] + invites},
                        **({by["k"]: by.get("avatar_url")} if by else {})}}


def card_hash(payload: dict) -> str:
    return hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:10]


def building_line(card: dict, me: bool = True) -> Optional[str]:
    if card.get("floor", 1) > 1:
        return f"floor {card['floor']} of @{card['base_h']}'s building"
    if card.get("size", 1) > 1:
        return f"{card['size']} people live on {'my' if me else 'this'} building"
    return None


def share_text(card: dict) -> str:
    m, tags = card["moment"], " ".join(f"@{t}" for t in card["tags"])
    if m != "dark" and card.get("floor", 1) > 1:
        rank = f" I'm #{card['rank']} of {card['of']} on the ladder." if card["rank"] else ""
        where = "uptown" if m == "uptown" else "on the Docks"
        bring = f" {tags} I saved you a floor in my building, come turn your lights on" if tags else " Move in above me"
        return f"I live on {building_line(card)} {where} in XField, a city on X where houses fight for votes.{rank}{bring} \u2192"
    if m == "dark":
        return f"@{card['h']} your house in XField is dark. Only you can turn the lights on \u2192"
    rank = f"#{card['rank']} of {card['of']}" if card["rank"] else None
    if m == "join":
        at = f" I'm {rank} on the Docks." if rank else ""
        if tags:
            return f"I just moved into XField.{at} {tags} I saved you a house next to mine, come turn your lights on \u2192"
        return f"I just moved into a shack on the Docks in XField, a city on X where houses fight for votes.{at} Move in next to me \u2192"
    if m == "uptown":
        return "I made it off the Docks. My house is uptown in XField" + (f", {rank}" if rank else "") + " \u2192"
    to_go = max(0, card["line"] - card["score"])
    dark = f" {tags} your houses are still dark." if tags else ""
    return f"My house is {rank} on the Docks in XField, {to_go} points from uptown. Vote for it.{dark} \u2192"


def og_text(card: dict) -> tuple:
    m, h = card["moment"], card["h"]
    if m != "dark" and card.get("floor", 1) > 1:
        where = f"#{card['rank']} of {card['of']} on the ladder" if card["rank"] else "On the ladder"
        return f"@{h} lives on {building_line(card)}", f"{where}, in a city on X where houses fight for votes."
    if m == "dark":
        who = f"@{card['by_h']} saved it for you. " if card.get("by_h") else ""
        return f"@{h}, your house in XField is dark", f"{who}Sign in with X to turn the lights on."
    where = f"#{card['rank']} of {card['of']}" if card["rank"] else "On the ladder"
    if m == "join":
        tags = ", ".join(f"@{t}" for t in card["tags"])
        return f"@{h} just moved into XField", f"{where} on the Docks. Houses are waiting next door for {tags}." if tags else \
            f"{where} on the Docks, in a city on X where houses fight for votes."
    if m == "uptown":
        return f"@{h} made it uptown", f"{where} in XField, a city on X where houses fight for votes."
    return f"Vote for @{h}'s house", f"{where} on the Docks · {max(0, card['line'] - card['score'])} points from uptown."


async def card_bytes(doc: dict, host: str) -> bytes:
    payload = await card_payload(doc, await street(doc))
    path = CARD_DIR / f"{doc['k']}-{card_hash({**payload, 'host': host})}.jpg"
    if not path.exists():
        urls = payload.pop("avatars")
        blobs = await asyncio.gather(*[fetch_avatar(u) for u in urls.values()])
        snap = None
        if payload["snap"]:
            try:
                snap = await storage.get(payload["snap"]["path"])
            except Exception:
                logger.exception("couldn't load the snapshot for %s", doc["k"])
        path.write_bytes(await asyncio.to_thread(render_share, payload, dict(zip(urls.keys(), blobs)), snap))
    return path.read_bytes()


async def warm_card(k: str, host: str):
    """Draw a house's card ahead of time, so X gets it instantly the first time it asks."""
    try:
        doc = await db.residents.find_one({"k": k, "hidden": False}, {"_id": 0})
        if doc:
            await card_bytes(doc, host)
    except Exception:
        logger.exception("warming the card for %s failed", k)


def tower_payload(doc: dict, blds: dict) -> dict:
    """A building's card: everyone in it, ground first, and its place among the city's tallest."""
    b = stacks.info(doc, blds)
    rank, of = stacks.rank_of(b["key"], blds)
    base = b["people"][0]
    return {"tv": 1, "k": base["k"], "h": base["h"], "area": b["area"], "size": b["size"], "rank": rank, "of": of,
            "floors": [{"k": d["k"], "h": d["h"], "s": "f" if d["status"] == "finished" else "r"} for d in b["people"]],
            "avatars": {d["k"]: d.get("avatar_url") for d in b["people"]}}


def tower_text(t: dict) -> str:
    where = WHERE[t["area"]]
    rank = f", #{t['rank']} tallest in the city" if t["rank"] else ""
    above = t["floors"][1:][::-1]
    lit = " ".join(f"@{p['h']}" for p in [p for p in above if p["s"] == "f"][:3])
    dark = " ".join(f"@{p['h']}" for p in [p for p in above if p["s"] == "r"][:2])
    who = (f" {lit} live above me." if lit else "") + (f" {dark} your floors are dark, come turn your lights on." if dark else "")
    return f"My building in XField is {t['size']} floors tall {where}{rank}.{who} Move in on top \u2192"


async def tower_bytes(doc: dict, host: str) -> bytes:
    payload = tower_payload(doc, await load_buildings())
    path = CARD_DIR / f"tower-{payload['k']}-{card_hash({**payload, 'host': host})}.jpg"
    if not path.exists():
        urls = payload.pop("avatars")
        blobs = await asyncio.gather(*[fetch_avatar(u) for u in urls.values()])
        path.write_bytes(await asyncio.to_thread(render_tower, payload, dict(zip(urls.keys(), blobs))))
    return path.read_bytes()


@api.get("/residents/{handle}")
async def resident(handle: str, request: Request):
    doc = await load_resident(handle)
    st = await street(doc)
    user = await current_user(request)
    base = public_base(request)
    brought = await db.residents.count_documents({"by": doc["k"], "hidden": False})
    lit = await db.residents.count_documents({"by": doc["k"], "hidden": False, "status": "finished"})
    nb = st["nb"]
    is_me = bool(user and user["k"] == doc["k"])
    if is_me:
        await db.residents.update_one({"k": doc["k"]}, {"$set": {"seen_at": now_iso()}})
    card = await card_payload(doc, st)
    v = card_hash(card)
    blds = await load_buildings()
    bld = building_of(doc, blds)
    tower = tower_payload(doc, blds) if bld["size"] > 1 else None
    bld["rank"], bld["of"] = (tower["rank"], tower["of"]) if tower else stacks.rank_of(stacks.key_of(doc), blds)
    tower = tower if bld["floor"] == 1 else None
    out = {"building": bld, "k": doc["k"], "h": doc["h"], "name": doc.get("name"), "avatar_url": doc.get("avatar_url"),
           "status": "finished" if doc["status"] == "finished" else "reserved", "x": doc["x"], "y": doc["y"],
           "tier": st["tier"], "tier_name": town.TIERS[st["tier"]], "inbound": st["inbound"], "by_h": doc.get("by_h"),
           "floors": st["floors"], "member": bool(doc.get("member")),
           "neighbourhood": {"id": nb["id"], "name": nb.get("name"), "landmark": nb.get("landmark"), "color": nb.get("color"),
                             "claimed": bool(nb.get("claimed")), "founder": nb.get("founder_k") == doc["k"],
                             "leader": nb.get("leader_k") == doc["k"]} if nb else None,
           "street": st["street"], "neighbours": st["neighbours"], "brought": brought, "brought_lit": lit, "is_me": is_me,
           "ladder": await ladder_of(doc, is_me),
           "share": {"text": share_text(card), "url": f"{base}/api/s/{doc['h']}?v={v}", "tags": st["tags"], "moment": card["moment"]},
           "card_url": f"{base}/api/residents/{doc['h']}/card.jpg?v={v}"}
    seat = mansions.seat_of(row := await current_row(), doc["k"])
    if seat:
        m = mansion_payload(doc, seat, row)
        mv = card_hash(m)
        out["mansion"] = {"rank": seat["rank"], "week": row["week"], "until": row["until"],
                          "share": {"text": mansion_text(m), "url": f"{base}/api/m/{doc['h']}?v={mv}",
                                    "card_url": f"{base}/api/residents/{doc['h']}/mansion.jpg?v={mv}"}}
    if tower:
        tv = card_hash(tower)
        out["tower_share"] = {"text": tower_text(tower), "url": f"{base}/api/t/{tower['h']}?v={tv}",
                              "card_url": f"{base}/api/residents/{tower['h']}/tower.jpg?v={tv}"}
    if is_me:
        out["news"] = news_of(st)
        out["done"] = doc.get("done") or {}
        out["invites_left"] = max(0, INVITES - len(doc.get("circle") or []))
        out["cast"] = await db.votes.count_documents({"voter": doc["k"]})
        out["has_snap"] = bool(doc.get("snap"))
    return out


async def ladder_of(doc: dict, is_me: bool) -> Optional[dict]:
    """A lit house's place on the ladder. Its owner also sees their rabbit, their last results and, one a day, who
    voted for them."""
    if doc["status"] != "finished":
        return None
    pool = await arena_pool()
    mine, playing = arena.score(doc), in_arena(doc)
    out = {"score": mine, "uptown": bool(doc.get("uptown")), "away": away(doc), "ranked": doc.get("ranked", True),
           "rank": 1 + sum(arena.score(d) > mine for d in pool) if playing else None, "of": len(pool), "line": arena.UPTOWN_AT,
           "start": arena.START, "need": max(0, MIN_PLAYERS - len(pool))}
    if not is_me:
        return out
    ahead = arena.rabbit(pool, doc["k"]) if playing else None
    results = await db.votes.find({"$or": [{"win": doc["k"]}, {"lose": doc["k"]}]}, {"_id": 0}).sort("at", -1).to_list(10)
    revealed = await reveal_voter(doc)
    found = {d["k"]: d async for d in db.residents.find({"k": {"$in": [r["k"] for r in revealed]}, "hidden": False},
                                                          {"_id": 0, "k": 1, "h": 1, "avatar_url": 1})}
    return {**out, "rabbit": {**person(ahead), "gap": arena.score(ahead) - mine} if ahead else None,
            "history": [{"pts": r["pts"] if r["win"] == doc["k"] else -r["pts"], "at": r["at"]} for r in results],
            "voters": [person(found[r["k"]]) for r in reversed(revealed) if r["k"] in found],
            "design": arena.model_of(doc, doc.get("dock") is not None) if not doc.get("design") else doc["design"],
            "floors": town.floors_of(doc), "left": await votes_left(doc["k"])}


async def reveal_voter(doc: dict) -> list:
    """Each day, one more person who voted for your house, oldest vote first."""
    seen = doc.get("revealed") or []
    if seen and seen[-1]["day"] == today():
        return seen
    known = {r["k"] for r in seen}
    async for v in db.votes.find({"win": doc["k"]}, {"_id": 0, "voter": 1}).sort("at", 1):
        if v["voter"] not in known:
            seen = [*seen, {"k": v["voter"], "day": today()}]
            await db.residents.update_one({"k": doc["k"]}, {"$set": {"revealed": seen}})
            break
    return seen


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


@api.get("/residents/{handle}/tower.jpg")
async def resident_tower(handle: str, request: Request):
    doc = await load_resident(handle)
    data = await tower_bytes(doc, public_base(request).split("://", 1)[-1])
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@api.get("/t/{handle}")
async def tower_share_page(handle: str, request: Request):
    """A shared building: X shows everyone who lives in it, and newcomers who follow the link move in on top."""
    base = public_base(request)
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False}, {"_id": 0})
    if not doc:
        return RedirectResponse(f"{base}/", status_code=302)
    t = tower_payload(doc, await load_buildings())
    target = f"{base}/?at={t['h']}"
    await track_share("tower", t["h"], request)
    if not BOT_RE.search(request.headers.get("user-agent", "")):
        resp = RedirectResponse(target, status_code=302)
        if t["floors"][0]["s"] == "f":
            resp.set_cookie(INVITE_COOKIE, t["k"], max_age=7 * 86400, httponly=True, samesite="lax", path="/")
        return resp
    where = WHERE[t["area"]]
    rank = f"#{t['rank']} tallest of {t['of']} buildings" if t["rank"] else "A building"
    title = html.escape(f"@{t['h']}'s building is {t['size']} floors tall")
    desc = html.escape(f"{rank} {where} in XField. Move in on top.")
    return og_page(title, desc, f"{base}/api/residents/{t['h']}/tower.jpg?v={card_hash(t)}", target)


@api.get("/residents/{handle}/mansion.jpg")
async def resident_mansion(handle: str, request: Request):
    doc = await load_resident(handle)
    row = await current_row()
    seat = mansions.seat_of(row, doc["k"])
    if not seat:
        raise HTTPException(404, "No mansion this week.")
    data = await mansion_bytes(doc, seat, row, public_base(request).split("://", 1)[-1])
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@api.get("/m/{handle}")
async def mansion_share_page(handle: str, request: Request):
    """A shared mansion: X shows its holder on Millionaires' Row, and newcomers who follow the link move in next to them."""
    base = public_base(request)
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False}, {"_id": 0})
    if not doc:
        return RedirectResponse(f"{base}/", status_code=302)
    row = await current_row()
    seat = mansions.seat_of(row, doc["k"])
    if not seat:
        return RedirectResponse(f"{base}/api/s/{doc['h']}", status_code=302)
    target = f"{base}/?at={doc['h']}"
    await track_share("mansion", doc["h"], request)
    if not BOT_RE.search(request.headers.get("user-agent", "")):
        resp = RedirectResponse(target, status_code=302)
        resp.set_cookie(INVITE_COOKIE, doc["k"], max_age=7 * 86400, httponly=True, samesite="lax", path="/")
        return resp
    m = mansion_payload(doc, seat, row)
    title = html.escape(f"@{doc['h']} holds mansion #{seat['rank']} on Millionaires' Row")
    desc = html.escape(f"#{seat['rank']} this week \u00b7 {m['score']:,} points, in XField, a city on X where houses fight for votes. "
                       "Move in next to them.")
    return og_page(title, desc, f"{base}/api/residents/{doc['h']}/mansion.jpg?v={card_hash(m)}", target)


@api.get("/residents/{handle}/card.jpg")
async def resident_card(handle: str, request: Request):
    doc = await load_resident(handle)
    data = await card_bytes(doc, public_base(request).split("://", 1)[-1])
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@api.get("/s/{handle}")
async def share_page(handle: str, request: Request):
    """A shared house: X shows its card, and people land on it in the city, invited by its owner."""
    base = public_base(request)
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False}, {"_id": 0})
    if not doc:
        return RedirectResponse(f"{base}/", status_code=302)
    target = f"{base}/?at={doc['h']}"
    await track_share("house", doc["h"], request)
    if not BOT_RE.search(request.headers.get("user-agent", "")):
        resp = RedirectResponse(target, status_code=302)
        if doc["status"] == "finished":
            resp.set_cookie(INVITE_COOKIE, doc["k"], max_age=7 * 86400, httponly=True, samesite="lax", path="/")
        return resp
    card = await card_payload(doc, await street(doc))
    title, desc = (html.escape(t) for t in og_text(card))
    img = f"{base}/api/residents/{doc['h']}/card.jpg?v={card_hash(card)}"
    return og_page(title, desc, img, target)


def og_page(title: str, desc: str, img: str, target: str) -> HTMLResponse:
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>{title} · XField</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website"><meta property="og:site_name" content="XField">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:url" content="{target}"><meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
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
        doc = await db.residents.find_one({"k": user["k"], "hidden": False}, {"_id": 0, "nb": 1})
        user = {**{f: user.get(f) for f in ("k", "h", "name", "avatar_url")}, "nb": (doc or {}).get("nb")}
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
    await db.sessions.insert_one({"token_hash": _hash(token), "x_id": u.get("id"), "k": k, "h": h, "name": u.get("name") or h,
                                  "avatar_url": avatar, "created_at": now_iso(), "expires_at": now() + timedelta(days=30)})
    res = await db.residents.find_one({"k": k}, {"_id": 0})
    fallback = {"handle": h, "name": u.get("name") or h, "avatar_url": avatar, "host": base.split("://", 1)[-1]}
    if not (res and res.get("hidden")) and not (res and res["status"] == "finished"):
        await db.jobs.update_one({"k": k}, {"$set": {"k": k, "h": h, "state": "queued", "code": None, "updated_at": now_iso()}}, upsert=True)
        asyncio.create_task(run_move_in(k, h, request.cookies.get(INVITE_COOKIE), True, fallback))
    elif res and not res.get("hidden"):
        await db.residents.update_one({"k": k}, {"$set": {"h": h, "name": fallback["name"], "seen_at": now_iso(),
                                                          **({"avatar_url": avatar} if avatar else {})}})
        asyncio.create_task(warm_card(k, base.split("://", 1)[-1]))
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
                                  "created_at": now_iso(), "expires_at": now() + timedelta(days=30)})
    res = await db.residents.find_one({"k": k}, {"_id": 0, "status": 1})
    target = _safe_next(next)
    if not res or res["status"] != "finished":
        await run_move_in(k, h, request.cookies.get(INVITE_COOKIE), True)
        target = "/?welcome=1"
    resp = RedirectResponse(target, status_code=302)
    resp.set_cookie(SESSION_COOKIE, token, max_age=30 * 86400, httponly=True, samesite="lax", path="/")
    resp.delete_cookie(INVITE_COOKIE, path="/")
    return resp


@api.post("/dev/paper")
async def dev_paper():
    if not DEV_MODE:
        raise HTTPException(404)
    await publish_paper(force=True)
    return await load_issue(db.papers, "latest", {"_id": 0})


async def dev_seed():
    """Dev only: the first few of each crew move in; the rest of the city waits dark."""
    for crew in DEV_CREWS:
        for h in crew[:DEV_LIT]:
            await run_move_in(h, h, None, True)
    logger.info("dev mode: seeded %d residents", await count_taken())


async def dev_arrivals():
    """Dev only: every half minute or so a seeded citizen moves in, a real tester's friends first, so one tester
    watches their street light up."""
    dev = [h for c in DEV_CREWS for h in c]
    i = 0
    while True:
        await asyncio.sleep(25 + town.hval(f"wait{i}") % 10)
        i += 1
        wanted = {c["k"] async for d in db.residents.find({"status": "finished", "k": {"$nin": dev}}, {"_id": 0, "circle": 1})
                  for c in d.get("circle") or []}
        waiting = await db.residents.find({"status": "reserved", "hidden": False, "k": {"$in": dev}}, {"_id": 0, "k": 1, "h": 1}).to_list(None)
        d = next((d for d in waiting if d["k"] in wanted), waiting[0] if waiting else None)
        if d:
            await run_move_in(d["k"], d["h"], None, True)


async def dev_voters():
    """Dev only: seeded citizens vote every few seconds, so the ladder moves for a tester."""
    dev = [h for c in DEV_CREWS for h in c]
    while True:
        await asyncio.sleep(DEV_VOTE_EVERY_S)
        voters = [d["k"] async for d in db.residents.find({"k": {"$in": dev}, "status": "finished", "hidden": False}, {"_id": 0, "k": 1})]
        if not voters:
            continue
        k = random.choice(voters)
        await db.residents.update_one({"k": k}, {"$set": {"seen_at": now_iso()}})
        if not await votes_left(k) or not (await matchup(k))[0]:
            continue
        try:
            async with ARENA_LOCK:
                await cast(k, random.randint(0, 1))
        except HTTPException:
            pass


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.sessions.delete_one({"token_hash": _hash(token)})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


# ---------- town life: weekly re-reads, moves and demolitions ----------

async def refresh_resident(d: dict):
    """Keep names and faces current. Who your people are is yours to pick, so a re-read never changes it."""
    profile = await get_profile_lite(d["h"], force=True)
    if profile.get("throttled") or not profile.get("found"):
        return
    await db.residents.update_one({"k": d["k"]}, {"$set": {
        "h": profile["handle"], "name": profile.get("name") or profile["handle"], "read_at": now_iso(),
        **({"avatar_url": profile["avatar_url"]} if profile.get("avatar_url") else {})}})
    await bump()


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
        cutoff = (now() - REFRESH_AFTER).isoformat()
        due = await db.residents.find({"hidden": False, "read_at": {"$lt": cutoff}}, {"_id": 0, "k": 1, "h": 1}) \
            .sort("read_at", 1).to_list(None)
        for d in due:
            try:
                await refresh_resident(d)
            except Exception:
                logger.exception("refresh failed for @%s", d["h"])
            await asyncio.sleep(REFRESH_GAP_S)
        await demolish_stale()
        logger.info("town refresh: %d houses re-read", len(due))
    await publish_paper()


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


@api.get("/districts/{nb_id}")
async def district(nb_id: str, request: Request):
    nb = await load_district(nb_id)
    user = await current_user(request)
    docs = await db.residents.find({"hidden": False}, LOT_FIELDS).to_list(None)
    by_k = {d["k"]: d for d in docs}
    members = [d for d in docs if d.get("nb") == nb_id]
    lit = {d["k"] for d in members if d["status"] == "finished"}
    me = by_k.get(user["k"]) if user else None
    k = me["k"] if me else None
    leader = nb.get("leader_k")
    posts = await db.posts.find({"$or": [{"nb": nb_id}, {"to": nb_id}]}, {"_id": 0}).sort("at", -1).to_list(30)
    others = await db.neighbourhoods.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "color": 1}).to_list(None)
    flags = {n["id"]: {f: n.get(f) for f in ("id", "name", "color")} for n in others}
    return {
        **{f: nb.get(f) for f in ("id", "name", "landmark", "color", "claimed", "size", "bx", "by", "titles")},
        "floors": sum(town.floors_of(d) for d in members),
        "founder": person(by_k.get(nb.get("founder_k"))), "leader": person(by_k.get(leader)),
        "anchor": person(by_k.get(nb.get("anchor"))),
        "members": sorted(({**person(d), "s": "f" if d["status"] == "finished" else "r", "f": town.floors_of(d)}
                           for d in members), key=lambda m: (-m["f"], m["k"]))[:30],
        "lit": len(lit),
        "posts": [{**person(by_k[p["k"]]), "text": p["text"], "at": p["at"], "leader": p["k"] == leader,
                   "from": flags.get(p["nb"]) if p["nb"] != nb_id else None, "to": flags.get(p.get("to"))}
                  for p in posts if p["k"] in by_k],
        "election": {"open": len(lit) >= town.ELECTION_MIN, "min": town.ELECTION_MIN,
                     "tally": [{**person(by_k[c]), "votes": n} for c, n in tally(nb, lit).most_common(5)]},
        "me": {"member": me.get("nb") == nb_id, "lit": me["status"] == "finished",
               "founder": k == nb.get("founder_k"), "leader": k == leader,
               "can_claim": not leader and me.get("nb") == nb_id and me["status"] == "finished",
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
        occupied, _ = await occupancy()
        lot = town.nearest_free_lot(doc["x"], doc["y"], occupied)
        nb = new_district(doc["k"], lot, 1, **{"claimed": True, "founder_k": doc["k"], "leader_k": doc["k"],
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
        if nb.get("leader_k"):
            raise HTTPException(409, "This district already has a leader.")
        if doc.get("nb") != nb_id:
            raise HTTPException(403, "Only citizens of this district can lead it.")
        await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {"claimed": True, "leader_k": doc["k"], **fields}})
        await db.residents.update_one({"k": doc["k"]}, {"$set": {"member": nb_id}})
        await regroup()
        await db.events.insert_one({"type": "claimed", "h": doc["h"], "nb": nb_id, "at": now_iso()})
        await bump()
    return await district(nb_id, request)


@api.post("/districts/{nb_id}/join")
async def join_district(nb_id: str, request: Request):
    doc = await require_citizen(request)
    async with TOWN_LOCK:
        await load_district(nb_id)
        if doc.get("member") == nb_id:
            raise HTTPException(400, "You already live here.")
        if await db.neighbourhoods.count_documents({"active": True, "founder_k": doc["k"], "id": {"$ne": nb_id}}):
            raise HTTPException(409, "Founders stay in the district they founded.")
        await db.residents.update_one({"k": doc["k"]}, {"$set": {"member": nb_id, "nb": nb_id}})
        await regroup()
        await db.events.insert_one({"type": "joined", "h": doc["h"], "nb": nb_id, "at": now_iso()})
        await bump()
        me = await db.residents.find_one({"k": doc["k"]}, {"_id": 0, "x": 1, "y": 1})
    return {"x": me["x"], "y": me["y"]}


@api.post("/districts/{nb_id}/settings")
async def district_settings(nb_id: str, body: CharterRequest, request: Request):
    doc = await require_citizen(request)
    fields = charter_fields(body)
    if not fields:
        raise HTTPException(400, "Nothing to change.")
    res = await db.neighbourhoods.update_one({"id": nb_id, "active": True, "leader_k": doc["k"]}, {"$set": fields})
    if not res.matched_count:
        raise HTTPException(403, "Only the district leader can do that.")
    if "name" in fields:
        await db.events.insert_one({"type": "renamed", "h": doc["h"], "nb": nb_id, "name": fields["name"], "at": now_iso()})
    await bump()
    return await district(nb_id, request)


@api.post("/districts/{nb_id}/posts")
async def district_post(nb_id: str, body: PostRequest, request: Request):
    doc = await require_citizen(request)
    if doc.get("nb") != nb_id:
        raise HTTPException(403, "Only citizens of this district can post here.")
    text = re.sub(r"\s+", " ", body.text).strip()
    if not text or contains_blocked(text):
        raise HTTPException(400, "Keep it friendly.")
    nb = await load_district(nb_id)
    to = None
    if body.to:
        if nb.get("leader_k") != doc["k"]:
            raise HTTPException(403, "Only the district leader can message other districts.")
        to = (await load_district(body.to))["id"]
        if to == nb_id:
            raise HTTPException(400, "Pick another district.")
    last = await db.posts.find_one({"k": doc["k"]}, sort=[("at", -1)])
    if last and now() < datetime.fromisoformat(last["at"]) + POST_EVERY:
        raise HTTPException(429, "Give it a few seconds before posting again.")
    await db.posts.insert_one({"nb": nb_id, "to": to, "k": doc["k"], "text": text, "at": now_iso()})
    await bump()
    return await district(nb_id, request)


@api.post("/districts/{nb_id}/vote")
async def vote(nb_id: str, body: VoteRequest, request: Request):
    doc = await require_citizen(request)
    cand = normalize_handle(body.candidate).lower()
    async with TOWN_LOCK:
        nb = await load_district(nb_id)
        lit = {d["k"] async for d in db.residents.find({"nb": nb_id, "hidden": False, "status": "finished"}, {"_id": 0, "k": 1})}
        if len(lit) < town.ELECTION_MIN:
            raise HTTPException(400, f"Elections open once {town.ELECTION_MIN} citizens have lit their houses.")
        if doc["k"] not in lit or cand not in lit:
            raise HTTPException(403, "Only lit citizens of this district can vote or run.")
        await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {f"votes.{doc['k']}": cand}})
        nb["votes"] = {**(nb.get("votes") or {}), doc["k"]: cand}
        leader, n = (tally(nb, lit).most_common(1) or [(None, 0)])[0]
        if leader and leader != nb.get("leader_k") and n * 2 > len(lit):
            await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {"leader_k": leader, "claimed": True}})
            h = (await db.residents.find_one({"k": leader}, {"_id": 0, "h": 1}))["h"]
            await db.events.insert_one({"type": "new_leader", "h": h, "nb": nb_id, "at": now_iso()})
        await bump()
    return await district(nb_id, request)


# ---------- the ladder: two houses, pick one ----------

def today() -> str:
    return now().date().isoformat()


async def votes_left(k: str) -> int:
    return max(0, arena.VOTES_PER_DAY - await db.votes.count_documents({"voter": k, "day": today()}))


async def arena_pool() -> list:
    docs = await db.residents.find({"status": "finished", "hidden": False}, TOWN_FIELDS).to_list(None)
    return [d for d in docs if in_arena(d)]


async def matchup(k: str) -> tuple:
    """The two houses k is voting on, and whether they're k's own people: two of their mutuals when two they haven't
    voted on today are in the running, else two strangers with no names on them. Kept until k votes, so a pair can't
    be rerolled."""
    pool = {d["k"]: d for d in await arena_pool()}
    cur = await db.matchups.find_one({"k": k})
    if cur and all(x in pool for x in cur["pair"]):
        return [pool[x] for x in cur["pair"]], cur.get("friends", False)
    me = await db.residents.find_one({"k": k}, TOWN_FIELDS) or {"k": k}
    seen = {x async for v in db.votes.find({"voter": k, "day": today()}) for x in (v["win"], v["lose"])}
    fresh = [d for d in pool.values() if d["k"] not in seen]
    friends = [d for d in fresh if d["k"] != k and near(me, d)]
    mine = len(friends) >= 2
    pair = arena.pair(friends if mine else fresh, k, random) or arena.pair(list(pool.values()), k, random)
    if pair:
        await db.matchups.update_one({"k": k}, {"$set": {"k": k, "pair": [d["k"] for d in pair], "friends": mine, "at": now_iso()}},
                                     upsert=True)
    return pair, mine


async def arena_state(k: str) -> dict:
    """Your votes left today and, while you have some, two houses: your mutuals', or strangers' with no names. Voting
    opens once enough people have signed in."""
    left = await votes_left(k)
    players = len(await arena_pool())
    pair, friends = await matchup(k) if left else ([], False)
    colors = {n["id"]: n.get("color") async for n in db.neighbourhoods.find({"active": True}, {"_id": 0, "id": 1, "color": 1})}
    tomorrow = (now() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return {"left": left, "of": arena.VOTES_PER_DAY, "next_at": tomorrow.isoformat(), "friends": friends,
            "players": players, "need": max(0, MIN_PLAYERS - players),
            "pair": [{"m": arena.model_of(d, d.get("dock") is not None), "c": colors.get(d.get("nb")),
                      "docks": d.get("dock") is not None, **({"p": person(d), "e": arena.score(d)} if friends else {})} for d in pair]}


async def cast(k: str, pick: int):
    """The picked house takes points from the other. A house that climbs uptown, into the top ten or to the top is
    news; a house that drops is not."""
    if not await votes_left(k):
        raise HTTPException(429, f"That's your {arena.VOTES_PER_DAY} votes for today.")
    cur = await db.matchups.find_one_and_delete({"k": k})
    pool = await arena_pool()
    by_k = {d["k"]: d for d in pool}
    if not cur or not all(x in by_k for x in cur["pair"]):
        raise HTTPException(409, "Those houses moved on. Here's a new pair.")
    w, lo = by_k[cur["pair"][pick]], by_k[cur["pair"][1 - pick]]
    pts = arena.points(arena.score(w), arena.score(lo))
    won = arena.score(w) + pts
    others = [arena.score(d) - (pts if d is lo else 0) for d in pool if d is not w]
    was_rank = 1 + sum(arena.score(d) > arena.score(w) for d in pool if d is not w)
    rank = 1 + sum(s > won for s in others)
    await db.residents.update_one({"k": w["k"]}, {"$set": {"elo": won}})
    await db.residents.update_one({"k": lo["k"]}, {"$set": {"elo": arena.score(lo) - pts}})
    await db.votes.insert_one({"voter": k, "win": w["k"], "lose": lo["k"], "pts": pts, "day": today(), "at": now_iso()})
    if rank < was_rank and (rank == 1 or rank <= arena.TOP < was_rank):
        await db.events.insert_one({"type": "top", "h": w["h"], "rank": rank, "at": now_iso()})
    moved = not w.get("uptown") and won >= arena.UPTOWN_AT
    if moved:
        async with TOWN_LOCK:
            await go_uptown(w["k"])
        await db.events.insert_one({"type": "uptown", "h": w["h"], "nb": w.get("nb"), "at": now_iso()})
    await bump()
    return {"pick": pick, "pts": pts, "e": won, "rank": rank, "of": len(pool), "moved": moved,
            "uptown": moved or bool(w.get("uptown")), "to_go": max(0, arena.UPTOWN_AT - won)}


@api.get("/arena")
async def get_arena(request: Request):
    me = await require_citizen(request)
    await db.residents.update_one({"k": me["k"]}, {"$set": {"seen_at": now_iso()}})
    return await arena_state(me["k"])


@api.post("/arena/vote")
async def arena_vote(body: PickRequest, request: Request):
    me = await require_citizen(request)
    async with ARENA_LOCK:
        last = await cast(me["k"], body.pick)
    return {**await arena_state(me["k"]), "last": last}


@api.post("/me/design")
async def set_design(body: DesignRequest, request: Request):
    me = await require_citizen(request)
    if body.design not in arena.DESIGNS:
        raise HTTPException(400, "Pick one of the designs.")
    need = arena.FAMILY_FLOORS[arena.FAMILIES.index(body.design[0])]
    if town.floors_of(me) < need:
        raise HTTPException(400, f"That one needs {need} floors. Every friend who moves in adds a floor.")
    await db.residents.update_one({"k": me["k"]}, {"$set": {"design": body.design}})
    await bump()
    return {"design": body.design}


@api.post("/me/ranked")
async def set_ranked(body: RankedRequest, request: Request):
    """Stop competing, or start again. Your score stays where it is while you're out."""
    me = await require_citizen(request)
    await db.residents.update_one({"k": me["k"]}, {"$set": {"ranked": body.ranked}})
    await db.matchups.delete_many({"pair": me["k"]})
    await bump()
    return {"ranked": body.ranked}


# ---------- your people: up to 3 invites, whose dark houses wait next to yours ----------

async def find_person(h: str) -> Optional[dict]:
    """Someone you can pick: from the city if they're here, else their X name and face. None if X has no such account."""
    k = h.lower()
    doc = await db.residents.find_one({"k": k}, {"_id": 0, "k": 1, "h": 1, "name": 1, "avatar_url": 1, "status": 1, "hidden": 1})
    if doc:
        return None if doc.get("hidden") else {"k": k, "h": doc["h"], "name": doc.get("name") or doc["h"],
                                               "a": doc.get("avatar_url"), "lit": doc["status"] == "finished"}
    p = await get_profile_lite(h)
    if p.get("throttled"):
        return {"k": k, "h": h, "name": h, "a": None, "lit": False}
    if not p.get("found") or contains_blocked(p["handle"], p.get("name") or ""):
        return None
    return {"k": k, "h": p["handle"], "name": p.get("name") or p["handle"], "a": p.get("avatar_url"), "lit": False}


@api.get("/people/lookup")
async def people_lookup(handle: str, request: Request):
    user = await current_user(request)
    if not user:
        raise HTTPException(401, "Sign in with X first.")
    h = clean_handle(handle)
    if h.lower() == user["k"]:
        raise HTTPException(400, "That's you. Pick the people you talk to.")
    p = await find_person(h)
    if not p:
        raise HTTPException(404, f"Couldn't find @{h} on X.")
    return p


@api.post("/me/people")
async def set_people(body: PeopleRequest, request: Request):
    """Invite up to 3 people. Each one not in XField yet gets a dark house next to yours, waiting for them to sign in.
    Invites are for good: you can fill your empty slots, never swap someone out."""
    me = await require_citizen(request)
    had = [c["k"] for c in me.get("circle") or []]
    handles, seen = [], {me["k"], *had}
    for raw in body.handles:
        h = clean_handle(raw)
        if h.lower() not in seen:
            seen.add(h.lower())
            handles.append(h)
    if not handles:
        return {"people": len(had), "added": 0, "no_room": 0, "invites_left": max(0, INVITES - len(had))}
    if len(had) + len(handles) > INVITES:
        left = max(0, INVITES - len(had))
        raise HTTPException(400, f"You can invite {INVITES} people in all, and you have {left} {'invite' if left == 1 else 'invites'} left.")
    found = await asyncio.gather(*[find_person(h) for h in handles])
    missing = [h for h, p in zip(handles, found) if not p]
    if missing:
        raise HTTPException(400, "Couldn't find " + ", ".join(f"@{h}" for h in missing) + " on X.")
    await check_rate(client_ip(request))
    circle = [{"handle": p["h"], "name": p["name"], "avatar_url": p["a"], "weight": INVITES - len(had) - i} for i, p in enumerate(found)]
    async with TOWN_LOCK:
        occupied, pos = await occupancy()
        wanted = sum(1 for c in circle if c["handle"].lower() not in pos)
        await db.residents.update_one({"k": me["k"]}, {"$push": {"circle": {"$each": [{"k": c["handle"].lower(), "w": c["weight"]} for c in circle]}}})
        added = await reserve_circle(me["k"], me["h"], me["x"], me["y"], circle, occupied, pos, await count_taken())
        created = await refresh_neighbourhoods()
        if added:
            await db.events.insert_one({"type": "grew", "h": me["h"], "n": added, "at": now_iso()})
        await bump()
    for nb_id in created:
        asyncio.create_task(name_neighbourhood(nb_id))
    asyncio.create_task(warm_card(me["k"], public_base(request).split("://", 1)[-1]))
    total = len(had) + len(circle)
    return {"people": total, "added": added, "no_room": wanted - added, "invites_left": INVITES - total}


@api.post("/me/done")
async def mark_done(body: DoneRequest, request: Request):
    """Ticks off a step of the welcome: the tour, sharing your card, tagging your invites."""
    me = await require_citizen(request)
    at = (me.get("done") or {}).get(body.step) or now_iso()
    await db.residents.update_one({"k": me["k"]}, {"$set": {f"done.{body.step}": at}})
    return {"step": body.step, "at": at}


def _snap_point(v) -> Optional[list]:
    if not isinstance(v, (list, tuple)) or len(v) != 2 or not all(isinstance(n, (int, float)) for n in v):
        return None
    x, y = v
    return [round(x), round(y)] if -200 <= x <= SNAP_W + 200 and -200 <= y <= SNAP_H + 200 else None


@api.post("/me/snapshot")
async def save_snapshot(request: Request, image: UploadFile = File(...), meta: str = Form("{}")):
    """A picture of your house and street, taken from the 3D city in your browser. Your share card is drawn over it."""
    me = await require_citizen(request)
    last = (me.get("snap") or {}).get("at")
    if last and now() - datetime.fromisoformat(last) < SNAP_GAP:
        return {"saved": False}
    data = await image.read(2_500_001)
    if len(data) > 2_500_000:
        raise HTTPException(413, "That picture is too big.")
    try:
        pic = Image.open(io.BytesIO(data))
        pic.verify()
        pic = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        raise HTTPException(400, "That isn't a picture.")
    if pic.size != (SNAP_W, SNAP_H):
        pic = pic.resize((SNAP_W, SNAP_H), Image.LANCZOS)
    buf = io.BytesIO()
    pic.save(buf, "JPEG", quality=88)
    try:
        info = json.loads(meta)
    except ValueError:
        info = {}
    info = info if isinstance(info, dict) else {}
    faces = [{"k": f["k"].lower(), "x": pt[0], "y": pt[1]} for f in (info.get("faces") or [])[:12]
             if isinstance(f, dict) and isinstance(f.get("k"), str) and (pt := _snap_point([f.get("x"), f.get("y")]))]
    me_at = _snap_point(info.get("me")) or [380, 250]
    path = await storage.put(f"snapshots/{me['k']}/{uuid.uuid4().hex}.jpg", buf.getvalue())
    await db.residents.update_one({"k": me["k"]}, {"$set": {"snap": {"path": path, "at": now_iso(), "me": me_at, "faces": faces}}})
    asyncio.create_task(warm_card(me["k"], public_base(request).split("://", 1)[-1]))
    return {"saved": True}


@api.post("/me/leave")
async def leave_city(request: Request, response: Response):
    """Take your house out of XField for good, and sign out."""
    me = await require_citizen(request)
    async with TOWN_LOCK:
        await db.residents.update_one({"k": me["k"]}, {"$set": {"hidden": True}})
        await db.matchups.delete_many({"$or": [{"k": me["k"]}, {"pair": me["k"]}]})
        created = await refresh_neighbourhoods()
        await bump()
    for nb_id in created:
        asyncio.create_task(name_neighbourhood(nb_id))
    await reseat_mansions()
    return await logout(request, response)


async def reshuffle():
    """Each week, uptown houses that fell below the line go back to the Docks. The ticker counts them; it never
    names them."""
    down = await db.residents.find({"uptown": True, "hidden": False, "status": "finished", "elo": {"$lt": arena.UPTOWN_AT},
                                    "$or": [{"lv": {"$exists": False}}, {"earned": True}]}, {"_id": 0}).to_list(None)
    if not down:
        return
    async with TOWN_LOCK:
        for d in down:
            await go_docks(d)
        await sync_docks()
        await sync_stacks()
    await db.events.insert_one({"type": "docked", "h": "", "n": len(down), "at": now_iso()})
    await bump()


# ---------- Millionaires' Row ----------

async def current_row() -> Optional[dict]:
    """This week's mansion holders, best first, or None before the first handover."""
    return await db.mansions.find_one({}, {"_id": 0}, sort=[("week", -1)])


async def hand_out_mansions(force: bool = False) -> tuple:
    """Every Monday the ten players with the most points move into Millionaires' Row for the week. Returns the row and
    whether it was handed out just now."""
    async with MANSION_LOCK:
        last = await current_row()
        if last and not force and mansions.handed_this_week(datetime.fromisoformat(last["handed_at"]), now()):
            logger.info("mansion handover skipped: week %s was already handed out", last["week"])
            return last, False
        holders = mansions.hand_out(await arena_pool())
        if not holders:
            return last, False
        row = {"week": (last or {}).get("week", 0) + 1, "handed_at": now_iso(),
               "until": mansions.next_handover(now()).isoformat(), "holders": holders}
        await db.mansions.insert_one(dict(row))
        await db.events.insert_one({"type": "mansions", "h": holders[0]["h"], "n": len(holders), "week": row["week"], "at": now_iso()})
        await bump()
        logger.info("mansions handed out for week %s", row["week"])
        return row, True


async def reseat_mansions():
    """A holder who is hidden or leaves gives up their mansion; the next player in line moves in."""
    async with MANSION_LOCK:
        row = await current_row()
        if not row:
            return
        ks = [h["k"] for h in row["holders"]]
        here = {d["k"] async for d in db.residents.find({"k": {"$in": ks}, "hidden": False, "status": "finished"}, {"_id": 0, "k": 1})}
        gone = set(ks) - here
        if not gone:
            return
        holders = mansions.reseat(row["holders"], await arena_pool(), gone)
        await db.mansions.update_one({"week": row["week"]}, {"$set": {"holders": holders}})
        await bump()


async def monday_handover():
    _, handed = await hand_out_mansions()
    if handed:
        await publish_paper(force=True)


def mansion_payload(doc: dict, seat: dict, row: dict) -> dict:
    return {"mv": 1, "k": doc["k"], "h": doc["h"], "name": doc.get("name"), "rank": seat["rank"], "score": arena.score(doc),
            "until": row["until"], "week": row["week"]}


def mansion_text(m: dict) -> str:
    return (f"I'm #{m['rank']} in XField this week, so I live in a mansion on Millionaires' Row until Monday. "
            "Move in next to me \u2192")


async def mansion_bytes(doc: dict, seat: dict, row: dict, host: str) -> bytes:
    payload = mansion_payload(doc, seat, row)
    path = CARD_DIR / f"mansion-{doc['k']}-{card_hash({**payload, 'host': host})}.jpg"
    if not path.exists():
        avatar = await fetch_avatar(doc.get("avatar_url"))
        path.write_bytes(await asyncio.to_thread(render_mansion, payload, {doc["k"]: avatar}))
    return path.read_bytes()


def row_story(row: dict, people: dict) -> Optional[dict]:
    hs = [h for h in row["holders"] if h["k"] in people]
    if not hs:
        return None
    second = f", @{hs[1]['h']} the estate next door" if len(hs) > 1 else ""
    rest = f", and {len(hs) - 2} more of the top ten move into villas down the row" if len(hs) > 2 else ""
    return {"title": "New on Millionaires' Row", "people": [people[h["k"]] for h in hs[:4]],
            "body": f"The weekly handover is done: @{hs[0]['h']} takes the gold-trimmed estate at #1{second}{rest}. "
                    "The keys are theirs until next Monday."}


def with_row_story(edition: dict, row: dict, people: dict) -> dict:
    """The paper after a handover always covers it, unless its writer already did."""
    told = any("millionaire" in f"{s['title']} {s['body']}".lower() for s in edition["stories"])
    story = None if told else row_story(row, people)
    if not story:
        return edition
    quiet = not edition["stories"]
    return {**edition, "headline": story["title"] if quiet else edition["headline"], "stories": [story, *edition["stories"]][:5]}


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


async def load_issue(coll, issue: str, projection: dict) -> dict:
    query = {} if issue == "latest" else {"issue": int(issue)} if issue.isdigit() else None
    doc = await coll.find_one(query, projection, sort=[("issue", -1)]) if query is not None else None
    if not doc:
        raise HTTPException(404, "Not published yet.")
    return doc


async def load_census(issue: str) -> dict:
    return await load_issue(db.census, issue, CENSUS_PUBLIC)


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
    await reshuffle()


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
async def census_card(issue: str, request: Request, og: int = 0):
    c = await load_census(issue)
    host = public_base(request).split("://", 1)[-1]
    payload = census_card_payload(c, host)
    path = CENSUS_DIR / f"{c['issue']}-{card_hash(payload)}.jpg"
    if not path.exists():
        people = census_people(c)
        blobs = await asyncio.gather(*[fetch_avatar(u) for u in people.values()])
        data = await asyncio.to_thread(render_census, payload, dict(zip(people.keys(), blobs)), host)
        path.write_bytes(data)
    data = path.read_bytes()
    return Response(content=widen(data) if og else data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


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
    return og_page(title, desc, f"{base}/api/census/{c['issue']}/card.jpg?v={v}&og=1", target)


# ---------- the daily paper ----------

FACTS = {
    "moved_in": lambda e: f"New blood: @{e['h']} moved in" + (
        f" on floor {e['lv'] + 1} of @{e['on_h']}'s building" if e.get("on_h") else
        (f" on {e['where']}" if e.get("where") else "") + ", starting on the Docks"),
    "new_nb": lambda e: f"New district: {e['name']}",
    "nb_gone": lambda e: f"The district {e['name']} emptied out",
    "uptown": lambda e: f"@{e['h']}'s house won enough votes to move off the Docks and uptown",
    "top": lambda e: f"@{e['h']}'s house reached #1 on the ladder" if e["rank"] == 1 else f"@{e['h']}'s house broke into the top {arena.TOP}",
    "docked": lambda e: f"The weekly reshuffle sent {e['n']} uptown {'house' if e['n'] == 1 else 'houses'} back to the Docks",
    "demolished": lambda e: f"{e['n']} empty lots were cleared",
    "mansions": lambda e: f"Weekly mansion handover: the top {e['n']} on the ladder moved into mansions on Millionaires' Row "
                          f"for the week, @{e['h']} at #1",
}
FACTS["lights_on"] = FACTS["moved_in"]


def climbers(votes: list) -> list:
    """Houses that gained the most points, as (k, gained). Only gains: the paper never reports a fall."""
    net = Counter()
    for v in votes:
        net[v["win"]] += v["pts"]
        net[v["lose"]] -= v["pts"]
    return [(k, n) for k, n in net.most_common(5) if n > 0]


def tower_rows(blds: dict, before: dict) -> tuple:
    """The five tallest buildings, with how many floors each grew since the last paper, and every building's height."""
    heights = {ds[0]["k"]: len(ds) for _, ds in stacks.towers(blds)}
    rows = [{**person(ds[0]), "size": len(ds), "area": stacks.area_of(key, ds),
             "grew": len(ds) - before.get(ds[0]["k"], 1) if before else 0} for key, ds in stacks.towers(blds)[:5]]
    return rows, heights


def tower_facts(towers: list) -> str:
    if not towers:
        return ""
    lines = [f"- @{t['h']}'s building: {t['size']} floors, {'uptown' if t['area'] == 'uptown' else 'on the Docks'}"
             + (f" (+{t['grew']} since the last paper)" if t["grew"] > 0 else "") for t in towers]
    return "\n\nTallest buildings (newcomers live on floors stacked on top once the ground is full):\n" + "\n".join(lines)


def paper_sections(events: list, top: list, people: dict) -> dict:
    """The boxes around the stories: climbers, who moved uptown, new faces and new districts."""
    def who(types):
        seen = {}
        for e in events:
            k = (e.get("h") or "").lower()
            if e["type"] in types and k in people:
                seen.setdefault(k, {**people[k], "where": e.get("where")})
        return list(seen.values())
    return {"climbers": [{**people[k], "pts": n} for k, n in top], "uptown": who(("uptown",)),
            "arrivals": who(("moved_in", "lights_on")),
            "districts": list(dict.fromkeys(e["name"] for e in events if e["type"] == "new_nb" and e.get("name")))}


def plain_paper(events: list, top: list, people: dict, towers: list = ()) -> dict:
    """A front page written from the facts alone, for when the writer is away."""
    sec, stories = paper_sections(events, top, people), []
    up = sec["uptown"]
    tall = max(towers, key=lambda t: (t["grew"], t["size"]), default=None)
    if tall and tall["grew"] > 0:
        stories.append({"title": f"@{tall['h']}'s building climbs to {tall['size']} floors", "people": [tall],
                        "body": f"{tall['grew']} new {'floor' if tall['grew'] == 1 else 'floors'} went up on @{tall['h']}'s building "
                                f"{'uptown' if tall['area'] == 'uptown' else 'on the Docks'} since the last paper. With every ground spot "
                                "taken, XField is growing up."})
    if len(up) > 2:
        shown, rest = (up[:4], f"{len(up) - 4} others") if len(up) > 4 else (up[:-1], f"@{up[-1]['h']}")
        stories.append({"title": f"{len(up)} houses leave the Docks", "people": up[:4],
                        "body": "It was moving day on the waterfront. " + ", ".join(f"@{p['h']}" for p in shown)
                                + f" and {rest} won the votes they needed and moved to lots of their own uptown, next to their friends."})
    for p in up if len(up) <= 2 else []:
        stories.append({"title": f"@{p['h']} leaves the Docks", "people": [p],
                        "body": f"Vote by vote, @{p['h']}'s house earned its way off the waterfront and onto its own lot uptown"
                                + (f" on {p['where']}." if p.get("where") else ".")})
    if sec["climbers"]:
        c = sec["climbers"][0]
        stories.append({"title": f"@{c['h']} climbs {c['pts']} points", "people": [c],
                        "body": f"Nobody gained more on the ladder since the last paper. Voters who had never seen the name on the door "
                                f"kept picking @{c['h']}'s house."})
    for e in [e for e in events if e["type"] == "top" and e.get("rank") == 1][-1:]:
        k = e["h"].lower()
        stories.append({"title": f"A new #1: @{e['h']}", "people": [people[k]] if k in people else [],
                        "body": f"@{e['h']}'s house now sits at the very top of the XField ladder."})
    if sec["arrivals"]:
        n = len(sec["arrivals"])
        stories.append({"title": f"{n} new {'face' if n == 1 else 'faces'} on the Docks", "people": sec["arrivals"][:4],
                        "body": "Every house starts on the waterfront. " + ", ".join(f"@{p['h']}" for p in sec["arrivals"][:4])
                                + (" and others" if n > 4 else "") + " turned their lights on and joined the queue for votes."})
    if sec["districts"]:
        stories.append({"title": f"New on the map: {sec['districts'][0]}", "people": [],
                        "body": "A circle of friends filled enough lots to earn a district name of its own."})
    if towers and not (tall and tall["grew"] > 0):
        t = towers[0]
        stories.append({"title": f"Tallest in town: @{t['h']}'s building", "people": [t],
                        "body": f"{t['size']} floors stand on @{t['h']}'s ground spot "
                                f"{'uptown' if t['area'] == 'uptown' else 'on the Docks'}, more than any other building in XField."})
    headline = stories[0]["title"] if stories else "A quiet day in XField"
    return {"headline": headline, "stories": stories[:5], "quotes": []}


async def publish_paper(force: bool = False):
    """Every morning: who moved in, who climbed and who moved uptown, as a front page. Nothing from X."""
    async with PAPER_LOCK:
        last = await db.papers.find_one({}, {"_id": 0}, sort=[("issue", -1)])
        if last and not force and now() - datetime.fromisoformat(last["published_at"]) < PAPER_EVERY:
            return
        since = last["published_at"] if last else (now() - timedelta(days=1)).isoformat()
        events = await db.events.find({"at": {"$gte": since}}, {"_id": 0}).sort("at", 1).to_list(500)
        docs = {d["k"]: d async for d in db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "h": 1, "avatar_url": 1, "nb": 1})}
        people = {k: person(d) for k, d in docs.items()}
        names = {n["id"]: n.get("name") async for n in db.neighbourhoods.find({"active": True}, {"_id": 0, "id": 1, "name": 1})}
        for e in events:
            if e["type"] in ("moved_in", "lights_on"):
                e["where"] = names.get((docs.get(e["h"].lower()) or {}).get("nb"))
        top = [(k, n) for k, n in climbers(await db.votes.find({"at": {"$gte": since}}, {"_id": 0}).to_list(None)) if k in people]
        lit = await db.residents.count_documents({"hidden": False, "status": "finished"})
        happened = [FACTS[e["type"]](e) for e in events if e["type"] in FACTS][-60:]
        ground = await count_taken()
        stacked = await db.residents.count_documents({"hidden": False, "lv": {"$gte": 1}})
        towers, heights = tower_rows(await load_buildings(), (last or {}).get("heights") or {})
        facts = (f"XField today: {lit} people live here, {ground} of {TOWN_CAPACITY} ground spots taken"
                 f"{f' and {stacked} floors built on top' if stacked else ''}.\n\n"
                 "Happened since the last paper:\n" + ("\n".join(f"- {line}" for line in happened) or "- nothing much") +
                 "\n\nBiggest climbers on the ladder:\n" +
                 ("\n".join(f"- @{people[k]['h']} +{n} points" for k, n in top) or "- nobody yet") + tower_facts(towers))
        try:
            edition = await write_paper(facts, people)
        except Exception as e:
            logger.warning("paper writing failed: %s", e)
            edition = plain_paper(events, top, people, towers)
        if any(e["type"] == "mansions" for e in events) and (row := await current_row()):
            edition = with_row_story(edition, row, people)
        sections = paper_sections(events, top, people)
        votes = await db.votes.count_documents({"at": {"$gte": since}})
        docked = await db.residents.count_documents({"hidden": False, "status": "finished", "dock": {"$exists": True}})
        featured = {}
        for p in [p for s in edition["stories"] for p in s["people"]] + [people[k] for k, _ in top]:
            featured.setdefault(p["k"], {"k": p["k"], "h": p["h"], "a": p.get("a")})
        end = now()
        issue = (last or {}).get("issue", 0) + 1
        await db.papers.insert_one({"issue": issue, "label": f"{end:%A}, {end:%B} {end.day}", "published_at": end.isoformat(),
                                    **edition, **sections, "featured": list(featured.values()), "towers": towers, "heights": heights,
                                    "numbers": {"lit": lit, "taken": ground, "floors": stacked, "capacity": TOWN_CAPACITY, "votes": votes,
                                                "docks": docked, "uptown": lit - docked}})
        await db.events.insert_one({"type": "paper", "h": "", "issue": issue, "headline": edition["headline"], "at": end.isoformat()})
        await bump()
        logger.info("paper No. %s published", issue)


def paper_card_url(p: dict, base: str) -> str:
    return f"{base}/api/paper/{p['issue']}/card.jpg?v={card_hash({'p': p, 'host': base, 'front': 2})}"


@api.get("/paper/{issue}")
async def paper_issue(issue: str, request: Request):
    p = await load_issue(db.papers, issue, {"_id": 0})
    base = public_base(request)
    tags = " ".join(f"@{f['h']}" for f in p["featured"][:3])
    return {**p, "card_url": paper_card_url(p, base),
            "share": {"text": f"Today's XField Ledger: \u201c{p['headline']}\u201d" + (f" ft. {tags}" if tags else ""),
                      "url": f"{base}/api/p/{p['issue']}"}}


@api.get("/paper/{issue}/card.jpg")
async def paper_card(issue: str, request: Request, og: int = 0):
    p = await load_issue(db.papers, issue, {"_id": 0})
    host = public_base(request).split("://", 1)[-1]
    path = PAPER_DIR / f"{p['issue']}-{card_hash({'p': p, 'host': host, 'front': 2})}.jpg"
    if not path.exists():
        blobs = await asyncio.gather(*[fetch_avatar(f.get("a")) for f in p["featured"][:6]])
        data = await asyncio.to_thread(render_paper, p, {f["k"]: b for f, b in zip(p["featured"], blobs)}, host)
        path.write_bytes(data)
    return Response(content=path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@api.get("/p/{issue}")
async def paper_share_page(issue: str, request: Request):
    base = public_base(request)
    target = f"{base}/?place=ledger"
    try:
        p = await load_issue(db.papers, issue, {"_id": 0})
    except HTTPException:
        return RedirectResponse(target, status_code=302)
    await track_share("paper", str(p["issue"]), request)
    if not BOT_RE.search(request.headers.get("user-agent", "")):
        return RedirectResponse(target, status_code=302)
    title = html.escape(f"The XField Ledger No. {p['issue']}")
    return og_page(title, html.escape(p["headline"]), paper_card_url(p, base) + "&og=1", target)


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


@api.post("/cron/mansions")
async def cron_mansions(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not await accept_cron(request, "mansions"):
        return {"duplicate": True}
    asyncio.create_task(monday_handover())
    return {"accepted": True}


@api.post("/cron/refresh")
async def cron_refresh(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not await accept_cron(request, "refresh"):
        return {"duplicate": True}
    asyncio.create_task(run_refresh())
    return {"accepted": True}


# ---------- owner-only ----------

ADMIN_COOKIE = "xf_admin"
ADMIN_HOURS = 12


async def check_admin_key(request: Request, key: str):
    """The admin password is ADMIN_KEY; five wrong tries from one address lock it out for 15 minutes."""
    ip = client_ip(request)
    if not key:
        raise HTTPException(401, "Admin sign-in required.")
    if await db.admin_attempts.count_documents({"ip": ip, "ts": {"$gte": now() - timedelta(minutes=15)}}) >= 5:
        raise HTTPException(429, "Too many wrong passwords. Try again in 15 minutes.")
    if not secrets.compare_digest(key.encode(), ADMIN_KEY.encode()):
        await db.admin_attempts.insert_one({"ip": ip, "ts": now()})
        raise HTTPException(403, "Wrong admin password.")


async def require_admin(request: Request):
    token = request.cookies.get(ADMIN_COOKIE)
    if token and await db.admin_sessions.find_one({"token_hash": _hash(token), "expires_at": {"$gt": now()}}):
        return
    await check_admin_key(request, request.headers.get("x-admin-key", ""))


ADMIN = Depends(require_admin)


class AdminLogin(BaseModel):
    password: str = Field(max_length=200)


@api.post("/admin/login")
async def admin_login(body: AdminLogin, request: Request):
    await check_admin_key(request, body.password)
    token = secrets.token_urlsafe(32)
    await db.admin_sessions.insert_one({"token_hash": _hash(token), "expires_at": now() + timedelta(hours=ADMIN_HOURS)})
    resp = JSONResponse({"ok": True})
    resp.set_cookie(ADMIN_COOKIE, token, max_age=ADMIN_HOURS * 3600, httponly=True, secure=True, samesite="lax", path="/api")
    return resp


@api.post("/admin/logout")
async def admin_logout(request: Request):
    token = request.cookies.get(ADMIN_COOKIE)
    if token:
        await db.admin_sessions.delete_one({"token_hash": _hash(token)})
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(ADMIN_COOKIE, path="/api")
    return resp


@api.get("/admin/me", dependencies=[ADMIN])
async def admin_me(request: Request):
    return {"ok": True}


@api.post("/admin/check", dependencies=[ADMIN])
async def admin_check(request: Request):
    return {"ok": True}


# City limits: the admin's numbers win over the .env defaults, and every worker picks them up within 30 seconds.
ENV_LIMITS = {"town_capacity": TOWN_CAPACITY, "moveins_per_hour": MOVEINS_PER_HOUR}


async def load_settings():
    global TOWN_CAPACITY, MOVEINS_PER_HOUR
    s = {**ENV_LIMITS, **(await db.meta.find_one({"_id": "settings"}, {"_id": 0}) or {})}
    TOWN_CAPACITY, MOVEINS_PER_HOUR = int(s["town_capacity"]), int(s["moveins_per_hour"])


async def settings_loop():
    while True:
        await asyncio.sleep(30)
        try:
            await load_settings()
        except Exception:
            logger.exception("reloading city limits failed")


class LimitsBody(BaseModel):
    town_capacity: int = Field(ge=10, le=100000)
    moveins_per_hour: int = Field(ge=1, le=100000)


async def limits_out() -> dict:
    return {"town_capacity": TOWN_CAPACITY, "moveins_per_hour": MOVEINS_PER_HOUR, "taken": await count_taken(),
            "floors": await db.residents.count_documents({"hidden": False, "lv": {"$gte": 1}})}


@api.get("/admin/settings", dependencies=[ADMIN])
async def admin_settings(request: Request):
    return await limits_out()


@api.put("/admin/settings", dependencies=[ADMIN])
async def admin_save_settings(body: LimitsBody, request: Request):
    await db.meta.update_one({"_id": "settings"}, {"$set": body.model_dump()}, upsert=True)
    await load_settings()
    await bump()
    return await limits_out()


# ---------- billboards ----------

# Fixed spots in the 3D city (placed by frontend city3d/layout.js BILLBOARD_SPOTS): id -> (name, size).
BILLBOARDS = {"hero": ("Downtown, huge", "huge"), "west": ("West park", "big"), "east": ("East park", "big"),
              "corner": ("Front corner", "big"), "ledger": ("By the Ledger", "big"), "docks": ("Docks crane yard", "big")}
BILLBOARD_MAX_BYTES = 12 * 1024 * 1024


def billboard_out(slot: str, d: dict) -> dict:
    name, size = BILLBOARDS[slot]
    return {"id": slot, "name": name, "size": size, "caption": d.get("caption", ""), "link": d.get("link", ""),
            "enabled": d.get("enabled", False), "updated_at": d.get("updated_at"),
            "image_url": f"/api/billboards/{slot}/image?v={d['v']}" if d.get("image") else None}


async def all_billboards() -> list:
    docs = {d["slot"]: d async for d in db.billboards.find({}, {"_id": 0})}
    return [billboard_out(slot, docs.get(slot, {})) for slot in BILLBOARDS]


async def live_billboards() -> list:
    return [{k: b[k] for k in ("id", "size", "caption", "link", "image_url")} for b in await all_billboards()
            if b["enabled"] and b["image_url"]]


def billboard_slot(slot: str) -> str:
    if slot not in BILLBOARDS:
        raise HTTPException(404, "No billboard there.")
    return slot


class BillboardBody(BaseModel):
    caption: str = Field("", max_length=80)
    link: str = Field("", max_length=500)
    enabled: bool = True


@api.get("/billboards/{slot}/image")
async def billboard_image(slot: str):
    d = await db.billboards.find_one({"slot": billboard_slot(slot)}, {"_id": 0})
    if not d or not d.get("image"):
        raise HTTPException(404, "No picture on this billboard.")
    path = CARD_DIR / f"bb-{slot}-{d['v']}.jpg"
    if not path.exists():
        path.write_bytes(await storage.get(d["image"]))
    return Response(content=path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})


@api.get("/admin/billboards", dependencies=[ADMIN])
async def admin_billboards(request: Request):
    return {"billboards": await all_billboards()}


@api.put("/admin/billboards/{slot}", dependencies=[ADMIN])
async def admin_save_billboard(slot: str, body: BillboardBody, request: Request):
    link = body.link.strip()
    if link and not re.match(r"^https?://[^\s]+$", link):
        raise HTTPException(400, "The link must start with http:// or https://")
    await db.billboards.update_one({"slot": billboard_slot(slot)}, {"$set": {
        "caption": body.caption.strip(), "link": link, "enabled": body.enabled, "updated_at": now_iso()}}, upsert=True)
    await bump()
    return billboard_out(slot, await db.billboards.find_one({"slot": slot}, {"_id": 0}))


@api.post("/admin/billboards/{slot}/image", dependencies=[ADMIN])
async def admin_billboard_image(slot: str, request: Request, file: UploadFile = File(...)):
    billboard_slot(slot)
    raw = await file.read(BILLBOARD_MAX_BYTES + 1)
    if len(raw) > BILLBOARD_MAX_BYTES:
        raise HTTPException(413, "That picture is too big (12 MB max).")
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception:
        raise HTTPException(400, "That file isn't a picture we can read.")
    img.thumbnail((2048, 2048))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=86)
    data = buf.getvalue()
    v = hashlib.sha1(data).hexdigest()[:10]
    path = await storage.put(f"billboards/{slot}-{v}.jpg", data)
    (CARD_DIR / f"bb-{slot}-{v}.jpg").write_bytes(data)
    await db.billboards.update_one({"slot": slot}, {"$set": {"image": path, "v": v, "updated_at": now_iso()},
                                                     "$setOnInsert": {"caption": "", "link": "", "enabled": False}}, upsert=True)
    await bump()
    return billboard_out(slot, await db.billboards.find_one({"slot": slot}, {"_id": 0}))


@api.delete("/admin/billboards/{slot}/image", dependencies=[ADMIN])
async def admin_clear_billboard(slot: str, request: Request):
    await db.billboards.update_one({"slot": billboard_slot(slot)}, {"$unset": {"image": "", "v": ""}, "$set": {"updated_at": now_iso()}})
    await bump()
    return billboard_out(slot, await db.billboards.find_one({"slot": slot}, {"_id": 0}) or {})


# ---------- residents, the paper and live stats ----------

ADMIN_FIELDS = {"_id": 0, "k": 1, "h": 1, "name": 1, "avatar_url": 1, "status": 1, "hidden": 1, "elo": 1, "uptown": 1,
                "dock": 1, "lv": 1, "on": 1, "finished_at": 1}


def admin_row(d: dict) -> dict:
    lit = d["status"] == "finished"
    if d.get("hidden"):
        where = "Hidden"
    elif not lit:
        where = "Dark, not moved in"
    elif stacks.stacked(d):
        where = f"Floor {d['lv'] + 1}, {'Docks' if d.get('on') == 'dock' else 'uptown' if d.get('uptown') else 'city'}"
    else:
        where = "Uptown" if d.get("uptown") else "Docks"
    return {"k": d["k"], "h": d["h"], "name": d.get("name"), "a": d.get("avatar_url"), "lit": lit, "hidden": bool(d.get("hidden")),
            "points": arena.score(d), "uptown": bool(d.get("uptown")), "where": where, "joined": d.get("finished_at")}


async def admin_resident(handle: str) -> dict:
    d = await db.residents.find_one({"k": normalize_handle(handle).lower()}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Nobody lives there.")
    return d


@api.get("/admin/residents", dependencies=[ADMIN])
async def admin_residents(request: Request, q: str = "", hidden: bool = False):
    filt = {"hidden": True} if hidden else {}
    q = q.strip().lstrip("@").lower()[:15]
    if q:
        filt["k"] = {"$regex": "^" + re.escape(q)}
    docs = await db.residents.find(filt, ADMIN_FIELDS).sort([("status", 1), ("elo", -1), ("k", 1)]).to_list(50)
    return {"residents": [admin_row(d) for d in docs]}


class PointsBody(BaseModel):
    points: int = Field(ge=0, le=5000)


@api.post("/admin/residents/{handle}/points", dependencies=[ADMIN])
async def admin_points(handle: str, body: PointsBody, request: Request):
    d = await admin_resident(handle)
    if d["status"] != "finished":
        raise HTTPException(400, "Only people who moved in have points.")
    await db.residents.update_one({"k": d["k"]}, {"$set": {"elo": body.points}})
    await bump()
    return admin_row(await db.residents.find_one({"k": d["k"]}, ADMIN_FIELDS))


class MoveBody(BaseModel):
    to: Literal["uptown", "docks"]


@api.post("/admin/residents/{handle}/move", dependencies=[ADMIN])
async def admin_move(handle: str, body: MoveBody, request: Request):
    """Uptown lifts their points to the uptown line if they're below it; the Docks drops them just under it."""
    d = await admin_resident(handle)
    if d["status"] != "finished" or d.get("hidden"):
        raise HTTPException(400, "Only visible people who moved in can move.")
    if bool(d.get("uptown")) == (body.to == "uptown"):
        raise HTTPException(400, f"Already {'uptown' if body.to == 'uptown' else 'on the Docks'}.")
    async with TOWN_LOCK:
        if body.to == "uptown":
            await db.residents.update_one({"k": d["k"]}, {"$set": {"elo": max(arena.score(d), arena.UPTOWN_AT)}})
            await go_uptown(d["k"])
        else:
            await db.residents.update_one({"k": d["k"]}, {"$set": {"elo": min(arena.score(d), arena.UPTOWN_AT - 1)}})
            await go_docks(d)
            await sync_docks()
            await sync_stacks()
        await bump()
    return admin_row(await db.residents.find_one({"k": d["k"]}, ADMIN_FIELDS))


async def row_admin() -> dict:
    """This week's holders with their current points, the next three in line, and when the next handover is."""
    row, pool = await current_row(), await arena_pool()
    holders = (row or {}).get("holders") or []
    docs = {d["k"]: d async for d in db.residents.find({"k": {"$in": [h["k"] for h in holders]}}, ADMIN_FIELDS)}
    return {"week": row["week"] if row else None, "handed_at": row["handed_at"] if row else None, "until": row["until"] if row else None,
            "holders": [{**admin_row(docs[h["k"]]), "rank": h["rank"], "was": h["score"]} for h in holders if h["k"] in docs],
            "next": [admin_row(d) for d in mansions.in_line(holders, pool, 3 if row else mansions.SEATS)],
            "next_at": mansions.next_handover(now()).isoformat()}


@api.get("/admin/mansions", dependencies=[ADMIN])
async def admin_mansions(request: Request):
    return await row_admin()


@api.post("/admin/mansions/hand-out", dependencies=[ADMIN])
async def admin_hand_out(request: Request):
    _, handed = await hand_out_mansions(force=True)
    if not handed:
        raise HTTPException(400, "Nobody is on the ladder yet.")
    return await row_admin()


class StoryBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    body: str = Field(min_length=1, max_length=1500)


class PaperBody(BaseModel):
    headline: str = Field(min_length=1, max_length=140)
    stories: list[StoryBody] = Field(min_length=1, max_length=6)


def admin_paper_out(p: Optional[dict]) -> dict:
    if not p:
        return {"paper": None, "publishing": PAPER_LOCK.locked()}
    return {"paper": {"issue": p["issue"], "label": p.get("label"), "published_at": p["published_at"], "headline": p["headline"],
                      "stories": [{"title": s["title"], "body": s["body"]} for s in p.get("stories") or []]},
            "publishing": PAPER_LOCK.locked()}


@api.get("/admin/paper", dependencies=[ADMIN])
async def admin_paper(request: Request):
    return admin_paper_out(await db.papers.find_one({}, {"_id": 0}, sort=[("issue", -1)]))


@api.put("/admin/paper", dependencies=[ADMIN])
async def admin_save_paper(body: PaperBody, request: Request):
    p = await db.papers.find_one({}, {"_id": 0}, sort=[("issue", -1)])
    if not p:
        raise HTTPException(404, "No paper yet. Publish one first.")
    old = p.get("stories") or []
    stories = [{"title": s.title.strip(), "body": s.body.strip(), "people": old[i].get("people", []) if i < len(old) else []}
               for i, s in enumerate(body.stories)]
    await db.papers.update_one({"issue": p["issue"]}, {"$set": {"headline": body.headline.strip(), "stories": stories, "edited_at": now_iso()}})
    await bump()
    return admin_paper_out(await db.papers.find_one({"issue": p["issue"]}, {"_id": 0}))


@api.post("/admin/paper/publish", dependencies=[ADMIN])
async def admin_publish_paper(request: Request):
    if PAPER_LOCK.locked():
        raise HTTPException(409, "A paper is already being written.")
    asyncio.create_task(publish_paper(force=True))
    return {"accepted": True}


async def track_share(kind: str, h: str, request: Request):
    """Who opened a shared link, and how often X fetched its preview."""
    bot = bool(BOT_RE.search(request.headers.get("user-agent", "")))
    await db.share_visits.insert_one({"kind": kind, "h": h, "bot": bot, "at": now_iso()})


@api.get("/admin/stats", dependencies=[ADMIN])
async def admin_stats(request: Request):
    day, week = (now() - timedelta(days=1)).isoformat(), (now() - timedelta(days=7)).isoformat()
    R, live = db.residents, {"hidden": False}
    lit = {**live, "status": "finished"}

    async def shares(bot: bool) -> dict:
        return {"day": await db.share_visits.count_documents({"bot": bot, "at": {"$gte": day}}),
                "week": await db.share_visits.count_documents({"bot": bot, "at": {"$gte": week}}),
                "total": await db.share_visits.count_documents({"bot": bot})}
    recent = await R.find({**lit, "finished_at": {"$exists": True}}, ADMIN_FIELDS).sort("finished_at", -1).to_list(8)
    top = await R.find(lit, ADMIN_FIELDS).sort([("elo", -1), ("k", 1)]).to_list(5)
    paper = await db.papers.find_one({}, {"_id": 0, "issue": 1, "published_at": 1, "headline": 1}, sort=[("issue", -1)])
    return {
        "people": {"lit": await R.count_documents(lit), "dark": await R.count_documents({**live, "status": {"$ne": "finished"}}),
                   "hidden": await R.count_documents({"hidden": True}), "uptown": await R.count_documents({**lit, "uptown": True}),
                   "floors": await R.count_documents({**live, "lv": {"$gte": 1}})},
        "ground": {"taken": await count_taken(), "capacity": TOWN_CAPACITY},
        "signups": {"day": await R.count_documents({**lit, "finished_at": {"$gte": day}}),
                    "week": await R.count_documents({**lit, "finished_at": {"$gte": week}})},
        "votes": {"today": await db.votes.count_documents({"day": today()}), "day": await db.votes.count_documents({"at": {"$gte": day}}),
                  "total": await db.votes.estimated_document_count()},
        "shares": {"opens": await shares(False), "previews": await shares(True)},
        "tallest": tower_rows(await load_buildings(), {})[0],
        "top": [admin_row(d) for d in top], "recent": [admin_row(d) for d in recent], "paper": paper,
    }


@api.post("/admin/residents/{handle}/hide", dependencies=[ADMIN])
async def admin_hide(handle: str, body: HideRequest, request: Request):
    k = normalize_handle(handle).lower()
    res = await db.residents.update_one({"k": k}, {"$set": {"hidden": body.hidden}})
    if not res.matched_count:
        raise HTTPException(404, "Nobody lives there.")
    async with TOWN_LOCK:
        created = await refresh_neighbourhoods()
        await bump()
    for nb_id in created:
        asyncio.create_task(name_neighbourhood(nb_id))
    await reseat_mansions()
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
    await db.admin_sessions.create_index("token_hash", unique=True)
    await db.admin_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.billboards.create_index("slot", unique=True)
    await db.share_visits.create_index("at")
    await load_settings()
    asyncio.create_task(settings_loop())
    await db.oauth_states.create_index("ts", expireAfterSeconds=600)
    await db.sessions.create_index("token_hash", unique=True)
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.census.create_index("issue", unique=True)
    await db.papers.create_index("issue", unique=True)
    await db.mansions.create_index("week", unique=True)
    await db.cron_runs.create_index("run_id", unique=True)
    await db.cron_runs.create_index("ts", expireAfterSeconds=30 * 86400)
    await db.posts.create_index([("nb", 1), ("at", -1)])
    await db.posts.create_index([("to", 1), ("at", -1)])
    await db.neighbourhoods.update_many({"mayor_k": {"$exists": True}}, {"$rename": {"mayor_k": "leader_k"}})
    async for nb in db.neighbourhoods.find({"color": {"$exists": False}}, {"_id": 0, "id": 1}):
        legacy = new_district(None, (0, 0), 0)
        await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {
            **{f: legacy[f] for f in ("claimed", "founder_k", "leader_k", "votes")},
            "color": town.color_for(nb["id"]), "landmark": None, "name": None, "named": False}})
    async for nb in db.neighbourhoods.find({"active": True, "named": False}, {"_id": 0, "id": 1}):
        asyncio.create_task(name_neighbourhood(nb["id"]))
    await db.votes.create_index([("voter", 1), ("day", 1)])
    await db.votes.create_index([("win", 1), ("at", 1)])
    await db.votes.create_index([("lose", 1), ("at", 1)])
    await db.votes.create_index("at")
    await db.matchups.create_index("k", unique=True)
    await migrate_to_night()
    await migrate_to_ladder()
    await migrate_signed_in_only()
    try:
        await storage.init()
    except Exception:
        logger.exception("object storage init failed; share cards fall back to drawings")
    if DEV_MODE:
        asyncio.create_task(dev_arrivals())
        asyncio.create_task(dev_voters())
    if DEV_MODE and not await count_taken():
        asyncio.create_task(dev_seed())


async def migrate_to_night():
    """Once: one person per lot, the field war, raids, flags and billboards gone, and every house as tall as its street."""
    if await db.meta.find_one({"_id": "night_migrated"}):
        return
    async with TOWN_LOCK:
        occupied, _ = await occupancy()
        seen = set()
        for d in sorted(await db.residents.find({}, {"_id": 0, "k": 1, "x": 1, "y": 1, "placed_at": 1,
                                                       "created_at": 1}).to_list(None), key=placed):
            p = (d["x"], d["y"])
            if p in seen:
                p = town.nearest_free_lot(*p, occupied)
                occupied.add(p)
                await db.residents.update_one({"k": d["k"]}, {"$set": {"x": p[0], "y": p[1]}})
            seen.add(p)
        await db.residents.update_many({}, {"$unset": {f: "" for f in (
            "bank", "bank_at", "xp", "floors_at", "trusted", "billboard", "raided_by", "raid_term", "raid_used",
            "guard_used", "guarding", "guards")}})
        for name in ("tiles", "claims", "seasons", "hits", "raids"):
            await db.drop_collection(name)
        await db.meta.delete_many({"_id": {"$in": ["field", "city", "raids_migrated"]}})
        await db.events.delete_many({"type": {"$in": ["crown", "city_mayor", "billboard"]}})
        await db.neighbourhoods.update_many({}, {"$unset": {"allies": "", "proposals": "", "target": ""}})
        await refresh_neighbourhoods()
    await db.meta.insert_one({"_id": "night_migrated", "at": now_iso()})
    await bump()


async def migrate_to_ladder():
    """Once: nothing read from X but faces and friends, everyone on the ladder at the start, and on the Docks."""
    if await db.meta.find_one({"_id": "ladder_migrated"}):
        return
    async with TOWN_LOCK:
        await db.residents.update_many({}, {"$unset": {f: "" for f in (
            "signs", "signs_at", "sign_tone", "sign_by", "sign_at", "trade", "job", "posts", "fresh", "was", "bio", "followers")}})
        await db.residents.update_many({"elo": {"$exists": False}}, {"$set": {"elo": arena.START}})
        await db.residents.update_many({"status": "finished", "seen_at": {"$exists": False}}, {"$set": {"seen_at": now_iso()}})
        await db.events.delete_many({"type": "sign"})
        await sync_docks()
    await db.meta.insert_one({"_id": "ladder_migrated", "at": now_iso()})
    await bump()


async def migrate_signed_in_only():
    """Once: only people who signed in with X stay. Every house, district, vote, paper and census built from automatic
    X reads goes, and the ladder starts again from the people who are really here."""
    if DEV_MODE or await db.meta.find_one({"_id": "signed_in_only"}):
        return
    async with TOWN_LOCK:
        keep = [d["k"] async for d in db.residents.find({"status": "finished", "verified": True, "hidden": False}, {"_id": 0, "k": 1})]
        await db.residents.delete_many({"k": {"$nin": keep}})
        await db.residents.update_many({}, {"$set": {"circle": [], "ties": {}, "floors": 1, "elo": arena.START, "uptown": False,
                                                     "nb": None, "by": None, "by_h": None},
                                            "$unset": {"dock": "", "revealed": "", "member": "", "design": ""}})
        for coll in (db.events, db.votes, db.matchups, db.papers, db.census, db.neighbourhoods, db.jobs, db.posts):
            await coll.delete_many({})
        for folder in (CARD_DIR, CENSUS_DIR, PAPER_DIR):
            for f in folder.glob("*.jpg"):
                f.unlink()
        await refresh_neighbourhoods()
    await db.meta.insert_one({"_id": "signed_in_only", "at": now_iso(), "kept": keep})
    await bump()
    logger.info("clean-up: kept %d signed-in residents", len(keep))


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


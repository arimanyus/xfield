import asyncio
import hashlib
import html
import json
import logging
import os
import re
import secrets
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

import town  # noqa: E402
from safety import contains_blocked  # noqa: E402
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
CARD_DIR = ROOT_DIR / "media" / "cards"
CARD_DIR.mkdir(parents=True, exist_ok=True)
CIRCLE_SIZE = 8
READ_TTL = timedelta(days=7)
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
                  "Little Bavaria", "Shelbyville Border", "Rich Texan Ranch", "Squidport", "Lower Springfield"]

app = FastAPI()
api = APIRouter(prefix="/api")
TOWN_LOCK = asyncio.Lock()
NAMING_LOCK = asyncio.Lock()
AVATAR_CACHE: dict = {}


def now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now().isoformat()


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
        raise HTTPException(400, "That handle can't move into Springfield.")
    return h


class MoveInRequest(BaseModel):
    handle: str = Field(min_length=1, max_length=120)
    by: Optional[str] = Field(default=None, max_length=120)


class HideRequest(BaseModel):
    hidden: bool = True


async def bump():
    await db.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}}, upsert=True)


async def town_version() -> int:
    doc = await db.meta.find_one({"_id": "town"})
    return (doc or {}).get("version", 0)


# ---------- X reads (cached) ----------

async def get_profile(handle: str) -> dict:
    key = handle.lower()
    doc = await db.profiles.find_one({"handle_lower": key}, {"_id": 0})
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
    if doc and now() - datetime.fromisoformat(doc["fetched_at"]) < READ_TTL:
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
    occupied = {(d["x"], d["y"]) for d in docs}
    pos = {d["k"]: (d["x"], d["y"]) for d in docs}
    taken = {town.TOWN_HALL_BLOCK}
    async for nb in db.neighbourhoods.find({"active": True}, {"_id": 0, "bx": 1, "by": 1}):
        taken.add((nb["bx"], nb["by"]))
    for b in taken:
        occupied.update(town.block_plots(*b))
    return occupied, pos, taken


async def place_move_in(k: str, profile: dict, circle: list, by: Optional[str]):
    occupied, pos, _ = await occupancy()
    owner = await db.residents.find_one({"k": k}, {"_id": 0})
    was_reserved = bool(owner and owner["status"] == "reserved")
    if owner:
        ox, oy = owner["x"], owner["y"]
    else:
        placed = [(pos[c["handle"].lower()], c["weight"]) for c in circle if c["handle"].lower() in pos]
        if placed:
            tw = sum(w for _, w in placed)
            target = (sum(p[0] * w for p, w in placed) / tw, sum(p[1] * w for p, w in placed) / tw)
        else:
            target = town.frontier_target(k, occupied)
        ox, oy = town.nearest_free_plot(*target, occupied)
        occupied.add((ox, oy))
    by_k = owner.get("by") if owner else (by if by and by != k else None)
    by_doc = await db.residents.find_one({"k": by_k}, {"_id": 0, "h": 1}) if by_k else None
    posts = [p["text"][:160] for p in (profile.get("posts") or [])[:6]]
    await db.residents.update_one({"k": k}, {"$set": {
        "h": profile["handle"], "name": profile.get("name") or profile["handle"], "avatar_url": profile.get("avatar_url"),
        "bio": profile.get("bio", ""), "followers": profile.get("followers"), "posts": posts, "status": "finished",
        "circle": [{"k": c["handle"].lower(), "w": c["weight"]} for c in circle], "read_at": now_iso(),
        "finished_at": (owner or {}).get("finished_at") or now_iso(), "x": ox, "y": oy,
    }, "$setOnInsert": {"k": k, "hidden": False, "by": by_k, "by_h": (by_doc or {}).get("h"), "nb": None,
                        "created_at": now_iso()}}, upsert=True)
    new_reserved = 0
    for c in sorted(circle, key=lambda c: -c["weight"]):
        ck = c["handle"].lower()
        if ck in pos:
            if c.get("avatar_url"):
                await db.residents.update_one({"k": ck, "avatar_url": None}, {"$set": {"avatar_url": c["avatar_url"]}})
            continue
        p = town.nearest_free_plot(ox, oy, occupied)
        occupied.add(p)
        pos[ck] = p
        await db.residents.insert_one({
            "k": ck, "h": c["handle"], "name": c.get("name") or c["handle"], "avatar_url": c.get("avatar_url"),
            "bio": "", "status": "reserved", "hidden": False, "x": p[0], "y": p[1], "by": k, "by_h": profile["handle"],
            "circle": [], "nb": None, "created_at": now_iso()})
        new_reserved += 1
    await db.events.insert_one({"type": "lights_on" if was_reserved else "moved_in", "h": profile["handle"],
                                "by_h": (owner or {}).get("by_h") or (by_doc or {}).get("h"), "n": new_reserved,
                                "at": now_iso()})


async def refresh_neighbourhoods() -> list:
    docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "x": 1, "y": 1, "status": 1, "circle": 1, "nb": 1}).to_list(None)
    keys = {d["k"] for d in docs}
    pos = {d["k"]: (d["x"], d["y"]) for d in docs}
    edges, indeg = defaultdict(dict), Counter()
    for d in docs:
        if d["status"] != "finished":
            continue
        for c in d.get("circle") or []:
            m = c["k"]
            if m in keys and m != d["k"]:
                w = float(c.get("w", 1))
                edges[d["k"]][m] = edges[d["k"]].get(m, 0) + w
                edges[m][d["k"]] = edges[m].get(d["k"], 0) + w
                indeg[m] += 1
    groups = town.clusters(sorted(keys), edges)
    active = await db.neighbourhoods.find({"active": True}, {"_id": 0}).to_list(None)
    by_anchor = {nb["anchor"]: nb for nb in active}
    occupied, _, taken = await occupancy()
    assign, sizes, created = {}, {}, []
    for g in sorted(groups, key=lambda g: (-len(g), min(g))):
        anchors = sorted((by_anchor[k] for k in g if k in by_anchor), key=lambda nb: nb["created_at"])
        if anchors:
            nb = anchors[0]
        elif len(g) >= town.MIN_NEIGHBOURHOOD:
            anchor = max(g, key=lambda k: (indeg[k], -town.hval(k)))
            cx = sum(pos[k][0] for k in g) / len(g)
            cy = sum(pos[k][1] for k in g) / len(g)
            b = town.free_block_near(cx, cy, occupied, taken)
            if not b:
                continue
            nb = {"id": secrets.token_urlsafe(5), "anchor": anchor, "bx": b[0], "by": b[1], "landmark": None,
                  "name": None, "named": False, "active": True, "size": len(g), "created_at": now_iso()}
            await db.neighbourhoods.insert_one(dict(nb))
            taken.add(b)
            occupied.update(town.block_plots(*b))
            created.append(nb["id"])
            by_anchor[anchor] = nb
        else:
            continue
        sizes[nb["id"]] = len(g)
        for k in g:
            assign[k] = nb["id"]
    for nb in active:
        if nb["id"] not in sizes:
            await db.neighbourhoods.update_one({"id": nb["id"]}, {"$set": {"active": False}})
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
    "You run the planning office of a cartoon Springfield on X. A new neighbourhood formed from a group of X accounts "
    "who talk to each other. Pick the one landmark that fits what they post about, and invent a short, funny, "
    "Simpsons-flavoured neighbourhood name built around that landmark (e.g. 'Power Plant Heights', 'Moe's Back Alley', "
    "'Kwik-E Corners'). Max 3 words, max 24 characters, no handles, no real people's names, nothing mean or crude. "
    "Match the topic list literally: crypto, web3, DAOs and trading always get moes; AI and engineering get power_plant; "
    "only founders and business talk gets kwik_e_mart. Spread landmarks around town: avoid the ones already used a lot "
    "unless they are clearly the best fit. "
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
                                      {"_id": 0, "h": 1, "name": 1, "bio": 1, "posts": 1, "status": 1}).to_list(40)
    members.sort(key=lambda m: m["status"] != "finished")
    lines = []
    for m in members[:24]:
        line = f"@{m['h']} ({m.get('name') or ''}) bio: {(m.get('bio') or '')[:160]}"
        if m.get("posts"):
            line += " | posts: " + " / ".join(m["posts"][:4])
        lines.append(line[:700])
    landmark, name = "lard_lad", _fallback_name(nb_id)
    try:
        chat = LlmChat(api_key=LLM_KEY, session_id=f"nb-{uuid.uuid4()}", system_message=NAMING_SYSTEM).with_model("anthropic", NAMING_MODEL)
        used = Counter([n["landmark"] async for n in db.neighbourhoods.find({"active": True, "named": True}, {"_id": 0, "landmark": 1})])
        used_line = ", ".join(f"{k} x{v}" for k, v in used.most_common()) or "none yet"
        prompt = f"Landmarks already in town: {used_line}\n\nResidents:\n" + "\n".join(lines)
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
    await db.neighbourhoods.update_one({"id": nb_id}, {"$set": {"landmark": landmark, "name": name, "named": True}})
    await bump()


async def run_move_in(k: str, h: str, by: Optional[str]):
    try:
        await set_job(k, "reading")
        profile = None
        for attempt in range(4):
            profile = await get_profile(h)
            if not profile.get("throttled"):
                break
            await set_job(k, "traffic")
            await asyncio.sleep(12 * (attempt + 1))
        if not profile.get("found"):
            code = "protected" if profile.get("protected") else ("traffic" if profile.get("throttled") else "not_found")
            return await set_job(k, "error", code)
        if contains_blocked(profile["handle"], profile.get("name") or ""):
            return await set_job(k, "error", "blocked")
        await set_job(k, "building", h=profile["handle"])
        circle = await prepare_circle(k, profile)
        async with TOWN_LOCK:
            await place_move_in(k, profile, circle, by)
            created = await refresh_neighbourhoods()
            await bump()
        for nb_id in created:
            asyncio.create_task(name_neighbourhood(nb_id))
        await set_job(k, "done")
    except Exception:
        logger.exception("move-in failed for @%s", h)
        await set_job(k, "error", "failed")


@api.get("/")
async def root():
    return {"message": "Springfield, X is open"}


@api.post("/move-in")
async def move_in(body: MoveInRequest, request: Request):
    h = clean_handle(body.handle)
    k = h.lower()
    by = None
    if body.by:
        b = normalize_handle(body.by)
        by = b.lower() if is_valid_handle(b) else None
    res = await db.residents.find_one({"k": k}, {"_id": 0})
    if res and res.get("hidden"):
        raise HTTPException(403, "That house isn't available.")
    if res and res["status"] == "finished" and now() - datetime.fromisoformat(res["read_at"]) < READ_TTL:
        return {"handle": res["h"], "state": "done", "code": "already"}
    job = await db.jobs.find_one({"k": k}, {"_id": 0})
    if job and job["state"] in ACTIVE_JOB and now() - datetime.fromisoformat(job["updated_at"]) < timedelta(minutes=3):
        return job_public(job)
    await check_rate(client_ip(request))
    await db.jobs.update_one({"k": k}, {"$set": {"k": k, "h": h, "state": "queued", "code": None, "by": by,
                                                 "updated_at": now_iso()}}, upsert=True)
    asyncio.create_task(run_move_in(k, h, by))
    return {"handle": h, "state": "queued", "code": None}


@api.get("/move-in/{handle}")
async def move_in_status(handle: str):
    job = await db.jobs.find_one({"k": normalize_handle(handle).lower()}, {"_id": 0})
    if not job:
        raise HTTPException(404, "No move-in for that handle.")
    return job_public(job)


# ---------- town ----------

def inbound_counts(docs: list) -> Counter:
    keys = {d["k"] for d in docs}
    indeg = Counter()
    for d in docs:
        if d["status"] == "finished":
            for c in d.get("circle") or []:
                if c["k"] in keys and c["k"] != d["k"]:
                    indeg[c["k"]] += 1
    return indeg


TOWN_FIELDS = {"_id": 0, "k": 1, "h": 1, "name": 1, "avatar_url": 1, "status": 1, "x": 1, "y": 1, "by_h": 1, "nb": 1,
               "circle": 1}


@api.get("/town")
async def get_town(v: Optional[int] = None):
    version = await town_version()
    if v is not None and v == version:
        return {"unchanged": True, "version": version}
    docs = await db.residents.find({"hidden": False}, TOWN_FIELDS).to_list(None)
    indeg = inbound_counts(docs)
    residents = [{"k": d["k"], "h": d["h"], "n": d.get("name") or d["h"], "a": d.get("avatar_url"),
                  "s": "f" if d["status"] == "finished" else "r", "x": d["x"], "y": d["y"],
                  "t": town.tier_of(indeg[d["k"]]), "by": d.get("by_h"), "nb": d.get("nb")} for d in docs]
    nbs = await db.neighbourhoods.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "landmark": 1, "bx": 1, "by": 1,
                                                          "size": 1, "named": 1}).to_list(None)
    events = await db.events.find({}, {"_id": 0}).sort("at", -1).to_list(12)
    finished = sum(1 for r in residents if r["s"] == "f")
    biggest = max(nbs, key=lambda n: n.get("size", 0), default=None)
    return {"version": version, "residents": residents, "neighbourhoods": nbs, "ticker": events,
            "town_hall": {"bx": town.TOWN_HALL_BLOCK[0], "by": town.TOWN_HALL_BLOCK[1]},
            "stats": {"population": len(residents), "finished": finished, "reserved": len(residents) - finished,
                      "neighbourhoods": len(nbs),
                      "biggest": {"name": biggest.get("name"), "size": biggest.get("size")} if biggest and biggest.get("name") else None}}


async def load_resident(handle: str) -> dict:
    doc = await db.residents.find_one({"k": normalize_handle(handle).lower(), "hidden": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Nobody lives there yet.")
    return doc


async def street(doc: dict) -> dict:
    all_docs = await db.residents.find({"hidden": False}, {"_id": 0, "k": 1, "status": 1, "circle": 1}).to_list(None)
    indeg = inbound_counts(all_docs)
    own = [c["k"] for c in sorted(doc.get("circle") or [], key=lambda c: -c["w"])]
    inbound = [d["k"] for d in all_docs if d["status"] == "finished" and any(c["k"] == doc["k"] for c in d.get("circle") or [])]
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
            "landmark": nb.get("landmark"), "tags": st["tags"],
            "neighbours": [{"k": n["k"], "h": n["h"], "tier": n["t"], "status": "reserved" if n["s"] == "r" else "finished"}
                           for n in st["neighbours"]],
            "avatars": {doc["k"]: doc.get("avatar_url"), **{n["k"]: n["a"] for n in st["neighbours"]}}}


def card_hash(payload: dict) -> str:
    return hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:10]


def share_text(st: dict) -> str:
    if st["tags"]:
        return "I'm in Springfield. " + " ".join(f"@{t}" for t in st["tags"]) + " your houses are ready \u2192"
    return "I'm in Springfield. Come find your house \u2192"


@api.get("/residents/{handle}")
async def resident(handle: str, request: Request):
    doc = await load_resident(handle)
    st = await street(doc)
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
            "share": {"text": share_text(st), "url": f"{base}/api/s/{doc['h']}", "tags": st["tags"]},
            "card_url": f"{base}/api/residents/{doc['h']}/card.jpg?v={v}" if doc["status"] == "finished" else None}


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
        AVATAR_CACHE.clear()
    AVATAR_CACHE[url] = data
    return data


@api.get("/residents/{handle}/card.jpg")
async def resident_card(handle: str, request: Request):
    doc = await load_resident(handle)
    if doc["status"] != "finished":
        raise HTTPException(404, "That house is still under scaffolding.")
    st = await street(doc)
    payload = card_payload(doc, st)
    path = CARD_DIR / f"{doc['k']}-{card_hash(payload)}.jpg"
    if not path.exists():
        urls = payload.pop("avatars")
        blobs = await asyncio.gather(*[fetch_avatar(u) for u in urls.values()])
        avatars = dict(zip(urls.keys(), blobs))
        host = public_base(request).split("://", 1)[-1]
        data = await asyncio.to_thread(render_card, payload, avatars, host)
        path.write_bytes(data)
    return Response(content=path.read_bytes(), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


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
    nb_name = (st["nb"] or {}).get("name") or "Springfield"
    title = html.escape(f"@{doc['h']} lives in {nb_name}")
    tags = ", ".join(f"@{t}" for t in st["tags"])
    desc = html.escape(f"Next to {tags}. Your house is ready." if tags else "Springfield, X: the town built from who talks to whom.")
    img = f"{base}/api/residents/{doc['h']}/card.jpg?v={card_hash(card_payload(doc, st))}" if doc["status"] == "finished" else ""
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>{title} · Springfield, X</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Already Aired">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:url" content="{target}"><meta property="og:image" content="{img}">
<meta property="og:image:width" content="1260"><meta property="og:image:height" content="1680">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{img}">
<meta http-equiv="refresh" content="0;url={target}"></head>
<body><a href="{target}">{title}</a></body></html>"""
    return HTMLResponse(page)


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
    async for nb in db.neighbourhoods.find({"active": True, "named": False}, {"_id": 0, "id": 1}):
        asyncio.create_task(name_neighbourhood(nb["id"]))


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

"""Fills the preview city with sample residents (marked sample: true) until every ground spot is taken, then stacks
floors on top: tall share-link towers uptown, patched stacks on the Docks, dark invite floors and floor movers.
Run: cd /app/backend && python tests/seed_full_city.py"""
import asyncio
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import arena  # noqa: E402
import server  # noqa: E402
import stacks  # noqa: E402

db = server.db
rng = random.Random(7)
FIRST = ["mira", "devon", "kai", "noor", "lena", "omar", "priya", "jonas", "ines", "theo", "sana", "felix", "ava", "ravi",
         "yuki", "marco", "zara", "eli", "nina", "tariq", "june", "hugo", "leila", "sam", "iris", "diego", "maya", "arjun",
         "cleo", "finn", "rosa", "idris", "nora", "luca", "esme", "rafa", "tess", "kofi", "alba", "rhys"]
WORDS = ["builds", "codes", "ships", "writes", "draws", "makes", "cooks", "runs", "lifts", "reads", "plays", "films",
         "sings", "bakes", "trades", "hikes", "paints", "learns", "thinks", "posts"]
POOL = iter(rng.sample([f"{f}_{w}" for f in FIRST for w in WORDS], 600))
SEEDED = []


def fresh_handle() -> str:
    return next(POOL)


def profile(h: str) -> dict:
    first = h.split("_")[0].title()
    return {"handle": h, "name": f"{first} {chr(65 + server.town.hval(h) % 26)}.", "avatar_url": server.dev_avatar(h.lower()),
            "found": True}


async def settle(created):
    for nb_id in created:
        await server.name_neighbourhood(nb_id)


async def move_in(h: str, by: str = None) -> dict:
    k = h.lower()
    async with server.TOWN_LOCK:
        await server.place_move_in(k, profile(h), [], by, True)
        created = await server.refresh_neighbourhoods()
    await settle(created)
    SEEDED.append(k)
    return await db.residents.find_one({"k": k}, {"_id": 0})


async def invite(k: str, handles: list):
    me = await db.residents.find_one({"k": k}, {"_id": 0})
    had = len(me.get("circle") or [])
    circle = [{"handle": h, "name": profile(h)["name"], "avatar_url": profile(h)["avatar_url"], "weight": server.INVITES - had - i}
              for i, h in enumerate(handles)]
    async with server.TOWN_LOCK:
        occupied, pos = await server.occupancy()
        await db.residents.update_one({"k": k}, {"$push": {"circle": {"$each": [{"k": c["handle"].lower(), "w": c["weight"]}
                                                                                for c in circle]}}})
        await server.reserve_circle(k, me["h"], me["x"], me["y"], circle, occupied, pos, await server.count_taken())
        created = await server.refresh_neighbourhoods()
    await settle(created)
    SEEDED.extend(h.lower() for h in handles)


async def uptown(k: str, elo: int):
    await db.residents.update_one({"k": k}, {"$set": {"elo": elo}})
    async with server.TOWN_LOCK:
        await server.go_uptown(k)


async def main():
    if await db.residents.count_documents({"sample": True}):
        sys.exit("Sample residents are already in this city.")
    founders = [await move_in(fresh_handle()) for _ in range(55)]
    print("founders in, ground", await server.count_taken())
    invited = []
    for f in founders:
        hs = [fresh_handle() for _ in range(2)]
        await invite(f["k"], hs)
        invited += hs
    print("invites in, ground", await server.count_taken())
    for h in invited:
        if rng.random() < 0.6:
            await move_in(h)
    while await server.count_taken() < server.TOWN_CAPACITY:
        await move_in(fresh_handle())
    print("ground full", await server.count_taken())
    lit = [d["k"] for d in await db.residents.find({"status": "finished", "sample": {"$ne": True}, "k": {"$in": SEEDED}},
                                                   {"_id": 0, "k": 1}).to_list(None)]
    rng.shuffle(lit)
    ups, rest = lit[:36], lit[36:]
    for k in ups:
        await uptown(k, rng.randint(arena.UPTOWN_AT, 1160))
    for k in rest:
        await db.residents.update_one({"k": k}, {"$set": {"elo": rng.randint(930, arena.UPTOWN_AT - 1)}})
    print("uptown", len(ups))

    # The city is full: everyone from here on lives on a floor.
    tower, mid, small, dock = ups[0], ups[1], ups[2], rest[0]
    for host, n in ((tower, 10), (mid, 6), (small, 3), (dock, 7), ("loverboiwrites", 3)):
        for _ in range(n):
            await move_in(fresh_handle(), by=host)
    for _ in range(18):
        await move_in(fresh_handle())
    blds = await server.load_buildings()
    floor_folk = [d for ds in blds.values() for d in ds if stacks.stacked(d) and d["status"] == "finished" and d["k"] in SEEDED]
    rng.shuffle(floor_folk)
    for d in floor_folk[:5]:
        await invite(d["k"], [fresh_handle()])
    for d in floor_folk[5:8]:
        await uptown(d["k"], rng.randint(arena.UPTOWN_AT, 1080))
    await db.residents.update_many({"k": {"$in": SEEDED}}, {"$set": {"sample": True}})
    await server.bump()
    town = await server.get_town()
    print("stats", town["stats"])
    tall = sorted(((len(ds), stacks.area_of(k, ds), ds[0]["h"]) for k, ds in (await server.load_buildings()).items()), reverse=True)[:8]
    print("tallest", tall)


asyncio.run(main())

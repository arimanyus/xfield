"""Simulates a full city on a throwaway database: run with DB_NAME=floors_sim TOWN_CAPACITY=3."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import server  # noqa: E402
import stacks  # noqa: E402

db = server.db


async def arrive(h, by=None):
    fb = {"handle": h, "name": h.title(), "avatar_url": None, "host": "test"}
    await server.run_move_in(h.lower(), h, by, True, fb)
    return await db.residents.find_one({"k": h.lower()}, {"_id": 0})


async def show(label):
    blds = await server.load_buildings()
    print(f"--- {label}: ground={await server.count_taken()}")
    for key, ds in sorted(blds.items(), key=lambda kv: str(kv[0])):
        print("  ", key, stacks.area_of(key, ds), [(d["k"], d.get("lv"), d["status"][0], bool(d.get("uptown"))) for d in ds])


async def main():
    assert os.environ["DB_NAME"] == "floors_sim"
    await db.client.drop_database("floors_sim")
    for h in ("alice", "bob", "cara"):
        await arrive(h)
    await show("three ground homes")
    d = await arrive("dave")
    assert d["lv"] == 1, d
    await show("dave on a floor")
    e = await arrive("erin", by="bob")
    bob = await db.residents.find_one({"k": "bob"})
    assert stacks.key_of(e) == stacks.key_of(bob), (e, bob)
    await show("erin via bob's link")
    async with server.TOWN_LOCK:
        await server.reserve_circle("erin", "erin", e["x"], e["y"], [{"handle": "fay", "weight": 3}], *await server.occupancy(),
                                    await server.count_taken())
        await server.refresh_neighbourhoods()
    fay = await db.residents.find_one({"k": "fay"})
    assert fay["status"] == "reserved" and stacks.key_of(fay) == stacks.key_of(bob), fay
    await show("fay invited by erin")
    async with server.TOWN_LOCK:
        await server.go_uptown("bob")
    await show("bob moved uptown")
    erin = await db.residents.find_one({"k": "erin"})
    assert erin["lv"] == 0, erin
    async with server.TOWN_LOCK:
        await server.go_uptown("fay") if False else None
        await server.go_uptown("erin")
    await show("erin moved uptown from the ground of an orphan stack")
    erin = await db.residents.find_one({"k": "erin"})
    assert erin.get("uptown") and erin.get("lv") == 1, erin
    fay = await db.residents.find_one({"k": "fay"})
    assert fay["lv"] == 0, fay
    g = await arrive("gus")
    await show("gus on the shortest docks building")
    assert g["lv"] >= 1
    town = await server.get_town()
    print("stats", town["stats"])
    assert town["stats"]["floors"] >= 2
    erin_card = await server.card_payload(erin, await server.street(erin))
    print("erin card", erin_card["floor"], erin_card["size"], erin_card["base_h"], server.share_text(erin_card))
    await db.client.drop_database("floors_sim")
    print("ALL GOOD")


asyncio.run(main())

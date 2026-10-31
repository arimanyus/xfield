"""Throwaway-DB check of moved_in event fields (on_h, lv) for floor arrivals. Run: DB_NAME=floors_sim_ev TOWN_CAPACITY=2"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import server  # noqa: E402

db = server.db


async def arrive(h, by=None):
    fb = {"handle": h, "name": h.title(), "avatar_url": None, "host": "test"}
    await server.run_move_in(h.lower(), h, by, True, fb)
    return await db.residents.find_one({"k": h.lower()}, {"_id": 0})


async def ev(h):
    return await db.events.find_one({"h": h, "type": "moved_in"}, {"_id": 0})


async def main():
    assert os.environ["DB_NAME"] == "floors_sim_ev"
    await db.client.drop_database("floors_sim_ev")
    await arrive("Alice")
    await arrive("Bob")
    e = await ev("Alice")
    print("ground event", e)
    assert e and "on_h" not in e and "lv" not in e, e
    c = await arrive("Cara", by="bob")
    e = await ev("Cara")
    print("floor via link event", e)
    assert e["on_h"] == "Bob" and e["lv"] == 1 == c["lv"], e
    d = await arrive("Dan", by="bob")
    e = await ev("Dan")
    print("floor 2 event", e)
    assert e["on_h"] == "Bob" and e["lv"] == 2, e
    f = await arrive("Fay")
    e = await ev("Fay")
    print("random arrival event", e)
    assert e["on_h"] == "Alice" and e["lv"] == 1, e
    fact = server.FACTS["moved_in"](e) if hasattr(server, "FACTS") and callable(server.FACTS.get("moved_in")) else None
    print("fact", fact)
    blds = await server.load_buildings()
    bob = await db.residents.find_one({"k": "bob"}, {"_id": 0})
    t = server.tower_payload(bob, blds)
    print("tower", t["size"], t["rank"], t["of"], server.tower_text(t))
    assert t["size"] == 3 and t["rank"] == 1
    await db.client.drop_database("floors_sim_ev")
    print("ALL GOOD")


asyncio.run(main())

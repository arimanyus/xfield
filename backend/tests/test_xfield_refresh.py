"""XField town refresh: stale read house re-read + move, stale reserved demolished, pointed-at stale reserved kept.

Mutates Mongo (backs up and restores the target resident; fake zz_test_* residents are demolished/cleaned).
Run alone (not with xdist):  pytest tests/test_xfield_refresh.py -p no:xdist -s
"""
import asyncio
import os
import time
import uuid
from datetime import datetime, timezone

import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ENV = dotenv_values("/app/backend/.env")
TARGET = os.environ.get("REFRESH_TARGET", "levelsio")
FAR = (14, 14)


def mongo(fn):
    async def run():
        cl = AsyncIOMotorClient(ENV["MONGO_URL"])
        try:
            return await fn(cl[ENV["DB_NAME"]])
        finally:
            cl.close()
    return asyncio.run(run())


def fake(k, created, circle=None):
    return {"k": k, "h": k, "status": "reserved", "verified": False, "hidden": False, "x": -30 - len(k) % 5,
            "y": -30 - (2 if "pointed" in k else 0), "circle": circle or [], "created_at": created, "name": "x",
            "avatar_url": None, "by": None, "by_h": None, "nb": None, "sign_tone": "pun"}


def trigger():
    r = requests.post(f"{BASE}/api/cron/refresh", json={}, timeout=30,
                      headers={"Authorization": f"Bearer {ENV['WEBHOOK_CRON_SECRET']}", "X-Webhook-Id": "TEST_" + uuid.uuid4().hex})
    assert r.status_code == 200 and r.json() == {"accepted": True}


def test_refresh_moves_and_demolishes():
    backup = mongo(lambda db: db.residents.find_one({"k": TARGET}, {"_id": 0}))
    assert backup and backup.get("read_at")
    start = datetime.now(timezone.utc).isoformat()
    old = "2026-09-01T00:00:00+00:00"
    mongo(lambda db: db.residents.update_one({"k": TARGET}, {"$set": {
        "read_at": "2026-10-01T00:00:00+00:00", "x": FAR[0], "y": FAR[1],
        "circle": [{"k": "zz_far_a", "w": 9}, {"k": "zz_far_b", "w": 8}]}}))
    mongo(lambda db: db.residents.insert_many([
        fake("zz_test_stale", old),
        fake("zz_test_pointed", old),
        fake("zz_test_pointer", datetime.now(timezone.utc).isoformat(), [{"k": "zz_test_pointed", "w": 3}]),
    ]))
    try:
        trigger()
        deadline = time.time() + 90
        doc = None
        while time.time() < deadline:
            time.sleep(5)
            doc = mongo(lambda db: db.residents.find_one({"k": TARGET}, {"_id": 0}))
            gone = mongo(lambda db: db.residents.find_one({"k": "zz_test_stale"}))
            if doc["read_at"] > start and not gone:
                break
        print("target now", doc["x"], doc["y"], "read_at", doc["read_at"], "circle", [c["k"] for c in doc["circle"]][:5])
        assert mongo(lambda db: db.residents.find_one({"k": "zz_test_stale"})) is None, "stale reserved not demolished"
        assert mongo(lambda db: db.residents.find_one({"k": "zz_test_pointed"})) is not None, "pointed-at house was demolished"
        events = requests.get(f"{BASE}/api/town", timeout=30).json()["ticker"]
        recent = [e for e in events if e["at"] > start]
        print("events", recent)
        assert any(e["type"] == "demolished" for e in recent)
        if doc["read_at"] > start:  # not throttled
            assert (doc["x"], doc["y"]) != FAR, "house did not move back"
            mv = [e for e in recent if e["type"] == "moved" and e["h"].lower() == TARGET]
            assert mv and "nb_name" in mv[0]
        else:
            print("X read throttled; house waits (expected)")
    finally:
        # cleanup: restore target if not re-read; remove fake pointer/pointed
        doc = mongo(lambda db: db.residents.find_one({"k": TARGET}, {"_id": 0}))
        if doc["read_at"] <= start:
            mongo(lambda db: db.residents.replace_one({"k": TARGET}, backup))
        mongo(lambda db: db.residents.delete_many({"k": {"$in": ["zz_test_stale", "zz_test_pointed", "zz_test_pointer"]}}))
        mongo(lambda db: db.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}}))

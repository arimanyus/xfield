"""Tests for the async episode generation + retry bug fix.

Targets the user-reported Cloudflare 'archive hiccuped' bug. All backend tests
for the new async contract (text_status pending/ready/failed, retry endpoint,
pasted posts, multi-mirror fast-fail, exclusion of pending/failed from public
lists) live here. Keeps episode creation to <=3 to respect the 10/hr IP limit.
"""
import os
import time
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

S = requests.Session()
S.headers.update({"Content-Type": "application/json"})

STATE: dict = {}


def _poll(ep_id, field, target_values, timeout=90, interval=3):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = S.get(f"{API}/episodes/{ep_id}", timeout=15)
        if r.status_code == 200:
            last = r.json()
            if last.get(field) in target_values:
                return last
        time.sleep(interval)
    return last


# ---------- POST /api/episodes async contract w/ posts_text ----------
@pytest.mark.order(1)
class TestAsyncBugfix:
    def test_post_returns_fast_pending_with_pasted(self):
        payload = {
            "handle": "zzqxnobody9981",
            "spice": "roast",
            "labels": {"role": "builder", "vibe": "lurker", "obsession": "coffee"},
            "posts_text": "shipped the thing. nobody noticed.\nhot take: every productivity app is a to-do list wearing a trench coat",
        }
        t0 = time.time()
        r = S.post(f"{API}/episodes", json=payload, timeout=15)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 10, f"POST took {elapsed:.1f}s (should be ~1-3s)"
        ep = r.json()
        assert ep["text_status"] == "pending"
        assert ep["image_status"] == "pending"
        assert ep.get("title") in (None, "")
        assert ep["source"] == "pasted"
        STATE["ep_id"] = ep["id"]
        STATE["post_elapsed"] = elapsed

    def test_pending_excluded_from_recent(self):
        ep_id = STATE["ep_id"]
        r = S.get(f"{API}/recent", timeout=15)
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()]
        assert ep_id not in ids, f"pending ep {ep_id} should not be in /api/recent"

    def test_text_becomes_ready(self):
        ep_id = STATE["ep_id"]
        final = _poll(ep_id, "text_status", {"ready", "failed"}, timeout=90)
        assert final is not None
        assert final["text_status"] == "ready", f"text_status={final.get('text_status')}"
        assert final.get("title")
        assert final.get("already_happened")
        assert final.get("coming_near") and final["coming_near"].get("year")
        assert final.get("coming_far") and final["coming_far"].get("year")

    def test_ready_appears_in_recent(self):
        ep_id = STATE["ep_id"]
        # small grace in case list cached
        found = False
        for _ in range(5):
            r = S.get(f"{API}/recent", timeout=15)
            ids = [e["id"] for e in r.json()]
            if ep_id in ids:
                found = True
                break
            time.sleep(2)
        assert found, "ready ep missing from /api/recent"

    def test_image_becomes_ready_and_served(self):
        ep_id = STATE["ep_id"]
        final = _poll(ep_id, "image_status", {"ready", "failed"}, timeout=120)
        assert final["image_status"] == "ready", f"image_status={final.get('image_status')}"
        img = S.get(f"{API}/episodes/{ep_id}/image", timeout=30)
        assert img.status_code == 200
        assert img.headers["content-type"].startswith("image/jpeg")
        assert len(img.content) > 10_000


# ---------- Retry flow (simulate failure in Mongo) ----------
    def test_retry_unknown_404(self):
        r = S.post(f"{API}/episodes/zzz-no-exist/retry", timeout=15)
        assert r.status_code == 404

    def test_retry_on_ready_is_noop(self):
        ep_id = STATE.get("ep_id")
        assert ep_id, "need ep from previous class"
        before = S.get(f"{API}/episodes/{ep_id}").json()
        r = S.post(f"{API}/episodes/{ep_id}/retry", timeout=15)
        assert r.status_code == 200
        after = r.json()
        assert after["text_status"] == "ready"
        assert after["title"] == before["title"]

    def test_simulate_failed_then_retry(self):
        ep_id = STATE["ep_id"]
        # Flip to failed directly in Mongo
        mc = MongoClient(MONGO_URL)
        res = mc[DB_NAME].episodes.update_one({"id": ep_id}, {"$set": {"text_status": "failed"}})
        mc.close()
        assert res.modified_count == 1

        # GET shows failed
        d = S.get(f"{API}/episodes/{ep_id}").json()
        assert d["text_status"] == "failed"

        # /recent excludes it
        rec = S.get(f"{API}/recent").json()
        assert all(e["id"] != ep_id for e in rec)

        # Retry → pending
        r = S.post(f"{API}/episodes/{ep_id}/retry", timeout=15)
        assert r.status_code == 200
        assert r.json()["text_status"] == "pending"

        # Becomes ready
        final = _poll(ep_id, "text_status", {"ready", "failed"}, timeout=90)
        assert final["text_status"] == "ready"
        assert final.get("title")


# ---------- Validation + /api/read fast-fail ----------
    def test_posts_text_blocked_word(self):
        r = S.post(f"{API}/episodes", json={
            "handle": "zzqxnobody9981", "spice": "roast",
            "labels": {"role": "builder", "vibe": "lurker", "obsession": "coffee"},
            "posts_text": "I love porn so much",
        }, timeout=15)
        assert r.status_code == 400, r.text

    def test_read_nonexistent_fast_fail(self):
        t0 = time.time()
        r = S.post(f"{API}/read", json={"handle": "zzqxnobody9981"}, timeout=30)
        elapsed = time.time() - t0
        assert r.status_code == 200
        d = r.json()
        assert d["found"] is False
        assert elapsed < 25, f"/api/read took {elapsed:.1f}s (should be <20-25s)"

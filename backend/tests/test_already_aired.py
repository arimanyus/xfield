"""End-to-end backend tests for Already Aired.

All tests live in one class so pytest-xdist loadscope pins them to a single
worker (preserves ordering + the shared 10/hr rate limit).
"""
import os
import time
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
S = requests.Session()
S.headers.update({"Content-Type": "application/json"})

# Shared state across tests (module scope)
STATE: dict = {}


def _poll_image(ep_id: str, timeout: int = 90) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = S.get(f"{API}/episodes/{ep_id}")
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("image_status") == "ready":
            return last
        if last.get("image_status") == "failed":
            return last
        time.sleep(3)
    return last


@pytest.mark.order(1)
class TestAlreadyAired:
    # ---------- /api/read ----------
    def test_read_valid_handle_naval(self):
        r = S.post(f"{API}/read", json={"handle": "@naval"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["found"] is True
        assert d["name"]
        assert d["avatar_url"]
        assert d["post_count"] > 0
        assert d["source"] in ("nitter", "syndication", "fxtwitter", "taps")
        # usually nitter per request
        assert d["labels"]
        for k in ("role", "vibe", "obsession"):
            assert d["labels"].get(k)
        STATE["naval_labels"] = d["labels"]

    def test_read_invalid_handle(self):
        r = S.post(f"{API}/read", json={"handle": "bad handle!"}, timeout=15)
        assert r.status_code == 400

    def test_read_nonexistent_handle(self):
        r = S.post(f"{API}/read", json={"handle": "zzqxnobody9981"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["found"] is False
        assert d["labels"] is None

    # ---------- /api/episodes validation ----------
    def test_create_episode_blocked_label(self):
        r = S.post(f"{API}/episodes", json={
            "handle": "naval", "spice": "roast",
            "labels": {"role": "investor", "vibe": "thread writer", "obsession": "porn"},
        }, timeout=20)
        assert r.status_code == 400, r.text

    def test_create_episode_invalid_spice(self):
        r = S.post(f"{API}/episodes", json={
            "handle": "naval", "spice": "spicy",
            "labels": {"role": "a", "vibe": "b", "obsession": "c"},
        }, timeout=20)
        assert r.status_code == 422

    # ---------- Create naval episode (full flow + image poll) ----------
    def test_create_naval_episode(self):
        labels = STATE.get("naval_labels") or {"role": "investor", "vibe": "thread writer", "obsession": "wealth"}
        r = S.post(f"{API}/episodes", json={
            "handle": "naval", "spice": "roast", "labels": labels,
        }, timeout=60)
        assert r.status_code == 200, r.text
        ep = r.json()
        assert ep["id"]
        assert 7 <= ep["season"] <= 15
        assert 1 <= ep["episode"] <= 24
        assert 1996 <= ep["aired_year"] <= 2004
        assert ep["title"]
        assert ep["already_happened"]
        year = datetime.now(timezone.utc).year
        assert ep["coming_near"]["year"] == year + 1
        assert ep["coming_far"]["year"] in range(year + 3, year + 8)
        assert ep["subtitle"]
        assert ep["image_status"] == "pending"
        assert ep["share_url"].endswith(f"/api/s/{ep['id']}")
        STATE["naval_ep"] = ep["id"]
        # Poll for image
        final = _poll_image(ep["id"], timeout=90)
        assert final["image_status"] in ("ready", "failed"), final
        STATE["naval_ep_image_status"] = final["image_status"]
        if final["image_status"] == "ready":
            img = S.get(f"{API}/episodes/{ep['id']}/image", timeout=30)
            assert img.status_code == 200
            assert img.headers["content-type"].startswith("image/jpeg")
            assert len(img.content) > 20_000

    # ---------- Friend flow ----------
    def test_create_friend_episode_sama_by_naval(self):
        r = S.post(f"{API}/episodes", json={
            "handle": "sama", "found_by": "naval", "spice": "savage",
            "labels": {"role": "founder", "vibe": "shipper", "obsession": "agi"},
        }, timeout=60)
        assert r.status_code == 200, r.text
        ep = r.json()
        assert ep["found_by"] == "naval"
        assert ep["spice"] == "savage"
        STATE["sama_ep"] = ep["id"]

    # ---------- Taps flow (nonexistent handle) ----------
    def test_create_taps_episode(self):
        r = S.post(f"{API}/episodes", json={
            "handle": "zzqxnobody9981", "spice": "roast",
            "labels": {"role": "builder", "vibe": "lurker", "obsession": "coffee"},
        }, timeout=60)
        assert r.status_code == 200, r.text
        ep = r.json()
        assert ep["source"] == "taps"
        STATE["taps_ep"] = ep["id"]

    # ---------- Share increment + leaderboards ----------
    def test_share_increments(self):
        ep_id = STATE["naval_ep"]
        before = S.get(f"{API}/episodes/{ep_id}").json()["shares"]
        for _ in range(3):
            r = S.post(f"{API}/episodes/{ep_id}/share", json={"channel": "x"}, timeout=10)
            assert r.status_code == 200
        after = r.json()["shares"]
        assert after == before + 3

    def test_leaderboard_shared(self):
        r = S.get(f"{API}/leaderboard", params={"type": "shared"}, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and rows
        assert rows[0]["id"] == STATE["naval_ep"]

    def test_leaderboard_prophesied_and_prophets(self):
        r = S.get(f"{API}/leaderboard", params={"type": "prophesied"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        r = S.get(f"{API}/leaderboard", params={"type": "prophets"}, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(row["handle"].lower() == "naval" for row in rows), rows
        r = S.get(f"{API}/leaderboard", params={"type": "shared", "period": "today"}, timeout=15)
        assert r.status_code == 200

    # ---------- /api/recent + /api/handles ----------
    def test_recent(self):
        r = S.get(f"{API}/recent", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(e["id"] == STATE["naval_ep"] for e in rows)

    def test_handle_page_sama(self):
        r = S.get(f"{API}/handles/sama", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["episode_count"] >= 1
        assert "prophet_count" in d
        assert isinstance(d["episodes"], list)

    # ---------- OG share page ----------
    def test_share_page_bot(self):
        r = requests.get(f"{API}/s/{STATE['naval_ep']}",
                         headers={"User-Agent": "Twitterbot/1.0"}, allow_redirects=False, timeout=15)
        assert r.status_code == 200
        body = r.text
        assert "og:image" in body and "og:title" in body
        assert 'summary_large_image' in body

    def test_share_page_human(self):
        r = requests.get(f"{API}/s/{STATE['naval_ep']}",
                         headers={"User-Agent": "Mozilla/5.0"}, allow_redirects=False, timeout=15)
        assert r.status_code == 302
        assert "/ep/" in r.headers["location"]

    def test_share_page_unknown(self):
        r = requests.get(f"{API}/s/does-not-exist", allow_redirects=False, timeout=15,
                         headers={"User-Agent": "Mozilla/5.0"})
        assert r.status_code == 302
        assert r.headers["location"].rstrip("/").endswith(BASE.rstrip("/"))

    # ---------- Report hide flow (last, uses taps ep) ----------
    def test_report_hides_after_three(self):
        ep_id = STATE["taps_ep"]
        last = None
        for _ in range(3):
            r = S.post(f"{API}/episodes/{ep_id}/report", json={"reason": "test"}, timeout=15)
            assert r.status_code == 200
            last = r.json()
        assert last["hidden"] is True
        r = S.get(f"{API}/episodes/{ep_id}", timeout=15)
        assert r.status_code == 404
        r = S.get(f"{API}/recent", timeout=15)
        assert all(e["id"] != ep_id for e in r.json())

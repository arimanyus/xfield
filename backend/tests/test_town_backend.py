"""Backend tests for the XField city.

Covers: /api/town, /api/move-in, /api/residents, /api/residents/*/card.jpg,
/api/s/{handle}, owner-only admin.

Only hits the public preview URL (REACT_APP_BACKEND_URL).
"""

import os
import time

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_KEY = "seQiVzVB_MXusJKQlgSsQll5ppdq2CxX"


# ---------- helpers ----------

def api_get(path, **kw):
    return requests.get(f"{BASE}{path}", timeout=30, **kw)


def api_post(path, **kw):
    return requests.post(f"{BASE}{path}", timeout=30, **kw)


def wait_move_in(h, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = api_get(f"/api/move-in/{h}")
        if r.status_code != 200:
            return None
        j = r.json()
        if j["state"] in ("done", "error"):
            return j
        time.sleep(2)
    return None


# ---------- town ----------

class TestTown:
    def test_town_shape(self):
        r = api_get("/api/town")
        assert r.status_code == 200
        d = r.json()
        for k in ("version", "residents", "neighbourhoods", "ticker", "town_hall", "stats", "options"):
            assert k in d, f"missing {k}"
        assert d["town_hall"] == {"bx": 0, "by": 0}
        assert set(d["options"]) == {"colors", "projects", "landmarks"}
        s = d["stats"]
        for k in ("population", "finished", "reserved", "neighbourhoods", "biggest"):
            assert k in s
        assert isinstance(d["residents"], list)
        if d["residents"]:
            r0 = d["residents"][0]
            for k in ("k", "h", "n", "a", "s", "x", "y", "t", "f", "by", "nb"):
                assert k in r0, f"resident missing {k}"
            assert r0["s"] in ("f", "r")

    def test_town_unchanged(self):
        v = api_get("/api/town").json()["version"]
        r = api_get(f"/api/town?v={v}")
        assert r.status_code == 200
        j = r.json()
        assert j.get("unchanged") is True
        assert j.get("version") == v


# ---------- residents ----------

class TestResidents:
    def test_finished_resident(self):
        r = api_get("/api/residents/levelsio")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("k", "h", "name", "avatar_url", "status", "tier", "tier_name", "floors", "max_floors",
                  "land_value", "home", "inbound", "by_h", "neighbourhood", "neighbours", "brought",
                  "brought_lit", "share", "card_url"):
            assert k in d, f"missing {k}"
        assert d["status"] == "finished"
        assert d["card_url"] and "card.jpg" in d["card_url"]
        s = d["share"]
        assert set(s.keys()) >= {"text", "url", "tags"}
        assert s["url"].endswith("/api/s/levelsio")
        assert len(s["tags"]) <= 3
        # share text format
        assert "on XField." in s["text"]
        assert "economy" not in d
        if s["tags"]:
            for t in s["tags"]:
                assert f"@{t}" in s["text"]
            assert s["text"].endswith("your lots are reserved \u2192")

    def test_reserved_resident(self):
        town = api_get("/api/town").json()
        reserved = next((r for r in town["residents"] if r["s"] == "r"), None)
        assert reserved, "need at least one reserved resident"
        r = api_get(f"/api/residents/{reserved['h']}")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "reserved"
        assert d["card_url"] is None

    def test_unknown_404(self):
        r = api_get("/api/residents/zzqqxx_no_user_99")
        assert r.status_code == 404

    def test_card_jpg_finished(self):
        r = api_get("/api/residents/levelsio/card.jpg")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/jpeg"
        assert len(r.content) > 1000
        # JPEG magic
        assert r.content[:2] == b"\xff\xd8"

    def test_card_jpg_reserved_404(self):
        town = api_get("/api/town").json()
        reserved = next((r for r in town["residents"] if r["s"] == "r"), None)
        assert reserved
        r = api_get(f"/api/residents/{reserved['h']}/card.jpg")
        assert r.status_code == 404


# ---------- share page ----------

class TestSharePage:
    def test_bot_gets_html(self):
        r = requests.get(f"{BASE}/api/s/levelsio",
                         headers={"User-Agent": "Twitterbot/1.0"},
                         timeout=20, allow_redirects=False)
        assert r.status_code == 200
        body = r.text
        assert 'property="og:title"' in body
        assert 'property="og:image"' in body
        assert 'card.jpg' in body
        assert 'name="twitter:card" content="summary_large_image"' in body

    def test_browser_redirects(self):
        r = requests.get(f"{BASE}/api/s/levelsio",
                         headers={"User-Agent": "Mozilla/5.0"},
                         timeout=20, allow_redirects=False)
        assert r.status_code == 302
        assert "/h/levelsio?arrive=1" in r.headers.get("location", "")

    def test_unknown_redirects_home(self):
        r = requests.get(f"{BASE}/api/s/zzqqxx_no_user_99",
                         headers={"User-Agent": "Mozilla/5.0"},
                         timeout=20, allow_redirects=False)
        assert r.status_code == 302
        assert r.headers.get("location", "").rstrip("/").endswith(BASE.rstrip("/"))


# ---------- move-in ----------

class TestMoveIn:
    def test_invalid_handle_400(self):
        r = api_post("/api/move-in", json={"handle": "bad handle!!"})
        assert r.status_code == 400

    def test_already_finished(self):
        r = api_post("/api/move-in", json={"handle": "levelsio"})
        assert r.status_code == 200
        j = r.json()
        assert j["state"] == "done"
        assert j["code"] == "already"

    def test_nonexistent_handle(self):
        # X handles max 15 chars, alphanumeric + underscore
        h = "zzqqxxnouser99"
        r = api_post("/api/move-in", json={"handle": h})
        assert r.status_code == 200
        j = wait_move_in(h, timeout=60)
        assert j is not None
        assert j["state"] == "error"
        assert j["code"] == "not_found"

    def test_lights_on_reserved(self):
        """Pick a reserved handle and move it in -> should become finished at same x,y and emit lights_on."""
        town = api_get("/api/town").json()
        # Prefer well-known reserved handle to maximize success on free X guest API
        preferred = ["pmarca", "dhh", "balajis", "karpathy", "patio11", "elonmusk"]
        reserved = [r for r in town["residents"] if r["s"] == "r"]
        pick = None
        for p in preferred:
            for r in reserved:
                if r["k"] == p.lower():
                    pick = r
                    break
            if pick:
                break
        if not pick:
            pytest.skip("no suitable reserved handle for lights-on test")
        orig_x, orig_y, orig_by = pick["x"], pick["y"], pick["by"]
        v_before = town["version"]
        r = api_post("/api/move-in", json={"handle": pick["h"]})
        assert r.status_code == 200, r.text
        j = wait_move_in(pick["h"], timeout=120)
        assert j is not None, "move-in timed out"
        if j["state"] != "done":
            pytest.skip(f"move-in didn't succeed (code={j.get('code')}); likely X throttled")
        # verify resident
        res = api_get(f"/api/residents/{pick['h']}").json()
        assert res["status"] == "finished"
        assert res["x"] == orig_x and res["y"] == orig_y
        assert res["by_h"] == orig_by
        town2 = api_get("/api/town").json()
        assert town2["version"] > v_before
        # ticker should contain lights_on entry for this handle
        found = any(e.get("type") == "lights_on" and (e.get("h", "").lower() == pick["k"] or e.get("k") == pick["k"]) for e in town2["ticker"])
        assert found, f"no lights_on event in ticker: {town2['ticker'][:5]}"


# ---------- admin ----------

class TestAdmin:
    def test_no_key_403(self):
        r = api_post("/api/admin/check")
        assert r.status_code == 403

    def test_with_key_ok(self):
        r = api_post("/api/admin/check", headers={"X-Admin-Key": ADMIN_KEY})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_hide_and_restore(self):
        handle = "arseneeth"
        hdr = {"X-Admin-Key": ADMIN_KEY}
        try:
            r = api_post(f"/api/admin/residents/{handle}/hide",
                         headers=hdr, json={"hidden": True})
            assert r.status_code == 200
            # Gone from town
            town = api_get("/api/town").json()
            assert not any(x["k"] == handle.lower() for x in town["residents"])
            # resident 404
            assert api_get(f"/api/residents/{handle}").status_code == 404
            # move-in -> 403
            r2 = api_post("/api/move-in", json={"handle": handle})
            assert r2.status_code == 403
        finally:
            r = api_post(f"/api/admin/residents/{handle}/hide",
                         headers=hdr, json={"hidden": False})
            assert r.status_code == 200
        # restored
        assert api_get(f"/api/residents/{handle}").status_code == 200

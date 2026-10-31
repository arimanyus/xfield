# City chat (public GET, POST rules, anti-flood, mute) + admin chat moderation + the 3 new billboard slots
# (stadium/airport/station). One class per feature; billboard docs are snapshotted and restored, chat is wiped at the end.
import hashlib
import io
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from PIL import Image
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_KEY = "seQiVzVB_MXusJKQlgSsQll5ppdq2CxX"
HDR = {"X-Admin-Key": ADMIN_KEY}
LOVER = {"Cookie": "xf_session=test_snap_token_loverboi_2026"}
JONAS_TOKEN = "TEST_chat_jonas_token_2026"
JONAS = {"Cookie": f"xf_session={JONAS_TOKEN}"}
NEW_SLOTS = ["stadium", "airport", "station"]


def env(key, path="/app/backend/.env"):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(env("MONGO_URL"))[env("DB_NAME")]


def png():
    b = io.BytesIO()
    Image.new("RGB", (320, 160), (200, 30, 90)).save(b, "PNG")
    return b.getvalue()


# ---------- billboards: new slots ----------
class TestNewBillboards:
    def test_admin_lists_new_slots(self):
        r = requests.get(f"{API}/admin/billboards", headers=HDR)
        assert r.status_code == 200
        bbs = {b["id"]: b for b in r.json()["billboards"]}
        assert len(bbs) == 9
        assert bbs["stadium"]["name"] == "Stadium big screen"
        assert bbs["airport"]["name"] == "Airport terminal"
        assert bbs["station"]["name"] == "Central Station"
        for s in NEW_SLOTS:
            assert bbs[s]["size"] == "big"

    def test_admin_needs_key(self):
        assert requests.get(f"{API}/admin/billboards").status_code == 401

    def test_upload_save_clear_cycle_and_town(self, mdb):
        snap = {s: mdb.billboards.find_one({"slot": s}, {"_id": 0}) for s in NEW_SLOTS}
        try:
            for s in NEW_SLOTS:
                r = requests.post(f"{API}/admin/billboards/{s}/image", headers=HDR, files={"file": ("a.png", png(), "image/png")})
                assert r.status_code == 200, r.text
                assert r.json()["image_url"].startswith(f"/api/billboards/{s}/image?v=")
                img = requests.get(BASE_URL + r.json()["image_url"])
                assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
                r = requests.put(f"{API}/admin/billboards/{s}", headers=HDR, json={"caption": f"TEST_{s}", "link": "https://example.com", "enabled": True})
                assert r.status_code == 200 and r.json()["caption"] == f"TEST_{s}" and r.json()["enabled"] is True
            town = {b["id"]: b for b in requests.get(f"{API}/town").json()["billboards"]}
            for s in NEW_SLOTS:
                assert s in town and town[s]["caption"] == f"TEST_{s}" and town[s]["link"] == "https://example.com"
            # disabled -> gone from town
            requests.put(f"{API}/admin/billboards/stadium", headers=HDR, json={"caption": "x", "link": "", "enabled": False})
            # cleared picture -> gone from town
            r = requests.delete(f"{API}/admin/billboards/airport/image", headers=HDR)
            assert r.status_code == 200 and r.json()["image_url"] is None
            town = {b["id"] for b in requests.get(f"{API}/town").json()["billboards"]}
            assert "stadium" not in town and "airport" not in town and "station" in town
            # bad link
            r = requests.put(f"{API}/admin/billboards/station", headers=HDR, json={"caption": "", "link": "javascript:alert(1)", "enabled": True})
            assert r.status_code == 400
        finally:
            for s, d in snap.items():
                mdb.billboards.delete_one({"slot": s})
                if d:
                    mdb.billboards.insert_one(dict(d))
            mdb.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}})


# ---------- city chat ----------
class TestChat:
    @pytest.fixture(scope="class", autouse=True)
    def setup(self, mdb):
        mdb.sessions.delete_many({"token_hash": hashlib.sha256(JONAS_TOKEN.encode()).hexdigest()})
        mdb.sessions.insert_one({"token_hash": hashlib.sha256(JONAS_TOKEN.encode()).hexdigest(), "k": "jonas_trades", "h": "jonas_trades",
                                 "name": "Jonas", "avatar_url": None, "test": True,
                                 "expires_at": datetime.now(timezone.utc) + timedelta(days=1)})
        mdb.chat.delete_many({"k": {"$in": ["loverboiwrites", "jonas_trades"]}})
        mdb.residents.update_many({"k": {"$in": ["loverboiwrites", "jonas_trades"]}}, {"$set": {"chat_muted": False}})
        yield
        mdb.residents.update_many({"k": {"$in": ["loverboiwrites", "jonas_trades"]}}, {"$set": {"chat_muted": False}})
        mdb.sessions.delete_many({"token_hash": hashlib.sha256(JONAS_TOKEN.encode()).hexdigest()})

    def test_public_get(self):
        r = requests.get(f"{API}/chat")
        assert r.status_code == 200
        d = r.json()
        assert d["removed"] == [] and d["me"] is None and isinstance(d["messages"], list)

    def test_post_requires_session(self):
        r = requests.post(f"{API}/chat", json={"text": "hi"})
        assert r.status_code == 401 and r.json()["detail"] == "Sign in with X first."

    def test_post_and_validation(self, mdb):
        r = requests.post(f"{API}/chat", headers=LOVER, json={"text": "  TEST   hello\n\n city  "})
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["text"] == "TEST hello city"
        assert set(m) >= {"id", "k", "h", "a", "text", "at", "where", "rank"}
        assert m["where"] == "docks" and m["k"] == "loverboiwrites"
        got = requests.get(f"{API}/chat", headers=LOVER).json()
        assert got["messages"][-1]["id"] == m["id"] and got["me"]["muted"] is False
        assert requests.post(f"{API}/chat", headers=LOVER, json={"text": ""}).status_code in (400, 422)
        assert requests.post(f"{API}/chat", headers=LOVER, json={"text": "   \n "}).status_code in (400, 422)
        assert requests.post(f"{API}/chat", headers=LOVER, json={"text": "x" * 281}).status_code == 422
        assert requests.post(f"{API}/chat", headers=LOVER, json={"text": "x" * 280}).status_code == 200
        assert requests.post(f"{API}/chat", headers=LOVER, json={"text": "free porn here"}).status_code == 400

    def test_after_and_removed(self):
        a = requests.post(f"{API}/chat", headers=JONAS, json={"text": "TEST jonas one"})
        assert a.status_code == 200, a.text
        assert a.json()["where"] == "uptown"
        a = a.json()
        time.sleep(0.05)
        b = requests.post(f"{API}/chat", headers=JONAS, json={"text": "TEST jonas two"}).json()
        r = requests.get(f"{API}/chat", params={"after": a["at"]}).json()
        assert b["id"] in [m["id"] for m in r["messages"]]  # 5 s overlap (iter 17) may also return a
        assert requests.delete(f"{API}/admin/chat/{a['id']}", headers=HDR).status_code == 200
        r = requests.get(f"{API}/chat", params={"after": b["at"]}).json()
        assert a["id"] in r["removed"] and a["id"] not in [m["id"] for m in r["messages"]]
        full = requests.get(f"{API}/chat").json()
        assert a["id"] not in [m["id"] for m in full["messages"]]
        assert requests.delete(f"{API}/admin/chat/nope_unknown", headers=HDR).status_code == 404

    def test_flood_guard(self, mdb):
        mdb.chat.delete_many({"k": "jonas_trades"})
        codes = [requests.post(f"{API}/chat", headers=JONAS, json={"text": f"TEST flood {i}"}).status_code for i in range(9)]
        assert codes[:8] == [200] * 8
        assert codes[8] == 429

    def test_flood_message(self):
        r = requests.post(f"{API}/chat", headers=JONAS, json={"text": "TEST flood again"})
        assert r.status_code == 429 and r.json()["detail"].startswith("Slow down a little")

    def test_hidden_resident_dropped(self, mdb):
        mdb.residents.update_one({"k": "jonas_trades"}, {"$set": {"hidden": True}})
        try:
            ks = {m["k"] for m in requests.get(f"{API}/chat").json()["messages"]}
            assert "jonas_trades" not in ks
        finally:
            mdb.residents.update_one({"k": "jonas_trades"}, {"$set": {"hidden": False}})
        ks = {m["k"] for m in requests.get(f"{API}/chat").json()["messages"]}
        assert "jonas_trades" in ks

    def test_admin_chat_and_mute(self):
        assert requests.get(f"{API}/admin/chat").status_code == 401
        gone = requests.get(f"{API}/chat").json()["messages"][-1]["id"]
        assert requests.delete(f"{API}/admin/chat/{gone}", headers=HDR).status_code == 200
        d = requests.get(f"{API}/admin/chat", headers=HDR).json()
        assert len(d["messages"]) <= 100
        assert any(m["id"] == gone and m["deleted"] for m in d["messages"])
        ats = [m["at"] for m in d["messages"]]
        assert ats == sorted(ats, reverse=True)
        assert any(m["deleted"] for m in d["messages"])
        r = requests.post(f"{API}/admin/chat/mute/loverboiWrites", headers=HDR, json={"muted": True})
        assert r.status_code == 200 and r.json()["muted"] is True
        r = requests.post(f"{API}/chat", headers=LOVER, json={"text": "TEST muted?"})
        assert r.status_code == 403 and r.json()["detail"] == "You're muted in the city chat."
        assert requests.get(f"{API}/chat", headers=LOVER).json()["me"]["muted"] is True
        d = requests.get(f"{API}/admin/chat", headers=HDR).json()
        assert "loverboiwrites" in [p["k"] for p in d["muted"]]
        assert all(m["muted"] for m in d["messages"] if m["k"] == "loverboiwrites")
        requests.post(f"{API}/admin/chat/mute/@loverboiWrites", headers=HDR, json={"muted": False})
        assert requests.get(f"{API}/chat", headers=LOVER).json()["me"]["muted"] is False
        assert requests.post(f"{API}/admin/chat/mute/nobody_zz_999", headers=HDR, json={"muted": True}).status_code == 404

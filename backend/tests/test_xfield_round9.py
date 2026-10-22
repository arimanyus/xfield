"""XField round 9 backend tests: town shape/signs, Sign in with X (fake sessions), lawn sign API,
cron auth, weekly census, 100-cap guard. Town refresh/demolish flow lives in test_xfield_refresh.py.

Only hits the public preview URL (REACT_APP_BACKEND_URL); uses Mongo directly for fake sessions.
"""
import asyncio
import hashlib
import io
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ENV = dotenv_values("/app/backend/.env")
CRON = ENV["WEBHOOK_CRON_SECRET"]


def mongo(coro_fn):
    async def run():
        cl = AsyncIOMotorClient(ENV["MONGO_URL"])
        try:
            return await coro_fn(cl[ENV["DB_NAME"]])
        finally:
            cl.close()
    return asyncio.run(run())


def get(path, **kw):
    return requests.get(f"{BASE}{path}", timeout=60, **kw)


def post(path, **kw):
    return requests.post(f"{BASE}{path}", timeout=60, **kw)


@pytest.fixture
def fake_session():
    """Insert a fake X session for a resident; yields (token, k). Cleans up afterwards."""
    tokens = []

    def make(k, h=None):
        token = "TEST_" + secrets.token_urlsafe(24)
        doc = {"token_hash": hashlib.sha256(token.encode()).hexdigest(), "x_id": "TEST", "k": k, "h": h or k,
               "name": h or k, "avatar_url": None, "created_at": datetime.now(timezone.utc).isoformat(),
               "expires_at": datetime.now(timezone.utc) + timedelta(hours=1)}
        mongo(lambda db: db.sessions.insert_one(doc))
        tokens.append(doc["token_hash"])
        return token
    yield make
    mongo(lambda db: db.sessions.delete_many({"token_hash": {"$in": tokens}}))


# ---------- town ----------

class TestTown:
    def test_town_shape(self):
        r = get("/api/town")
        assert r.status_code == 200
        j = r.json()
        for key in ("version", "residents", "neighbourhoods", "ticker", "town_hall", "stats"):
            assert key in j
        assert j["stats"]["capacity"] == 100
        assert j["stats"]["taken"] == len(j["residents"]) <= 100
        assert j["stats"]["finished"] + j["stats"]["reserved"] == j["stats"]["taken"]
        res = j["residents"][0]
        for f in ("k", "h", "n", "a", "s", "x", "y", "t", "by", "nb", "sg"):
            assert f in res
        ats = [e["at"] for e in j["ticker"]]
        assert ats == sorted(ats, reverse=True)
        for e in j["ticker"]:
            if e.get("nb"):
                assert "nb_name" in e
        # lots unique
        assert len({(r["x"], r["y"]) for r in j["residents"]}) == len(j["residents"])

    def test_town_unchanged(self):
        v = get("/api/town").json()["version"]
        j = get(f"/api/town?v={v}").json()
        assert j.get("unchanged") is True


class TestResident:
    def test_profile_with_signs(self):
        r = get("/api/residents/paulg")
        assert r.status_code == 200
        j = r.json()
        assert set(j["signs"].keys()) >= {"pun", "roast", "kind"}
        assert j["sign_tone"] in ("pun", "roast", "kind")
        assert j["is_me"] is False
        assert "text" in j["share"] and "url" in j["share"]
        assert j["card_url"]

    def test_unknown_404(self):
        assert get("/api/residents/zz_nobody_here_123").status_code == 404

    def test_card_jpg(self):
        r = get("/api/residents/paulg/card.jpg")
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/jpeg")
        assert Image.open(io.BytesIO(r.content)).size == (1260, 1680)


# ---------- Sign in with X ----------

class TestAuth:
    def test_me_signed_out(self):
        j = get("/api/auth/me").json()
        assert j == {"enabled": True, "user": None}

    def test_me_with_fake_session(self, fake_session):
        tok = fake_session("levelsio")
        j = get("/api/auth/me", cookies={"xf_session": tok}).json()
        assert j["user"]["k"] == "levelsio"
        assert "token_hash" not in j["user"]

    def test_login_redirect(self):
        r = get("/api/auth/x/login?next=/", allow_redirects=False)
        assert r.status_code == 302
        u = urlparse(r.headers["location"])
        assert u.netloc == "x.com" and u.path == "/i/oauth2/authorize"
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        assert q["response_type"] == "code"
        assert q["redirect_uri"] == f"{BASE}/api/auth/x/callback"
        assert q["scope"] == "tweet.read users.read"
        assert q["code_challenge_method"] == "S256" and q["code_challenge"] and q["state"]
        assert q["client_id"]
        assert "xf_oauth_state" in r.headers.get("set-cookie", "")

    def test_callback_cancelled(self):
        r = get("/api/auth/x/callback?error=access_denied", allow_redirects=False)
        assert r.status_code == 302 and r.headers["location"].endswith("/?signin=cancelled")

    def test_callback_expired_no_cookie(self):
        r = get("/api/auth/x/callback?code=abc&state=xyz", allow_redirects=False)
        assert r.status_code == 302 and r.headers["location"].endswith("/?signin=expired")

    def test_callback_expired_mismatch(self):
        r = get("/api/auth/x/callback?code=abc&state=xyz", cookies={"xf_oauth_state": "other"}, allow_redirects=False)
        assert r.headers["location"].endswith("/?signin=expired")

    def test_logout_clears_session(self, fake_session):
        tok = fake_session("naval")
        r = post("/api/auth/logout", cookies={"xf_session": tok})
        assert r.status_code == 200 and r.json() == {"ok": True}
        assert get("/api/auth/me", cookies={"xf_session": tok}).json()["user"] is None


# ---------- lawn sign ----------

class TestSign:
    def test_sign_no_session_401(self):
        assert post("/api/me/sign", json={"tone": "roast"}).status_code == 401

    def test_sign_reserved_404(self, fake_session):
        tok = fake_session("naval")
        assert post("/api/me/sign", json={"tone": "roast"}, cookies={"xf_session": tok}).status_code == 404

    def test_sign_bad_tone_400(self, fake_session):
        tok = fake_session("naval")
        r = post("/api/me/sign", json={"tone": "mean"}, cookies={"xf_session": tok})
        assert r.status_code in (400, 422)

    def test_sign_finished_200(self, fake_session):
        orig = mongo(lambda db: db.residents.find_one({"k": "levelsio"}, {"_id": 0, "status": 1, "sign_tone": 1, "signs": 1}))
        mongo(lambda db: db.residents.update_one({"k": "levelsio"}, {"$set": {"status": "finished"}}))
        try:
            tok = fake_session("levelsio")
            other = "kind" if orig.get("sign_tone") != "kind" else "roast"
            r = post("/api/me/sign", json={"tone": other}, cookies={"xf_session": tok})
            assert r.status_code == 200 and r.json() == {"tone": other}
            town = get("/api/town").json()
            lv = next(x for x in town["residents"] if x["k"] == "levelsio")
            assert lv["sg"] == orig["signs"][other]
            me = get("/api/residents/levelsio", cookies={"xf_session": tok}).json()
            assert me["is_me"] is True and me["sign_tone"] == other
        finally:
            mongo(lambda db: db.residents.update_one({"k": "levelsio"}, {"$set": {
                "status": orig["status"], "sign_tone": orig.get("sign_tone", "pun")}}))
            mongo(lambda db: db.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}}))


# ---------- crons ----------

class TestCron:
    @pytest.mark.parametrize("ep", ["census", "refresh"])
    def test_no_auth(self, ep):
        assert post(f"/api/cron/{ep}", json={}).status_code == 401
        assert post(f"/api/cron/{ep}", json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401

    @pytest.mark.parametrize("ep", ["census", "refresh"])
    def test_bad_json(self, ep):
        r = post(f"/api/cron/{ep}", data="not json{", headers={"Authorization": f"Bearer {CRON}",
                                                               "Content-Type": "application/json"})
        assert r.status_code == 400

    def test_census_accept_duplicate_and_6day_guard(self):
        before = get("/api/census").json()["issues"]
        rid = "TEST_" + uuid.uuid4().hex
        h = {"Authorization": f"Bearer {CRON}", "X-Webhook-Id": rid}
        r1 = post("/api/cron/census", json={}, headers=h)
        assert r1.status_code == 200 and r1.json() == {"accepted": True}
        r2 = post("/api/cron/census", json={}, headers=h)
        assert r2.status_code == 200 and r2.json() == {"duplicate": True}
        import time
        time.sleep(4)
        assert get("/api/census").json()["issues"] == before


# ---------- census ----------

class TestCensus:
    def test_list(self):
        j = get("/api/census").json()
        assert any(i["issue"] == 1 for i in j["issues"])
        assert all("label" in i for i in j["issues"])
        nxt = datetime.fromisoformat(j["next_at"])
        assert nxt.weekday() == 0 and nxt.hour == 9 and nxt.minute == 0
        assert nxt > datetime.now(timezone.utc) and nxt - datetime.now(timezone.utc) <= timedelta(days=7)

    @pytest.mark.parametrize("which", ["latest", "1"])
    def test_issue(self, which):
        r = get(f"/api/census/{which}")
        assert r.status_code == 200
        j = r.json()
        assert "snapshot" not in j and "_id" not in j
        for f in ("issue", "label", "population", "capacity", "fastest", "towers", "towers_total", "mover", "newest_lit",
                  "lit_week", "moves", "demolished", "card_url", "share"):
            assert f in j, f
        assert set(j["population"]) >= {"taken", "lit", "reserved", "new"}
        if j["fastest"]:
            assert set(j["fastest"]) >= {"name", "landmark", "gained", "size"}
        if j["mover"]:
            assert set(j["mover"]) >= {"h", "a", "gained"}
        if which == "1":
            assert j["share"]["text"].startswith("XField Census No. 1:")
            assert j["share"]["url"].endswith("/api/c/1")

    @pytest.mark.parametrize("bad", ["999", "abc"])
    def test_404(self, bad):
        assert get(f"/api/census/{bad}").status_code == 404

    def test_card(self):
        r = get("/api/census/1/card.jpg")
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/jpeg")
        assert Image.open(io.BytesIO(r.content)).size == (1260, 1680)

    def test_share_browser(self):
        r = get("/api/c/1", allow_redirects=False, headers={"User-Agent": "Mozilla/5.0 Chrome/120"})
        assert r.status_code == 302 and r.headers["location"].endswith("/census/1")

    def test_share_bot(self):
        r = get("/api/c/1", allow_redirects=False, headers={"User-Agent": "Twitterbot/1.0"})
        assert r.status_code == 200
        assert 'property="og:image" content="' in r.text and "/api/census/1/card.jpg" in r.text
        assert 'name="twitter:card" content="summary_large_image"' in r.text


# ---------- capacity ----------

class TestCapacity:
    def test_full_town_409(self):
        taken = get("/api/town").json()["stats"]["taken"]
        n = 100 - taken
        fakes = [{"k": f"zz_test_fill_{i}", "h": f"zz_test_fill_{i}", "status": "reserved", "verified": False,
                  "hidden": False, "x": 500 + i, "y": 500, "circle": [], "created_at": datetime.now(timezone.utc).isoformat(),
                  "name": "x", "avatar_url": None, "by": None, "by_h": None, "nb": None, "sign_tone": "pun"}
                 for i in range(n)]
        if fakes:
            mongo(lambda db: db.residents.insert_many(fakes))
        try:
            r = post("/api/move-in", json={"handle": "zz_cap_probe_x"})
            assert r.status_code == 409, r.text
            assert "full" in r.json()["detail"].lower()
        finally:
            mongo(lambda db: db.residents.delete_many({"k": {"$regex": "^zz_test_fill_"}}))
            mongo(lambda db: db.jobs.delete_many({"k": "zz_cap_probe_x"}))

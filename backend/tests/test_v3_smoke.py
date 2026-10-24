"""XField v3 'Pure Votes' smoke/regression tests against the public preview URL.

Covers: /api/town, auth (X OAuth redirect, /auth/me, dev routes off), residents + card.jpg,
arena (signed out, fake session, vote + 3/day limit), census, paper, cron auth.
Data changed for the arena test is restored in fixture teardown.
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FE = dotenv_values("/app/frontend/.env")
BE = dotenv_values("/app/backend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or FE["REACT_APP_BACKEND_URL"]).rstrip("/")
CRON = BE["WEBHOOK_CRON_SECRET"]
db = MongoClient(BE["MONGO_URL"])[BE["DB_NAME"]]


def get(p, **kw):
    return requests.get(f"{BASE}{p}", timeout=30, **kw)


def post(p, **kw):
    return requests.post(f"{BASE}{p}", timeout=30, **kw)


# ---------- town ----------
class TestTown:
    def test_town_shape(self):
        r = get("/api/town")
        assert r.status_code == 200
        d = r.json()
        for k in ("version", "residents", "neighbourhoods", "ticker", "town_hall", "bounds", "newest", "paper",
                  "ladder", "options", "stats"):
            assert k in d, k
        assert d["stats"]["capacity"] == 200
        assert d["stats"]["taken"] == len(d["residents"])
        assert d["ladder"] == {"uptown_at": 1030, "votes": 3}
        assert isinstance(d["version"], int)

    def test_town_unchanged(self):
        v = get("/api/town").json()["version"]
        r = get(f"/api/town?v={v}")
        assert r.status_code == 200 and r.json() == {"unchanged": True, "version": v}


# ---------- auth ----------
class TestAuth:
    def test_me_signed_out(self):
        assert get("/api/auth/me").json() == {"enabled": True, "user": None}

    def test_x_login_redirect(self):
        r = get("/api/auth/x/login?next=/", allow_redirects=False)
        assert r.status_code == 302
        u = urlparse(r.headers["location"])
        assert u.netloc == "x.com" and u.path == "/i/oauth2/authorize"
        q = parse_qs(u.query)
        assert q["redirect_uri"][0] == f"{BASE}/api/auth/x/callback"
        assert q["code_challenge_method"][0] == "S256" and q["code_challenge"][0] and q["state"][0]
        assert q["response_type"][0] == "code"

    def test_dev_routes_off(self):
        assert get("/api/dev/login?handle=paulg&next=/", allow_redirects=False).status_code == 404
        assert post("/api/dev/paper").status_code == 404


# ---------- residents ----------
class TestResidents:
    @pytest.mark.parametrize("h", ["paulg", "levelsio", "naval"])
    def test_resident(self, h):
        r = get(f"/api/residents/{h}")
        assert r.status_code == 200, r.text
        assert r.json().get("k", r.json().get("handle", "")).lower() in (h, "") or h in r.text.lower()

    def test_unknown(self):
        assert get("/api/residents/zz_nobody_here_123").status_code == 404

    def test_card(self):
        r = get("/api/residents/paulg/card.jpg")
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/jpeg")
        assert r.content[:3] == b"\xff\xd8\xff"


# ---------- arena ----------
PLAYERS = ["levelsio", "naval", "paulg", "sama"]


@pytest.fixture(scope="class")
def citizen():
    originals = {k: db.residents.find_one({"k": k}) for k in PLAYERS}
    assert all(originals.values())
    token = secrets.token_urlsafe(24)
    th = hashlib.sha256(token.encode()).hexdigest()
    start = datetime.now(timezone.utc).isoformat()
    now_s = start
    db.sessions.insert_one({"token_hash": th, "k": "levelsio", "h": "levelsio", "name": "levelsio",
                            "avatar_url": None, "expires_at": datetime.now(timezone.utc) + timedelta(hours=1)})
    yield {"token": token, "th": th}
    # restore
    for k, doc in originals.items():
        db.residents.replace_one({"k": k}, doc)
    db.sessions.delete_one({"token_hash": th})
    db.votes.delete_many({"voter": "levelsio"})
    db.matchups.delete_many({"k": "levelsio"})
    db.events.delete_many({"type": {"$in": ["top", "uptown"]}, "at": {"$gte": start}})
    db.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}})


class TestArena:
    def test_signed_out(self):
        assert get("/api/arena").status_code == 401

    def test_session_unlit_house(self, citizen):
        r = get("/api/arena", cookies={"xf_session": citizen["token"]})
        assert r.status_code == 404, r.text
        assert get("/api/auth/me", cookies={"xf_session": citizen["token"]}).json()["user"]["k"] == "levelsio"

    def test_vote_flow(self, citizen):
        now_s = datetime.now(timezone.utc).isoformat()
        db.residents.update_many({"k": {"$in": PLAYERS}}, {"$set": {"status": "finished", "seen_at": now_s}})
        c = {"xf_session": citizen["token"]}
        r = get("/api/arena", cookies=c)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["left"] == 3 and d["of"] == 3 and len(d["pair"]) == 2
        # same pair until you vote
        assert get("/api/arena", cookies=c).json()["pair"] == d["pair"]
        pair_keys = db.matchups.find_one({"k": "levelsio"})["pair"]
        assert "levelsio" not in pair_keys
        before = {k: db.residents.find_one({"k": k})["elo"] for k in pair_keys}
        v = post("/api/arena/vote", json={"pick": 0}, cookies=c)
        assert v.status_code == 200, v.text
        last = v.json()["last"]
        assert last["pts"] == 16  # equals at 1000
        assert db.residents.find_one({"k": pair_keys[0]})["elo"] == before[pair_keys[0]] + 16
        assert db.residents.find_one({"k": pair_keys[1]})["elo"] == before[pair_keys[1]] - 16
        assert v.json()["left"] == 2
        for _ in range(2):
            v = post("/api/arena/vote", json={"pick": 1}, cookies=c)
            assert v.status_code == 200, v.text
        assert v.json()["left"] == 0 and v.json()["pair"] == []
        v4 = post("/api/arena/vote", json={"pick": 0}, cookies=c)
        assert v4.status_code == 429, v4.text


# ---------- census / paper ----------
class TestCensusPaper:
    def test_census_list(self):
        r = get("/api/census")
        assert r.status_code == 200 and "issues" in r.json() and "next_at" in r.json()

    def test_census_latest(self):
        r = get("/api/census/latest")
        assert r.status_code == 200, r.text
        assert r.json()["issue"] >= 1 and "card_url" in r.json()

    def test_census_card(self):
        r = get("/api/census/1/card.jpg")
        assert r.status_code == 200 and r.content[:3] == b"\xff\xd8\xff"

    def test_paper_latest(self):
        r = get("/api/paper/latest")
        assert r.status_code in (200, 404), r.text


# ---------- crons ----------
class TestCron:
    @pytest.mark.parametrize("name", ["census", "refresh"])
    def test_no_bearer(self, name):
        assert post(f"/api/cron/{name}", json={"run_id": "x"}).status_code == 401

    @pytest.mark.parametrize("name", ["census", "refresh"])
    def test_wrong_bearer(self, name):
        assert post(f"/api/cron/{name}", json={"run_id": "x"},
                    headers={"Authorization": "Bearer nope"}).status_code == 401

    def test_census_accepted_then_duplicate(self):
        rid = f"TEST_{secrets.token_hex(6)}"
        h = {"Authorization": f"Bearer {CRON}", "X-Webhook-Id": rid}
        r = post("/api/cron/census", json={"run_id": rid}, headers=h)
        assert r.status_code == 200 and r.json() == {"accepted": True}, r.text
        r2 = post("/api/cron/census", json={"run_id": rid}, headers=h)
        assert r2.json() == {"duplicate": True}
        db.cron_runs.delete_many({"run_id": f"census:{rid}"})

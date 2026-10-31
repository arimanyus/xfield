# City chat iteration 17: reactions (toggle, counts, auth rules), polling cursor (after/overlap/removed) and
# @mention alerts (creation rules, me.mentions, mark seen, admin delete removes mentions). Chat + mentions wiped at the end.
import hashlib
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
HDR = {"X-Admin-Key": "seQiVzVB_MXusJKQlgSsQll5ppdq2CxX"}
LOVER = {"Cookie": "xf_session=test_snap_token_loverboi_2026"}
TOK = {"jonas_trades": "TEST_r17_jonas", "theo_makes": "TEST_r17_theo", "idris_bakes": "TEST_r17_idris"}
JONAS = {"Cookie": f"xf_session={TOK['jonas_trades']}"}
THEO = {"Cookie": f"xf_session={TOK['theo_makes']}"}
IDRIS = {"Cookie": f"xf_session={TOK['idris_bakes']}"}


def env(key, path="/app/backend/.env"):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


def th(t):
    return hashlib.sha256(t.encode()).hexdigest()


@pytest.fixture(scope="module")
def mdb():
    db = MongoClient(env("MONGO_URL"))[env("DB_NAME")]
    for k, t in TOK.items():
        db.sessions.delete_many({"token_hash": th(t)})
        db.sessions.insert_one({"token_hash": th(t), "k": k, "h": k, "name": k, "avatar_url": None, "test": True,
                                "expires_at": datetime.now(timezone.utc) + timedelta(days=1)})
    db.chat.delete_many({})
    db.mentions.delete_many({})
    db.residents.update_many({"k": {"$in": ["loverboiwrites", *TOK]}}, {"$set": {"chat_muted": False}})
    yield db
    db.chat.delete_many({})
    db.mentions.delete_many({})
    db.residents.update_many({"k": {"$in": ["loverboiwrites", *TOK]}}, {"$set": {"chat_muted": False}})
    for t in TOK.values():
        db.sessions.delete_many({"token_hash": th(t)})


def post(h, text):
    r = requests.post(f"{API}/chat", headers=h, json={"text": text})
    assert r.status_code == 200, r.text
    return r.json()


def react(h, mid, rr):
    return requests.post(f"{API}/chat/{mid}/react", headers=h, json={"r": rr})


# ---------- reactions ----------
class TestReactions:
    def test_toggle_and_order(self, mdb):
        m = post(LOVER, "TEST react me")
        assert m["reactions"] == []
        r = react(LOVER, m["id"], "gem")
        assert r.status_code == 200, r.text
        assert r.json()["reactions"] == [{"r": "gem", "n": 1, "mine": True}]
        r = react(LOVER, m["id"], "fire").json()
        assert [x["r"] for x in r["reactions"]] == ["fire", "gem"]
        r = react(LOVER, m["id"], "gem").json()
        assert r["reactions"] == [{"r": "fire", "n": 1, "mine": True}]
        r = react(LOVER, m["id"], "fire").json()
        assert r["reactions"] == []

    def test_counts_add_up_and_mine_per_viewer(self, mdb):
        m = post(LOVER, "TEST two people")
        react(LOVER, m["id"], "love")
        r = react(JONAS, m["id"], "love").json()
        assert r["reactions"] == [{"r": "love", "n": 2, "mine": True}]
        pub = next(x for x in requests.get(f"{API}/chat").json()["messages"] if x["id"] == m["id"])
        assert pub["reactions"] == [{"r": "love", "n": 2, "mine": False}]
        th_ = next(x for x in requests.get(f"{API}/chat", headers=THEO).json()["messages"] if x["id"] == m["id"])
        assert th_["reactions"][0]["mine"] is False
        r = react(JONAS, m["id"], "love").json()
        assert r["reactions"] == [{"r": "love", "n": 1, "mine": False}]  # loverboi's remains

    def test_errors(self, mdb):
        m = post(LOVER, "TEST errs")
        assert react(LOVER, m["id"], "thumbs").status_code == 400
        assert react(LOVER, "nope_unknown_id", "fire").status_code == 404
        assert requests.post(f"{API}/chat/{m['id']}/react", json={"r": "fire"}).status_code == 401
        dark = react(IDRIS, m["id"], "fire")
        print("dark resident react:", dark.status_code, dark.text)
        assert dark.status_code in (403, 404)
        assert requests.delete(f"{API}/admin/chat/{m['id']}", headers=HDR).status_code == 200
        assert react(LOVER, m["id"], "fire").status_code == 404
        m2 = post(JONAS, "TEST mute react")
        requests.post(f"{API}/admin/chat/mute/jonas_trades", headers=HDR, json={"muted": True})
        try:
            r = react(JONAS, m2["id"], "fire")
            assert r.status_code == 403 and "muted" in r.json()["detail"]
        finally:
            requests.post(f"{API}/admin/chat/mute/jonas_trades", headers=HDR, json={"muted": False})


# ---------- polling cursor ----------
class TestCursor:
    def test_cursor_after_reacted_removed(self, mdb):
        d = requests.get(f"{API}/chat").json()
        assert isinstance(d["cursor"], str)
        datetime.fromisoformat(d["cursor"])
        a = post(THEO, "TEST cursor a")
        time.sleep(6.5)
        c1 = requests.get(f"{API}/chat").json()["cursor"]
        r = requests.get(f"{API}/chat", params={"after": c1}).json()
        assert a["id"] not in [m["id"] for m in r["messages"]]  # older than cursor - 5 s
        react(JONAS, a["id"], "eyes")
        r = requests.get(f"{API}/chat", params={"after": c1}).json()
        got = [m for m in r["messages"] if m["id"] == a["id"]]
        assert got and got[0]["reactions"] == [{"r": "eyes", "n": 1, "mine": False}]
        b = post(THEO, "TEST cursor b")
        r = requests.get(f"{API}/chat", params={"after": c1}).json()
        assert b["id"] in [m["id"] for m in r["messages"]]
        assert requests.delete(f"{API}/admin/chat/{b['id']}", headers=HDR).status_code == 200
        r = requests.get(f"{API}/chat", params={"after": c1}).json()
        assert b["id"] in r["removed"] and b["id"] not in [m["id"] for m in r["messages"]]

    def test_bad_cursor(self):
        assert requests.get(f"{API}/chat", params={"after": "garbage"}).status_code == 400


# ---------- mentions ----------
class TestMentions:
    def test_mention_rules(self, mdb):
        mdb.mentions.delete_many({})
        m = post(JONAS, "TEST hi @LOVERBOIWRITES @jonas_trades @nobody_zz_999 @loverboiwrites @theo_makes")
        docs = list(mdb.mentions.find({"msg_id": m["id"]}, {"_id": 0}))
        assert sorted(d["to"] for d in docs) == ["loverboiwrites", "theo_makes"]
        me = requests.get(f"{API}/chat", headers=LOVER).json()["me"]
        assert me["muted"] is False and len(me["mentions"]) == 1
        x = me["mentions"][0]
        assert set(x) == {"id", "msg_id", "h", "a", "text", "at"} and x["msg_id"] == m["id"] and x["h"] == "jonas_trades"
        assert requests.get(f"{API}/chat").json()["me"] is None
        # jonas named himself: nothing for him
        assert requests.get(f"{API}/chat", headers=JONAS).json()["me"]["mentions"] == []

    def test_five_limit_and_hidden(self, mdb):
        mdb.mentions.delete_many({})
        mdb.residents.update_one({"k": "sana_sings"}, {"$set": {"hidden": True}})
        try:
            m = post(LOVER, "TEST @sana_sings @jonas_trades")
            assert [d["to"] for d in mdb.mentions.find({"msg_id": m["id"]})] == ["jonas_trades"]
        finally:
            mdb.residents.update_one({"k": "sana_sings"}, {"$set": {"hidden": False}})
        ks = [d["k"] for d in mdb.residents.find({"hidden": False, "k": {"$nin": ["loverboiwrites"]}}, {"k": 1}).limit(7)]
        m = post(LOVER, "TEST " + " ".join("@" + k for k in ks))
        assert mdb.mentions.count_documents({"msg_id": m["id"]}) == 5

    def test_order_seen_and_admin_delete(self, mdb):
        mdb.mentions.delete_many({})
        m1 = post(JONAS, "TEST first @theo_makes")
        time.sleep(0.05)
        m2 = post(LOVER, "TEST second @theo_makes")
        ms = requests.get(f"{API}/chat", headers=THEO).json()["me"]["mentions"]
        assert [x["msg_id"] for x in ms] == [m1["id"], m2["id"]]
        assert requests.post(f"{API}/chat/mentions/seen", json={"ids": [ms[0]["id"]]}).status_code == 401
        # someone else can't mark theo's mentions seen
        assert requests.post(f"{API}/chat/mentions/seen", headers=LOVER, json={"ids": [ms[0]["id"]]}).json()["seen"] == 0
        r = requests.post(f"{API}/chat/mentions/seen", headers=THEO, json={"ids": [ms[0]["id"]]})
        assert r.status_code == 200 and r.json()["seen"] == 1
        ms = requests.get(f"{API}/chat", headers=THEO).json()["me"]["mentions"]
        assert [x["msg_id"] for x in ms] == [m2["id"]]
        assert requests.delete(f"{API}/admin/chat/{m2['id']}", headers=HDR).status_code == 200
        assert mdb.mentions.count_documents({"msg_id": m2["id"]}) == 0
        assert requests.get(f"{API}/chat", headers=THEO).json()["me"]["mentions"] == []

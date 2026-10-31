# Millionaires' Row (mansions) API tests: town payload, admin mansions + hand-out, cron skip rule, resident mansion
# payload, mansion.jpg, /api/m share page, hide->reseat. Runs sequentially in ONE class (loadscope pins it to one worker).
# Leaves the preview in the "before the first handover" state at the end (as the main agent requested).
import io
import os
import time
import uuid

import pytest
import requests
from PIL import Image
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_KEY = "seQiVzVB_MXusJKQlgSsQll5ppdq2CxX"
HDR = {"X-Admin-Key": ADMIN_KEY}


def env(key, path="/app/backend/.env"):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


CRON = env("WEBHOOK_CRON_SECRET")
BOT = {"User-Agent": "Twitterbot/1.0"}
HUMAN = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120"}


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(env("MONGO_URL"))[env("DB_NAME")]


def reset_before(mdb):
    mdb.mansions.delete_many({})
    mdb.events.delete_many({"type": "mansions"})
    mdb.meta.update_one({"_id": "town"}, {"$inc": {"version": 1}})


def cron(run_id, secret=CRON, body=None):
    h = {"X-Webhook-Id": run_id}
    if secret is not None:
        h["Authorization"] = f"Bearer {secret}"
    return requests.post(f"{API}/cron/mansions", headers=h, json=body if body is not None else {"run_id": run_id})


class TestMansions:
    state = {}

    @pytest.fixture(scope="class", autouse=True)
    def leave_before(self, mdb):
        yield
        time.sleep(2)
        reset_before(mdb)

    # --- before the first handover ---
    def test_01_before_state(self, mdb):
        reset_before(mdb)
        t = requests.get(f"{API}/town").json()
        assert t["mansions"] is None
        assert "next_handover" in t and "T09:00:00" in t["next_handover"]
        a = requests.get(f"{API}/admin/mansions", headers=HDR).json()
        assert a["week"] is None and a["holders"] == [] and len(a["next"]) == 10
        assert "T09:00:00" in a["next_at"]
        TestMansions.state["line"] = [d.get("k") or d.get("h", "").lower() for d in a["next"]]

    def test_02_admin_auth(self):
        assert requests.get(f"{API}/admin/mansions").status_code == 401
        assert requests.post(f"{API}/admin/mansions/hand-out").status_code == 401

    # --- hand out ---
    def test_03_hand_out(self, mdb):
        v0 = requests.get(f"{API}/town").json()["version"]
        r = requests.post(f"{API}/admin/mansions/hand-out", headers=HDR)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["week"] == 1 and len(a["holders"]) == 10 and len(a["next"]) == 3
        assert [h["rank"] for h in a["holders"]] == list(range(1, 11))
        assert all("points" in h and "was" in h for h in a["holders"])
        t = requests.get(f"{API}/town").json()
        assert t["version"] > v0
        assert t["mansions"]["week"] == 1 and len(t["mansions"]["holders"]) == 10
        assert mdb.events.count_documents({"type": "mansions"}) == 1
        TestMansions.state["holders"] = [h["k"] for h in t["mansions"]["holders"]]
        assert TestMansions.state["holders"] == TestMansions.state["line"], "the 10 in line should be who moved in"

    def test_04_hand_out_again_increments_week(self):
        a = requests.post(f"{API}/admin/mansions/hand-out", headers=HDR).json()
        assert a["week"] == 2 and len(a["holders"]) == 10

    # --- cron ---
    def test_05_cron_auth_and_body(self):
        rid = f"TEST_{uuid.uuid4().hex}"
        assert cron(rid, secret="wrong").status_code == 401
        assert cron(rid, secret=None).status_code == 401
        r = requests.post(f"{API}/cron/mansions", data="not json",
                          headers={"Authorization": f"Bearer {CRON}", "X-Webhook-Id": rid, "Content-Type": "application/json"})
        assert r.status_code == 400
        assert cron(rid, body=[1, 2]).status_code == 400

    def test_06_cron_skips_when_handed_this_week(self):
        rid = f"TEST_{uuid.uuid4().hex}"
        r = cron(rid)
        assert r.status_code == 200 and r.json() == {"accepted": True}
        d = cron(rid)
        assert d.status_code == 200 and d.json() == {"duplicate": True}
        time.sleep(3)
        assert requests.get(f"{API}/admin/mansions", headers=HDR).json()["week"] == 2

    # --- resident payload & cards ---
    def test_07_resident_mansion_payload(self):
        h1 = TestMansions.state["holders"][0]
        d = requests.get(f"{API}/residents/{h1}").json()
        m = d["mansion"]
        assert m["rank"] == 1 and m["week"] == 2 and m["until"]
        assert "/api/m/" in m["share"]["url"] and "/mansion.jpg" in m["share"]["card_url"] and m["share"]["text"]
        nd = requests.get(f"{API}/residents/loverboiWrites").json()
        assert "mansion" not in nd

    def test_08_mansion_jpg(self):
        h1 = TestMansions.state["holders"][0]
        r = requests.get(f"{API}/residents/{h1}/mansion.jpg")
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
        assert Image.open(io.BytesIO(r.content)).size == (1200, 630)
        assert requests.get(f"{API}/residents/loverboiWrites/mansion.jpg").status_code == 404

    def test_09_share_page(self):
        h1 = TestMansions.state["holders"][0]
        r = requests.get(f"{API}/m/{h1}", headers=BOT, allow_redirects=False)
        assert r.status_code == 200
        assert "holds mansion #1 on Millionaires&#x27;" in r.text or "holds mansion #1 on Millionaires'" in r.text
        assert "mansion.jpg" in r.text and "og:image" in r.text
        r = requests.get(f"{API}/m/{h1}", headers=HUMAN, allow_redirects=False)
        assert r.status_code == 302 and f"/?at=" in r.headers["location"]
        assert "xf_invite=" in r.headers.get("set-cookie", "")
        r = requests.get(f"{API}/m/loverboiWrites", headers=HUMAN, allow_redirects=False)
        assert r.status_code == 302 and "/api/s/loverboiWrites" in r.headers["location"]

    # --- hide -> reseat ---
    def test_10_hide_reseats(self):
        hs = TestMansions.state["holders"]
        before = requests.get(f"{API}/admin/mansions", headers=HDR).json()
        first_in_line = before["next"][0]["h"].lower()
        try:
            r = requests.post(f"{API}/admin/residents/{hs[0]}/hide", headers=HDR, json={"hidden": True})
            assert r.status_code == 200
            after = requests.get(f"{API}/admin/mansions", headers=HDR).json()
            ks = [h["h"].lower() for h in after["holders"]]
            assert hs[0] not in ks and len(ks) == 10
            assert ks[:9] == hs[1:10], "people below should move up one"
            assert ks[9] == first_in_line, "next in line should take the last seat"
            assert [h["rank"] for h in after["holders"]] == list(range(1, 11))
        finally:
            requests.post(f"{API}/admin/residents/{hs[0]}/hide", headers=HDR, json={"hidden": False})

    def test_11_ticker_event(self):
        t = requests.get(f"{API}/town").json()
        assert any(e.get("type") == "mansions" for e in t["ticker"]), [e.get("type") for e in t["ticker"]][:10]

    # --- regression share cards ---
    def test_12_regression_share(self):
        assert requests.get(f"{API}/s/loverboiWrites", headers=BOT, allow_redirects=False).status_code == 200
        assert requests.get(f"{API}/t/arjun_reads", headers=BOT, allow_redirects=False).status_code == 200

# Share card v3 (rank, avatar, real house snapshot, invites) + share page + dark-house card
import io
import os
import re
import glob

import pytest
import requests
from PIL import Image
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
OUT = "/app/test_reports/cards"
os.makedirs(OUT, exist_ok=True)
H = "loverboiWrites"


@pytest.fixture(scope="module")
def db():
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def res():
    r = requests.get(f"{BASE_URL}/api/residents/{H}", timeout=30)
    assert r.status_code == 200
    return r.json()


# Card image
def test_card_jpg(res):
    r = requests.get(f"{BASE_URL}/api/residents/{H}/card.jpg", timeout=60)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/jpeg")
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (1200, 630)
    open(f"{OUT}/loverboi.jpg", "wb").write(r.content)


# Resident share url / text
def test_share_url_hash(res):
    url, card = res["share"]["url"], res["card_url"]
    m = re.search(r"/api/s/loverboiWrites\?v=([0-9a-f]+)$", url)
    assert m, url
    assert card.endswith(f"/api/residents/{H}/card.jpg?v={m.group(1)}")


def test_share_text_rank(res):
    assert res["share"]["moment"] == "join"
    assert "I'm #1 of 1 on the Docks" in res["share"]["text"], res["share"]["text"]


# Share page OG for bots / redirect for humans
def test_share_page_bot(res):
    v = res["share"]["url"].split("?v=")[1]
    r = requests.get(f"{BASE_URL}/api/s/{H}?v={v}", headers={"User-Agent": "Twitterbot/1.0"}, timeout=30, allow_redirects=False)
    assert r.status_code == 200
    t = r.text
    assert f'og:image" content="{BASE_URL}/api/residents/{H}/card.jpg?v={v}"' in t
    assert 'og:image:width" content="1200"' in t and 'og:image:height" content="630"' in t
    assert 'twitter:card" content="summary_large_image"' in t
    desc = re.search(r'og:description" content="([^"]*)"', t).group(1)
    assert "#1 of" in desc, desc


def test_share_page_human(res):
    r = requests.get(f"{BASE_URL}/api/s/{H}", headers={"User-Agent": "Mozilla/5.0"}, timeout=30, allow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"].endswith(f"/?at={H}")


# Dark house + invites with temporary zz_ docs
@pytest.fixture(scope="module")
def zz(db):
    base = db.residents.find_one({"k": "loverboiwrites"}, {"_id": 0})
    owner = {**base, "k": "zz_cardtest", "h": "zz_CardTest", "name": "ZZ Card Test", "circle": [{"k": "zz_inv1", "w": 3}],
             "x": 40, "y": 40, "snap": None, "done": {}, "by": None, "by_h": None}
    owner.pop("snap")
    inv = {**base, "k": "zz_inv1", "h": "zz_Inv1", "name": "ZZ Invitee", "status": "reserved", "verified": False,
           "by": "zz_cardtest", "by_h": "zz_CardTest", "circle": [], "x": 41, "y": 40, "done": {}}
    inv.pop("snap")
    inv.pop("finished_at", None)
    db.residents.delete_many({"k": {"$in": ["zz_cardtest", "zz_inv1"]}})
    db.residents.insert_many([owner, inv])
    yield
    db.residents.delete_many({"k": {"$in": ["zz_cardtest", "zz_inv1"]}})
    for f in glob.glob("/app/backend/media/cards/zz_*"):
        os.remove(f)


def test_dark_card(zz):
    r = requests.get(f"{BASE_URL}/api/residents/zz_inv1/card.jpg", timeout=60)
    assert r.status_code == 200
    assert Image.open(io.BytesIO(r.content)).size == (1200, 630)
    open(f"{OUT}/zz_inv1.jpg", "wb").write(r.content)
    j = requests.get(f"{BASE_URL}/api/residents/zz_inv1", timeout=30).json()
    assert j["share"]["moment"] == "dark"


def test_owner_card(zz):
    r = requests.get(f"{BASE_URL}/api/residents/zz_cardtest/card.jpg", timeout=60)
    assert r.status_code == 200
    open(f"{OUT}/zz_cardtest.jpg", "wb").write(r.content)
    j = requests.get(f"{BASE_URL}/api/residents/zz_cardtest", timeout=30).json()
    assert j["share"]["tags"] == ["zz_Inv1"]
    assert "@zz_Inv1" in j["share"]["text"]


def test_dark_og(zz):
    r = requests.get(f"{BASE_URL}/api/s/zz_inv1", headers={"User-Agent": "Twitterbot/1.0"}, timeout=30)
    assert r.status_code == 200
    assert "@zz_CardTest saved it for you" in r.text


# Cache busting: loverboi card v changes when a new resident (zz) appears in the pool -> "of N" changes
def test_cache_bust(db, res):
    v0 = requests.get(f"{BASE_URL}/api/residents/{H}", timeout=30).json()["card_url"].split("?v=")[1]
    base = db.residents.find_one({"k": "loverboiwrites"}, {"_id": 0})
    tmp = {**base, "k": "zz_rival", "h": "zz_Rival", "x": 44, "y": 44, "done": {}, "elo": 1100}
    tmp.pop("snap")
    db.residents.insert_one(tmp)
    try:
        j = requests.get(f"{BASE_URL}/api/residents/{H}", timeout=30).json()
        v1 = j["card_url"].split("?v=")[1]
        print("rank/of", j["ladder"], j["share"]["text"])
        assert v1 != v0
    finally:
        db.residents.delete_many({"k": "zz_rival"})
        for f in glob.glob("/app/backend/media/cards/zz_*"):
            os.remove(f)
    j = requests.get(f"{BASE_URL}/api/residents/{H}", timeout=30).json()
    assert j["card_url"].split("?v=")[1] == v0

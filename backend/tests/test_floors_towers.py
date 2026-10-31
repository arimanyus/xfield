"""XField 'building up' (floors + towers Phase 2) regression tests. Read-only against the preview DB."""
import io
import os
import re

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()


def res(h):
    r = S.get(f"{API}/residents/{h}", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def jpeg(url, size=(1200, 630)):
    r = S.get(url, timeout=60)
    assert r.status_code == 200, r.status_code
    assert r.headers["content-type"].startswith("image/jpeg")
    im = Image.open(io.BytesIO(r.content))
    assert im.format == "JPEG"
    if size:
        assert im.size == size, im.size
    return im


@pytest.fixture(scope="module")
def town():
    r = S.get(f"{API}/town", timeout=30)
    assert r.status_code == 200
    return r.json()


# Town stats + floor residents
class TestTown:
    def test_stats(self, town):
        st = town["stats"]
        assert st["taken"] == 200 and st["capacity"] == 200 and st["floors"] >= 50, st

    def test_floor_residents_geometry(self, town):
        rs = town["residents"]
        floors = [r for r in rs if r.get("lv") is not None and r.get("lv") >= 1]
        assert len(floors) >= 50
        assert all(r.get("on") in ("dock", "lot") for r in floors)
        grounds = [r for r in rs if r.get("lv") is None]
        dock_ground = {r["d"] for r in grounds if r.get("d") is not None}
        lot_ground = {(r["x"], r["y"]) for r in grounds if r.get("d") is None}
        for r in floors:
            if r["on"] == "dock":
                assert r.get("d") in dock_ground, r
            else:
                assert (r["x"], r["y"]) in lot_ground, r


# Resident building block
class TestBuilding:
    @pytest.mark.parametrize("h,floor,size,area,rank", [
        ("arjun_reads", 1, 10, "docks", 1), ("theo_makes", 1, 9, "uptown", 3),
        ("jonas_trades", 1, 9, "uptown", 2), ("loverboiWrites", 1, 4, "docks", 4)])
    def test_owner_buildings(self, h, floor, size, area, rank):
        b = res(h)["building"]
        assert (b["floor"], b["size"], b["area"], b["rank"]) == (floor, size, area, rank), b
        assert b["of"] >= rank
        assert b["people"][0]["floor"] == size  # top floor first
        assert b["people"][-1]["floor"] == 1
        assert all("s" in p for p in b["people"])
        assert {"k", "h", "a"} <= set(b["base"])

    def test_sana_floor2(self):
        d = res("sana_sings")
        assert d["building"]["floor"] == 2 and d["building"]["base"]["h"] == "theo_makes"
        assert d["share"]["text"].startswith("I live on floor 2 of @theo_makes's building uptown in XField"), d["share"]["text"]
        assert "tower_share" not in d

    def test_single_home(self, town):
        rs = town["residents"]
        stacked_keys = {r.get("d") for r in rs if r.get("lv")} | {(r["x"], r["y"]) for r in rs if r.get("lv") and r.get("on") == "lot"}
        single = next(r for r in rs if r.get("lv") is None and r.get("d") not in stacked_keys
                      and (r["x"], r["y"]) not in stacked_keys and (r.get("d") is not None or True))
        d = res(single["h"])
        assert d["building"]["size"] == 1 and d["building"]["rank"] is None, d["building"]
        assert "tower_share" not in d


# Tower share text / card / OG page
class TestTowerShare:
    def test_tower_share_text(self):
        t = res("arjun_reads")["tower_share"]
        assert t["text"].startswith("My building in XField is 10 floors tall on the Docks, #1 tallest in the city."), t["text"]
        assert "Move in on top" in t["text"]
        assert re.search(r"/api/t/arjun_reads\?v=", t["url"]) and "/api/residents/arjun_reads/tower.jpg?v=" in t["card_url"]

    def test_tower_jpg_owner_and_floor(self):
        jpeg(res("theo_makes")["tower_share"]["card_url"])
        jpeg(f"{API}/residents/sana_sings/tower.jpg")

    def test_og_bot(self):
        r = S.get(f"{API}/t/theo_makes", headers={"User-Agent": "Twitterbot/1.0"}, allow_redirects=False, timeout=30)
        assert r.status_code == 200
        assert "@theo_makes&#x27;s building is 9 floors tall" in r.text or "@theo_makes's building is 9 floors tall" in r.text
        assert re.search(r'og:image"[^>]*tower\.jpg|tower\.jpg[^>]*og:image', r.text)

    def test_redirect_human(self):
        r = requests.get(f"{API}/t/sana_sings", headers={"User-Agent": "Mozilla/5.0"}, allow_redirects=False, timeout=30)
        assert r.status_code == 302 and r.headers["location"].endswith("/?at=theo_makes"), r.headers
        assert "xf_invite=theo_makes" in r.headers.get("set-cookie", ""), r.headers.get("set-cookie")

    def test_share_card_floor(self):
        jpeg(f"{API}/residents/sana_sings/card.jpg", size=None)


# Ledger towers
class TestPaper:
    def test_paper_towers(self):
        r = S.get(f"{API}/paper/latest", timeout=30)
        assert r.status_code == 200
        p = r.json()
        assert p["issue"] >= 3
        tw = p["towers"]
        got = [(t["h"], t["size"]) for t in tw]
        assert got == [("arjun_reads", 10), ("jonas_trades", 9), ("theo_makes", 9), ("loverboiWrites", 4), ("theo_sings", 4)], got
        assert all({"k", "h", "a", "size", "area", "grew"} <= set(t) for t in tw)
        assert p["heights"] and p["numbers"]["floors"] >= 50
        jpeg(p["card_url"], size=None)

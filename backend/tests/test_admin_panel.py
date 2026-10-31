# Admin panel API tests: auth (cookie + header), billboards, residents, paper, city limits, stats, share tracking.
# Restores everything it changes. Never makes more than 1 wrong-password attempt.
import io
import os
import time

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_KEY = "seQiVzVB_MXusJKQlgSsQll5ppdq2CxX"
HDR = {"X-Admin-Key": ADMIN_KEY}


def png_bytes(color=(10, 200, 120), size=(3000, 1500)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json={"password": ADMIN_KEY})
    assert r.status_code == 200, r.text
    return s


# ---------- auth ----------
class TestAdminAuth:
    def test_login_sets_httponly_cookie(self):
        s = requests.Session()
        r = s.post(f"{API}/admin/login", json={"password": ADMIN_KEY})
        assert r.status_code == 200 and r.json() == {"ok": True}
        sc = r.headers.get("set-cookie", "")
        assert "xf_admin=" in sc and "HttpOnly" in sc and "Secure" in sc and "Path=/api" in sc
        assert s.get(f"{API}/admin/me").status_code == 200
        # logout
        assert s.post(f"{API}/admin/logout").status_code == 200
        assert s.get(f"{API}/admin/me").status_code == 401

    def test_old_token_invalid_after_logout(self):
        s = requests.Session()
        s.post(f"{API}/admin/login", json={"password": ADMIN_KEY})
        tok = s.cookies.get("xf_admin")
        s.post(f"{API}/admin/logout")
        r = requests.get(f"{API}/admin/me", cookies={"xf_admin": tok})
        assert r.status_code == 401

    def test_me_without_cookie_401(self):
        r = requests.get(f"{API}/admin/me")
        assert r.status_code == 401

    def test_empty_password_401_no_lockout(self):
        r = requests.post(f"{API}/admin/login", json={"password": ""})
        assert r.status_code == 401

    def test_wrong_password_403(self):
        r = requests.post(f"{API}/admin/login", json={"password": "TEST_wrong_pw"})
        assert r.status_code == 403
        assert r.json()["detail"] == "Wrong admin password."

    def test_header_key_works(self):
        assert requests.get(f"{API}/admin/me", headers=HDR).status_code == 200

    @pytest.mark.parametrize("method,path", [
        ("get", "/admin/billboards"), ("put", "/admin/billboards/east"), ("delete", "/admin/billboards/east/image"),
        ("get", "/admin/residents"), ("post", "/admin/residents/theo_makes/points"), ("post", "/admin/residents/theo_makes/move"),
        ("post", "/admin/residents/theo_makes/hide"), ("get", "/admin/paper"), ("put", "/admin/paper"),
        ("post", "/admin/paper/publish"), ("get", "/admin/settings"), ("put", "/admin/settings"), ("get", "/admin/stats")])
    def test_unauth_rejected(self, method, path):
        # valid bodies so we see the auth check, not body validation (422 for bad bodies comes first in FastAPI)
        body = {"points": 10, "to": "docks", "hidden": False, "caption": "", "link": "", "enabled": False,
                "headline": "x", "stories": [{"title": "x", "body": "x"}], "town_capacity": 200, "moveins_per_hour": 30}
        r = getattr(requests, method)(f"{API}{path}", json=body)
        assert r.status_code == 401, f"{method} {path} -> {r.status_code}"


# ---------- billboards ----------
class TestBillboards:
    def test_list_six_slots(self, admin):
        bbs = admin.get(f"{API}/admin/billboards").json()["billboards"]
        assert [b["id"] for b in bbs] == ["hero", "west", "east", "corner", "ledger", "docks", "stadium", "airport", "station"]
        hero = bbs[0]
        assert hero["size"] == "huge" and hero["name"] == "Downtown, huge"

    @pytest.mark.parametrize("link", ["javascript:alert(1)", "ftp://x", "example.com"])
    def test_bad_link_400(self, admin, link):
        r = admin.put(f"{API}/admin/billboards/east", json={"caption": "x", "link": link, "enabled": False})
        assert r.status_code == 400

    def test_caption_too_long_422(self, admin):
        r = admin.put(f"{API}/admin/billboards/east", json={"caption": "x" * 81, "link": "", "enabled": False})
        assert r.status_code == 422

    def test_unknown_slot_404(self, admin):
        assert admin.put(f"{API}/admin/billboards/nope", json={"caption": "", "link": "", "enabled": False}).status_code == 404
        r = admin.post(f"{API}/admin/billboards/nope/image", files={"file": ("a.png", png_bytes(), "image/png")})
        assert r.status_code == 404

    def test_non_image_400(self, admin):
        r = admin.post(f"{API}/admin/billboards/docks/image", files={"file": ("a.txt", b"hello world", "text/plain")})
        assert r.status_code == 400

    def test_full_cycle_docks_slot(self, admin):
        try:
            r = admin.post(f"{API}/admin/billboards/docks/image", files={"file": ("a.png", png_bytes(), "image/png")})
            assert r.status_code == 200, r.text
            url = r.json()["image_url"]
            assert url.startswith("/api/billboards/docks/image?v=")
            img = requests.get(f"{BASE_URL}{url}")
            assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
            im = Image.open(io.BytesIO(img.content))
            assert im.format == "JPEG" and max(im.size) <= 2048
            r = admin.put(f"{API}/admin/billboards/docks", json={"caption": "TEST_docks", "link": "https://example.org", "enabled": True})
            assert r.status_code == 200 and r.json()["caption"] == "TEST_docks"
            live = requests.get(f"{API}/town").json()["billboards"]
            d = [b for b in live if b["id"] == "docks"]
            assert d and d[0]["link"] == "https://example.org" and d[0]["size"] == "big"
            assert set(d[0].keys()) == {"id", "size", "caption", "link", "image_url"}
            # disabled -> gone from town
            admin.put(f"{API}/admin/billboards/docks", json={"caption": "TEST_docks", "link": "https://example.org", "enabled": False})
            assert not [b for b in requests.get(f"{API}/town").json()["billboards"] if b["id"] == "docks"]
        finally:
            admin.put(f"{API}/admin/billboards/docks", json={"caption": "", "link": "", "enabled": False})
            r = admin.delete(f"{API}/admin/billboards/docks/image")
            assert r.status_code == 200 and r.json()["image_url"] is None
        assert requests.get(f"{API}/billboards/docks/image").status_code == 404

    def test_town_lists_only_hero(self):
        # The hero is switched on but waits for its picture; a board without a picture stays off the city.
        live = requests.get(f"{API}/town").json()["billboards"]
        assert {b["id"] for b in live} <= {"hero", "stadium", "airport", "station"}  # main agent may have test pictures on the new slots


# ---------- residents ----------
def row(admin, k):
    rows = admin.get(f"{API}/admin/residents", params={"q": k}).json()["residents"]
    return next(r for r in rows if r["k"] == k)


class TestResidents:
    def test_search(self, admin):
        rows = admin.get(f"{API}/admin/residents", params={"q": "theo"}).json()["residents"]
        assert rows and all(r["k"].startswith("theo") for r in rows)
        assert set(rows[0]) == {"k", "h", "name", "a", "lit", "hidden", "points", "uptown", "where", "joined"}

    def test_points_set_and_restore(self, admin):
        orig = row(admin, "june_plays")["points"]
        try:
            r = admin.post(f"{API}/admin/residents/june_plays/points", json={"points": 777})
            assert r.status_code == 200 and r.json()["points"] == 777
            assert row(admin, "june_plays")["points"] == 777
            assert admin.post(f"{API}/admin/residents/june_plays/points", json={"points": 5001}).status_code == 422
            assert admin.post(f"{API}/admin/residents/june_plays/points", json={"points": -1}).status_code == 422
        finally:
            admin.post(f"{API}/admin/residents/june_plays/points", json={"points": orig})
        assert row(admin, "june_plays")["points"] == orig

    def test_points_unknown_404(self, admin):
        assert admin.post(f"{API}/admin/residents/TEST_nobody_x/points", json={"points": 10}).status_code == 404

    def test_move_docks_to_uptown_and_back(self, admin):
        k = "june_plays"
        o = row(admin, k)
        assert o["uptown"] is False
        try:
            r = admin.post(f"{API}/admin/residents/{k}/move", json={"to": "uptown"})
            assert r.status_code == 200, r.text
            assert r.json()["uptown"] is True and r.json()["points"] >= 1030
            assert admin.post(f"{API}/admin/residents/{k}/move", json={"to": "uptown"}).status_code == 400
        finally:
            r = admin.post(f"{API}/admin/residents/{k}/move", json={"to": "docks"})
            assert r.status_code == 200 and r.json()["uptown"] is False and r.json()["points"] <= 1029
            admin.post(f"{API}/admin/residents/{k}/points", json={"points": o["points"]})
        n = row(admin, k)
        assert n["points"] == o["points"] and n["uptown"] is False

    def test_move_uptown_to_docks_and_back(self, admin):
        k = "omar_writes"
        o = row(admin, k)
        assert o["uptown"] is True
        try:
            r = admin.post(f"{API}/admin/residents/{k}/move", json={"to": "docks"})
            assert r.status_code == 200, r.text
            assert r.json()["uptown"] is False and r.json()["points"] <= 1029
            assert admin.post(f"{API}/admin/residents/{k}/move", json={"to": "docks"}).status_code == 400
        finally:
            admin.post(f"{API}/admin/residents/{k}/move", json={"to": "uptown"})
            admin.post(f"{API}/admin/residents/{k}/points", json={"points": o["points"]})
        n = row(admin, k)
        assert n["points"] == o["points"] and n["uptown"] is True

    def test_move_bad_target_422(self, admin):
        assert admin.post(f"{API}/admin/residents/omar_writes/move", json={"to": "moon"}).status_code == 422

    def test_hide_and_unhide(self, admin):
        k = "june_draws"
        try:
            r = admin.post(f"{API}/admin/residents/{k}/hide", json={"hidden": True})
            assert r.status_code == 200
            hidden = admin.get(f"{API}/admin/residents", params={"hidden": "true"}).json()["residents"]
            assert k in [h["k"] for h in hidden] and all(h["hidden"] for h in hidden)
            assert k not in [x.get("k") for x in requests.get(f"{API}/town").json()["residents"]]
            # hidden -> move refused
            assert admin.post(f"{API}/admin/residents/{k}/move", json={"to": "uptown"}).status_code == 400
        finally:
            admin.post(f"{API}/admin/residents/{k}/hide", json={"hidden": False})
        assert row(admin, k)["hidden"] is False


# ---------- paper ----------
class TestPaper:
    def test_edit_and_restore(self, admin):
        orig = admin.get(f"{API}/admin/paper").json()["paper"]
        assert orig and orig["headline"] and 1 <= len(orig["stories"]) <= 6
        body = {"headline": orig["headline"], "stories": orig["stories"]}
        try:
            new = {"headline": "TEST_headline", "stories": [{"title": "TEST_t", "body": "TEST_b"}]}
            r = admin.put(f"{API}/admin/paper", json=new)
            assert r.status_code == 200 and r.json()["paper"]["headline"] == "TEST_headline"
            latest = requests.get(f"{API}/paper/latest").json()
            text = str(latest)
            assert "TEST_headline" in text and "TEST_b" in text
            assert admin.put(f"{API}/admin/paper", json={"headline": "", "stories": [{"title": "a", "body": "b"}]}).status_code == 422
            assert admin.put(f"{API}/admin/paper", json={"headline": "a", "stories": []}).status_code == 422
            assert admin.put(f"{API}/admin/paper", json={"headline": "a", "stories": [{"title": "", "body": "b"}]}).status_code == 422
            assert admin.put(f"{API}/admin/paper", json={"headline": "a", "stories": [{"title": "a", "body": "b"}] * 7}).status_code == 422
        finally:
            r = admin.put(f"{API}/admin/paper", json=body)
            assert r.status_code == 200
        assert admin.get(f"{API}/admin/paper").json()["paper"]["headline"] == orig["headline"]


# ---------- city limits ----------
class TestLimits:
    def test_save_and_restore(self, admin):
        try:
            r = admin.put(f"{API}/admin/settings", json={"town_capacity": 250, "moveins_per_hour": 40})
            assert r.status_code == 200
            assert r.json()["town_capacity"] == 250 and r.json()["moveins_per_hour"] == 40
            assert requests.get(f"{API}/town").json()["stats"]["capacity"] == 250
            assert admin.get(f"{API}/admin/settings").json()["town_capacity"] == 250
            assert admin.put(f"{API}/admin/settings", json={"town_capacity": 9, "moveins_per_hour": 30}).status_code == 422
            assert admin.put(f"{API}/admin/settings", json={"town_capacity": 200, "moveins_per_hour": 0}).status_code == 422
            assert admin.put(f"{API}/admin/settings", json={"town_capacity": 100001, "moveins_per_hour": 30}).status_code == 422
        finally:
            admin.put(f"{API}/admin/settings", json={"town_capacity": 200, "moveins_per_hour": 30})
        s = admin.get(f"{API}/admin/settings").json()
        assert s["town_capacity"] == 200 and s["moveins_per_hour"] == 30
        assert requests.get(f"{API}/town").json()["stats"]["capacity"] == 200


# ---------- stats + share tracking ----------
class TestStats:
    def test_stats_shape(self, admin):
        s = admin.get(f"{API}/admin/stats").json()
        for k in ("lit", "dark", "hidden", "uptown", "floors"):
            assert isinstance(s["people"][k], int)
        assert s["ground"]["capacity"] == 200
        assert len(s["tallest"]) <= 5 and len(s["top"]) <= 5 and len(s["recent"]) <= 8
        assert s["paper"]["issue"]
        for g in ("opens", "previews"):
            assert set(s["shares"][g]) == {"day", "week", "total"}

    def test_share_tracking(self, admin):
        before = admin.get(f"{API}/admin/stats").json()["shares"]
        bot = {"User-Agent": "Twitterbot/1.0"}
        human = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36"}
        requests.get(f"{API}/s/theo_makes", headers=bot, allow_redirects=False)
        requests.get(f"{API}/s/theo_makes", headers=human, allow_redirects=False)
        requests.get(f"{API}/t/theo_makes", headers=human, allow_redirects=False)
        issue = admin.get(f"{API}/admin/paper").json()["paper"]["issue"]
        requests.get(f"{API}/p/{issue}", headers=bot, allow_redirects=False)
        after = admin.get(f"{API}/admin/stats").json()["shares"]
        assert after["previews"]["total"] - before["previews"]["total"] == 2
        assert after["opens"]["total"] - before["opens"]["total"] == 2

"""Backend tests for savage default + Simpsons cast + share card features (iter 5).

Rate-limit aware: tries to create one levelsio episode; if 429, falls back to the
pre-existing pmarca episode HzJr0Bjq (same code paths/features) for the
read-only validations.
"""
import io
import os
import re
import time

import pytest
import requests
from dotenv import load_dotenv
from PIL import Image

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
S = requests.Session()
S.headers.update({"Content-Type": "application/json"})

SIMPSONS = {
    "homer", "marge", "bart", "lisa", "maggie", "burns", "smithers",
    "moe", "krusty", "flanders", "brockman", "skinner", "wiggum", "milhouse",
    "nelson", "lenny", "carl", "frink", "quimby", "apu", "barney", "ralph",
    "patty", "selma", "edna", "willie", "grandpa", "abe", "otto",
    "comic book guy", "duffman", "troy mcclure",
}
FALLBACK_EP = "HzJr0Bjq"  # pre-existing pmarca savage episode
STATE: dict = {}


def _is_simpsons(cast_list):
    joined = " ".join(cast_list).lower()
    return any(name in joined for name in SIMPSONS)


class TestSavageCastCard:
    def test_01_create_levelsio_savage_default(self):
        """Create one episode without spice; verify default = savage. Falls back on 429."""
        r = S.post(f"{API}/episodes", json={
            "handle": "levelsio",
            "labels": {"role": "indie hacker", "vibe": "ships in public", "obsession": "making money"},
        }, timeout=60)
        if r.status_code == 429:
            STATE["ep_id"] = FALLBACK_EP
            STATE["created"] = False
            pytest.skip(f"Rate-limited (429); will reuse {FALLBACK_EP} for downstream read-only tests")
        assert r.status_code == 200, r.text
        ep = r.json()
        assert ep["spice"] == "savage", f"spice default != savage: {ep.get('spice')}"
        assert ep["text_status"] == "pending"
        STATE["ep_id"] = ep["id"]
        STATE["created"] = True

    def test_02_text_ready_with_simpsons_cast(self):
        ep_id = STATE.get("ep_id") or FALLBACK_EP
        STATE["ep_id"] = ep_id
        deadline = time.time() + (90 if STATE.get("created") else 5)
        ep = None
        while time.time() < deadline:
            ep = S.get(f"{API}/episodes/{ep_id}").json()
            if ep.get("text_status") == "ready":
                break
            if ep.get("text_status") == "failed":
                pytest.fail(f"text failed: {ep}")
            time.sleep(3)
        assert ep and ep.get("text_status") == "ready", ep
        STATE["ep_doc"] = ep

        # cast: 2-4 Simpsons names
        cast = ep.get("cast")
        assert isinstance(cast, list) and 2 <= len(cast) <= 4, f"bad cast: {cast}"
        assert all(isinstance(c, str) and c.strip() for c in cast)
        assert _is_simpsons(cast), f"no Simpsons names in cast: {cast}"

        # spice savage (either created now or fallback)
        assert ep.get("spice") == "savage", ep.get("spice")

        # subtitle starts with uppercase speaker prefix + ':'
        sub = ep.get("subtitle", "")
        assert re.match(r"^[A-Z][A-Z .'’\-]{1,30}:", sub), f"subtitle lacks speaker prefix: {sub!r}"

        assert ep.get("already_happened"), ep

        # evidence present, NOT wrapped in matching quote characters
        ev = (ep.get("evidence") or "").strip()
        assert ev, "evidence empty"
        wrapped = (
            (ev.startswith('"') and ev.endswith('"'))
            or (ev.startswith("“") and ev.endswith("”"))
            or (ev.startswith("'") and ev.endswith("'"))
            or (ev.startswith("‘") and ev.endswith("’"))
        )
        assert not wrapped, f"evidence wrapped in quotes: {ev!r}"

    def test_03_image_and_card_endpoints(self):
        ep_id = STATE["ep_id"]
        deadline = time.time() + (150 if STATE.get("created") else 5)
        ep = None
        while time.time() < deadline:
            ep = S.get(f"{API}/episodes/{ep_id}").json()
            if ep.get("image_status") == "ready":
                break
            if ep.get("image_status") == "failed":
                pytest.fail(f"image failed: {ep}")
            time.sleep(3)
        assert ep and ep["image_status"] == "ready", ep
        assert ep.get("still_kind") in ("likeness", "generic"), ep
        assert ep.get("image_url")
        assert ep.get("card_url"), f"card_url missing: {ep}"

        img = S.get(f"{API}/episodes/{ep_id}/image", timeout=30)
        assert img.status_code == 200
        assert img.headers["content-type"].startswith("image/jpeg")

        card = S.get(f"{API}/episodes/{ep_id}/card", timeout=30)
        assert card.status_code == 200
        assert card.headers["content-type"].startswith("image/jpeg")
        assert len(card.content) > 100_000, f"card too small: {len(card.content)}B"
        im = Image.open(io.BytesIO(card.content))
        assert im.width == 1080, f"card width={im.width}"
        assert im.height >= 1350, f"card height={im.height}"

    def test_04_card_fallback_old_episode(self):
        """Old eps that predate the card feature still return 200 image/jpeg (fallback to still)."""
        tried = []
        for old_id in ("SOyV7Kk-", "5MusI4jx"):
            r = S.get(f"{API}/episodes/{old_id}/card", timeout=30)
            tried.append((old_id, r.status_code))
            if r.status_code == 200:
                assert r.headers["content-type"].startswith("image/jpeg")
                return
        pytest.fail(f"No old episode card served: {tried}")

    def test_05_share_page_bot_simpsons_title(self):
        ep_id = STATE["ep_id"]
        r = requests.get(f"{API}/s/{ep_id}",
                         headers={"User-Agent": "Twitterbot/1.0"},
                         allow_redirects=False, timeout=15)
        assert r.status_code == 200
        assert 'property="og:title"' in r.text
        assert "The Simpsons predicted @" in r.text

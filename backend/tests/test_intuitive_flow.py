"""Tests for the 'intuitive flow' iteration (no confirm screen, one-episode-per-handle,
fresh re-roll, new share-card dimensions 1080xH, H>=1350)."""
import os
import time

import pytest
import requests

def _load_frontend_url():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE_URL = _load_frontend_url().rstrip("/")
API = f"{BASE_URL}/api"

LABELS = {"role": "a", "vibe": "b", "obsession": "c"}


# --- /api/read: existing handle returns existing_episode_id ---
def test_read_paulg_returns_existing():
    r = requests.post(f"{API}/read", json={"handle": "paulg"}, timeout=90)
    assert r.status_code == 200
    data = r.json()
    assert data.get("found") is True
    assert data.get("handle") == "paulg"
    assert data.get("existing_episode_id") == "iYPNfdw8"


def test_read_naval_returns_existing():
    r = requests.post(f"{API}/read", json={"handle": "naval"}, timeout=90)
    assert r.status_code == 200
    assert r.json().get("existing_episode_id") == "kjitcK2D"


def test_read_sama_returns_existing():
    r = requests.post(f"{API}/read", json={"handle": "sama"}, timeout=90)
    assert r.status_code == 200
    assert r.json().get("existing_episode_id") == "f0iQEXPh"


# --- /api/episodes without fresh: returns existing episode (no new generation) ---
def test_create_without_fresh_returns_existing():
    r = requests.post(f"{API}/episodes", json={"handle": "paulg", "labels": LABELS}, timeout=120)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "iYPNfdw8"


# --- GET existing episode has required fields ---
def test_get_existing_episode():
    r = requests.get(f"{API}/episodes/iYPNfdw8", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["handle"] == "paulg"
    assert d["text_status"] in ("ready", None)
    assert "already_happened" in d
    assert "coming_near" in d and "coming_far" in d


# --- Card endpoint for existing episode ---
def test_existing_card_endpoint():
    r = requests.get(f"{API}/episodes/iYPNfdw8/card", timeout=30)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/jpeg")
    assert len(r.content) > 10_000


# --- fresh:true creates new episode and reuses it on read ---
@pytest.mark.order(after="test_existing_card_endpoint")
def test_fresh_creates_new_and_card_dimensions():
    r = requests.post(f"{API}/episodes", json={"handle": "paulg", "labels": LABELS, "fresh": True}, timeout=120)
    if r.status_code == 429:
        pytest.skip("rate limited; skipping fresh generation test")
    assert r.status_code == 200, r.text
    new = r.json()
    new_id = new["id"]
    assert new_id != "iYPNfdw8"
    assert new["text_status"] == "pending"

    # pending episode <5min old is reused by /api/read
    r2 = requests.post(f"{API}/read", json={"handle": "paulg"}, timeout=60)
    assert r2.status_code == 200
    assert r2.json().get("existing_episode_id") == new_id

    # Poll until ready
    deadline = time.time() + 180
    ready = None
    while time.time() < deadline:
        g = requests.get(f"{API}/episodes/{new_id}", timeout=30).json()
        if g.get("text_status") == "ready" and g.get("image_status") == "ready":
            ready = g
            break
        if g.get("text_status") == "failed":
            pytest.fail(f"episode text_status failed: {g}")
        time.sleep(4)
    assert ready is not None, "episode not ready in time"

    # Verify new share card dims: 1080 x >= 1350
    c = requests.get(f"{API}/episodes/{new_id}/card", timeout=60)
    assert c.status_code == 200
    assert c.headers["content-type"].startswith("image/jpeg")
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(c.content))
        assert img.size[0] == 1080, f"card width {img.size[0]} != 1080"
        assert img.size[1] >= 1350, f"card height {img.size[1]} < 1350"
    except ImportError:
        pass


# --- /api/timeline and /api/handles/paulg still working ---
def test_timeline_endpoint():
    r = requests.get(f"{API}/timeline", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d.get("confirmed"), list) and len(d["confirmed"]) > 0
    assert "pending" in d and "categories" in d


def test_handle_page():
    r = requests.get(f"{API}/handles/paulg", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["handle"].lower() == "paulg"
    assert isinstance(d["episodes"], list) and len(d["episodes"]) >= 1


def test_leaderboard():
    r = requests.get(f"{API}/leaderboard", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

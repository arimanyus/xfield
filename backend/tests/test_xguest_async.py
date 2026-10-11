"""Tests for X guest source and async episode generation (iteration 4)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://handle-prophecy.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- /api/read ----------

@pytest.mark.parametrize("handle", ["pmarca", "paulg"])
def test_read_handle_via_x(session, handle):
    t0 = time.monotonic()
    r = session.post(f"{API}/read", json={"handle": handle}, timeout=30)
    elapsed = time.monotonic() - t0
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("found") is True, data
    assert data.get("source") == "x", f"expected source=x, got {data.get('source')}"
    assert data.get("post_count", 0) >= 10, data
    assert data.get("name")
    av = data.get("avatar_url") or ""
    assert "pbs.twimg.com" in av, av
    assert "_400x400" in av, av
    assert isinstance(data.get("followers"), int), data.get("followers")
    assert isinstance(data.get("labels"), dict) and data["labels"], data.get("labels")
    assert data.get("sample_posts"), "sample_posts empty"
    assert elapsed < 20, f"read took {elapsed:.1f}s"


def test_read_nonexistent_handle_fast_fails(session):
    t0 = time.monotonic()
    r = session.post(f"{API}/read", json={"handle": "zzqxnobody9981x"}, timeout=30)
    elapsed = time.monotonic() - t0
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("found") is False, data
    assert elapsed < 25, f"not-found took {elapsed:.1f}s"


# ---------- /api/episodes (one episode budget) ----------

EP = {}


def test_create_episode_pending(session):
    t0 = time.monotonic()
    r = session.post(f"{API}/episodes", json={
        "handle": "paulg", "spice": "roast",
        "labels": {"role": "essayist", "vibe": "thread writer", "obsession": "startups"},
    }, timeout=15)
    elapsed = time.monotonic() - t0
    assert r.status_code == 200, r.text
    data = r.json()
    assert elapsed < 10, f"create took {elapsed:.1f}s"
    assert data.get("id")
    assert data.get("text_status") == "pending", data
    EP["id"] = data["id"]


def test_episode_text_becomes_ready(session):
    ep_id = EP.get("id")
    assert ep_id, "no episode id"
    deadline = time.monotonic() + 90
    data = None
    while time.monotonic() < deadline:
        r = session.get(f"{API}/episodes/{ep_id}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        if data.get("text_status") == "ready":
            break
        if data.get("text_status") == "failed":
            pytest.fail(f"text generation failed: {data}")
        time.sleep(2)
    assert data and data.get("text_status") == "ready", data
    assert data.get("source") == "x", data.get("source")
    assert data.get("already_happened"), "already_happened empty"
    assert data.get("evidence"), f"evidence empty: {data}"


def test_episode_image_ready(session):
    ep_id = EP.get("id")
    assert ep_id
    deadline = time.monotonic() + 90
    data = None
    while time.monotonic() < deadline:
        r = session.get(f"{API}/episodes/{ep_id}", timeout=15)
        data = r.json()
        if data.get("image_status") == "ready":
            break
        if data.get("image_status") == "failed":
            pytest.fail(f"image failed: {data}")
        time.sleep(3)
    assert data and data.get("image_status") == "ready", data
    img = session.get(f"{API}/episodes/{ep_id}/image", timeout=15)
    assert img.status_code == 200
    assert img.headers.get("content-type", "").startswith("image/")


def test_retry_idempotent_on_ready(session):
    ep_id = EP.get("id")
    assert ep_id
    t0 = time.monotonic()
    r = session.post(f"{API}/episodes/{ep_id}/retry", timeout=10)
    elapsed = time.monotonic() - t0
    assert r.status_code == 200, r.text
    assert elapsed < 5, f"retry took {elapsed:.1f}s"
    # still ready
    r2 = session.get(f"{API}/episodes/{ep_id}", timeout=10)
    assert r2.json().get("text_status") == "ready"

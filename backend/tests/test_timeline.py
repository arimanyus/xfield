"""Backend tests for the new /api/timeline endpoint (Simpsons predictions timeline)."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback: read frontend/.env
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def timeline_data():
    r = requests.get(f"{API}/timeline", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_status_and_shape(timeline_data):
    assert set(["confirmed", "pending", "categories", "pending_total"]).issubset(timeline_data.keys())
    assert isinstance(timeline_data["pending_total"], int)


def test_confirmed_count_and_fields(timeline_data):
    confirmed = timeline_data["confirmed"]
    assert len(confirmed) == 23
    cats = set(timeline_data["categories"])
    required = {"id", "code", "title", "aired", "event", "gap", "headline", "detail", "category", "status"}
    for p in confirmed:
        assert required.issubset(p.keys()), f"missing keys in {p.get('id')}: {required - p.keys()}"
        assert p["status"] == "confirmed"
        assert p["category"] in cats
        assert p["gap"] == p["event"] - p["aired"]


def test_confirmed_sorted_by_event_ascending(timeline_data):
    years = [p["event"] for p in timeline_data["confirmed"]]
    assert years == sorted(years)


def test_trump_entry(timeline_data):
    trump = next((p for p in timeline_data["confirmed"] if p["id"] == "trump"), None)
    assert trump is not None
    assert trump["code"] == "S11E17"
    assert trump["aired"] == 2000
    assert trump["event"] == 2016
    assert trump["gap"] == 16


def test_pending_shape_and_sort(timeline_data):
    from datetime import datetime
    cur_year = datetime.utcnow().year
    pending = timeline_data["pending"]
    assert isinstance(pending, list)
    for p in pending:
        for k in ("year", "text", "handle", "episode_id", "code", "title"):
            assert k in p
        assert p["year"] >= cur_year + 1
    years = [p["year"] for p in pending]
    assert years == sorted(years)


def test_sports_filter_entries(timeline_data):
    sports = [p["id"] for p in timeline_data["confirmed"] if p["category"] == "sports"]
    assert set(sports) == {"superbowl-26", "fifa", "curling"}

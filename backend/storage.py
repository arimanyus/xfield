"""Emergent object storage: house snapshots live here, so they survive redeploys."""
import asyncio
import os

import requests

STORAGE_URL = ((os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com").rstrip("/") \
    + "/objstore/api/v1/storage"
APP = "xfield"
_key = None


def _init(force: bool = False) -> str:
    global _key
    if _key and not force:
        return _key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    r.raise_for_status()
    _key = r.json()["storage_key"]
    return _key


def _call(method: str, path: str, headers: dict = None, data: bytes = None) -> requests.Response:
    """A 404 can mean our storage key went stale, so mint a fresh one and try once more."""
    for force in (False, True):
        r = requests.request(method, f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": _init(force), **(headers or {})},
                             data=data, timeout=60)
        if r.status_code != 404:
            break
    r.raise_for_status()
    return r


def _put(path: str, data: bytes, content_type: str) -> str:
    return _call("PUT", path, data=data, headers={"Content-Type": content_type}).json()["path"]


def _get(path: str) -> bytes:
    return _call("GET", path).content


async def put(path: str, data: bytes, content_type: str = "image/jpeg") -> str:
    return await asyncio.to_thread(_put, f"{APP}/{path}", data, content_type)


async def get(path: str) -> bytes:
    return await asyncio.to_thread(_get, path)


async def init():
    await asyncio.to_thread(_init)

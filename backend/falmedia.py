import os
import time
from urllib.parse import urlparse

import requests

EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
# Fal Universal Key supports queue inference through the Emergent proxy only, not Fal Platform APIs.
INTEGRATION_PROXY_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "https://integrations.emergentagent.com").rstrip("/")
CONTROL_BASE = f"{INTEGRATION_PROXY_BASE}/api/v1/fal"
PUBLIC_QUEUE_BASE = f"{CONTROL_BASE}/queue"
QUEUE_ORIGIN = "https://queue.fal.run"

FLUX_DEV = "fal-ai/flux/dev"
FLUX_KONTEXT = "fal-ai/flux-pro/kontext"


class FalError(Exception):
    pass


class InsufficientCreditsError(FalError):
    pass


def _headers(extra=None):
    headers = {"Authorization": f"Bearer {EMERGENT_LLM_KEY}", "Content-Type": "application/json"}
    job_id = os.environ.get("job_id")
    if job_id:
        headers["X-App-ID"] = job_id
        headers["X-Job-ID"] = job_id
    run_id = os.environ.get("run_id")
    if run_id:
        headers["X-Environment-ID"] = run_id
    if extra:
        headers.update(extra)
    return headers


def _trusted(url: str) -> str:
    c, q = urlparse(url), urlparse(PUBLIC_QUEUE_BASE)
    if c.scheme != q.scheme or c.netloc != q.netloc or c.username or c.password or c.fragment \
            or not c.path.startswith(q.path.rstrip("/") + "/"):
        raise FalError("Proxy returned an untrusted media queue URL")
    return url


def _get_with_retry(url: str, timeout: int, deadline: float, attempts: int = 5) -> requests.Response:
    delay = 1
    for i in range(attempts):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise FalError("Timed out waiting for media generation")
        try:
            return requests.get(url, headers=_headers(), timeout=min(timeout, remaining))
        except (requests.ConnectTimeout, requests.ReadTimeout, requests.ConnectionError) as exc:
            if i == attempts - 1:
                raise FalError("Polling failed after transient network errors") from exc
            time.sleep(max(0, min(delay, deadline - time.monotonic())))
            delay *= 2
    raise AssertionError("unreachable")


def run_media_generation(endpoint_id: str, payload: dict, timeout_seconds: int = 120) -> dict:
    submit = requests.post(f"{CONTROL_BASE}/proxy", headers=_headers({"X-Fal-Target-Url": f"{QUEUE_ORIGIN}/{endpoint_id}"}),
                           json=payload, timeout=60)
    if submit.status_code == 402:
        raise InsufficientCreditsError("Insufficient Universal Key credits for this generation")
    submit.raise_for_status()
    sub = submit.json()
    status_url, response_url = _trusted(sub["status_url"]), _trusted(sub["response_url"])
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        st = _get_with_retry(status_url, 30, deadline)
        st.raise_for_status()
        body = st.json()
        status = (body.get("status") or "").upper()
        if status in {"COMPLETED", "OK"}:
            if body.get("error"):
                raise FalError(f"Media generation failed: {body['error']}")
            res = _get_with_retry(response_url, 60, deadline)
            res.raise_for_status()
            return res.json()
        if status in {"FAILED", "CANCELLED", "CANCELED", "ERROR"}:
            raise FalError(f"Media generation failed: {status}")
        time.sleep(1.5)
    raise FalError("Timed out waiting for media generation")


def first_image_bytes(result: dict) -> bytes | None:
    images = result.get("images") or []
    if not images:
        return None
    url = images[0].get("url")
    if not url:
        return None
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.content


def flux_text_to_image(prompt: str) -> bytes | None:
    payload = {"prompt": prompt, "image_size": "landscape_16_9", "num_images": 1, "output_format": "jpeg",
               "num_inference_steps": 28, "guidance_scale": 3.5, "enable_safety_checker": True}
    return first_image_bytes(run_media_generation(FLUX_DEV, payload))


def flux_kontext(prompt: str, image_url: str) -> bytes | None:
    payload = {"prompt": prompt, "image_url": image_url, "aspect_ratio": "16:9", "num_images": 1,
               "output_format": "jpeg", "guidance_scale": 3.5, "safety_tolerance": "2"}
    return first_image_bytes(run_media_generation(FLUX_KONTEXT, payload))

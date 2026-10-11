import asyncio
import base64
import io
import json
import logging
import os
import random
import re
import uuid
from datetime import date, datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

from emergentintegrations.llm.chat import ImageContent, LlmChat, StreamDone, TextDelta, UserMessage

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger("generator")

ASSETS = Path(__file__).parent / "assets"
KEY = os.environ["EMERGENT_LLM_KEY"]
TEXT_MODEL = os.environ["TEXT_MODEL"]
LABEL_MODEL = os.environ["LABEL_MODEL"]
IMAGE_MODEL = os.environ["IMAGE_MODEL"]

DEFAULT_LABELS = {"role": "poster", "vibe": "chronically online", "obsession": "the timeline"}

SAFETY = (
    "Hard rules: joke ONLY about what this person has publicly posted, their bio, and their online behaviour "
    "(posting habits, ego, takes, obsessions, hustle, gear, routines). NEVER joke about or mention race, ethnicity, "
    "religion, gender, sexuality, disability, body, appearance, health, age, family, children, relationships, "
    "nationality, identity politics, tragedy, violence, self-harm, death or real-world harm. No slurs, no hate. "
    "Never present invented facts as real-world claims about the person; everything is framed as what the cartoon episode showed."
)

EPISODE_SYSTEM = (
    'You are the head writer of "The Fortunes", a fictional American animated sitcom about a yellow-skinned cartoon '
    "family that ran for 30 seasons (1990-2020) and is famous for eerily predicting real people's lives. The show is "
    "original: never mention or imitate any real cartoon, its characters, catchphrases or towns. FORBIDDEN words anywhere "
    "in your output: Simpsons, Homer, Marge, Bart, Lisa, Maggie, Springfield, Krusty, Burns, Smithers, Flanders, Moe, Apu, "
    "Milhouse, Nelson, Ralph, Duff, Kwik-E-Mart, D'oh, Ay caramba, Family Guy, South Park, Griffin, Quahog.\n"
    "Given an X (Twitter) user's bio, labels and recent posts, write the lost episode that predicted them.\n"
    f"{SAFETY}\n"
    "Comedy style: specific, observational, deadpan, quotable. The funniest line quotes or paraphrases something they "
    'actually posted. Spice: "roast" = affectionate ribbing; "savage" = merciless about ego, habits, takes and online '
    "behaviour, still within the hard rules.\n"
    "Reply with ONLY a JSON object, no markdown fences, with exactly these keys:\n"
    "{\n"
    ' "title": "episode title spoofing their life, 3-7 words, Title Case",\n'
    ' "aired_date": "YYYY-MM-DD between 1996-01-01 and 2004-12-31",\n'
    ' "episode_number": <integer 1-24>,\n'
    ' "already_happened": "1-2 sentences, max 200 characters, present tense: what the episode showed that has now come true about them, grounded in a specific real post or bio detail",\n'
    ' "evidence": "short verbatim or lightly trimmed quote (max 90 chars) from one of their real posts that proves it; empty string if no posts were given",\n'
    ' "coming_near": {"year": NEAR_YEAR, "text": "1 sentence, max 160 chars, a specific funny prophecy for that year"},\n'
    ' "coming_far": {"year": <integer between FAR_MIN and FAR_MAX>, "text": "1 sentence, max 160 chars, a bigger, stranger prophecy"},\n'
    ' "subtitle": "one line of dialogue (max 60 chars) the character says in the still",\n'
    ' "scene": "1-2 sentences describing the still: setting, action, props. No on-screen text.",\n'
    ' "character": "visual description of the cartoon version of them: hair, glasses, facial hair, outfit, expression. Max 40 words. Use hints from bio/posts about their gear or style, otherwise invent something fitting the labels."\n'
    "}"
)

LABEL_SYSTEM = (
    "You label X (Twitter) users for a comedy app. Reply ONLY with a JSON object: "
    '{"role": "...", "vibe": "...", "obsession": "..."}. '
    "role = what they do or are (1-3 lowercase words, e.g. 'indie hacker', 'vc', 'designer'); "
    "vibe = how they behave online (1-3 lowercase words, e.g. 'chronically online', 'reply guy', 'thread poster'); "
    "obsession = the thing they can't stop posting about (1-3 lowercase words, e.g. 'ai agents', 'bitcoin', 'their startup'). "
    "Base it only on the bio and posts. Never reference race, religion, gender, sexuality, disability, health, body, age, family or identity politics."
)


async def _llm_text(model: str, system: str, user: str, max_tokens: int) -> str:
    chat = (LlmChat(api_key=KEY, session_id=f"aa-{uuid.uuid4()}", system_message=system)
            .with_model("anthropic", model).with_params(max_tokens=max_tokens))
    parts = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return "".join(parts)


def _json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(), flags=re.M).strip()
    s, e = text.find("{"), text.rfind("}")
    if s < 0 or e <= s:
        raise ValueError("no JSON object in model output")
    return json.loads(text[s:e + 1])


def _posts_block(profile: dict) -> str:
    posts = profile.get("posts") or []
    if not posts:
        return "(no posts could be read)"
    return "\n".join(f"{i + 1}. {p['text']}" for i, p in enumerate(posts[:20]))


def _profile_block(profile: dict) -> str:
    return (f"Handle: @{profile['handle']}\nName: {profile.get('name') or profile['handle']}\n"
            f"Bio: {profile.get('bio') or '(empty)'}\nLocation: {profile.get('location') or '(unknown)'}\n"
            f"Their original posts (a mix of their most popular and most recent):\n{_posts_block(profile)}")


async def extract_labels(profile: dict) -> dict:
    try:
        raw = await asyncio.wait_for(_llm_text(LABEL_MODEL, LABEL_SYSTEM, _profile_block(profile), 200), timeout=25)
        data = _json(raw)
        out = {k: str(data.get(k, "")).strip().lower()[:40] or DEFAULT_LABELS[k] for k in DEFAULT_LABELS}
        return out
    except Exception as e:
        logger.warning("label extraction failed: %s", e)
        return dict(DEFAULT_LABELS)


def _clamp(s, n):
    s = str(s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


async def write_episode(profile: dict, labels: dict, spice: str, found_by) -> dict:
    today = date.today()
    near, far_min, far_max = today.year + 1, today.year + 3, today.year + 7
    system = (EPISODE_SYSTEM.replace("NEAR_YEAR", str(near))
              .replace("FAR_MIN", str(far_min)).replace("FAR_MAX", str(far_max)))
    user = (f"Today is {today.isoformat()}.\nSpice level: {spice}.\n"
            f"Labels (confirmed by the person who submitted this): role = {labels['role']}; vibe = {labels['vibe']}; "
            f"obsession = {labels['obsession']}.\n"
            + (f"Submitted by @{found_by} who wants to roast their friend.\n" if found_by else "Submitted by the person themselves.\n")
            + _profile_block(profile) + "\nWrite the episode JSON now.")
    data, raw = None, ""
    for attempt, model in enumerate((TEXT_MODEL, TEXT_MODEL, LABEL_MODEL), start=1):
        try:
            raw = await asyncio.wait_for(_llm_text(model, system, user, 1500), timeout=45)
            data = _json(raw)
            if not data.get("already_happened"):
                raise ValueError("missing already_happened")
            break
        except Exception as e:
            logger.warning("episode write attempt %d via %s failed: %s | raw=%r", attempt, model, e, (raw or "")[:300])
            data = None
    if data is None:
        raise RuntimeError("episode writer returned no usable JSON after 3 attempts")

    try:
        aired = datetime.strptime(str(data.get("aired_date", "")), "%Y-%m-%d").date()
    except ValueError:
        aired = date(random.randint(1996, 2004), random.randint(1, 12), random.randint(1, 28))
    aired = max(date(1996, 1, 1), min(aired, date(2004, 12, 31)))
    try:
        ep_num = int(data.get("episode_number") or random.randint(1, 24))
    except (TypeError, ValueError):
        ep_num = random.randint(1, 24)
    ep_num = max(1, min(ep_num, 24))

    def year_of(block, default, lo, hi):
        try:
            y = int((block or {}).get("year"))
        except (TypeError, ValueError):
            y = default
        return max(lo, min(y, hi))

    cn, cf = data.get("coming_near") or {}, data.get("coming_far") or {}
    return {
        "title": _clamp(data.get("title") or "The One Nobody Saw Coming", 70),
        "season": aired.year - 1989,
        "episode": ep_num,
        "aired_date": aired.isoformat(),
        "aired_year": aired.year,
        "already_happened": _clamp(data.get("already_happened"), 240),
        "evidence": _clamp(data.get("evidence"), 110),
        "coming_near": {"year": near, "text": _clamp(cn.get("text"), 190)},
        "coming_far": {"year": year_of(cf, far_min + 2, far_min, far_max), "text": _clamp(cf.get("text"), 190)},
        "subtitle": _clamp(data.get("subtitle") or "I should not have posted that.", 70),
        "scene": _clamp(data.get("scene"), 400),
        "character": _clamp(data.get("character"), 300),
    }


STILL_BASE = (
    "A single paused frame from a late-1990s American animated TV sitcom, hand-drawn cel animation look: flat colors, "
    "thick clean black outlines, soft CRT glow, slightly faded VHS color palette. Widescreen 16:9 composition, medium shot. "
    "Scene: {scene} The main character is a yellow-skinned cartoon person with an overbite and big round eyes: {character} "
    "{ref} Absolutely no text, letters, captions, subtitles, logos or watermarks anywhere in the image."
)
REF_NOTE = ("Use the attached picture only as a loose style reference for the character design: borrow the hair color and "
            "hairstyle, whether they wear glasses, facial hair, and clothing colors. The result must be an original flat "
            "yellow cartoon character in the show's house style, not a portrait or likeness of any real person. ")


async def fetch_avatar(url) -> bytes | None:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        img.thumbnail((512, 512))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=90)
        return buf.getvalue()
    except Exception as e:
        logger.warning("avatar fetch failed: %s", e)
        return None


async def generate_still(ep: dict, avatar: bytes | None):
    attempts = []
    if avatar:
        attempts.append((STILL_BASE.format(scene=ep["scene"], character=ep["character"], ref=REF_NOTE), avatar))
    attempts.append((STILL_BASE.format(scene=ep["scene"], character=ep["character"], ref=""), None))
    for prompt, ref in attempts:
        try:
            chat = (LlmChat(api_key=KEY, session_id=f"img-{uuid.uuid4()}", system_message="You generate images.")
                    .with_model("gemini", IMAGE_MODEL).with_params(modalities=["image", "text"]))
            kwargs = {"text": prompt}
            if ref:
                kwargs["file_contents"] = [ImageContent(base64.b64encode(ref).decode())]
            _, images = await chat.send_message_multimodal_response(UserMessage(**kwargs))
            if images:
                return base64.b64decode(images[0]["data"]), bool(ref)
            logger.warning("image model returned no image (ref=%s)", bool(ref))
        except Exception as e:
            logger.warning("still generation failed (ref=%s): %s", bool(ref), e)
    return None, False


W, H = 1200, 675
YELLOW = (250, 204, 21, 255)
WHITE = (248, 250, 252, 255)


def _font(name, size):
    return ImageFont.truetype(str(ASSETS / name), size)


def _cover(img, w, h):
    scale = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left, top = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((left, top, left + w, top + h))


def _wrap(d, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _shadow(d, xy, text, font, fill):
    x, y = xy
    d.text((x + 2, y + 2), text, font=font, fill=(0, 0, 0, 220))
    d.text((x, y), text, font=font, fill=fill)


def _generic_background(ep):
    base = Image.new("RGB", (W, H), (15, 23, 42))
    noise = Image.effect_noise((W, H), 48).convert("RGB")
    base = Image.blend(base, noise, 0.18)
    d = ImageDraw.Draw(base)
    big = _font("BebasNeue-Regular.ttf", 120)
    lines = _wrap(d, ep["title"].upper(), big, W - 200)[:2]
    y = H / 2 - 60 * len(lines) - 20
    for ln in lines:
        w = d.textlength(ln, font=big)
        d.text(((W - w) / 2, y), ln, font=big, fill=(250, 204, 21))
        y += 118
    osd = _font("VT323-Regular.ttf", 34)
    msg = "STILL MISSING FROM ARCHIVE — TAPE DAMAGED"
    w = d.textlength(msg, font=osd)
    d.text(((W - w) / 2, y + 10), msg, font=osd, fill=(148, 163, 184))
    return base


def compose_card(ep: dict, still: bytes | None) -> bytes:
    if still:
        base = _cover(Image.open(io.BytesIO(still)).convert("RGB"), W, H)
    else:
        base = _generic_background(ep)
    base = base.convert("RGBA")
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for y in range(0, H, 3):
        d.line([(0, y), (W, y)], fill=(0, 0, 0, 34))

    osd = _font("VT323-Regular.ttf", 40)
    aired = datetime.strptime(ep["aired_date"], "%Y-%m-%d").strftime("%m.%d.%Y")
    _shadow(d, (36, 24), f"ARCHIVE  S{ep['season']:02d}E{ep['episode']:02d}", osd, YELLOW)
    _shadow(d, (36, 62), f"AIRED {aired}", osd, WHITE)
    d.ellipse([W - 156, 36, W - 136, 56], fill=(239, 68, 68, 255))
    _shadow(d, (W - 122, 24), "PLAY", osd, WHITE)

    sub_font = _font("Outfit-Regular.ttf", 36)
    lines = _wrap(d, ep["subtitle"], sub_font, W - 180)[:2]
    line_h, bottom_h = 46, 58
    bar_h = 26 + line_h * len(lines)
    d.rectangle([0, H - bottom_h - bar_h, W, H - bottom_h], fill=(0, 0, 0, 150))
    y = H - bottom_h - bar_h + 12
    for ln in lines:
        w = d.textlength(ln, font=sub_font)
        _shadow(d, ((W - w) / 2, y), ln, sub_font, YELLOW)
        y += line_h

    d.rectangle([0, H - bottom_h, W, H], fill=(7, 11, 20, 238))
    small = _font("VT323-Regular.ttf", 30)
    brand_font = _font("BebasNeue-Regular.ttf", 30)
    brand = "ALREADY AIRED"
    bw = d.textlength(brand, font=brand_font)
    d.text((W - 36 - bw, H - 44), brand, font=brand_font, fill=YELLOW)
    meta = f"@{ep['handle']}  ·  “{ep['title']}”"
    while d.textlength(meta, font=small) > W - 100 - bw and len(meta) > 20:
        meta = meta[:-2].rstrip() + "…"
    d.text((36, H - 45), meta, font=small, fill=WHITE)

    out = Image.alpha_composite(base, ov).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=88, optimize=True)
    return buf.getvalue()


async def render_card_for_episode(ep: dict, avatar_url) -> tuple:
    avatar = await fetch_avatar(avatar_url)
    still, used_ref = await generate_still(ep, avatar)
    card = await asyncio.to_thread(compose_card, ep, still)
    kind = "likeness" if still and used_ref else ("generic" if still else "missing")
    return card, kind

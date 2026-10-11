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
import falmedia  # noqa: E402

logger = logging.getLogger("generator")

ASSETS = Path(__file__).parent / "assets"
KEY = os.environ["EMERGENT_LLM_KEY"]
TEXT_MODEL = os.environ["TEXT_MODEL"]
LABEL_MODEL = os.environ["LABEL_MODEL"]
IMAGE_MODEL = os.environ["IMAGE_MODEL"]

DEFAULT_LABELS = {"role": "poster", "vibe": "chronically online", "obsession": "the timeline"}

SAFETY = (
    "Hard rules (the only off-limits list): never joke about or mention race, ethnicity, religion, gender, sexuality, "
    "disability, body, appearance, health, age, family, children, relationships, nationality, tragedy, violence, "
    "self-harm, death or real-world harm. No slurs. Everything else they chose to post publicly is fair game: their job, "
    "company, product, fundraising, net-worth claims, follower count, hustle, takes, hot streaks, flops, routines, gear, "
    "ego, and the gap between how they post and what they obviously are. Never present invented facts as real-world "
    "claims; everything is framed as what the episode showed."
)

CAST = ("Homer Simpson, Marge Simpson, Bart Simpson, Lisa Simpson, Maggie, Mr. Burns, Smithers, Moe Szyslak, Krusty the Clown, "
        "Ned Flanders, Comic Book Guy, Milhouse, Nelson Muntz, Ralph Wiggum, Chief Wiggum, Principal Skinner, Kent Brockman, "
        "Lenny and Carl, Barney Gumble, Professor Frink, Sideshow Bob, Grampa Simpson, Patty and Selma, Groundskeeper Willie, "
        "Apu, Dr. Nick, Lionel Hutz, Troy McClure, Disco Stu, Duffman, Mayor Quimby, Otto, Edna Krabappel")

EPISODE_SYSTEM = (
    "You are the head writer of a parody archive of lost episodes of THE SIMPSONS: the Fox animated series famous for "
    "predicting the future (President Trump in 2000, Disney buying Fox in 1998, the smartwatch in 1995). Each lost episode "
    "predicted a real X (Twitter) user years before they existed online. Write it as a real Simpsons episode: Springfield "
    "settings (Moe's Tavern, the Kwik-E-Mart, the nuclear plant, Springfield Elementary, Channel 6 News, the Android's "
    "Dungeon, 742 Evergreen Terrace), running gags, Kent Brockman segments, Mr. Burns schemes, chalkboard gags, couch gags. "
    f"Use the actual characters by name — {CAST} — reacting to a new Springfield character who is this person.\n"
    "Given the user's bio, labels and real posts, write the lost episode that predicted them.\n"
    f"{SAFETY}\n"
    "Comedy style: specific, observational, deadpan, quotable, in the voice of the show's golden era. The funniest line "
    "quotes or paraphrases something they actually posted and lets a Simpsons character react to it.\n"
    'Spice "savage" (the default): go for the throat. No compliments, no softening, no "but honestly they\'re great". '
    "Mock the ego, the delusion, the engagement bait, the recycled takes, the product nobody asked for, the follower count "
    "versus the self-image. Cruel, precise, quotable, and still within the hard rules. "
    'Spice "roast": the same jokes with a wink, affectionate instead of lethal.\n'
    "Reply with ONLY a JSON object, no markdown fences, with exactly these keys:\n"
    "{\n"
    ' "title": "Simpsons-style episode title spoofing their life, 3-7 words, Title Case (puns on film/book titles welcome)",\n'
    ' "aired_date": "YYYY-MM-DD between 1996-01-01 and 2004-12-31",\n'
    ' "episode_number": <integer 1-24>,\n'
    ' "cast": ["2 to 4 real Simpsons character names who appear in the episode"],\n'
    ' "already_happened": "1-2 sentences, max 200 characters, present tense: what the episode showed that has now come true about them, grounded in a specific real post or bio detail, with a Simpsons character involved",\n'
    ' "evidence": "short verbatim or lightly trimmed quote (max 90 chars) from one of their real posts that proves it; empty string if no posts were given",\n'
    ' "coming_near": {"year": NEAR_YEAR, "text": "1 sentence, max 160 chars, a specific brutal prophecy for that year"},\n'
    ' "coming_far": {"year": <integer between FAR_MIN and FAR_MAX>, "text": "1 sentence, max 160 chars, a bigger, stranger prophecy"},\n'
    ' "subtitle": "one line of dialogue from the still, max 90 chars, prefixed with the speaker in caps, e.g. MR. BURNS: Excellent. Another man posting through it.",\n'
    ' "scene": "1-2 sentences describing the still: Springfield setting, the cast members by name, what they and the person are doing. No on-screen text.",\n'
    ' "scene_visual": "the same still described for an illustrator who has never seen the show: no character names, no show or brand names, no place names. Describe the setting and each character purely visually (e.g. a bald overweight yellow man in a white polo shirt). 1-2 sentences.",\n'
    ' "character": "visual description of the Simpsons-style version of this person: hair, glasses, facial hair, outfit, expression. Max 40 words. Use hints from bio/posts about their gear or style, otherwise invent something fitting the labels."\n'
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
    cast = [str(c).strip()[:40] for c in (data.get("cast") or []) if str(c).strip()][:4]
    return {
        "title": _clamp(data.get("title") or "The One Nobody Saw Coming", 70),
        "season": aired.year - 1989,
        "episode": ep_num,
        "aired_date": aired.isoformat(),
        "aired_year": aired.year,
        "cast": cast,
        "already_happened": _clamp(data.get("already_happened"), 240),
        "evidence": _clamp(data.get("evidence"), 110),
        "coming_near": {"year": near, "text": _clamp(cn.get("text"), 190)},
        "coming_far": {"year": year_of(cf, far_min + 2, far_min, far_max), "text": _clamp(cf.get("text"), 190)},
        "subtitle": _clamp(data.get("subtitle") or "HOMER: I should not have posted that.", 110),
        "scene": _clamp(data.get("scene"), 400),
        "scene_visual": _clamp(data.get("scene_visual"), 400),
        "character": _clamp(data.get("character"), 300),
    }


NAME_RE = re.compile(r"\b(the simpsons?|simpsons?|springfield|homer|marge|bart|lisa|maggie|mr\.? burns|burns|smithers|moe'?s?( tavern)?|"
                     r"krusty|flanders|comic book guy|milhouse|nelson|ralph|wiggum|skinner|brockman|lenny|carl|barney|frink|"
                     r"sideshow bob|grampa|patty|selma|willie|apu|kwik-e-mart|duff(man)?|quimby|otto|krabappel|evergreen terrace|"
                     r"channel 6|fox)\b", re.I)


def sanitize_visual(text: str) -> str:
    return re.sub(r"\s{2,}", " ", NAME_RE.sub("a cartoon character", text or "")).strip()


STILL_STYLE_ONLY = (
    "A single paused frame from a 1990s yellow-skinned animated family sitcom: overbites, big round eyes, four fingers, "
    "flat colors, thick black outlines, a small American town, soft CRT glow and faded VHS color. Widescreen 16:9 "
    "composition, medium shot. Scene: {scene} The main character is a yellow-skinned cartoon person: {character} "
    "Absolutely no text, letters, captions, subtitles, logos or watermarks anywhere in the image."
)
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


async def describe_avatar(avatar: bytes | None) -> str:
    if not avatar:
        return ""
    try:
        chat = LlmChat(api_key=KEY, session_id=f"look-{uuid.uuid4()}",
                       system_message="You describe profile photos for a cartoonist. Reply with one line, max 25 words, only visible "
                                      "physical features and clothing: hair color/style, facial hair, glasses, headwear, clothing colors. "
                                      "No names, no guesses about identity.").with_model("anthropic", LABEL_MODEL)
        r = await asyncio.wait_for(chat.send_message(UserMessage(text="Describe this person for a cartoonist.",
                                                                  file_contents=[ImageContent(base64.b64encode(avatar).decode())])), 25)
        return _clamp(r.strip().strip('"'), 200)
    except Exception as e:
        logger.warning("avatar description failed: %s", e)
        return ""


FLUX_PROMPT = (
    "A paused frame from a classic 1990s episode of The Simpsons, authentic Simpsons cel animation style: yellow skin, big round "
    "eyes, overbites, flat colors, thick clean black outlines, soft CRT glow and faded VHS color. {scene} The Simpsons characters "
    "{cast} are drawn exactly as they appear in the show. The new character representing the person: {character}. Widescreen, "
    "medium shot, expressive faces. No text, no captions, no signs with words, no logos, no watermarks."
)


async def generate_still(ep: dict, avatar: bytes | None):
    look = await describe_avatar(avatar)
    character = f"a Simpsons-style version of a person with {look}; {ep['character']}" if look else ep["character"]
    cast_names = ", ".join(ep.get("cast") or []) or "Homer Simpson"
    try:
        prompt = FLUX_PROMPT.format(scene=ep["scene"], cast=cast_names, character=character)
        img = await asyncio.wait_for(asyncio.to_thread(falmedia.flux_text_to_image, prompt), 150)
        if img:
            logger.info("still generated via flux (likeness=%s)", bool(look))
            return img, bool(look)
        logger.warning("flux returned no image")
    except falmedia.InsufficientCreditsError:
        logger.error("Universal Key credits exhausted for fal image generation")
    except Exception as e:
        logger.warning("flux still generation failed: %s", e)

    scene = sanitize_visual(ep.get("scene_visual") or ep["scene"])
    gen_character = sanitize_visual(f"{look}; {ep['character']}" if look else ep["character"])
    try:
        chat = (LlmChat(api_key=KEY, session_id=f"img-{uuid.uuid4()}", system_message="You generate images.")
                .with_model("gemini", IMAGE_MODEL).with_params(modalities=["image", "text"]))
        _, images = await chat.send_message_multimodal_response(
            UserMessage(text=STILL_STYLE_ONLY.format(scene=scene, character=gen_character)))
        if images:
            logger.info("still generated via gemini fallback")
            return base64.b64decode(images[0]["data"]), False
        logger.warning("gemini fallback returned no image")
    except Exception as e:
        logger.warning("gemini fallback failed: %s", e)
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
    _shadow(d, (36, 24), f"THE SIMPSONS  S{ep['season']:02d}E{ep['episode']:02d}", osd, YELLOW)
    _shadow(d, (36, 62), f"AIRED {aired}", osd, WHITE)
    d.ellipse([W - 156, 36, W - 136, 56], fill=(239, 68, 68, 255))
    _shadow(d, (W - 122, 24), "PLAY", osd, WHITE)

    sub_font = _font("Outfit-Regular.ttf", 36)
    lines = _wrap(d, ep["subtitle"], sub_font, W - 180)[:2]
    line_h, bottom_h = 46, 58
    bar_h = 26 + line_h * len(lines)
    d.rectangle([0, H - bottom_h - bar_h, W, H - bottom_h], fill=(0, 0, 0, 200))
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


SW = 1080
INK = (7, 11, 20)
GREY = (148, 163, 184)


def compose_share_card(ep: dict, card16: bytes, site_host: str) -> bytes:
    top_h = round(SW * 9 / 16)
    canvas = Image.new("RGB", (SW, 1700), INK)
    canvas.paste(Image.open(io.BytesIO(card16)).convert("RGB").resize((SW, top_h), Image.LANCZOS), (0, 0))
    d = ImageDraw.Draw(canvas)
    x, y = 44, top_h + 34

    title_font = _font("BebasNeue-Regular.ttf", 64)
    for ln in _wrap(d, f"“{ep['title']}”", title_font, SW - 2 * x)[:2]:
        d.text((x, y), ln, font=title_font, fill=(250, 204, 21))
        y += 64
    osd = _font("VT323-Regular.ttf", 28)
    cast = [c.upper() for c in (ep.get("cast") or [])[:3]]
    starring = "STARRING " + (", ".join(cast) + " & " if cast else "") + f"@{ep['handle'].upper()}"
    while d.textlength(starring, font=osd) > SW - 2 * x and len(starring) > 20:
        starring = starring[:-2] + "…"
    d.text((x, y + 6), starring, font=osd, fill=GREY)
    y += 50

    label_font = _font("VT323-Regular.ttf", 30)
    body = _font("Outfit-Regular.ttf", 27)
    blocks = [("ALREADY HAPPENED", ep["already_happened"], True),
              (f"COMING {ep['coming_near']['year']}", ep["coming_near"]["text"], False),
              (f"COMING {ep['coming_far']['year']}", ep["coming_far"]["text"], False)]
    for label, text, accent in blocks:
        lines = _wrap(d, text, body, SW - x - 70)[:3]
        block_h = 30 + 34 * len(lines)
        d.rectangle([x, y + 4, x + 3, y + block_h], fill=(250, 204, 21) if accent else (71, 85, 105))
        d.text((x + 18, y), label, font=label_font, fill=(250, 204, 21) if accent else (203, 213, 225))
        y += 32
        for ln in lines:
            d.text((x + 18, y), ln, font=body, fill=(241, 245, 249))
            y += 34
        y += 26

    total_h = max(1350, y + 70)
    d.line([(x, total_h - 60), (SW - x, total_h - 60)], fill=(250, 204, 21), width=1)
    d.text((x, total_h - 48), f"@{ep['handle']}", font=osd, fill=(248, 250, 252))
    brand_font = _font("BebasNeue-Regular.ttf", 30)
    bw = d.textlength("ALREADY AIRED", font=brand_font)
    d.text((SW - x - bw, total_h - 50), "ALREADY AIRED", font=brand_font, fill=(250, 204, 21))
    mid = f"FIND YOURS · {site_host}"
    mw = d.textlength(mid, font=osd)
    if mw < SW - 2 * x - bw - 220:
        d.text(((SW - mw) / 2, total_h - 48), mid, font=osd, fill=GREY)

    out = canvas.crop((0, 0, SW, total_h))
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=88, optimize=True)
    return buf.getvalue()

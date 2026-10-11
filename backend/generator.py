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
WRITER_EFFORT = os.environ.get("WRITER_EFFORT", "medium")

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

PROPHECY_RULES = (
    "WHY THE REAL PREDICTIONS ARE FAMOUS: each one is a CONCRETE EVENT with a proper noun and a consequence that sounded "
    "absurd when it aired and became a headline later. That is the bar. A prophecy here is a news headline from the future "
    "about this person, never a description of their habits.\n"
    "PROPHECY RULES\n"
    "1. Event, not behaviour. Something happens TO them or BECAUSE of them out in the world: an acquisition, a lawsuit, a "
    "Senate hearing, a bankruptcy, a Netflix docuseries, a recall, an award, a ban, a merger, a cabinet post, a stadium "
    "naming, a cult, a court ruling, an ETF, a museum exhibit, a Wikipedia edit war, a Costco product. BANNED: \"will post\", "
    "\"will tweet\", \"keeps\", \"continues\", \"still\", \"spends every day\", \"the same X seventeen times\", or anything that "
    "merely extends what they already do.\n"
    "2. Specific or dead. Every prophecy contains at least TWO of: a proper noun from their actual life (their company, "
    "product, project, newsletter, employer, podcast, rival, city, gear, a person they mention), a hard number (dollars, "
    "followers, a version, a count, a percentage), a named institution (the SEC, Fox News, Harvard, the Vatican, Delaware "
    "Chancery Court, Costco, the Nobel committee, the Louvre), or a phrase from one of their posts turned into something official "
    "(a law, a ticker, a plaque, a diagnosis the AMA rejects).\n"
    "3. The Simpsons test: in the prophecy year, could someone screenshot it next to a real headline and say \"they called it\"? "
    "If it only works as a joke about their personality, it fails.\n"
    "4. Savage. The event is a humiliation disguised as a milestone, or a milestone that exposes the delusion. No compliments, "
    "no softening, no wink. Cruel, precise, quotable, within the hard rules.\n"
    "5. Form: ONE sentence, max 150 characters, present-tense headline style that starts with the verb or the event "
    "(\"Sells Nomad List to Marriott for $40M after…\", \"Is subpoenaed by the SEC over…\", \"Becomes the first man to…\"). "
    "Never start with \"He will\", \"She will\", \"They will\", \"The character\".\n"
    "6. Near year = plausible-absurd. Far year = bigger, stranger, civilization-scale, still anchored to their real thing.\n"
    "ALREADY HAPPENED (the receipt): one sentence, max 180 characters, past tense, recapping what the episode showed when it "
    "aired: a NAMED Simpsons character doing, beat for beat, the exact thing this person later did in one specific real post. "
    "Don't restate the post; the evidence quote is the receipt. \"evidence\" must be a verbatim excerpt (max 90 chars) copied "
    "from one of the posts given, never paraphrased."
)

EPISODE_SYSTEM = (
    "You are the head writer of a parody archive of lost episodes of THE SIMPSONS: the Fox animated series famous for "
    "predicting the future (President Trump, aired 2000; Disney buying Fox, 1998; the smartwatch, 1995; the Higgs boson mass, "
    "1998; Lady Gaga's Super Bowl halftime, 2012). Each lost episode predicted a real X (Twitter) user years before they "
    "existed online. Write it as a real Simpsons episode: Springfield settings (Moe's Tavern, the Kwik-E-Mart, the nuclear "
    "plant, Springfield Elementary, Channel 6 News, the Android's Dungeon, 742 Evergreen Terrace), running gags, Kent Brockman "
    f"segments, Mr. Burns schemes. Use the actual characters by name — {CAST} — reacting to a new Springfield character who is "
    "this person.\n"
    f"{SAFETY}\n"
    f"{PROPHECY_RULES}\n"
    "Comedy style: specific, observational, deadpan, quotable, golden-era voice. Mine the posts for proper nouns, numbers, "
    "products, rivals, claims and catchphrases and build every line on them.\n"
    "Reply with ONLY a JSON object, no markdown fences, with exactly these keys:\n"
    "{\n"
    ' "title": "Simpsons-style episode title spoofing their life, 3-7 words, Title Case (puns on film/book titles welcome)",\n'
    ' "aired_date": "YYYY-MM-DD between 1996-01-01 and 2004-12-31",\n'
    ' "episode_number": <integer 1-24>,\n'
    ' "cast": ["2 to 4 real Simpsons character names who appear in the episode"],\n'
    ' "already_happened_options": [{"text": "receipt recap as specified", "evidence": "verbatim excerpt of the matching post"}, {...}] (2 options, each built on a DIFFERENT post),\n'
    ' "near_options": ["4 distinct headline prophecies for NEAR_YEAR, each on a different specific from their posts"],\n'
    ' "far_options": [{"year": <integer between FAR_MIN and FAR_MAX>, "text": "headline prophecy"}, ...] (4 options),\n'
    ' "subtitle": "one line of dialogue from the still, max 90 chars, prefixed with the speaker in caps, e.g. MR. BURNS: Excellent. Another man posting through it.",\n'
    ' "scene": "1-2 sentences describing the still. It must STAGE the already-happened moment literally, not a generic group shot: the Springfield setting, the cast members by name, and one clear visual action with props that mirrors the receipt post so the frame reads as the prediction without any text. No on-screen text.",\n'
    ' "scene_visual": "the same still described for an illustrator who has never seen the show: no character names, no show or brand names, no place names. Describe the setting and each character purely visually (e.g. a bald overweight yellow man in a white polo shirt). 1-2 sentences.",\n'
    ' "character": "visual description of the Simpsons-style version of this person: hair, glasses, facial hair, outfit, expression. Max 40 words. Use hints from bio/posts about their gear or style, otherwise invent something fitting the labels."\n'
    "}"
)

CRITIC_SYSTEM = (
    "You are the showrunner doing the final pass on a lost SIMPSONS episode script about a real X user. You get their bio, "
    "real posts and the writers' candidate lines. Pick and sharpen.\n"
    f"{SAFETY}\n"
    f"{PROPHECY_RULES}\n"
    "Score every candidate 0-10 on: (a) SPECIFIC: names their actual company/product/project/number/phrase from the posts and "
    "could not be about another user; (b) HEADLINE-SHAPED: a concrete event in the world, not a behaviour that continues; "
    "(c) SAVAGE: humiliates with precision; (d) SIMPSONS TEST. Reject anything that breaks rule 1 or 5.\n"
    "Pick the best near and far prophecy and rewrite each tighter: one sentence, max 150 chars, headline present tense, "
    "keep every specific, sharpen the twist. If no candidate scores at least 7 on both (a) and (b), write a new one from the "
    "posts that does. Pick the best already_happened option (the one whose evidence is really in the posts and whose scene "
    "mirrors it beat for beat); tighten it to max 180 chars and keep the evidence a verbatim excerpt.\n"
    'Reply with ONLY JSON: {"already_happened": "...", "evidence": "...", "coming_near": "...", "coming_far": {"year": N, "text": "..."}}'
)

BANNED_RE = re.compile(r"^(he|she|they|the character)\b|\b(will (post|tweet)|keeps?|continues?|still|every day|seventeen times)\b", re.I)

LABEL_SYSTEM = (
    "You label X (Twitter) users for a comedy app. Reply ONLY with a JSON object: "
    '{"role": "...", "vibe": "...", "obsession": "..."}. '
    "role = what they do or are (1-3 lowercase words, e.g. 'indie hacker', 'vc', 'designer'); "
    "vibe = how they behave online (1-3 lowercase words, e.g. 'chronically online', 'reply guy', 'thread poster'); "
    "obsession = the thing they can't stop posting about (1-3 lowercase words, e.g. 'ai agents', 'bitcoin', 'their startup'). "
    "Base it only on the bio and posts. Never reference race, religion, gender, sexuality, disability, health, body, age, family or identity politics."
)


async def _llm_text(model: str, system: str, user: str, max_tokens: int, effort: str | None = None) -> str:
    params = {"max_tokens": max_tokens}
    if effort:
        params.update(reasoning_effort=effort, allowed_openai_params=["reasoning_effort"])
    chat = (LlmChat(api_key=KEY, session_id=f"aa-{uuid.uuid4()}", system_message=system)
            .with_model("anthropic", model).with_params(**params))
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
    return "\n".join(f"{i + 1}. {p['text']}" for i, p in enumerate(posts[:25]))


def _profile_block(profile: dict) -> str:
    followers = profile.get("followers")
    return (f"Handle: @{profile['handle']}\nName: {profile.get('name') or profile['handle']}\n"
            f"Bio: {profile.get('bio') or '(empty)'}\nLocation: {profile.get('location') or '(unknown)'}\n"
            f"Followers: {f'{followers:,}' if isinstance(followers, int) else '(unknown)'}\n"
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


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def _verify_evidence(evidence: str, profile: dict) -> str:
    posts = [p["text"] for p in (profile.get("posts") or []) if p.get("text")]
    ev = str(evidence or "").strip().strip('"“”\'‘’')
    if not posts:
        return _clamp(ev, 110)
    nev = _norm(ev)
    if nev and any(nev in _norm(p) for p in posts):
        return _clamp(ev, 110)
    words = set(nev.split())
    best = max(posts, key=lambda p: len(words & set(_norm(p).split())) / (len(words) or 1))
    overlap = len(words & set(_norm(best).split())) / (len(words) or 1)
    logger.info("evidence not verbatim (overlap %.2f); using closest post", overlap)
    return _clamp(re.sub(r"\s+", " ", best).strip(), 110)


def _pick(options, bad=BANNED_RE):
    texts = [str((o or {}).get("text") if isinstance(o, dict) else o or "").strip() for o in (options or [])]
    texts = [t for t in texts if t]
    return next((t for t in texts if not bad.search(t)), texts[0] if texts else "")


async def _critic(draft: dict, user: str) -> dict:
    cands = {k: draft.get(k) for k in ("already_happened_options", "near_options", "far_options")}
    prompt = f"{user}\n\nWRITERS' DRAFT (title “{draft.get('title')}”, cast {draft.get('cast')}):\n{json.dumps(cands, ensure_ascii=False, indent=1)}\n\nDo the final pass now."
    raw = await asyncio.wait_for(_llm_text(TEXT_MODEL, CRITIC_SYSTEM, prompt, 900, WRITER_EFFORT), timeout=40)
    out = _json(raw)
    if not out.get("coming_near") or not (out.get("coming_far") or {}).get("text"):
        raise ValueError("critic returned incomplete lines")
    return out


async def write_episode(profile: dict, labels: dict, spice: str, found_by) -> dict:
    today = date.today()
    near, far_min, far_max = today.year + 1, today.year + 3, today.year + 7
    system = (EPISODE_SYSTEM.replace("NEAR_YEAR", str(near))
              .replace("FAR_MIN", str(far_min)).replace("FAR_MAX", str(far_max)))
    user = (f"Today is {today.isoformat()}. Near prophecy year: {near}. Far prophecy years: {far_min}-{far_max}.\n"
            f"Labels (confirmed by the person who submitted this): role = {labels['role']}; vibe = {labels['vibe']}; "
            f"obsession = {labels['obsession']}.\n"
            + (f"Submitted by @{found_by} who wants to destroy their friend.\n" if found_by else "Submitted by the person themselves.\n")
            + _profile_block(profile))
    data, raw = None, ""
    for attempt, model in enumerate((TEXT_MODEL, TEXT_MODEL, LABEL_MODEL), start=1):
        try:
            raw = await asyncio.wait_for(_llm_text(model, system, user + "\nWrite the episode JSON now.", 3000,
                                                   WRITER_EFFORT if model == TEXT_MODEL else None), timeout=60)
            data = _json(raw)
            if not data.get("near_options") or not data.get("far_options") or not data.get("already_happened_options"):
                raise ValueError("missing candidate lists")
            break
        except Exception as e:
            logger.warning("episode write attempt %d via %s failed: %s | raw=%r", attempt, model, e, (raw or "")[:300])
            data = None
    if data is None:
        raise RuntimeError("episode writer returned no usable JSON after 3 attempts")

    ah_opts = [o for o in (data.get("already_happened_options") or []) if isinstance(o, dict)]
    final = {"already_happened": _pick(ah_opts, re.compile(r"$^")), "evidence": (ah_opts[0] if ah_opts else {}).get("evidence", ""),
             "coming_near": _pick(data.get("near_options")), "coming_far": {}}
    far_first = next((o for o in (data.get("far_options") or []) if isinstance(o, dict) and not BANNED_RE.search(str(o.get("text", "")))),
                     (data.get("far_options") or [{}])[0])
    final["coming_far"] = far_first if isinstance(far_first, dict) else {"text": str(far_first)}
    try:
        final = await _critic(data, user)
        logger.info("critic pass applied")
    except Exception as e:
        logger.warning("critic pass failed, using first clean candidates: %s", e)

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

    cf = final.get("coming_far") or {}
    cn_text = final.get("coming_near")
    cn_text = cn_text.get("text") if isinstance(cn_text, dict) else cn_text
    cast = [str(c).strip()[:40] for c in (data.get("cast") or []) if str(c).strip()][:4]
    return {
        "title": _clamp(data.get("title") or "The One Nobody Saw Coming", 70),
        "season": aired.year - 1989,
        "episode": ep_num,
        "aired_date": aired.isoformat(),
        "aired_year": aired.year,
        "cast": cast,
        "already_happened": _clamp(final.get("already_happened"), 220),
        "evidence": _verify_evidence(final.get("evidence"), profile),
        "coming_near": {"year": near, "text": _clamp(cn_text, 170)},
        "coming_far": {"year": year_of(cf, far_min + 2, far_min, far_max), "text": _clamp(cf.get("text"), 170)},
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

    osd = _font("VT323-Regular.ttf", 44)
    aired = datetime.strptime(ep["aired_date"], "%Y-%m-%d").strftime("%m.%d.%Y")
    _shadow(d, (36, 22), f"THE SIMPSONS  S{ep['season']:02d}E{ep['episode']:02d}", osd, YELLOW)
    _shadow(d, (36, 64), f"AIRED {aired}", osd, WHITE)
    d.ellipse([W - 156, 36, W - 136, 56], fill=(239, 68, 68, 255))
    _shadow(d, (W - 122, 22), "PLAY", osd, WHITE)

    sub_font = _font("Outfit-Regular.ttf", 40)
    speaker, _, line = ep["subtitle"].partition(": ")
    if not line:
        speaker, line = "", ep["subtitle"]
    lines = _wrap(d, line.strip(), sub_font, W - 160)[:2]
    line_h, bottom_h = 50, 58
    bar_h = 28 + line_h * len(lines) + (40 if speaker else 0)
    d.rectangle([0, H - bottom_h - bar_h, W, H - bottom_h], fill=(0, 0, 0, 236))
    y = H - bottom_h - bar_h + 14
    if speaker:
        sp_font = _font("VT323-Regular.ttf", 38)
        w = d.textlength(speaker.upper(), font=sp_font)
        _shadow(d, ((W - w) / 2, y), speaker.upper(), sp_font, YELLOW)
        y += 40
    for ln in lines:
        w = d.textlength(ln, font=sub_font)
        _shadow(d, ((W - w) / 2, y), ln, sub_font, WHITE)
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


async def render_card_for_episode(ep: dict, avatar: bytes | None) -> tuple:
    still, used_ref = await generate_still(ep, avatar)
    card = await asyncio.to_thread(compose_card, ep, still)
    kind = "likeness" if still and used_ref else ("generic" if still else "missing")
    return card, kind


SW = 1080
INK = (7, 11, 20)
GREY = (148, 163, 184)
SLATE = (203, 213, 225)
TAPE = (250, 204, 21)


def _circle_avatar(avatar: bytes | None, handle: str, size: int) -> Image.Image:
    if avatar:
        try:
            img = _cover(Image.open(io.BytesIO(avatar)).convert("RGB"), size, size)
        except Exception:
            img = None
    else:
        img = None
    if img is None:
        img = Image.new("RGB", (size, size), TAPE)
        d = ImageDraw.Draw(img)
        f = _font("BebasNeue-Regular.ttf", int(size * 0.7))
        ch = (handle[:1] or "?").upper()
        w = d.textlength(ch, font=f)
        d.text(((size - w) / 2, size * 0.1), ch, font=f, fill=INK)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    img.putalpha(mask.resize((size, size), Image.LANCZOS))
    return img


def _block(d, x, y, label, text, font, label_font, max_w, max_lines, accent):
    lines = _wrap(d, text, font, max_w)[:max_lines]
    block_h = 32 + 32 * len(lines)
    d.rectangle([x, y + 4, x + 3, y + block_h], fill=TAPE if accent else (71, 85, 105))
    d.text((x + 18, y), label, font=label_font, fill=TAPE if accent else SLATE)
    y += 32
    for ln in lines:
        d.text((x + 18, y), ln, font=font, fill=(241, 245, 249))
        y += 32
    return y


def compose_share_card(ep: dict, card16: bytes, site_host: str, avatar: bytes | None = None) -> bytes:
    top_h = round(SW * 9 / 16)
    canvas = Image.new("RGB", (SW, 2000), INK)
    canvas.paste(Image.open(io.BytesIO(card16)).convert("RGB").resize((SW, top_h), Image.LANCZOS), (0, 0))
    d = ImageDraw.Draw(canvas)
    x, y = 44, top_h + 28
    max_w = SW - 2 * x

    d.text((x, y), "THE SIMPSONS PREDICTED", font=_font("BebasNeue-Regular.ttf", 44), fill=(248, 250, 252))
    y += 44
    d.text((x - 2, y - 6), f"@{ep['handle'].upper()}", font=_font("BebasNeue-Regular.ttf", 100), fill=TAPE)
    y += 96
    osd = _font("VT323-Regular.ttf", 28)
    aired = datetime.strptime(ep["aired_date"], "%Y-%m-%d").strftime("%b %d, %Y").upper()
    sub = f"S{ep['season']:02d}E{ep['episode']:02d}  “{ep['title']}”  ·  AIRED {aired}"
    while d.textlength(sub, font=osd) > max_w and len(sub) > 30:
        sub = sub[:-2].rstrip() + "…"
    d.text((x, y), sub, font=osd, fill=GREY)
    y += 50

    body = _font("Outfit-Regular.ttf", 25)
    label_font = _font("VT323-Regular.ttf", 30)
    y = _block(d, x, y, f"AIRED {ep['aired_year']}", ep["already_happened"], body, label_font, max_w - 70, 3, True) + 18

    now_year = datetime.now().year
    d.rectangle([x, y + 4, x + 3, y + 32], fill=(71, 85, 105))
    d.text((x + 18, y), f"CAME TRUE {now_year}", font=label_font, fill=SLATE)
    y += 40
    receipt = ep.get("evidence") or ep["already_happened"]
    r_lines = _wrap(d, receipt, body, max_w - 40)[:3]
    box_h = 76 + 32 * len(r_lines) + 14
    d.rounded_rectangle([x, y, x + max_w, y + box_h], radius=14, fill=(15, 23, 42), outline=(51, 65, 85), width=2)
    av = _circle_avatar(avatar, ep["handle"], 52)
    canvas.paste(av, (x + 16, y + 14), av)
    name = _clamp(ep.get("display_name") or ep["handle"], 28)
    d.text((x + 82, y + 12), name, font=_font("Outfit-Regular.ttf", 26), fill=(248, 250, 252))
    d.text((x + 82, y + 42), f"@{ep['handle']}", font=osd, fill=GREY)
    ry = y + 76
    for ln in r_lines:
        d.text((x + 18, ry), ln, font=body, fill=(241, 245, 249))
        ry += 32
    y += box_h + 26

    d.line([(x, y), (SW - x, y)], fill=(51, 65, 85), width=1)
    y += 20
    for block in (ep["coming_near"], ep["coming_far"]):
        y = _block(d, x, y, f"COMING {block['year']}", block["text"], body, label_font, max_w - 70, 3, False) + 16

    total_h = max(1350, y + 64)
    d.line([(x, total_h - 60), (SW - x, total_h - 60)], fill=TAPE, width=1)
    d.text((x, total_h - 48), f"@{ep['handle']}", font=osd, fill=(248, 250, 252))
    brand_font = _font("BebasNeue-Regular.ttf", 30)
    bw = d.textlength("ALREADY AIRED", font=brand_font)
    d.text((SW - x - bw, total_h - 50), "ALREADY AIRED", font=brand_font, fill=TAPE)
    mid = f"FIND YOURS · {site_host}"
    mw = d.textlength(mid, font=osd)
    if mw < SW - 2 * x - bw - 220:
        d.text(((SW - mw) / 2, total_h - 48), mid, font=osd, fill=GREY)

    out = canvas.crop((0, 0, SW, total_h))
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=88, optimize=True)
    return buf.getvalue()

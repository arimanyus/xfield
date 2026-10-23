"""Rooftop billboards written from a person's own posts, in three tones."""
import asyncio
import json
import os
import re
import uuid

from emergentintegrations.llm.chat import LlmChat, UserMessage

from safety import contains_blocked

TONES = ("pun", "roast", "kind")
FALLBACK = {"pun": "NOW SERVING FRESH HOT TAKES", "roast": "POSTS FIRST. THINKS LATER.", "kind": "GOOD NEIGHBOUR. GREAT TIMELINE."}
SYSTEM = (
    "You write rooftop billboards for buildings in XField, a city-builder on X: short lines in capital letters "
    "on a lit marquee. Read the person's bio and recent posts and write three billboards about what they actually "
    "post and care about:\n"
    "- pun: a cheeky pun or wordplay\n"
    "- roast: a savage but playful roast of their takes, habits or posting style. Never about looks, age, race, "
    "gender, sexuality, religion, health, disability, family or tragedy. No slurs, no profanity, nothing sexual.\n"
    "- kind: a warm, wholesome one-liner about them\n"
    "Each sign max 8 words and max 44 characters, ALL CAPS, no hashtags, no emojis, no @handles, no quotes, no names "
    "of other real people. Reply with JSON only: {\"pun\": \"...\", \"roast\": \"...\", \"kind\": \"...\"}"
)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9 ,.!?'&:\-$%]", "", s)).strip().upper()


async def write_signs(name: str, bio: str, posts: list) -> dict:
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"sign-{uuid.uuid4()}",
                   system_message=SYSTEM).with_model("anthropic", os.environ["TEXT_MODEL"])
    prompt = f"Name: {name}\nBio: {bio}\nRecent posts:\n" + "\n".join(f"- {p[:220]}" for p in posts[:18])
    raw = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=45)
    m = re.search(r"\{.*\}", raw, re.S)
    out = json.loads(m.group(0)) if m else {}
    signs = {}
    for tone in TONES:
        s = _clean(str(out.get(tone) or ""))
        signs[tone] = s if s and len(s) <= 52 and not contains_blocked(s) else FALLBACK[tone]
    return signs

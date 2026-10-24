"""The XField Ledger: a short daily paper about the city, written only from what happened inside it."""
import asyncio
import json
import os
import re
import uuid

from emergentintegrations.llm.chat import LlmChat, UserMessage

from safety import contains_blocked

SYSTEM = (
    "You write The XField Ledger, the daily paper of XField: a city where every house competes for votes. Houses start "
    "on the Docks and move uptown when they win enough votes. From today's facts write a short front page in the voice "
    "of a cheerful small-town paper: a headline and 2 to 5 stories. Lead with whoever moved uptown, then the biggest "
    "climbers and houses reaching the top ten, then new arrivals and districts. Celebrate wins only: never mention a "
    "house losing points, dropping or going back to the Docks by name. You know nothing about anyone outside the "
    "city, so never guess what people do, post or like. Only use the facts given: never invent numbers or events. "
    "Refer to people by @handle. Headline max 70 characters. Each story: a title max 60 characters, a body of one or "
    "two sentences max 220 characters, and the handles it is about. "
    "Reply with JSON only: {\"headline\": \"...\", \"stories\": [{\"title\": \"...\", \"body\": \"...\", \"handles\": [\"...\"]}]}"
)


def _fits(raw, limit: int):
    s = re.sub(r"\s+", " ", raw).strip() if isinstance(raw, str) else ""
    return s if s and len(s) <= limit and not contains_blocked(s) else None


async def write_paper(facts: str, people: dict) -> dict:
    """people maps a lowercase handle to its person."""
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"paper-{uuid.uuid4()}",
                   system_message=SYSTEM).with_model("anthropic", os.environ["TEXT_MODEL"])
    raw = await asyncio.wait_for(chat.send_message(UserMessage(text=facts)), timeout=90)
    m = re.search(r"\{.*\}", raw, re.S)
    out = json.loads(m.group(0)) if m else {}
    stories = []
    for s in (out.get("stories") or [])[:5]:
        if not isinstance(s, dict):
            continue
        title, body = _fits(s.get("title"), 80), _fits(s.get("body"), 300)
        ks = [str(h).lstrip("@").lower() for h in s.get("handles") or []]
        if title and body:
            stories.append({"title": title, "body": body, "people": [people[k] for k in dict.fromkeys(ks) if k in people][:4]})
    headline = _fits(out.get("headline"), 90)
    if not headline or not stories:
        raise ValueError("the paper came back empty")
    return {"headline": headline, "stories": stories, "quotes": []}

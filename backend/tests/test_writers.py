"""The paper only keeps what it was given. The model is faked; no server or key needed."""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("EMERGENT_LLM_KEY", "test")
os.environ.setdefault("TEXT_MODEL", "test")

import paper  # noqa: E402


def fake_model(module, reply: dict):
    class Chat:
        def __init__(self, **_):
            pass

        def with_model(self, *_):
            return self

        async def send_message(self, _):
            return "Sure! " + json.dumps(reply)

    module.LlmChat = Chat


def test_the_paper_only_names_real_people():
    fake_model(paper, {"headline": "Ada moves uptown", "stories": [
        {"title": "Uptown", "body": "@ada made it.", "handles": ["@Ada", "ghost", "ada"]},
        {"title": "No body"}, "not a story"]})
    ada = {"k": "ada", "h": "Ada", "a": None}
    out = asyncio.run(paper.write_paper("facts", {"ada": ada}))
    assert out == {"headline": "Ada moves uptown", "stories": [{"title": "Uptown", "body": "@ada made it.", "people": [ada]}],
                   "quotes": []}

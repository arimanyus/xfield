"""Publishes a fresh XField Ledger right now (the cron does this every morning). Run: cd /app/backend && python tests/publish_paper_now.py"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import server  # noqa: E402


async def main():
    await server.publish_paper(force=True)
    p = await server.db.papers.find_one({}, {"_id": 0, "issue": 1, "headline": 1, "stories": 1, "towers": 1, "numbers": 1},
                                        sort=[("issue", -1)])
    print(p["issue"], p["headline"])
    for s in p["stories"]:
        print(" -", s["title"], "|", s["body"])
    print("towers", [(t["h"], t["size"], t["area"], t["grew"]) for t in p["towers"]])
    print("numbers", p["numbers"])


asyncio.run(main())

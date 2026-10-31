"""Sample residents' faces, saved once into the frontend's public folder so the city doesn't hit DiceBear's rate limit.
Run: cd /app/backend && python tests/sample_faces.py"""
import asyncio
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import server  # noqa: E402

OUT = Path("/app/frontend/public/sample-faces")
SITE = next(line.split("=", 1)[1].strip() for line in open("/app/frontend/.env") if line.startswith("REACT_APP_BACKEND_URL="))


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    docs = await server.db.residents.find({"sample": True}, {"_id": 0, "k": 1}).to_list(None)
    async with httpx.AsyncClient(timeout=20) as c:
        for d in docs:
            path = OUT / f"{d['k']}.png"
            for attempt in range(6):
                if path.exists():
                    break
                try:
                    r = await c.get(f"https://api.dicebear.com/9.x/notionists/png?seed={d['k']}&backgroundColor=dbeafe&size=160")
                except httpx.HTTPError:
                    r = None
                if r is not None and r.status_code == 200:
                    path.write_bytes(r.content)
                    await asyncio.sleep(0.4)
                else:
                    await asyncio.sleep(3 * (attempt + 1))
            if path.exists():
                await server.db.residents.update_one({"k": d["k"]}, {"$set": {"avatar_url": f"{SITE}/sample-faces/{d['k']}.png"}})
    await server.bump()
    print("faces", len(list(OUT.glob("*.png"))), "of", len(docs))


asyncio.run(main())

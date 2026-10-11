import asyncio, json, os, sys, time
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")
from motor.motor_asyncio import AsyncIOMotorClient
from generator import write_episode


async def main(handle):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    prof = await db.profiles.find_one({"handle_lower": handle.lower()}, {"_id": 0})
    if not prof:
        print("no cached profile"); return
    prof = prof["data"]
    print("posts:", len(prof.get("posts") or []), "followers:", prof.get("followers"))
    t = time.time()
    ep = await write_episode(prof, {"role": "founder", "vibe": "chronically online", "obsession": "shipping"}, "savage", None)
    print(f"{time.time()-t:.1f}s")
    for k in ("title", "cast", "already_happened", "evidence", "coming_near", "coming_far", "subtitle"):
        print(f"{k}: {json.dumps(ep[k], ensure_ascii=False)}")

asyncio.run(main(sys.argv[1]))

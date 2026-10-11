import asyncio, os, sys
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")
import server  # noqa: E402
from generator import compose_share_card, fetch_avatar  # noqa: E402


async def main(host, handles):
    q = {"image_status": "ready", "hidden": False}
    if handles:
        q["handle_lower"] = {"$in": handles}
    async for ep in server.db.episodes.find(q, {"_id": 0}):
        try:
            card = (await server._serve_image(ep["image_store"], ep["image_path"], f"{ep['id']}.jpg")).body
            avatar = await fetch_avatar(ep.get("avatar_url"))
            share = compose_share_card(ep, card, host, avatar)
            card_path = f"{server.storage.APP_NAME}/cards/{ep['id']}-share.jpg"
            card_store = await server._store(card_path, share, f"{ep['id']}-share.jpg")
            await server.db.episodes.update_one({"id": ep["id"]}, {"$set": {"card_path": card_path, "card_store": card_store}})
            print("re-rendered", ep["id"], ep["handle"], len(share))
        except Exception as e:
            print("FAILED", ep["id"], e)

asyncio.run(main(sys.argv[1], [h.lower() for h in sys.argv[2:]]))

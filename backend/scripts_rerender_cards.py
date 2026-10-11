import asyncio, os, sys
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")
import server  # noqa: E402
from generator import compose_share_card, fetch_avatar, refresh_subtitle, shorten_aired, shorten_prophecy  # noqa: E402


async def main(host, handles):
    q = {"image_status": "ready", "hidden": False}
    if handles:
        q["handle_lower"] = {"$in": handles}
    async for ep in server.db.episodes.find(q, {"_id": 0}):
        try:
            if not ep.get("aired_short"):
                ep["aired_short"] = await shorten_aired(ep["already_happened"])
            for key in ("coming_near", "coming_far"):
                if not ep.get(f"{key}_short"):
                    ep[f"{key}_short"] = await shorten_prophecy(ep[key]["text"])
            card = refresh_subtitle((await server._serve_image(ep["image_store"], ep["image_path"], f"{ep['id']}.jpg")).body, ep)
            avatar = await fetch_avatar(ep.get("avatar_url"))
            share = compose_share_card(ep, card, host, avatar)
            path = f"{server.storage.APP_NAME}/cards/{ep['id']}.jpg"
            card_path = f"{server.storage.APP_NAME}/cards/{ep['id']}-share.jpg"
            store = await server._store(path, card, f"{ep['id']}.jpg")
            card_store = await server._store(card_path, share, f"{ep['id']}-share.jpg")
            await server.db.episodes.update_one({"id": ep["id"]}, {"$set": {
                "aired_short": ep["aired_short"], "coming_near_short": ep["coming_near_short"],
                "coming_far_short": ep["coming_far_short"], "image_path": path, "image_store": store,
                "card_path": card_path, "card_store": card_store}})
            print("re-rendered", ep["id"], ep["handle"], "|", ep["coming_near_short"], "|", ep["coming_far_short"])
        except Exception as e:
            print("FAILED", ep["id"], e)

asyncio.run(main(sys.argv[1], [h.lower() for h in sys.argv[2:]]))

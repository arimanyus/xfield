"""1200x630 link-preview card for a mansion on Millionaires' Row: the holder's face on a grand house, their rank this
week, their points and how long the keys are theirs."""
import io
from datetime import datetime

from PIL import Image, ImageDraw

from share_card import PAD, PX0, PX1, PY0, PY1, SOFT, W, H, _clip, _face, _fitw, _pill, _sky, sheet
from town_card import BODY, BRAND, DISPLAY, INK, LIT, _font, _shade

GOLD = (212, 167, 44)
SILVER = (203, 213, 225)
NAVY = (30, 58, 138)
LAWN = (134, 201, 110)
HEDGE = (63, 143, 58)
MARBLE = (245, 242, 236)
CREAM = (241, 230, 210)
POOL = (56, 189, 248)
WINDOW = (156, 199, 234)


def trim_of(rank: int) -> tuple:
    return GOLD if rank == 1 else SILVER if rank == 2 else NAVY


def _mansion(img, d, data, avatars):
    """A front view of the house: lawn and hedges, a columned porch, wings either side, the roof in its trim colour."""
    rank, trim = data["rank"], trim_of(data["rank"])
    d.rectangle([0, 470, 640, H], fill=LAWN)
    d.rectangle([40, 456, 600, 478], fill=HEDGE, outline=INK, width=3)
    d.polygon([(250, H), (390, H), (352, 478), (288, 478)], fill=MARBLE, outline=INK)
    d.rounded_rectangle([420, 520, 590, 580], radius=10, fill=POOL, outline=INK, width=3)
    grand = rank <= 2
    for x0, x1 in ((70, 210), (430, 570)) if grand else ((110, 220),):
        d.rectangle([x0, 300, x1, 456], fill=CREAM, outline=INK, width=3)
        d.polygon([(x0 - 10, 300), (x1 + 10, 300), ((x0 + x1) / 2, 248)], fill=trim, outline=INK)
        for wx in range(x0 + 20, x1 - 30, 46):
            for wy in (326, 388):
                d.rectangle([wx, wy, wx + 26, wy + 40], fill=WINDOW, outline=INK, width=2)
    d.rectangle([200, 230, 440, 456], fill=MARBLE, outline=INK, width=4)
    d.polygon([(186, 230), (454, 230), (320, 150)], fill=trim, outline=INK)
    d.rectangle([186, 222, 454, 236], fill=trim, outline=INK, width=3)
    for cx in range(222, 430, 40):
        d.rectangle([cx, 300, cx + 14, 456], fill=(255, 255, 255), outline=INK, width=2)
    d.rectangle([296, 386, 344, 456], fill=_shade(trim, 0.7), outline=INK, width=3)
    for wy in (540, 560):
        d.arc([440, wy - 8, 500, wy + 8], 200, 340, fill=(255, 255, 255), width=3)
        d.arc([505, wy - 8, 565, wy + 8], 200, 340, fill=(255, 255, 255), width=3)
    _face(img, avatars.get(data["k"]), 262, 214 - 116, 116, LIT)
    flag, f = f"#{rank}", _font(DISPLAY, 36, True)
    tw = d.textlength(flag, font=f)
    d.line([(34, 120), (34, 456)], fill=INK, width=5)
    d.polygon([(36, 126), (52 + tw, 126), (52 + tw, 180), (36, 180)], fill=trim, outline=INK)
    d.text((44, 153), flag, font=f, fill=INK if rank <= 2 else (255, 255, 255), anchor="lm")


def _until(iso: str) -> str:
    try:
        t = datetime.fromisoformat(iso)
    except (TypeError, ValueError):
        return "next Monday"
    return f"{t:%a %b} {t.day}, {t.hour}:00 UTC"


def _panel(img, data, avatars):
    d = sheet(img)
    x0, w, y = PX0 + PAD, PX1 - PX0 - 2 * PAD, PY0 + PAD
    _pill(d, x0, y, "XFIELD \u00b7 MILLIONAIRES' ROW", _font(BODY, 17, True), INK, (255, 255, 255), pad=14, h=34)
    y += 52
    name = data.get("name") or data["h"]
    f = _fitw(d, name, DISPLAY, w, 44, low=26)
    d.text((x0, y), _clip(d, name, f, w), font=f, fill=INK)
    y += 56
    handle = f"@{data['h']}"
    f = _fitw(d, handle, BODY, w, 28, low=16)
    d.text((x0, y), _clip(d, handle, f, w), font=f, fill=_shade(BRAND, 0.6))
    y += 52
    d.rounded_rectangle([x0, y, x0 + w, y + 104], radius=20, fill=SOFT, outline=INK, width=3)
    big = f"#{data['rank']}"
    bf = _font(DISPLAY, 76, True)
    bb = d.textbbox((0, 0), big, font=bf)
    d.text((x0 + 24, y + (104 - (bb[3] - bb[1])) / 2 - bb[1]), big, font=bf, fill=INK)
    rx = x0 + 48 + (bb[2] - bb[0])
    d.text((rx, y + 18), "this week", font=_fitw(d, "this week", BODY, x0 + w - rx - 16, 30), fill=INK)
    pts = f"{data['score']:,} points on the ladder"
    d.text((rx, y + 58), pts, font=_fitw(d, pts, BODY, x0 + w - rx - 16, 22, False), fill=_shade(INK, 2.2))
    y += 126
    line = "Mansion holder until"
    d.text((x0, y), line, font=_font(BODY, 22, False), fill=_shade(INK, 2.2))
    when = _until(data.get("until"))
    d.text((x0, y + 30), when, font=_fitw(d, when, DISPLAY, w, 32, low=20), fill=INK)
    cta = "MOVE IN NEXT TO ME \u2192"
    _pill(d, x0, PY1 - PAD - 52, cta, _fitw(d, cta, BODY, w - 44, 26), BRAND, INK, h=52)


def render_mansion(data: dict, avatars: dict) -> bytes:
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    _sky(d)
    _mansion(img, d, data, avatars)
    _panel(img, data, avatars)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()

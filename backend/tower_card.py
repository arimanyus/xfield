"""1200x630 link-preview card for a building that grew floors: everyone who lives in it, ground to roof, and how it
ranks among the city's tallest. Patched together on the Docks, glass and steel uptown."""
import io
import random

from PIL import Image, ImageDraw, ImageOps

from share_card import PAD, PX0, PX1, PY0, PY1, QUAY, RUST, SEA, SOFT, TIN, W, H, _clip, _face, _fitw, _pill, _sky, sheet
from town_card import BODY, BRAND, DARK, DISPLAY, GLASS, INK, LIT, NEUTRAL, WALLS, _font, _shade, rgb

CX, BASE_Y, TOP_Y = 322, 560, 56
LAWN = (134, 197, 108)
ROOF_GARDEN = (93, 181, 82)
PLY = (163, 139, 99)
DOCK_WALLS = [TIN, RUST, PLY, (201, 195, 180)]
STEEL = (46, 52, 64)
WHERE = {"docks": "on the Docks", "uptown": "uptown", "dark": "in the city"}


def _disc(avatar, size, ring, grey=False):
    """A round face with a thin ring, small enough for one floor."""
    try:
        face = Image.open(io.BytesIO(avatar)).convert("RGB") if avatar else None
    except Exception:
        face = None
    face = ImageOps.fit(face, (size, size)) if face else Image.new("RGB", (size, size), (191, 219, 254))
    if grey:
        face = ImageOps.grayscale(face).convert("RGB")
    out = Image.new("RGBA", (size + 8, size + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.ellipse([0, 0, size + 7, size + 7], fill=INK)
    d.ellipse([2, 2, size + 5, size + 5], fill=ring)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out.paste(face, (4, 4), mask)
    return out


def _quad(d, cx, y0, y1, w, tilt, fill, width=3):
    """A floor seen from the front, leaning a little when it's propped up crooked."""
    lean = tilt * (y1 - y0)
    pts = [(cx - w / 2 + lean, y0), (cx + w / 2 + lean, y0), (cx + w / 2, y1), (cx - w / 2, y1)]
    d.polygon(pts, fill=fill, outline=INK, width=width)
    return pts


def _ground(d, docks):
    if docks:
        d.rectangle([0, BASE_Y + 22, 640, H], fill=SEA)
        d.rectangle([40, BASE_Y, 604, BASE_Y + 26], fill=QUAY, outline=INK, width=3)
        for x in range(60, 600, 46):
            d.line([(x, BASE_Y + 4), (x, BASE_Y + 22)], fill=_shade(QUAY, 0.8), width=2)
    else:
        d.rectangle([40, BASE_Y, 604, H], fill=LAWN, outline=INK, width=3)
        for x in (90, 554):
            d.ellipse([x - 26, BASE_Y - 46, x + 26, BASE_Y + 6], fill=ROOF_GARDEN, outline=INK, width=3)


def _floor_label(img, d, p, avatars, pts, fh, n):
    """Face and handle on a floor, and its floor number on the side."""
    (x0, y0), (x1, _), _, (x3, y1) = pts
    size = int(max(18, min(54, fh - 14)))
    lit = p["s"] == "f"
    disc = _disc(avatars.get(p["k"]), size, LIT if lit else NEUTRAL, grey=not lit)
    left = int(max(x0, x3) + 12)
    img.paste(disc, (left, int((y0 + y1) / 2 - disc.height / 2)), disc)
    tx = left + disc.width + 10
    room = min(x1, pts[2][0]) - tx - 46
    text = f"@{p['h']}" if lit else f"@{p['h']} \u00b7 dark"
    f = _fitw(d, text, BODY, room, int(max(13, min(24, fh * 0.42))), low=11)
    d.text((tx, (y0 + y1) / 2), _clip(d, text, f, room), font=f, fill=INK if lit else (241, 245, 249), anchor="lm")
    tag = _font(BODY, int(max(11, min(16, fh * 0.3))), True)
    d.text((min(x1, pts[2][0]) - 12, (y0 + y1) / 2), f"F{n}", font=tag, fill=_shade(INK, 2.4) if lit else (203, 213, 225), anchor="rm")


def _building(img, d, data, avatars):
    docks = data["area"] == "docks"
    rng = random.Random(data["k"])
    floors = data["floors"]
    ground_h = 96
    cap = 34
    fh = min(74, (BASE_Y - ground_h - TOP_Y - cap) / max(1, len(floors) - 1))
    _ground(d, docks)
    owner = floors[0]
    lit = owner["s"] == "f"
    wall = DARK if not lit else TIN if docks else WALLS[rng.randrange(len(WALLS))]
    pts = _quad(d, CX, BASE_Y - ground_h, BASE_Y, 330, 0, wall, 4)
    d.rectangle([pts[3][0] + 6, BASE_Y - 10, pts[2][0] - 6, BASE_Y - 4], fill=_shade(wall, 0.7))
    if not docks and lit:
        d.rectangle([pts[0][0] - 8, pts[0][1] - 8, pts[1][0] + 8, pts[0][1]], fill=rgb(data.get("color"), BRAND), outline=INK, width=3)
    _floor_label(img, d, owner, avatars, pts, ground_h - 30, 1)
    y = BASE_Y - ground_h
    for i, p in enumerate(floors[1:], start=2):
        off = p["s"] != "f"
        if docks:
            w, tilt, dx = rng.uniform(270, 320), rng.uniform(-0.12, 0.12), rng.uniform(-14, 14)
            fill = DARK if off else DOCK_WALLS[rng.randrange(len(DOCK_WALLS))]
        else:
            w, tilt, dx, fill = 316, 0, 0, DARK if off else GLASS
        pts = _quad(d, CX + dx, y - fh, y, w, tilt, fill)
        if not docks:
            for fx in (pts[3][0] + 4, pts[2][0] - 4):
                d.line([(fx, y - fh + 2), (fx, y - 2)], fill=STEEL, width=5)
            d.line([(pts[0][0], y - fh + 3), (pts[1][0], y - fh + 3)], fill=STEEL, width=4)
        elif rng.random() < 0.5:
            lx = pts[2][0] + 6
            d.line([(lx, y - fh), (lx, y)], fill=INK, width=2)
            for k in range(1, 4):
                d.line([(lx - 6, y - fh * k / 4), (lx + 6, y - fh * k / 4)], fill=INK, width=2)
        _floor_label(img, d, p, avatars, pts, fh, i)
        y -= fh
    if docks:
        d.polygon([(CX - 130, y), (CX + 130, y), (CX + 60, y - cap), (CX - 70, y - cap)], fill=(62, 111, 163), outline=INK, width=3)
        d.line([(CX + 90, y), (CX + 90, y - cap - 28)], fill=INK, width=3)
        d.line([(CX + 76, y - cap - 20), (CX + 104, y - cap - 20)], fill=INK, width=3)
    else:
        d.rectangle([CX - 166, y - 14, CX + 166, y], fill=(251, 248, 243), outline=INK, width=3)
        d.rectangle([CX - 150, y - 22, CX + 150, y - 14], fill=ROOF_GARDEN, outline=INK, width=2)
        for tx in (CX - 110, CX + 96):
            d.ellipse([tx - 18, y - 52, tx + 18, y - 16], fill=ROOF_GARDEN, outline=INK, width=3)


def _panel(img, data, avatars):
    d = sheet(img)
    x0, w, y = PX0 + PAD, PX1 - PX0 - 2 * PAD, PY0 + PAD
    _face(img, avatars.get(data["k"]), x0, y, 120, LIT if data["floors"][0]["s"] == "f" else NEUTRAL, grey=data["floors"][0]["s"] != "f")
    tx, tw = x0 + 138, w - 138
    kind = {"docks": "DOCKS STACK", "uptown": "UPTOWN TOWER"}.get(data["area"], "DARK BUILDING")
    _pill(d, tx, y + 4, f"XFIELD \u00b7 {kind}", _font(BODY, 17, True), INK, (255, 255, 255), pad=14, h=34)
    name = f"@{data['h']}'s building"
    f = _fitw(d, name, DISPLAY, tw, 36, low=22)
    d.text((tx, y + 48), _clip(d, name, f, tw), font=f, fill=INK)
    where = WHERE[data["area"]]
    d.text((tx, y + 92), where, font=_font(BODY, 22, False), fill=_shade(INK, 2.2))
    y += 140
    head = f"{data['size']} floors tall"
    d.text((x0, y), head, font=_fitw(d, head, DISPLAY, w, 48, low=28), fill=INK)
    y += 64
    d.rounded_rectangle([x0, y, x0 + w, y + 84], radius=18, fill=SOFT, outline=INK, width=3)
    big = f"#{data['rank']}" if data.get("rank") else "\u2013"
    bf = _font(DISPLAY, 60, True)
    bb = d.textbbox((0, 0), big, font=bf)
    d.text((x0 + 22, y + (84 - (bb[3] - bb[1])) / 2 - bb[1]), big, font=bf, fill=INK)
    rx = x0 + 44 + (bb[2] - bb[0])
    line = f"tallest of {data['of']} {'building' if data['of'] == 1 else 'buildings'}"
    d.text((rx, y + 14), line, font=_fitw(d, line, BODY, x0 + w - rx - 16, 24), fill=INK)
    lit = sum(p["s"] == "f" for p in data["floors"])
    sub = f"{lit} lit \u00b7 {data['size'] - lit} dark" if lit < data["size"] else "every floor lit"
    d.text((rx, y + 46), sub, font=_fitw(d, sub, BODY, x0 + w - rx - 16, 22, False), fill=_shade(INK, 2.2))
    y += 102
    above = data["floors"][1:][::-1]
    d.text((x0, y), f"LIVING ABOVE @{data['h'].upper()}" if len(data["h"]) < 12 else "LIVING ABOVE ME",
           font=_font(BODY, 17, True), fill=_shade(INK, 2.4))
    y += 28
    shown, size = above[:6], 56
    for i, p in enumerate(shown):
        _face(img, avatars.get(p["k"]), x0 + i * (size + 12), y, size, LIT if p["s"] == "f" else NEUTRAL, grey=p["s"] != "f")
    if len(above) > len(shown):
        d.text((x0 + len(shown) * (size + 12) + 4, y + size / 2), f"+{len(above) - len(shown)}", font=_font(BODY, 26, True),
               fill=INK, anchor="lm")
    cta = "MOVE IN ON TOP \u2192"
    _pill(d, x0, PY1 - PAD - 52, cta, _fitw(d, cta, BODY, w - 44, 26), BRAND, INK, h=52)


def render_tower(data: dict, avatars: dict) -> bytes:
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    _sky(d)
    _building(img, d, data, avatars)
    _panel(img, data, avatars)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()

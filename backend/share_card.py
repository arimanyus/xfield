"""1200x630 link-preview card for a house, telling the moment it's in: just moved in, up for votes, uptown, or dark."""
import io

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from town import djb2
from town_card import BODY, BRAND, DARK, DISPLAY, INK, LIT, NEUTRAL, WALLS, _circle, _font, _shade, _wrap, rgb

W, H = 1200, 630
TW, TH = 150, 75
CX, CY = 330, 400
SEA = (96, 165, 221)
QUAY = (176, 184, 194)
LAWN = (134, 197, 108)
TIN = (148, 163, 184)
RUST = (180, 102, 60)
SLOTS = [(-1, 0), (0, -1), (-1, -1), (1, -1), (-1, 1), (1, 0), (0, 1), (1, 1)]


def P(gx, gy, up=0.0):
    return (CX + (gx - gy) * TW / 2, CY + (gx + gy) * TH / 2 - up)


def _poly(d, pts, fill, w=3):
    d.polygon(pts, fill=fill, outline=INK, width=w)


def _sky(d):
    top, bot = (191, 219, 254), (248, 250, 252)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    for x in range(0, W, 50):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255), width=1)
    for y in range(0, H, 50):
        d.line([(0, y), (W, y)], fill=(255, 255, 255), width=1)


def _diamond(a):
    return [P(-a, -a), P(a, -a), P(a, a), P(-a, a)]


def _ground(d, docks):
    _poly(d, _diamond(2.35), SEA if docks else (170, 214, 140), 0)
    T, R, B, L = _diamond(1.5)
    t = 26
    _poly(d, [L, B, (B[0], B[1] + t), (L[0], L[1] + t)], (71, 85, 105))
    _poly(d, [B, R, (R[0], R[1] + t), (B[0], B[1] + t)], (100, 116, 139))
    _poly(d, [T, R, B, L], QUAY if docks else LAWN)
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            a = 0.42
            _poly(d, [P(i - a, j - a), P(i + a, j - a), P(i + a, j + a), P(i - a, j + a)],
                  _shade(QUAY, 0.92) if docks else _shade(LAWN, 1.08), 2)


def _face_quad(face, x0, x1, y0, y1, u0, u1, v0, v1):
    f = (lambda u, v: P(x0 + u * (x1 - x0), y1, v)) if face == "left" else (lambda u, v: P(x1, y1 - u * (y1 - y0), v))
    return [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)]


def _house(d, i, j, kind, key, color, scale=1.0):
    """kind: shack (Docks), home (uptown) or dark (reserved). Returns the point above the roof."""
    half = (0.3 if kind != "shack" else 0.33) * scale
    hh = (62 if kind == "shack" else 74) * scale
    x0, x1, y0, y1 = i - half, i + half, j - half, j + half
    T, R, B, L = (x0, y0), (x1, y0), (x1, y1), (x0, y1)
    wall = TIN if kind == "shack" else DARK if kind == "dark" else WALLS[djb2(key) % len(WALLS)]
    up = lambda p, v=hh: P(p[0], p[1], v)
    _poly(d, [P(*L), P(*B), up(B), up(L)], _shade(wall, 0.82))
    _poly(d, [P(*B), P(*R), up(R), up(B)], wall)
    if kind == "shack":
        for face in ("left", "right"):
            for u in (0.12, 0.24, 0.36, 0.64, 0.76, 0.88):
                q = _face_quad(face, x0, x1, y0, y1, u, u, 4, hh - 4)
                d.line([q[0], q[3]], fill=_shade(wall, 0.7), width=2)
        _poly(d, _face_quad("left", x0, x1, y0, y1, 0.42, 0.62, 0, hh * 0.62), _shade(RUST, 0.8), 2)
        _poly(d, _face_quad("right", x0, x1, y0, y1, 0.35, 0.65, hh * 0.35, hh * 0.7), LIT, 2)
        lift = 22 * scale
        _poly(d, [up(L), up(B), up(R, hh + lift), up(T, hh + lift)], RUST)
        return P(i, j, hh + lift)
    win = INK if kind == "dark" else LIT
    for face in ("left", "right"):
        for u0, u1 in ((0.15, 0.4), (0.6, 0.85)):
            _poly(d, _face_quad(face, x0, x1, y0, y1, u0, u1, hh * 0.25, hh * 0.7), win, 2)
    roof = NEUTRAL if kind == "dark" else color
    rh = 50 * scale
    ym = (y0 + y1) / 2
    r0, r1 = P(x0, ym, hh + rh), P(x1, ym, hh + rh)
    _poly(d, [up(T), up(R), r1, r0], _shade(roof, 0.78))
    _poly(d, [up(B), up(R), r1], wall)
    _poly(d, [up(L), up(B), r1, r0], roof)
    return P(i, j, hh + rh)


def _scene(img, d, data, avatars):
    docks = data["moment"] in ("join", "vote", "dark") and not data.get("uptown")
    _ground(d, docks)
    color = rgb(data.get("color"), BRAND)
    me_kind = "dark" if data["moment"] == "dark" else "shack" if docks else "home"
    items = [(0, 0, data["k"], me_kind, 1.25, True)]
    for (i, j), n in zip(SLOTS, data.get("neighbours", [])[:len(SLOTS)]):
        items.append((i, j, n["k"], "dark" if n["status"] == "reserved" else "shack" if docks else "home", 0.95, False))
    tops = []
    for i, j, key, kind, sc, mine in sorted(items, key=lambda it: (it[0] + it[1], it[0])):
        tops.append((mine, i + j, _house(d, i, j, kind, key, color, sc), key, kind))
    for mine, _, top, key, kind in sorted(tops, key=lambda t: (t[0], t[1])):
        size = 132 if mine else 66
        av = _circle(avatars.get(key), size, LIT if kind != "dark" else NEUTRAL)
        if kind == "dark":
            av = _grey(av)
        img.paste(av, (int(top[0] - size / 2), int(top[1] - size - 8)), av)


def widen(jpeg: bytes) -> bytes:
    """A tall card set whole on a 1200x630 sky, so X shows all of it instead of a cropped middle."""
    card = Image.open(io.BytesIO(jpeg)).convert("RGB")
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    _sky(d)
    h = H - 48
    w = round(card.width * h / card.height)
    x, y = (W - w) // 2, 24
    img.paste(card.resize((w, h), Image.LANCZOS), (x, y))
    d.rounded_rectangle([x - 3, y - 3, x + w + 3, y + h + 3], radius=10, outline=INK, width=4)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def _pill(d, x, y, text, font, fill, fg, pad=22, h=None):
    tw = d.textlength(text, font=font)
    bbox = d.textbbox((0, 0), text, font=font)
    th = bbox[3] - bbox[1]
    hh = h or th + 26
    d.rounded_rectangle([x, y, x + tw + pad * 2, y + hh], radius=hh / 2, fill=fill, outline=INK, width=3)
    d.text((x + pad, y + (hh - th) / 2 - bbox[1]), text, font=font, fill=fg)
    return y + hh


HEAD = {
    "join": "I just moved into XField",
    "vote": "Vote my house uptown",
    "uptown": "I made it uptown",
    "dark": "Your house is waiting",
}
CTA = {"join": "MOVE IN NEXT TO ME", "vote": "VOTE FOR ME", "uptown": "COME VISIT", "dark": "TURN YOUR LIGHTS ON"}
PX0, PX1, PY0, PY1 = 640, 1174, 24, 606
PAD = 30
SOFT = (241, 245, 249)


def _fitw(d, text, name, max_w, size, bold=True, low=12):
    while size > low and d.textlength(text, font=_font(name, size, bold)) > max_w:
        size -= 1
    return _font(name, size, bold)


def _clip(d, text, font, max_w):
    while len(text) > 2 and d.textlength(text, font=font) > max_w:
        text = text[:-2] + "\u2026"
    return text


def _grey(av):
    a = av.split()[3]
    return Image.merge("RGBA", (*ImageOps.grayscale(av.convert("RGB")).convert("RGB").split(), a))


def _face(img, avatar, x, y, size, ring, grey=False):
    av = _circle(avatar, size, ring)
    av = _grey(av) if grey else av
    img.paste(av, (int(x), int(y)), av)


def _header(img, d, data, avatars, x0, y, w):
    """Big face, name and handle, with where the house stands."""
    m = data["moment"]
    size = 120
    _face(img, avatars.get(data["k"]), x0, y, size, NEUTRAL if m == "dark" else LIT, grey=m == "dark")
    tx, tw = x0 + size + 18, w - size - 18
    where = {"dark": "A DARK HOUSE", "uptown": "UPTOWN"}.get(m, "THE DOCKS")
    _pill(d, tx, y + 4, f"XFIELD \u00b7 {where}", _font(BODY, 17, True), INK, (255, 255, 255), pad=14, h=34)
    name = data.get("name") or data["h"]
    f = _fitw(d, name, DISPLAY, tw, 40, low=26)
    d.text((tx, y + 44), _clip(d, name, f, tw), font=f, fill=INK)
    handle = f"@{data['h']}"
    f = _fitw(d, handle, BODY, tw, 26, low=16)
    d.text((tx, y + 88), _clip(d, handle, f, tw), font=f, fill=_shade(BRAND, 0.6))
    return y + size + 12


def _rank(d, data, x0, y, w):
    """The house's place on the ladder, big, with its points."""
    d.rounded_rectangle([x0, y, x0 + w, y + 84], radius=18, fill=SOFT, outline=INK, width=3)
    big = f"#{data['rank']}" if data.get("rank") else "\u2013"
    font = _font(DISPLAY, 60, True)
    bb = d.textbbox((0, 0), big, font=font)
    d.text((x0 + 22, y + (84 - (bb[3] - bb[1])) / 2 - bb[1]), big, font=font, fill=INK)
    tx = x0 + 22 + (bb[2] - bb[0]) + 22
    where = "uptown" if data["moment"] == "uptown" else "on the Docks"
    top = f"of {data['of']} {where}" if data.get("rank") else f"Not ranked yet, {where}"
    d.text((tx, y + 13), top, font=_fitw(d, top, BODY, x0 + w - tx - 16, 24), fill=INK)
    pts = f"{data['score']:,} points"
    d.text((tx, y + 45), pts, font=_fitw(d, pts, BODY, x0 + w - tx - 16, 24, False), fill=_shade(INK, 2.2))
    return y + 84 + 12


def _bar(d, x0, x1, y, data):
    start, line = data["start"], data["line"]
    frac = max(0.0, min(1.0, (data["score"] - start) / max(1, line - start)))
    d.rounded_rectangle([x0, y, x1, y + 22], radius=11, fill=(226, 232, 240), outline=INK, width=3)
    d.rounded_rectangle([x0, y, x0 + max(22, (x1 - x0) * frac), y + 22], radius=11, fill=LIT, outline=INK, width=3)
    to_go = max(0, line - data["score"])
    d.text((x0, y + 28), f"{to_go} POINTS TO UPTOWN" if to_go else "MOVING UPTOWN", font=_font(BODY, 18, True), fill=INK)
    return y + 62


def _invites(img, d, data, avatars, x0, y, w):
    """My three invites: lit faces moved in, grey faces still dark next to me, empty lots still open."""
    people = (data.get("invites") or [])[:3]
    dark = sum(p["s"] == "r" for p in people)
    label = f"MY 3 INVITES \u00b7 {dark} STILL DARK" if dark else "MY 3 INVITES"
    d.text((x0, y), label, font=_font(BODY, 17, True), fill=_shade(INK, 2.4))
    y += 26
    slot, size = w / 3, 52
    for i in range(3):
        sx = x0 + i * slot + (slot - size) / 2
        if i < len(people):
            p = people[i]
            _face(img, avatars.get(p["k"]), sx, y, size, LIT if p["s"] == "f" else NEUTRAL, grey=p["s"] != "f")
            text = f"@{p['h']}"
            color = INK if p["s"] == "f" else _shade(INK, 2.6)
        else:
            d.ellipse([sx + 2, y + 2, sx + size - 2, y + size - 2], fill=SOFT, outline=NEUTRAL, width=3)
            plus = _font(BODY, 30, True)
            bb = d.textbbox((0, 0), "+", font=plus)
            d.text((sx + (size - (bb[2] - bb[0])) / 2 - bb[0], y + (size - (bb[3] - bb[1])) / 2 - bb[1]), "+", font=plus, fill=NEUTRAL)
            text, color = "open lot", _shade(INK, 3.0)
        tw = slot - 8
        f = _fitw(d, text, BODY, tw, 17, low=13)
        text = _clip(d, text, f, tw)
        d.text((sx + size / 2, y + size + 4), text, font=f, fill=color, anchor="mt")
    return y + size + 28


def _saved_by(img, d, data, avatars, x0, y, w):
    """Who saved this dark house, and that only its owner can light it."""
    y += 6
    d.text((x0, y), "SAVED FOR YOU BY", font=_font(BODY, 17, True), fill=_shade(INK, 2.4))
    y += 28
    if data.get("by_k"):
        d.rounded_rectangle([x0, y, x0 + w, y + 112], radius=18, fill=SOFT, outline=INK, width=3)
        _face(img, avatars.get(data["by_k"]), x0 + 14, y + 12, 88, LIT)
        tx, tw = x0 + 118, w - 132
        who = f"@{data['by_h']}"
        f = _fitw(d, who, BODY, tw, 30, low=16)
        d.text((tx, y + 26), _clip(d, who, f, tw), font=f, fill=INK)
        d.text((tx, y + 66), "lives right next door", font=_font(BODY, 20, False), fill=_shade(INK, 2.2))
        y += 128
    else:
        d.text((x0, y), "A friend, right next door", font=_font(BODY, 24, False), fill=_shade(INK, 2.2))
        y += 44
    d.text((x0, y), "Only you can turn the lights on.", font=_fitw(d, "Only you can turn the lights on.", BODY, w, 24, True), fill=INK)
    y += 38
    small = _font(BODY, 20, False)
    for line in _wrap(d, "Sign in with X and it lights up with your face on it. Then win votes to move uptown.", small, w)[:2]:
        d.text((x0, y), line, font=small, fill=_shade(INK, 2.4))
        y += 28


def _panel(img, data, avatars):
    """The right-hand card: who lives here, their rank, their invites, and what a friend should do about it."""
    shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle([PX0 + 4, PY0 + 10, PX1 + 4, PY1 + 10], radius=30, fill=(15, 23, 42, 70))
    shade = shade.filter(ImageFilter.GaussianBlur(14))
    img.paste(shade, (0, 0), shade)
    sheet = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sheet).rounded_rectangle([PX0, PY0, PX1, PY1], radius=30, fill=(255, 255, 255, 244), outline=INK, width=4)
    img.paste(sheet, (0, 0), sheet)
    d = ImageDraw.Draw(img)
    m, x0, w = data["moment"], PX0 + PAD, PX1 - PX0 - 2 * PAD
    y = _header(img, d, data, avatars, x0, PY0 + PAD, w)
    head = HEAD[m]
    d.text((x0, y), head, font=_fitw(d, head, DISPLAY, w, 36, low=24), fill=INK)
    y += 46
    if m == "dark":
        _saved_by(img, d, data, avatars, x0, y, w)
    else:
        y = _rank(d, data, x0, y, w)
        if m != "uptown":
            y = _bar(d, x0, x0 + w, y, data)
        _invites(img, d, data, avatars, x0, y, w)
    cta = f"{CTA[m]} \u2192"
    _pill(d, x0, PY1 - PAD - 52, cta, _fitw(d, cta, BODY, w - 44, 26), BRAND, INK, h=52)


def _marker(img, avatar, x, y, size, ring, grey=False):
    """A face floating over a house, like in the city."""
    av = _grey(_circle(avatar, size, ring)) if grey else _circle(avatar, size, ring)
    d = ImageDraw.Draw(img)
    tip = y - 6
    d.polygon([(x - 12, tip - 18), (x + 12, tip - 18), (x, tip)], fill=ring, outline=INK, width=3)
    img.paste(av, (int(x - size / 2), int(tip - 14 - size)), av)


def render_share(data: dict, avatars: dict, snap: bytes = None) -> bytes:
    shot = None
    if snap and data.get("snap"):
        try:
            shot = Image.open(io.BytesIO(snap)).convert("RGB").resize((W, H), Image.LANCZOS)
        except Exception:
            shot = None
    if shot:
        img = shot
        for f in data["snap"]["faces"]:
            _marker(img, avatars.get(f["k"]), f["x"], f["y"], 58, NEUTRAL, grey=True)
        mx, my = data["snap"]["me"]
        _marker(img, avatars.get(data["k"]), mx, my, 104, LIT)
    else:
        img = Image.new("RGB", (W, H))
        d = ImageDraw.Draw(img)
        _sky(d)
        _scene(img, d, data, avatars)
    _panel(img, data, avatars)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()

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
        ring = LIT if mine and kind != "dark" else BRAND if mine else (LIT if kind != "dark" else NEUTRAL)
        av = _circle(avatars.get(key), size, ring)
        if kind == "dark" and not mine:
            rgba = av.split()
            av = Image.merge("RGBA", (*ImageOps.grayscale(av.convert("RGB")).convert("RGB").split(), rgba[3]))
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


def _names(tags):
    names = [f"@{t}" for t in tags]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " & " + names[-1]


HEAD = {
    "join": "I just moved into XField",
    "vote": "Vote my house uptown",
    "uptown": "I made it uptown",
    "dark": "Your house is waiting",
}
CTA = {"join": "MOVE IN NEXT TO ME", "vote": "VOTE FOR ME", "uptown": "COME VISIT", "dark": "TURN YOUR LIGHTS ON"}
PX0, PX1, PY0, PY1 = 692, 1168, 26, 604
PAD = 34


def _fitw(d, text, name, max_w, size, bold=True):
    while size > 12 and d.textlength(text, font=_font(name, size, bold)) > max_w:
        size -= 1
    return _font(name, size, bold)


def _where(data):
    m = data["moment"]
    if m == "dark":
        return f"Saved for you by @{data['by_h']}" if data.get("by_h") else "Saved for you, next to a friend"
    if m == "uptown":
        return f"Uptown in {data['nb_name']}" if data.get("nb_name") else "A house of my own, uptown"
    return "A shack on the Docks, for now"


def _bar(d, x0, x1, y, data):
    start, line = data["start"], data["line"]
    frac = max(0.0, min(1.0, (data["score"] - start) / max(1, line - start)))
    d.rounded_rectangle([x0, y, x1, y + 26], radius=13, fill=(226, 232, 240), outline=INK, width=3)
    d.rounded_rectangle([x0, y, x0 + max(26, (x1 - x0) * frac), y + 26], radius=13, fill=LIT, outline=INK, width=3)
    to_go = max(0, line - data["score"])
    d.text((x0, y + 36), f"{to_go} POINTS TO UPTOWN" if to_go else "MOVING UPTOWN", font=_font(BODY, 21, True), fill=INK)
    return y + 66


def _panel(img, data, host):
    """The right-hand card: where the house is in its story, and what a friend should do about it."""
    shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle([PX0 + 4, PY0 + 10, PX1 + 4, PY1 + 10], radius=30, fill=(15, 23, 42, 70))
    shade = shade.filter(ImageFilter.GaussianBlur(14))
    img.paste(shade, (0, 0), shade)
    sheet = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sheet).rounded_rectangle([PX0, PY0, PX1, PY1], radius=30, fill=(255, 255, 255, 240), outline=INK, width=4)
    img.paste(sheet, (0, 0), sheet)
    d = ImageDraw.Draw(img)
    m, x0, w = data["moment"], PX0 + PAD, PX1 - PX0 - 2 * PAD
    where = {"dark": "A DARK HOUSE", "uptown": "UPTOWN"}.get(m, "THE DOCKS")
    y = _pill(d, x0, PY0 + PAD - 4, f"XFIELD \u00b7 {where}", _font(BODY, 21, True), INK, (255, 255, 255), pad=18) + 20
    head = HEAD[m]
    for size in range(62, 40, -2):
        font = _font(DISPLAY, size, True)
        lines = _wrap(d, head, font, w)
        if len(lines) <= 2:
            break
    for line in lines[:2]:
        d.text((x0, y), line, font=font, fill=INK)
        y += size + 4
    handle = f"@{data['h']}"
    d.text((x0, y + 8), handle, font=_fitw(d, handle, BODY, w, 36), fill=_shade(BRAND, 0.6))
    y += 58
    where = _where(data)
    d.text((x0, y), where, font=_fitw(d, where, BODY, w, 23, False), fill=_shade(INK, 2.2))
    y += 44
    limit = PY1 - PAD - 100
    if m in ("vote", "uptown") and data.get("rank") and y + 44 <= limit:
        d.text((x0, y), f"#{data['rank']} of {data['of']} \u00b7 {data['score']} pts", font=_font(DISPLAY, 30, True), fill=INK)
        y += 46
    if m in ("vote", "join") and y + 62 <= limit:
        y = _bar(d, x0, x0 + w, y, data)
    tags = data.get("tags") or []
    if tags and m != "dark" and y + 28 <= limit:
        who = f"@{tags[0]}" + (f" & {len(tags) - 1} more" if len(tags) > 1 else "")
        line = f"Dark houses wait for {who}"
        d.text((x0, y), line, font=_fitw(d, line, BODY, w, 21), fill=_shade(INK, 2.4))
    cta = f"{CTA[m]} \u2192"
    _pill(d, x0, PY1 - PAD - 86, cta, _fitw(d, cta, BODY, w - 44, 27), BRAND, INK, h=56)
    d.text((x0 + 4, PY1 - PAD - 18), host, font=_fitw(d, host, BODY, w - 8, 20), fill=_shade(INK, 2.6))


def _marker(img, avatar, x, y, size, ring, grey=False):
    """A face floating over a house, like in the city."""
    av = _circle(avatar, size, ring)
    if grey:
        a = av.split()[3]
        av = Image.merge("RGBA", (*ImageOps.grayscale(av.convert("RGB")).convert("RGB").split(), a))
    d = ImageDraw.Draw(img)
    tip = y - 6
    d.polygon([(x - 12, tip - 18), (x + 12, tip - 18), (x, tip)], fill=ring, outline=INK, width=3)
    img.paste(av, (int(x - size / 2), int(tip - 14 - size)), av)


def render_share(data: dict, avatars: dict, host: str, snap: bytes = None) -> bytes:
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
        _marker(img, avatars.get(data["k"]), mx, my, 116, LIT)
    else:
        img = Image.new("RGB", (W, H))
        d = ImageDraw.Draw(img)
        _sky(d)
        _scene(img, d, data, avatars)
    _panel(img, data, host)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()

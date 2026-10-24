"""3:4 share card: an isometric close-up of a resident's block, drawn with Pillow."""
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from town import djb2

ASSETS = Path(__file__).parent / "assets"
DISPLAY, BODY = "SpaceGrotesk.ttf", "Inter.ttf"
W, H = 1260, 1680
INK = (15, 23, 42)
PAPER = (248, 250, 252)
BRAND = (52, 211, 153)
AMBER = (245, 158, 11)
LIT = (252, 227, 138)
GLASS = (156, 199, 234)
DARK = (51, 65, 85)
NEUTRAL = (138, 148, 163)
WALLS = [(232, 226, 214), (217, 195, 165), (201, 139, 107), (191, 199, 207), (227, 213, 184), (168, 181, 194)]
TWC, THC = 290, 145
CX, CY = W // 2, 960
SLOTS = [(1, 1), (0, 1), (1, 0), (-1, 1), (1, -1), (-1, 0), (0, -1), (-1, -1)]


def rgb(hex_color, default=NEUTRAL):
    try:
        return tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    except (TypeError, ValueError):
        return default


def _font(name: str, size: int, bold: bool = False):
    f = ImageFont.truetype(str(ASSETS / name), size)
    if bold:
        f.set_variation_by_name("Bold")
    return f


def _fit(d, text, name, max_w, size, bold=False, stroke=0):
    while size > 20:
        f = _font(name, size, bold)
        if d.textlength(text, font=f) + stroke * 2 <= max_w:
            return f
        size -= 4
    return _font(name, size, bold)


def _shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def P(gx, gy, up=0.0):
    return (CX + (gx - gy) * TWC / 2, CY + (gx + gy) * THC / 2 - up)


def _poly(d, pts, fill, w=3):
    d.polygon(pts, fill=fill, outline=INK, width=w)


def _sky(img):
    d = ImageDraw.Draw(img)
    top, bot = (191, 219, 254), PAPER
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255), width=1)
    for y in range(0, H, 60):
        d.line([(0, y), (W, y)], fill=(255, 255, 255), width=1)


def _island(d, color):
    T, R, B, L = P(-1.5, -1.5), P(1.5, -1.5), P(1.5, 1.5), P(-1.5, 1.5)
    t = 40
    _poly(d, [L, B, (B[0], B[1] + t), (L[0], L[1] + t)], (71, 85, 105))
    _poly(d, [B, R, (R[0], R[1] + t), (B[0], B[1] + t)], (100, 116, 139))
    _poly(d, [T, R, B, L], (203, 213, 225))
    pad = tuple(int(g * 0.82 + c * 0.18) for g, c in zip((134, 197, 108), color))
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            a = 0.43
            _poly(d, [P(i - a, j - a), P(i + a, j - a), P(i + a, j + a), P(i - a, j + a)], pad, 2)


def _quad(face, x0, x1, y0, y1, u0, u1, v0, v1):
    if face == "left":
        f = lambda u, v: P(x0 + u * (x1 - x0), y1, v)
    else:
        f = lambda u, v: P(x1, y1 - u * (y1 - y0), v)
    return [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)]


def _building(d, i, j, floors, key, color, scale=1.0, reserved=False):
    half = (0.3 if floors <= 2 else 0.34) * scale ** 0.5
    x0, x1, y0, y1 = i - half, i + half, j - half, j + half
    hh = min(48 + 30 * floors, 380) * scale
    wall = DARK if reserved else WALLS[djb2(key) % len(WALLS)]
    T, R, B, L = (x0, y0), (x1, y0), (x1, y1), (x0, y1)
    up = lambda p, v=hh: P(p[0], p[1], v)
    _poly(d, [P(*L), P(*B), up(B), up(L)], _shade(wall, 0.82))
    _poly(d, [P(*B), P(*R), up(R), up(B)], wall)
    rows = min(floors, 10)
    for face in ("left", "right"):
        for r in range(rows):
            v0 = hh * (0.1 + r * 0.8 / rows)
            for u0, u1 in ((0.15, 0.4), (0.6, 0.85)):
                _poly(d, _quad(face, x0, x1, y0, y1, u0, u1, v0, v0 + hh * 0.45 / rows), INK if reserved else LIT, 2)
    top_y = hh
    roof = NEUTRAL if reserved else color
    if floors <= 2:
        rh = 60 * scale
        ym = (y0 + y1) / 2
        r0, r1 = P(x0, ym, hh + rh), P(x1, ym, hh + rh)
        _poly(d, [up(T), up(R), r1, r0], _shade(roof, 0.78))
        _poly(d, [up(B), up(R), r1], wall)
        _poly(d, [up(L), up(B), r1, r0], roof)
        top_y = hh + rh
    else:
        band = 16 * scale
        _poly(d, [up(L, hh - band), up(B, hh - band), up(B), up(L)], _shade(roof, 0.82))
        _poly(d, [up(B, hh - band), up(R, hh - band), up(R), up(B)], roof)
        _poly(d, [up(T), up(R), up(B), up(L)], _shade(wall, 1.1))
        if floors >= 8:
            c = P(i, j, hh)
            d.line([c, (c[0], c[1] - 70 * scale)], fill=INK, width=6)
            d.ellipse([c[0] - 9, c[1] - 70 * scale - 9, c[0] + 9, c[1] - 70 * scale + 9], fill=(229, 72, 77), outline=INK, width=3)
            top_y = hh + 70 * scale
    return P(i, j, top_y)


def _circle(avatar: bytes, size: int, ring_color) -> Image.Image:
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.ellipse([0, 0, size - 1, size - 1], fill=INK)
    d.ellipse([4, 4, size - 5, size - 5], fill=ring_color)
    inner = size - 22
    face = None
    if avatar:
        try:
            face = Image.open(io.BytesIO(avatar)).convert("RGB").resize((inner, inner), Image.LANCZOS)
        except Exception:
            face = None
    if face is None:
        face = Image.new("RGB", (inner, inner), (191, 219, 254))
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, inner - 1, inner - 1], fill=255)
    out.paste(face, (11, 11), mask)
    ImageDraw.Draw(out).ellipse([9, 9, size - 10, size - 10], outline=INK, width=3)
    return out


def _pill(d, text, font, cy, fill, fg=INK, pad=34):
    tw = d.textlength(text, font=font)
    bbox = d.textbbox((0, 0), text, font=font)
    th = bbox[3] - bbox[1]
    x0, x1 = (W - tw) / 2 - pad, (W + tw) / 2 + pad
    y0, y1 = cy - th / 2 - 22, cy + th / 2 + 22
    d.rounded_rectangle([x0, y0, x1, y1], radius=(y1 - y0) / 2, fill=fill, outline=INK, width=4)
    d.text(((W - tw) / 2, cy - th / 2 - bbox[1]), text, font=font, fill=fg)


def _centered(d, text, font, y, fill):
    d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)


def _wrap(d, text, font, max_w):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if d.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    return lines + ([cur] if cur else [])


def _billboard(d, text, top):
    size, max_w = 54, 940
    while True:
        font = _font(DISPLAY, size, True)
        lines = _wrap(d, text, font, max_w)
        if len(lines) <= 2 or size <= 32:
            break
        size -= 4
    lh = size + 14
    h = lh * len(lines) + 36
    x0, x1 = W / 2 - 520, W / 2 + 520
    for px in (x0 + 140, x1 - 140):
        d.rectangle([px - 10, top + h - 6, px + 10, top + h + 34], fill=NEUTRAL, outline=INK, width=3)
    d.rounded_rectangle([x0, top, x1, top + h], radius=18, fill=INK)
    for i, line in enumerate(lines):
        tw = d.textlength(line, font=font)
        d.text(((W - tw) / 2, top + 20 + i * lh), line, font=font, fill=LIT)


def render_card(data: dict, avatars: dict, host: str) -> bytes:
    img = Image.new("RGB", (W, H))
    _sky(img)
    d = ImageDraw.Draw(img)
    color = rgb(data.get("color"), BRAND)
    _centered(d, "XFIELD", _font(DISPLAY, 140, True), 36, INK)
    nb_name = (data.get("nb_name") or "Unclaimed land").upper()
    _pill(d, nb_name, _fit(d, nb_name, BODY, 1000, 54, True), 262, color, fg=(255, 255, 255))

    _island(d, color)
    items = [(0, 0, data, 1.2)]
    for (i, j), n in zip(SLOTS, sorted(data.get("neighbours", []), key=lambda n: n.get("floors", 1))):
        items.append((i, j, n, 1.0))
    tops = []
    for i, j, n, sc in sorted(items, key=lambda it: (it[0] + it[1], it[0])):
        top = _building(d, i, j, n.get("floors", 1), n["k"], color, sc, n.get("status") == "reserved")
        tops.append((i + j, top, n, sc))
    for _, top, n, sc in sorted(tops, key=lambda t: (t[3] > 1, t[0])):
        owner = sc > 1
        size = 170 if owner else 104
        ring = color if owner else (LIT if n.get("status") != "reserved" else NEUTRAL)
        av = _circle(avatars.get(n["k"]), size, ring)
        img.paste(av, (int(top[0] - size / 2), int(top[1] - size - 14)), av)

    reserved = data.get("status") == "reserved"
    handle_line = (f"@{data['h']}, YOUR HOUSE IS DARK" if reserved else f"@{data['h']} LIVES HERE").upper()
    _centered(d, handle_line, _fit(d, handle_line, DISPLAY, 1150, 96, True), 1250, INK)
    if data.get("sign"):
        _billboard(d, data["sign"], 1372)
    else:
        tags = data.get("tags") or []
        if reserved:
            line = "Only you can turn the lights on."
        elif tags:
            names = [f"@{t}" for t in tags]
            line = "Next to " + (", ".join(names[:-1]) + " & " + names[-1] if len(names) > 1 else names[0])
        else:
            line = "A city on X, built from who talks to whom"
        _centered(d, line, _fit(d, line, BODY, 1120, 50, True), 1392, INK)
    cta = ("TURN YOUR LIGHTS ON AT " if reserved else "FIND YOUR HOUSE AT ") + host.upper()
    _pill(d, cta, _fit(d, cta, BODY, 1040, 44, True), 1590, BRAND)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()

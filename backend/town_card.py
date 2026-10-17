"""3:4 share card: an isometric close-up of a resident's street, drawn with Pillow."""
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from town import djb2

ASSETS = Path(__file__).parent / "assets"
W, H = 1260, 1680
INK = (17, 17, 17)
YELLOW = (255, 217, 15)
CREAM = (255, 253, 240)
WALLS = [(247, 168, 184), (159, 225, 180), (255, 226, 122), (185, 167, 245), (155, 215, 255), (255, 185, 122)]
ROOFS = [(139, 94, 60), (226, 85, 63), (91, 123, 214), (75, 170, 111), (124, 74, 140)]
TWC, THC = 290, 145
CX, CY = W // 2, 940
HEIGHTS = (70, 112, 196, 280)
ROOF_H = (62, 70)
SLOTS = [(1, 1), (0, 1), (1, 0), (-1, 1), (1, -1), (-1, 0), (0, -1), (-1, -1)]


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


def _poly(d, pts, fill, w=5):
    d.polygon(pts, fill=fill, outline=INK, width=w)


def _sky(img):
    d = ImageDraw.Draw(img)
    top, bot = (26, 127, 217), (155, 220, 255)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    for cx, cy, s in ((150, 520, 1.0), (1110, 600, 0.8), (200, 1260, 0.7), (1080, 1180, 1.1)):
        for dx, dy, r in ((0, 0, 60), (70, -25, 75), (150, 0, 60), (75, 20, 60)):
            rr = r * s
            x, y = cx + (dx - 75) * s, cy + dy * s
            d.ellipse([x - rr, y - rr + 10, x + rr, y + rr + 10], fill=(207, 234, 255))
        for dx, dy, r in ((0, 0, 60), (70, -25, 75), (150, 0, 60), (75, 20, 60)):
            rr = r * s
            x, y = cx + (dx - 75) * s, cy + dy * s
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 255, 255))


def _island(d):
    T, R, B, L = P(-1.5, -1.5), P(1.5, -1.5), P(1.5, 1.5), P(-1.5, 1.5)
    t = 46
    _poly(d, [L, B, (B[0], B[1] + t), (L[0], L[1] + t)], (138, 85, 48))
    _poly(d, [B, R, (R[0], R[1] + t), (B[0], B[1] + t)], (160, 103, 58))
    _poly(d, [T, R, B, L], (196, 190, 176))
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            a = 0.43
            _poly(d, [P(i - a, j - a), P(i + a, j - a), P(i + a, j + a), P(i - a, j + a)], (124, 194, 66), 4)


def _quad(face, x0, x1, y0, y1, u0, u1, v0, v1):
    if face == "left":
        f = lambda u, v: P(x0 + u * (x1 - x0), y1, v)
    else:
        f = lambda u, v: P(x1, y1 - u * (y1 - y0), v)
    return [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)]


def _building(d, i, j, tier, key, scale=1.0, reserved=False):
    half = 0.3 if tier <= 1 else 0.34
    half *= scale ** 0.5
    x0, x1, y0, y1 = i - half, i + half, j - half, j + half
    hh = HEIGHTS[tier] * scale
    wall = (243, 235, 221) if reserved else WALLS[djb2(key) % len(WALLS)]
    roof = (214, 200, 178) if reserved else ROOFS[djb2(key + "r") % len(ROOFS)]
    T, R, B, L = (x0, y0), (x1, y0), (x1, y1), (x0, y1)
    up = lambda p, v=hh: P(p[0], p[1], v)
    _poly(d, [P(*L), P(*B), up(B), up(L)], _shade(wall, 0.82))
    _poly(d, [P(*B), P(*R), up(R), up(B)], wall)
    top_y = hh
    if tier <= 1:
        rh = ROOF_H[tier] * scale
        ym = (y0 + y1) / 2
        r0, r1 = P(x0, ym, hh + rh), P(x1, ym, hh + rh)
        _poly(d, [up(T), up(R), r1, r0], _shade(roof, 0.78))
        _poly(d, [up(B), up(R), r1], wall)
        _poly(d, [up(L), up(B), r1, r0], roof)
        top_y = hh + rh
        if not reserved:
            _poly(d, _quad("right", x0, x1, y0, y1, 0.38, 0.62, 0, hh * 0.62), (120, 72, 40), 4)
            _poly(d, _quad("left", x0, x1, y0, y1, 0.3, 0.7, hh * 0.38, hh * 0.78), (190, 230, 255), 4)
    else:
        _poly(d, [up(T), up(R), up(B), up(L)], _shade(wall, 1.12))
        rows = 3 if tier == 2 else 6
        for face in ("left", "right"):
            for r in range(rows):
                v0 = hh * (0.12 + r * 0.82 / rows)
                v1 = v0 + hh * 0.5 / rows
                for u0, u1 in ((0.15, 0.4), (0.6, 0.85)):
                    _poly(d, _quad(face, x0, x1, y0, y1, u0, u1, v0, v1), (190, 230, 255), 3)
        if tier == 3:
            c = P(i, j, hh)
            d.line([c, (c[0], c[1] - 70 * scale)], fill=INK, width=7)
            d.ellipse([c[0] - 10, c[1] - 70 * scale - 10, c[0] + 10, c[1] - 70 * scale + 10], fill=(255, 107, 107), outline=INK, width=4)
            top_y = hh + 70 * scale
    if reserved:
        for p in (L, B, R):
            d.line([P(*p), P(p[0], p[1], top_y + 18)], fill=(176, 112, 50), width=9)
        for v in (hh * 0.35, hh * 0.75):
            d.line([P(*L, v), P(*B, v), P(*R, v)], fill=(176, 112, 50), width=8)
    return P(i, j, top_y)


def _circle(avatar: bytes, size: int, ring_color) -> Image.Image:
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.ellipse([0, 0, size - 1, size - 1], fill=INK)
    d.ellipse([5, 5, size - 6, size - 6], fill=ring_color)
    inner = size - 26
    face = None
    if avatar:
        try:
            face = Image.open(io.BytesIO(avatar)).convert("RGB").resize((inner, inner), Image.LANCZOS)
        except Exception:
            face = None
    if face is None:
        face = Image.new("RGB", (inner, inner), (155, 220, 255))
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, inner - 1, inner - 1], fill=255)
    out.paste(face, (13, 13), mask)
    ImageDraw.Draw(out).ellipse([11, 11, size - 12, size - 12], outline=INK, width=4)
    return out


def _pill(img, d, text, font, cy, fill, fg=INK, pad=34):
    tw = d.textlength(text, font=font)
    bbox = d.textbbox((0, 0), text, font=font)
    th = bbox[3] - bbox[1]
    x0, x1 = (W - tw) / 2 - pad, (W + tw) / 2 + pad
    y0, y1 = cy - th / 2 - 22, cy + th / 2 + 22
    d.rounded_rectangle([x0, y0, x1, y1], radius=(y1 - y0) / 2, fill=fill, outline=INK, width=6)
    d.text(((W - tw) / 2, cy - th / 2 - bbox[1]), text, font=font, fill=fg)


def _centered(d, text, font, y, fill, stroke=0):
    tw = d.textlength(text, font=font)
    d.text(((W - tw) / 2, y), text, font=font, fill=fill, stroke_width=stroke, stroke_fill=INK)


def render_card(data: dict, avatars: dict, host: str) -> bytes:
    img = Image.new("RGB", (W, H))
    _sky(img)
    d = ImageDraw.Draw(img)
    title = _font("LuckiestGuy-Regular.ttf", 150)
    _centered(d, "SPRINGFIELD, X", title, 58, YELLOW, stroke=9)
    nb_font = _fit(d, (data.get("nb_name") or "The edge of town").upper(), "Fredoka.ttf", 1000, 60, True)
    _pill(img, d, (data.get("nb_name") or "The edge of town").upper(), nb_font, 300, CREAM)

    landmark = data.get("landmark")
    if landmark and (ASSETS / "landmarks" / f"{landmark}.png").exists():
        lm = Image.open(ASSETS / "landmarks" / f"{landmark}.png").convert("RGBA")
        lw = 500
        lm = lm.resize((lw, int(lm.height * lw / lm.width)), Image.LANCZOS)
    _island(d)
    slots = SLOTS
    if landmark and (ASSETS / "landmarks" / f"{landmark}.png").exists():
        bx, by = P(-0.75, -0.75)
        img.paste(lm, (int(bx - lw / 2), int(by - lm.height + 40)), lm)
        slots = [s for s in SLOTS if s not in ((-1, -1), (-1, 0), (0, -1))]
    items = [(0, 0, data, 1.2)]
    for (i, j), n in zip(slots, sorted(data.get("neighbours", []), key=lambda n: n.get("tier", 0))):
        items.append((i, j, n, 1.0))
    tops = []
    for i, j, n, sc in sorted(items, key=lambda it: (it[0] + it[1], it[0])):
        top = _building(d, i, j, n.get("tier", 0), n["k"], sc, n.get("status") == "reserved")
        tops.append((i + j, top, n, sc))
    for _, top, n, sc in sorted(tops, key=lambda t: (t[3] > 1, t[0])):
        owner = sc > 1
        size = 170 if owner else 104
        ring = YELLOW if owner else (CREAM if n.get("status") != "reserved" else (255, 169, 77))
        av = _circle(avatars.get(n["k"]), size, ring)
        img.paste(av, (int(top[0] - size / 2), int(top[1] - size - 14)), av)

    handle_line = f"@{data['h']} LIVES HERE".upper()
    _centered(d, handle_line, _fit(d, handle_line, "LuckiestGuy-Regular.ttf", 1150, 104, stroke=7), 1250, YELLOW, stroke=7)
    tags = data.get("tags") or []
    if tags:
        names = [f"@{t}" for t in tags]
        line = "Next to " + (", ".join(names[:-1]) + " & " + names[-1] if len(names) > 1 else names[0])
    else:
        line = f"{len(data.get('neighbours', []))} neighbours and counting"
    _centered(d, line, _fit(d, line, "Fredoka.ttf", 1120, 54, True, 4), 1388, (255, 255, 255), stroke=4)
    _pill(img, d, f"FIND YOUR HOUSE AT {host}".upper(), _fit(d, f"FIND YOUR HOUSE AT {host}".upper(), "Fredoka.ttf", 1040, 46, True), 1560, YELLOW)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()

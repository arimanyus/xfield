"""1200x630 link preview for the daily XField Ledger: its front page, as it looks in the city."""
import io
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ASSETS = Path(__file__).parent / "assets"
W, H = 1200, 630
PAPER = (244, 239, 227)
INK = (28, 26, 23)
FADED = (92, 86, 76)
X0, X1 = 48, 1152
FOOT = 568


@lru_cache(maxsize=64)
def _serif(size: int, weight: str = "Regular"):
    f = ImageFont.truetype(str(ASSETS / "Playfair.ttf"), size)
    f.set_variation_by_name(weight)
    return f


@lru_cache(maxsize=8)
def _masthead(size: int):
    return ImageFont.truetype(str(ASSETS / "Masthead.ttf"), size)


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


def _spaced(d, x, y, text, font, gap=2.5, align="left", fill=INK):
    """Letter-spaced small caps, the way the paper prints its dateline."""
    width = sum(d.textlength(c, font=font) for c in text) + gap * (len(text) - 1)
    x = x - width / 2 if align == "center" else x - width if align == "right" else x
    for c in text:
        d.text((x, y), c, font=font, fill=fill, anchor="ls")
        x += d.textlength(c, font=font) + gap


def _rule(d, y, double=False):
    if double:
        d.rectangle([X0, y, X1, y + 2], fill=INK)
        d.rectangle([X0, y + 5, X1, y + 6], fill=INK)
        return y + 6
    d.rectangle([X0, y, X1, y], fill=INK)
    return y


def _headline(d, text, y):
    """As big as it can be in two lines across the page, or three if it must."""
    for lines_max, sizes in ((2, range(84, 54, -4)), (3, range(60, 38, -4))):
        for size in sizes:
            f = _serif(size, "Black")
            lines = _wrap(d, text, f, X1 - X0)
            if len(lines) <= lines_max:
                for line in lines:
                    y += size * 1.02
                    d.text((W / 2, y), line, font=f, fill=INK, anchor="ms")
                return y + size * 0.22
    f = _serif(40, "Black")
    for line in _wrap(d, text, f, X1 - X0)[:3]:
        y += 42
        d.text((W / 2, y), line, font=f, fill=INK, anchor="ms")
    return y + 10


def _photo(avatar, size):
    try:
        face = Image.open(io.BytesIO(avatar)).convert("RGB") if avatar else None
    except Exception:
        face = None
    face = ImageOps.fit(face, (size, size)) if face else Image.new("RGB", (size, size), (214, 206, 188))
    return ImageOps.autocontrast(ImageOps.grayscale(face), cutoff=2).convert("RGB")


def _story(d, x0, x1, y, title, body):
    if title:
        f = _serif(30, "Bold")
        for line in _wrap(d, title, f, x1 - x0)[:2]:
            y += 32
            d.text((x0, y), line, font=f, fill=INK, anchor="ls")
        y += 8
    if not body:
        return
    f, lh = _serif(23), 31
    room = max(1, int((FOOT - 14 - y) // lh))
    cap = _serif(76, "Black")
    first, rest = body[0], body[1:]
    cw = d.textlength(first, font=cap) + 10
    d.text((x0, y + 2 * lh - 6), first, font=cap, fill=INK, anchor="ls")
    lines = _wrap(d, rest, f, x1 - x0 - cw)
    head, tail = lines[:2], _wrap(d, " ".join(lines[2:]), f, x1 - x0)
    out = [(x0 + cw, line) for line in head] + [(x0, line) for line in tail]
    if len(out) > room:
        out = out[:room]
        x, line = out[-1]
        while line and d.textlength(line + "…", font=f) > x1 - x:
            line = line.rsplit(" ", 1)[0] if " " in line else line[:-1]
        out[-1] = (x, line.rstrip(",.;:") + "…")
    for x, line in out:
        y += lh
        d.text((x, y), line, font=f, fill=INK, anchor="ls")


def _sidebar(img, d, p, avatars, x0, x1, y):
    people = [f for f in p.get("featured") or [] if f.get("k")][:3]
    if people:
        _spaced(d, x0, y + 22, "PICTURED", _serif(16, "Bold"))
        room = FOOT - 12 - (y + 36)
        if room < 130:
            size = int(min(48, room / len(people) - 8))
            for i, f in enumerate(people):
                yy = int(y + 34 + i * (size + 8))
                img.paste(_photo(avatars.get(f["k"]), size), (int(x0), yy))
                d.rectangle([x0 - 1, yy - 1, x0 + size, yy + size], outline=INK, width=2)
                d.text((x0 + size + 14, yy + size / 2), f"@{f['h']}", font=_serif(20, "Bold"), fill=INK, anchor="lm")
            return
        size = min(104, int((x1 - x0 - 16 * (len(people) - 1)) / len(people)), int(room - 32))
        for i, f in enumerate(people):
            x = int(x0 + i * (size + 16))
            img.paste(_photo(avatars.get(f["k"]), size), (x, int(y + 36)))
            d.rectangle([x - 1, y + 35, x + size, y + 36 + size], outline=INK, width=2)
            name = f"@{f['h']}"
            nf = _serif(17, "Bold")
            while d.textlength(name, font=nf) > size + 8 and len(name) > 4:
                name = name[:-2] + "…"
            d.text((x + size / 2, y + 62 + size), name, font=nf, fill=INK, anchor="ms")
        return
    n = p.get("numbers") or {}
    _spaced(d, x0, y + 22, "BY THE NUMBERS", _serif(16, "Bold"))
    rows = [("Lights on", n.get("lit", 0)), ("On the Docks", n.get("docks", 0)), ("Uptown", n.get("uptown", 0)),
            ("Votes cast", n.get("votes", 0)), ("Lots taken", f"{n.get('taken', 0)}/{n.get('capacity', 0)}")]
    f, fb = _serif(21), _serif(21, "Bold")
    for i, (k, v) in enumerate(rows):
        yy = y + 58 + i * 31
        if yy > FOOT - 16:
            break
        d.text((x0, yy), k, font=f, fill=INK, anchor="ls")
        d.text((x1, yy), str(v), font=fb, fill=INK, anchor="rs")
        for dx in range(int(x0), int(x1), 6):
            d.point((dx, yy + 7), fill=FADED)


def render_paper(p: dict, avatars: dict, host: str) -> bytes:
    img = Image.new("RGB", (W, H), PAPER)
    grain = Image.effect_noise((W, H), 24).convert("RGB")
    img = Image.blend(img, grain, 0.05)
    d = ImageDraw.Draw(img)
    meta = _serif(17, "Bold")
    _spaced(d, X0, 40, f"NO. {p['issue']}", meta)
    _spaced(d, W / 2, 40, p["label"].upper(), meta, align="center")
    _spaced(d, X1, 40, "FREE · 3 VOTES A DAY", meta, align="right")
    _rule(d, 52)
    mast = "The XField Ledger"
    size = 96
    while d.textlength(mast, font=_masthead(size)) > 860:
        size -= 4
    d.text((W / 2, 134), mast, font=_masthead(size), fill=INK, anchor="ms")
    d.text((W / 2, 170), "\u201cAll the news that's fit to vote on.\u201d", font=_serif(17), fill=FADED, anchor="ms")
    y = _rule(d, 180, double=True)
    y = _headline(d, p["headline"], y + 6)
    lead = (p.get("stories") or [None])[0]
    if lead and lead["title"] != p["headline"]:
        y += 30
        d.text((W / 2, y), lead["title"], font=_serif(25), fill=FADED, anchor="ms")
        y += 12
    y = _rule(d, int(y) + 6)
    split = 790
    d.rectangle([split - 22, y + 14, split - 22, FOOT - 12], fill=INK)
    body = lead["body"] if lead else "Not much happened in XField since the last edition. The voters rest; the Docks wait."
    _story(d, X0, split - 46, y + 4, None, body)
    _sidebar(img, d, p, avatars, split, X1, y + 4)
    _rule(d, FOOT, double=True)
    _spaced(d, W / 2, FOOT + 40, f"READ TODAY'S PAPER AT {host.upper()}", _serif(19, "Bold"), gap=2, align="center")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()

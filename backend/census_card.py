"""3:4 weekly census card: a cartoon town noticeboard drawn with Pillow."""
import io

from PIL import Image, ImageDraw

from town_card import ASSETS, CREAM, H, INK, W, YELLOW, _circle, _fit, _font, _sky, _wrap

ORANGE = (255, 169, 77)
PINK = (255, 143, 199)
GREEN = (159, 225, 180)
BLUE = (155, 215, 255)
X0, X1 = 130, 1130
LUCKIEST = "LuckiestGuy-Regular.ttf"
FREDOKA = "Fredoka.ttf"


def _tag(d, x, y, text, fill):
    f = _font(FREDOKA, 34, True)
    tw = d.textlength(text, font=f)
    d.rounded_rectangle([x, y, x + tw + 48, y + 60], radius=30, fill=fill, outline=INK, width=5)
    d.text((x + 24, y + 30), text, font=f, fill=INK, anchor="lm")


def _faces(paper, people, avatars, x, y, size, step, ring):
    for i, p in enumerate(people):
        paper.alpha_composite(_circle(avatars.get(p["k"]), size, ring), (int(x + i * step), int(y)))


def _population(d, c):
    pop, cap = c["population"], c["capacity"]
    big = _font(LUCKIEST, 230)
    num = str(pop["taken"])
    d.text((X0, 600), num, font=big, fill=INK, anchor="ls")
    d.text((X0 + d.textlength(num, font=big) + 14, 600), f"/{cap}", font=_font(LUCKIEST, 104), fill=INK, anchor="ls")
    free = max(0, cap - pop["taken"])
    legend = f"{pop['lit']} LIT  ·  {pop['reserved']} RESERVED  ·  {free} FREE"
    d.text((X0, 656), legend, font=_fit(d, legend, FREDOKA, 700, 38, True), fill=INK, anchor="ls")
    cols, pitch, dot = 10, 26, 20
    gx, gy = X1 - cols * pitch, 400
    for i in range(cap if cap <= 100 else 100):
        fill = YELLOW if i < pop["lit"] else ORANGE if i < pop["taken"] else (255, 255, 255)
        x, y = gx + (i % cols) * pitch, gy + (i // cols) * pitch
        d.rounded_rectangle([x, y, x + dot, y + dot], radius=5, fill=fill, outline=INK, width=3)


def _fastest(paper, d, f):
    _tag(d, X0, 712, "FASTEST-GROWING", PINK)
    if not f:
        d.text((X0, 880), "QUIET WEEK", font=_font(LUCKIEST, 110), fill=INK, anchor="ls")
        d.text((X0, 950), "No neighbourhood grew this week.", font=_font(FREDOKA, 40, True), fill=INK, anchor="ls")
        return
    lm_path = ASSETS / "landmarks" / f"{f['landmark']}.png"
    if lm_path.exists():
        lm = Image.open(lm_path).convert("RGBA")
        k = min(330 / lm.width, 220 / lm.height)
        lm = lm.resize((int(lm.width * k), int(lm.height * k)), Image.LANCZOS)
        paper.alpha_composite(lm, (X0 + (330 - lm.width) // 2, 1005 - lm.height))
    tx, max_w = 500, X1 - 500
    size = 84
    while True:
        font = _font(LUCKIEST, size)
        lines = _wrap(d, f["name"].upper(), font, max_w)
        if len(lines) <= 2 and all(d.textlength(ln, font=font) <= max_w for ln in lines) or size <= 44:
            break
        size -= 6
    base = 830 if len(lines) == 1 else 790
    for i, ln in enumerate(lines[:2]):
        d.text((tx, base + i * (size + 8)), ln, font=font, fill=INK, anchor="ls")
    grew = f"+{f['gained']} HOUSES" if f["gained"] != 1 else "+1 HOUSE"
    gf = _font(LUCKIEST, 62)
    gw = d.textlength(grew, font=gf)
    d.rounded_rectangle([tx, 890, tx + gw + 56, 990], radius=50, fill=YELLOW, outline=INK, width=6)
    d.text((tx + 28, 948), grew, font=gf, fill=INK, anchor="lm")


def _towers(paper, d, c, avatars):
    _tag(d, X0, 1052, "NEW TOWERS", GREEN)
    towers = c["towers"][:4]
    if not towers:
        d.text((X0, 1220), "NONE YET", font=_font(LUCKIEST, 76), fill=INK, anchor="ls")
        d.text((X0, 1280), "5 neighbours make a tower.", font=_font(FREDOKA, 34, True), fill=INK, anchor="ls")
        return
    _faces(paper, towers, avatars, X0, 1132, 112, 84, CREAM)
    line = f"@{towers[0]['h']}" if c["towers_total"] == 1 else f"{c['towers_total']} WENT UP"
    font = _fit(d, line, FREDOKA if line.startswith("@") else LUCKIEST, 470, 52, line.startswith("@"))
    d.text((X0, 1300), line, font=font, fill=INK, anchor="ls")


def _mover(paper, d, m, avatars):
    x = 672
    _tag(d, x, 1052, "BIGGEST MOVER", BLUE)
    if not m:
        d.text((x, 1220), "NOBODY", font=_font(LUCKIEST, 76), fill=INK, anchor="ls")
        d.text((x, 1280), "Same faces, same streets.", font=_font(FREDOKA, 34, True), fill=INK, anchor="ls")
        return
    paper.alpha_composite(_circle(avatars.get(m["k"]), 132, YELLOW), (x, 1134))
    tx = x + 150
    handle = f"@{m['h']}"
    d.text((tx, 1186), handle, font=_fit(d, handle, FREDOKA, X1 - tx, 44, True), fill=INK, anchor="ls")
    d.text((tx, 1248), f"+{m['gained']} NEW", font=_font(LUCKIEST, 58), fill=INK, anchor="ls")
    d.text((tx, 1290), "NEIGHBOUR" if m["gained"] == 1 else "NEIGHBOURS", font=_font(FREDOKA, 32, True), fill=INK, anchor="ls")


def _newly_lit(paper, d, c, avatars):
    _tag(d, X0, 1362, "NEWLY LIT", YELLOW)
    lit = c["newest_lit"][:6]
    count = f"{c['lit_week']} THIS WEEK"
    d.text((X0, 1470), count, font=_font(FREDOKA, 34, True), fill=INK, anchor="ls")
    if not lit:
        d.text((440, 1440), "BE THE FIRST", font=_font(LUCKIEST, 76), fill=INK, anchor="ls")
        return
    _faces(paper, lit, avatars, 430, 1352, 108, 114, YELLOW)


def render_census(c: dict, avatars: dict, host: str) -> bytes:
    img = Image.new("RGB", (W, H))
    _sky(img)
    paper = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(paper)
    d.rounded_rectangle([70, 70, 1190, 1610], radius=40, fill=CREAM, outline=INK, width=9)
    kicker = f"ISSUE No. {c['issue']}  ·  {c['label'].upper()}"
    d.text((W / 2, 156), kicker, font=_fit(d, kicker, FREDOKA, 1000, 40, True), fill=INK, anchor="ms")
    title = "XFIELD CENSUS"
    d.text((W / 2, 318), title, font=_fit(d, title, LUCKIEST, 1000, 150, stroke=8), fill=YELLOW, anchor="ms",
           stroke_width=8, stroke_fill=INK)
    d.line([(X0, 350), (X1, 350)], fill=INK, width=6)
    d.line([(X0, 364), (X1, 364)], fill=INK, width=3)
    _population(d, c)
    d.line([(X0, 690), (X1, 690)], fill=INK, width=5)
    _fastest(paper, d, c.get("fastest"))
    d.line([(X0, 1030), (X1, 1030)], fill=INK, width=5)
    d.line([(642, 1050), (642, 1310)], fill=INK, width=4)
    _towers(paper, d, c, avatars)
    _mover(paper, d, c.get("mover"), avatars)
    d.line([(X0, 1338), (X1, 1338)], fill=INK, width=5)
    _newly_lit(paper, d, c, avatars)
    cta = f"FIND YOUR HOUSE AT {host.upper()}"
    cf = _fit(d, cta, FREDOKA, 860, 42, True)
    cw = d.textlength(cta, font=cf)
    d.rounded_rectangle([W / 2 - cw / 2 - 36, 1500, W / 2 + cw / 2 + 36, 1574], radius=37, fill=YELLOW, outline=INK, width=6)
    d.text((W / 2, 1537), cta, font=cf, fill=INK, anchor="mm")
    paper = paper.rotate(0.9, resample=Image.BICUBIC, center=(W / 2, H / 2))
    img.paste(paper, (0, 0), paper)
    pins = ImageDraw.Draw(img)
    for px, py in ((210, 104), (1050, 92)):
        pins.ellipse([px - 24, py - 24, px + 24, py + 24], fill=(255, 107, 107), outline=INK, width=6)
        pins.ellipse([px - 10, py - 12, px - 2, py - 4], fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()

"""3:4 weekly City Ledger card, drawn with Pillow."""
import io

from PIL import Image, ImageDraw

from town_card import AMBER, BODY, BRAND, DISPLAY, H, INK, LIT, NEUTRAL, PAPER, W, _circle, _fit, _font, _sky, rgb

BLUE = (219, 234, 254)
GREEN = (209, 250, 229)
YELLOW = (254, 243, 199)
PINK = (252, 231, 243)
X0, X1 = 130, 1130


def _tag(d, x, y, text, fill):
    f = _font(BODY, 32, True)
    tw = d.textlength(text, font=f)
    d.rounded_rectangle([x, y, x + tw + 48, y + 58], radius=29, fill=fill, outline=INK, width=3)
    d.text((x + 24, y + 29), text, font=f, fill=INK, anchor="lm")


def _faces(paper, people, avatars, x, y, size, step, ring):
    for i, p in enumerate(people):
        paper.alpha_composite(_circle(avatars.get(p["k"]), size, ring), (int(x + i * step), int(y)))


def _population(d, c):
    pop, cap = c["population"], c["capacity"]
    big = _font(DISPLAY, 220, True)
    num = str(pop["taken"])
    d.text((X0, 600), num, font=big, fill=INK, anchor="ls")
    d.text((X0 + d.textlength(num, font=big) + 14, 600), f"/{cap}", font=_font(DISPLAY, 96, True), fill=INK, anchor="ls")
    free = max(0, cap - pop["taken"])
    legend = f"{pop['lit']} LIT  ·  {pop['reserved']} RESERVED  ·  {free} FREE"
    d.text((X0, 656), legend, font=_fit(d, legend, BODY, 700, 36, True), fill=INK, anchor="ls")
    cols, pitch, dot = 10, 26, 20
    gx, gy = X1 - cols * pitch, 400
    for i in range(min(cap, 100)):
        fill = BRAND if i < pop["lit"] else AMBER if i < pop["taken"] else (255, 255, 255)
        x, y = gx + (i % cols) * pitch, gy + (i // cols) * pitch
        d.rounded_rectangle([x, y, x + dot, y + dot], radius=4, fill=fill, outline=INK, width=2)


def _districts(d, c):
    _tag(d, X0, 712, "TOP DISTRICTS", PINK)
    f = c.get("fastest")
    if f:
        line = f"FASTEST: {f['name'].upper()} +{f['gained']}"
        d.text((X1, 741), line, font=_fit(d, line, BODY, 520, 32, True), fill=INK, anchor="rm")
    rows = c.get("districts") or []
    if not rows:
        d.text((X0, 900), "NO DISTRICTS YET", font=_font(DISPLAY, 84, True), fill=INK, anchor="ls")
        return
    for i, r in enumerate(rows[:3]):
        y = 800 + i * 74
        d.rounded_rectangle([X0, y, X1, y + 60], radius=14, fill=(255, 255, 255), outline=INK, width=3)
        d.text((X0 + 26, y + 30), str(i + 1), font=_font(DISPLAY, 40, True), fill=INK, anchor="lm")
        d.rounded_rectangle([X0 + 70, y + 14, X0 + 102, y + 46], radius=6, fill=rgb(r.get("color")), outline=INK, width=2)
        stats = f"{r['floors']} FLOORS · {r['lit']} LIT"
        sf = _font(BODY, 30, True)
        d.text((X1 - 24, y + 30), stats, font=sf, fill=INK, anchor="rm")
        max_w = X1 - 24 - d.textlength(stats, font=sf) - 40 - (X0 + 124)
        d.text((X0 + 124, y + 30), r["name"], font=_fit(d, r["name"], BODY, max_w, 36, True), fill=INK, anchor="lm")


def _towers(paper, d, c, avatars):
    _tag(d, X0, 1052, "NEW TOWERS", GREEN)
    towers = c["towers"][:4]
    if not towers:
        d.text((X0, 1220), "NONE YET", font=_font(DISPLAY, 72, True), fill=INK, anchor="ls")
        d.text((X0, 1280), "Build to 4 floors to make one.", font=_font(BODY, 32, True), fill=INK, anchor="ls")
        return
    _faces(paper, towers, avatars, X0, 1132, 112, 84, PAPER)
    line = f"@{towers[0]['h']}" if c["towers_total"] == 1 else f"{c['towers_total']} WENT UP"
    d.text((X0, 1300), line, font=_fit(d, line, BODY if line.startswith("@") else DISPLAY, 470, 50, True), fill=INK, anchor="ls")


def _mover(paper, d, m, avatars):
    x = 672
    _tag(d, x, 1052, "BIGGEST MOVER", BLUE)
    if not m:
        d.text((x, 1220), "NOBODY", font=_font(DISPLAY, 72, True), fill=INK, anchor="ls")
        d.text((x, 1280), "Same faces, same blocks.", font=_font(BODY, 32, True), fill=INK, anchor="ls")
        return
    paper.alpha_composite(_circle(avatars.get(m["k"]), 132, BRAND), (x, 1134))
    tx = x + 150
    handle = f"@{m['h']}"
    d.text((tx, 1186), handle, font=_fit(d, handle, BODY, X1 - tx, 42, True), fill=INK, anchor="ls")
    d.text((tx, 1248), f"+{m['gained']} NEW", font=_font(DISPLAY, 56, True), fill=INK, anchor="ls")
    d.text((tx, 1290), "NEIGHBOUR" if m["gained"] == 1 else "NEIGHBOURS", font=_font(BODY, 30, True), fill=INK, anchor="ls")


def _newly_lit(paper, d, c, avatars):
    _tag(d, X0, 1362, "NEWLY LIT", YELLOW)
    lit = c["newest_lit"][:6]
    d.text((X0, 1470), f"{c['lit_week']} THIS WEEK", font=_font(BODY, 32, True), fill=INK, anchor="ls")
    if not lit:
        d.text((440, 1440), "BE THE FIRST", font=_font(DISPLAY, 72, True), fill=INK, anchor="ls")
        return
    _faces(paper, lit, avatars, 430, 1352, 108, 114, LIT)


def render_census(c: dict, avatars: dict, host: str) -> bytes:
    img = Image.new("RGB", (W, H))
    _sky(img)
    paper = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(paper)
    d.rounded_rectangle([70, 70, 1190, 1610], radius=32, fill=PAPER, outline=INK, width=5)
    kicker = f"LEDGER No. {c['issue']}  ·  {c['label'].upper()}"
    d.text((W / 2, 156), kicker, font=_fit(d, kicker, BODY, 1000, 38, True), fill=NEUTRAL, anchor="ms")
    title = "XFIELD CITY LEDGER"
    d.text((W / 2, 300), title, font=_fit(d, title, DISPLAY, 1000, 130, True), fill=INK, anchor="ms")
    d.rectangle([X0, 340, X1, 352], fill=BRAND)
    _population(d, c)
    d.line([(X0, 690), (X1, 690)], fill=INK, width=3)
    _districts(d, c)
    d.line([(X0, 1030), (X1, 1030)], fill=INK, width=3)
    d.line([(642, 1050), (642, 1310)], fill=INK, width=2)
    _towers(paper, d, c, avatars)
    _mover(paper, d, c.get("mover"), avatars)
    d.line([(X0, 1338), (X1, 1338)], fill=INK, width=3)
    _newly_lit(paper, d, c, avatars)
    cta = f"CLAIM YOUR LOT AT {host.upper()}"
    cf = _fit(d, cta, BODY, 860, 40, True)
    cw = d.textlength(cta, font=cf)
    d.rounded_rectangle([W / 2 - cw / 2 - 36, 1500, W / 2 + cw / 2 + 36, 1574], radius=37, fill=BRAND, outline=INK, width=4)
    d.text((W / 2, 1537), cta, font=cf, fill=INK, anchor="mm")
    img.paste(paper, (0, 0), paper)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()

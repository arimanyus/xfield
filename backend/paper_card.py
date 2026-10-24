"""3:4 share card for the daily XField Ledger, drawn with Pillow."""
import io

from PIL import Image, ImageDraw

from town_card import BODY, BRAND, DARK, DISPLAY, H, INK, NEUTRAL, PAPER, W, _circle, _fit, _font, _sky, _wrap

X0, X1 = 130, 1130


def _block(d, text, name, size, max_lines, y, fill, bold=True):
    """Wraps text into at most max_lines, shrinking it to fit, and returns the y below it."""
    while True:
        f = _font(name, size, bold)
        lines = _wrap(d, text, f, X1 - X0)
        if len(lines) <= max_lines or size <= 28:
            break
        size -= 4
    for line in lines[:max_lines]:
        y += size * 1.2
        d.text((X0, y), line, font=f, fill=fill, anchor="ls")
    return y


def render_paper(p: dict, avatars: dict, host: str) -> bytes:
    img = Image.new("RGB", (W, H))
    _sky(img)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(sheet)
    d.rounded_rectangle([70, 70, 1190, 1610], radius=32, fill=PAPER, outline=INK, width=5)
    kicker = f"No. {p['issue']}  ·  {p['label'].upper()}"
    d.text((W / 2, 156), kicker, font=_fit(d, kicker, BODY, 1000, 38, True), fill=NEUTRAL, anchor="ms")
    title = "THE XFIELD LEDGER"
    d.text((W / 2, 300), title, font=_fit(d, title, DISPLAY, 1000, 130, True), fill=INK, anchor="ms")
    d.rectangle([X0, 340, X1, 352], fill=BRAND)
    y = _block(d, p["headline"], DISPLAY, 96, 4, 380, INK)
    quote = p["quotes"][0] if p["quotes"] else None
    lead = p["stories"][0] if p["stories"] else {"title": f"@{quote['h']}", "body": f"\u201c{quote['text']}\u201d"} if quote else None
    if lead:
        y = _block(d, lead["title"], BODY, 46, 2, y + 50, INK)
        _block(d, lead["body"], BODY, 38, 4, y + 10, DARK, bold=False)
    people = p["featured"][:6]
    x = W / 2 - (len(people) * 150 - 30) / 2
    for i, person in enumerate(people):
        sheet.alpha_composite(_circle(avatars.get(person["k"]), 120, BRAND), (int(x + i * 150), 1310))
    cta = f"READ IT AT {host.upper()}"
    cf = _fit(d, cta, BODY, 860, 40, True)
    cw = d.textlength(cta, font=cf)
    d.rounded_rectangle([W / 2 - cw / 2 - 36, 1500, W / 2 + cw / 2 + 36, 1574], radius=37, fill=BRAND, outline=INK, width=4)
    d.text((W / 2, 1537), cta, font=cf, fill=INK, anchor="mm")
    img.paste(sheet, (0, 0), sheet)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()

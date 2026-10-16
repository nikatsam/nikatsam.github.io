# Builds a 1200x630 social share image for each project, plus one for the site.
# Uses each project's existing preview (assets/previews/<slug>.webp) and its name and tagline
# from data/projects.json. Output: assets/social/<slug>.jpg and assets/social/site.jpg.
# Run: python scripts/build-social.py   (needs Pillow; uses Arial from the Windows fonts folder)
import json
import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
W, H = 1200, 630
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT = "C:/Windows/Fonts/arial.ttf"

BG_TOP = (11, 13, 20)
BG_BOTTOM = (22, 26, 48)
ACCENT = (124, 140, 255)
ACCENT_2 = (55, 214, 193)
TEXT = (238, 240, 251)
MUTED = (154, 163, 194)


def gradient_background():
    img = Image.new("RGB", (W, H), BG_TOP)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        row = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = row
    # soft accent glow top-right, drawn as a blurred ellipse
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((780, -260, 1500, 420), fill=ACCENT)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    return Image.blend(img, Image.composite(glow, img, glow.convert("L")), 0.35)


def wrap(draw, text, font, max_width):
    words, lines, line = text.split(), [], ""
    for w in words:
        test = f"{line} {w}".strip()
        if draw.textlength(test, font=font) <= max_width:
            line = test
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def draw_text_block(draw, x, y, lines, font, fill, spacing):
    for i, line in enumerate(lines):
        draw.text((x, y + i * spacing), line, font=font, fill=fill)
    return y + len(lines) * spacing


def product_card(p):
    img = gradient_background()
    draw = ImageDraw.Draw(img)

    f_label = ImageFont.truetype(FONT_BOLD, 26)
    f_title = ImageFont.truetype(FONT_BOLD, 74)
    f_body = ImageFont.truetype(FONT, 34)
    f_brand = ImageFont.truetype(FONT_BOLD, 28)

    left = 80
    text_w = 480

    kind = "Game" if p["category"] == "game" else "Windows app"
    draw.text((left, 90), kind.upper(), font=f_label, fill=ACCENT_2)

    title_lines = wrap(draw, p["name"], f_title, text_w)
    y = draw_text_block(draw, left, 130, title_lines, f_title, TEXT, 84)

    body_lines = wrap(draw, p["tagline"], f_body, text_w)[:3]
    draw_text_block(draw, left, y + 26, body_lines, f_body, MUTED, 46)

    draw.text((left, H - 90), "Nikatsam", font=f_brand, fill=TEXT)

    # Preview on the right, framed with a rounded border
    preview = ROOT / "assets" / "previews" / f"{p['slug']}.webp"
    if preview.exists():
        shot = Image.open(preview).convert("RGB")
        target_w, target_h = 500, 312
        shot = shot.resize((target_w, target_h), Image.LANCZOS)
        px, py = W - target_w - 60, (H - target_h) // 2
        mask = Image.new("L", (target_w, target_h), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, target_w, target_h), radius=18, fill=255)
        img.paste(shot, (px, py), mask)
        ImageDraw.Draw(img).rounded_rectangle((px - 2, py - 2, px + target_w + 2, py + target_h + 2), radius=20, outline=(60, 70, 110), width=2)
    return img


def site_card(cfg):
    img = gradient_background()
    draw = ImageDraw.Draw(img)
    draw.text((80, 150), "NIKATSAM", font=ImageFont.truetype(FONT_BOLD, 26), fill=ACCENT_2)
    f_title = ImageFont.truetype(FONT_BOLD, 84)
    y = draw_text_block(draw, 80, 190, wrap(draw, "Windows apps and games", f_title, 1000), f_title, TEXT, 98)
    f_body = ImageFont.truetype(FONT, 36)
    draw_text_block(draw, 80, y + 24, wrap(draw, "Small, useful Windows tools built by one developer.", f_body, 1000), f_body, MUTED, 50)
    return img


def main():
    cfg = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))
    out = ROOT / "assets" / "social"
    out.mkdir(parents=True, exist_ok=True)
    for p in cfg["projects"]:
        product_card(p).save(out / f"{p['slug']}.jpg", "JPEG", quality=88, optimize=True)
        print(f"{p['slug']}.jpg")
    site_card(cfg).save(out / "site.jpg", "JPEG", quality=88, optimize=True)
    print("site.jpg")


if __name__ == "__main__":
    main()

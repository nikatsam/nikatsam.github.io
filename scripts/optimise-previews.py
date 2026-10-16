# Shrinks captured preview PNGs to 960x600 WebP (about 10x smaller than the originals).
# Run after scripts/capture-previews.mjs: python scripts/optimise-previews.py
# Needs Pillow: pip install pillow
import pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent / "assets" / "previews"
for png in sorted(root.glob("*.png")):
    img = Image.open(png).convert("RGB").resize((960, 600), Image.LANCZOS)
    out = png.with_suffix(".webp")
    img.save(out, "WEBP", quality=78, method=6)
    png.unlink()
    print(f"{out.name}: {out.stat().st_size // 1024} KB")

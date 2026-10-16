# Downloads each product's Microsoft Store screenshots into assets/screens/<slug>/ and writes
# data/screenshots.json (file, width, height per image) for the product page galleries.
#
# Source: the Store's public product catalogue, using each project's Store ID from data/projects.json.
# Images are resized to at most 1280px wide and saved as WebP to keep pages light.
# Run: python scripts/fetch-store-screenshots.py   (needs Pillow)
import io
import json
import pathlib
import shutil
import urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOGUE = "https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds={id}&market=US&languages=en-us"
MAX_W = 1280
OUT = ROOT / "assets" / "screens"
MANIFEST = ROOT / "data" / "screenshots.json"


def screenshot_urls(store_id):
    data = json.load(urllib.request.urlopen(CATALOGUE.format(id=store_id), timeout=30))
    loc = data["Products"][0]["LocalizedProperties"][0]
    return [("https:" + i["Uri"] if i["Uri"].startswith("//") else i["Uri"])
            for i in loc.get("Images", []) if i.get("ImagePurpose") == "Screenshot"]


def main():
    cfg = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))
    manifest = {}
    if OUT.exists():
        shutil.rmtree(OUT)
    for p in cfg["projects"]:
        if not p.get("store"):
            continue
        folder = OUT / p["slug"]
        folder.mkdir(parents=True, exist_ok=True)
        items = []
        for n, url in enumerate(screenshot_urls(p["store"]), start=1):
            raw = urllib.request.urlopen(url, timeout=60).read()
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            if img.width > MAX_W:
                img = img.resize((MAX_W, round(img.height * MAX_W / img.width)), Image.LANCZOS)
            name = f"{n:02d}.webp"
            img.save(folder / name, "WEBP", quality=80, method=6)
            items.append({"file": name, "width": img.width, "height": img.height})
        manifest[p["slug"]] = items
        print(f"{p['slug']}: {len(items)} screenshots")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("manifest written:", MANIFEST.relative_to(ROOT))


if __name__ == "__main__":
    main()

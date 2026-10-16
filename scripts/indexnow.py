# Tells IndexNow (Bing, Yandex and others) about new or changed URLs in sitemap.xml.
#
# - Only submits URLs that are new, or whose lastmod changed since the last run (state in data/indexnow-state.json).
# - Checks the key file is reachable on the site before submitting, because IndexNow requires it.
# - Never fails the build: problems are printed and the run exits 0, so a flaky endpoint can't block the weekly job.
#
# Usage:
#   python scripts/indexnow.py            submit new or changed URLs
#   python scripts/indexnow.py --dry-run  show what would be submitted
import json
import pathlib
import secrets
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOST = "nikatsam.github.io"
SITE = f"https://{HOST}/"
ENDPOINT = "https://api.indexnow.org/indexnow"
CONFIG = ROOT / "data" / "indexnow.json"
STATE = ROOT / "data" / "indexnow-state.json"
BATCH = 10_000
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def ensure_key():
    """Create the key once. The key is public by design: IndexNow reads it from the site root."""
    cfg = load(CONFIG, {})
    if "key" not in cfg:
        cfg["key"] = secrets.token_hex(16)
        CONFIG.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    key_file = ROOT / f"{cfg['key']}.txt"
    if not key_file.exists():
        key_file.write_text(cfg["key"], encoding="utf-8")
    return cfg["key"]


def sitemap_entries():
    root = ET.parse(ROOT / "sitemap.xml").getroot()
    out = {}
    for u in root.iter(NS + "url"):
        loc = u.find(NS + "loc").text.strip()
        lm = u.find(NS + "lastmod")
        out[loc] = lm.text.strip() if lm is not None else None
    return out


def key_is_live(key):
    try:
        with urllib.request.urlopen(f"{SITE}{key}.txt", timeout=20) as r:
            return r.read().decode("utf-8").strip() == key
    except Exception:
        return False


def submit(key, urls):
    body = json.dumps({"host": HOST, "key": key, "keyLocation": f"{SITE}{key}.txt", "urlList": urls}).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return f"error: {e}"


def main():
    dry = "--dry-run" in sys.argv
    key = ensure_key()
    entries = sitemap_entries()
    state = load(STATE, {})

    changed = [u for u, lm in entries.items() if u not in state or (lm and state.get(u) != lm)]
    print(f"sitemap URLs: {len(entries)}  new or changed: {len(changed)}")
    if not changed:
        print("Nothing to submit.")
        return
    if dry:
        for u in changed: print("  would submit", u)
        return

    if not key_is_live(key):
        print(f"Key file {SITE}{key}.txt is not live yet. Deploy first, then run again. Nothing submitted.")
        return

    for i in range(0, len(changed), BATCH):
        batch = changed[i:i + BATCH]
        status = submit(key, batch)
        print(f"  batch of {len(batch)}: HTTP {status}")
        if status in (200, 202):
            for u in batch: state[u] = entries[u] or "submitted"
    STATE.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"state saved: {len(state)} URLs tracked")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"IndexNow skipped: {e}")

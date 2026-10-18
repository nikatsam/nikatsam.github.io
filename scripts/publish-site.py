# Publishes the site to the public repo nikatsam.github.io, leaving out documentation and reports.
#
# Documentation (*.md) and reports/ stay local and are never committed or pushed.
# Usage: python scripts/publish-site.py "Commit message"
# The public clone lives at PUBLISH_DIR (default: %TEMP%/site-publish). It is created on first use.
import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLISH_DIR = pathlib.Path(os.environ.get("PUBLISH_DIR", pathlib.Path(os.environ["TEMP"]) / "site-publish"))
REMOTE = "https://github.com/nikatsam/nikatsam.github.io.git"
SKIP_DIRS = {".git", "reports", "__pycache__"}
SKIP_SUFFIXES = (".md", ".pyc")
TRAILER = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"


def run(args, cwd):
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True).stdout


def ensure_clone():
    if not (PUBLISH_DIR / ".git").exists():
        PUBLISH_DIR.mkdir(parents=True, exist_ok=True)
        run(["git", "init", "-q", "-b", "main"], PUBLISH_DIR)
        run(["git", "remote", "add", "origin", REMOTE], PUBLISH_DIR)
        run(["git", "fetch", "-q", "origin", "main"], PUBLISH_DIR)
        run(["git", "reset", "-q", "origin/main"], PUBLISH_DIR)


def clear_publish_tree():
    for item in PUBLISH_DIR.iterdir():
        if item.name == ".git":
            continue
        shutil.rmtree(item) if item.is_dir() else item.unlink()


def stage():
    copied = []
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name.endswith(SKIP_SUFFIXES):
                continue
            src = pathlib.Path(root) / name
            rel = src.relative_to(ROOT)
            dst = PUBLISH_DIR / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            copied.append(str(rel))
    return copied


def main():
    message = sys.argv[1] if len(sys.argv) > 1 else "Update site"
    ensure_clone()
    clear_publish_tree()
    files = stage()
    run(["git", "add", "-A"], PUBLISH_DIR)
    leaked = [f for f in run(["git", "diff", "--cached", "--name-only"], PUBLISH_DIR).splitlines()
              if f.lower().endswith(".md") or f.startswith("reports/")]
    if leaked:
        sys.exit(f"Refusing to publish documentation or reports: {leaked}")
    if not run(["git", "diff", "--cached", "--name-only"], PUBLISH_DIR).strip():
        print("No changes to publish.")
        return
    full = f"{message}\n\n{TRAILER}"
    run(["git", "-c", "user.name=nikatsam", "-c", "user.email=nikatsam@users.noreply.github.com",
         "commit", "-q", "-m", full], PUBLISH_DIR)
    run(["git", "push", "-q", "origin", "main"], PUBLISH_DIR)
    print(f"Published {len(files)} files: {message}")


if __name__ == "__main__":
    main()

// Captures a 1280x800 PNG of each project website into assets/previews/<slug>.png.
// Local tool: needs Microsoft Edge or Chrome installed. Set BROWSER to override the path.
// Run: node scripts/capture-previews.mjs [slug ...]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ROOT, loadConfig } from "./lib.mjs";

const run = promisify(execFile);
const candidates = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter(Boolean);

let browser;
for (const c of candidates) {
  try { await access(c); browser = c; break; } catch { /* try next */ }
}
if (!browser) throw new Error("No Edge or Chrome found. Set BROWSER to the executable path.");

const cfg = await loadConfig();
const only = new Set(process.argv.slice(2));
await mkdir(new URL("assets/previews/", ROOT), { recursive: true });

for (const p of cfg.projects) {
  if (!p.site || (only.size && !only.has(p.slug))) continue;
  const out = new URL(`assets/previews/${p.slug}.png`, ROOT);
  await run(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--window-size=1280,800", "--virtual-time-budget=6000",
    `--screenshot=${fileURLToPath(out)}`, p.site,
  ], { timeout: 90_000 }).catch((err) => console.warn(`skip ${p.slug}: ${err.message.split("\n")[0]}`));
  console.log(`captured ${p.slug}`);
}

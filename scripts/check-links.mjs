// Link and Store check for the built site. Run before publishing.
//   FAIL (exit 1): a link returns 404/410, a local file is missing, or a Store ID opens a page for a different product.
//   WARN (exit 0): a site blocks bots (403/429), a server errors (5xx), or a request times out. These are retried, then reported.
import { readFile, readdir, access } from "node:fs/promises";
import { ROOT, loadConfig, storeUrl } from "./lib.mjs";

const cfg = await loadConfig();
const fails = [];
const warns = [];
const UA = "profile-site-link-check/1.0 (+https://github.com/nikatsam)";

async function status(url, method = "HEAD") {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "user-agent": UA } });
      if (res.status === 405 && method === "HEAD") return status(url, "GET");
      if (res.status < 500 && res.status !== 429 && res.status !== 403) return res;
      if (attempt === 3) return res;
    } catch (err) {
      if (attempt === 3) return { status: 0, error: err.name };
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

const htmlFiles = ["index.html", ...(await readdir(new URL("apps/", ROOT))).map((d) => `apps/${d}/index.html`)];
const links = new Map(); // url -> files that use it
for (const file of htmlFiles) {
  const html = await readFile(new URL(file, ROOT), "utf8");
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const v = m[1].replace(/&amp;/g, "&");
    if (/^https?:\/\//.test(v)) {
      if (!links.has(v)) links.set(v, new Set());
      links.get(v).add(file);
    } else if (!v.startsWith("#") && !v.startsWith("mailto:")) {
      const target = new URL(v.replace(/[#?].*$/, ""), new URL(file, ROOT));
      const ok = await access(target).then(() => true, () => false);
      const isDir = v.endsWith("/");
      if (!ok && !(isDir && await access(new URL("index.html", target)).then(() => true, () => false))) {
        fails.push(`missing local file: ${v} (in ${file})`);
      }
    }
  }
}

// Store IDs: the page must be for the product named on the card, not just any Store page
for (const p of cfg.projects.filter((x) => x.store)) {
  const res = await status(`${storeUrl(p.store)}?hl=en-us&gl=US`, "GET");
  if (res.status === 200) {
    const title = (await res.text()).match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!norm(title).startsWith(norm(p.name))) fails.push(`Store ID ${p.store} is "${title}", expected "${p.name}"`);
  } else if (res.status === 404 || res.status === 410) {
    fails.push(`Store ID ${p.store} (${p.name}) returns ${res.status}`);
  } else {
    warns.push(`Store ID ${p.store} (${p.name}) could not be verified: ${res.status || res.error}`);
  }
}

// Project websites and every other external link
for (const [url, files] of links) {
  const where = [...files].join(", ");
  // Links to this profile site are checked against the local build, since they only resolve after deploy
  // Only the profile's own pages (root and apps/) are local. Project websites are live sites.
  const ownPath = url.slice(cfg.siteUrl.length);
  if (url.startsWith(cfg.siteUrl) && (ownPath === "" || ownPath.startsWith("apps/") || ownPath.startsWith("feed") || ownPath.startsWith("privacy-first"))) {
    const rel = url.slice(cfg.siteUrl.length).replace(/[#?].*$/, "");
    const local = new URL(rel.endsWith("/") || rel === "" ? `${rel}index.html` : rel, ROOT);
    const ok = await access(local).then(() => true, () => false);
    if (!ok) fails.push(`${url} has no local file (in ${where})`);
    continue;
  }
  // Store product links were verified above by ID, so skip them here
  if (url.startsWith("https://apps.microsoft.com/detail/")) continue;
  const res = await status(url);
  if (res.status === 404 || res.status === 410) fails.push(`${url} returns ${res.status} (in ${where})`);
  else if (res.status >= 400 || res.status === 0) warns.push(`${url} returned ${res.status || res.error} (in ${where})`);
}

console.log(`Checked ${links.size} external links, ${cfg.projects.filter((p) => p.store).length} Store IDs, ${htmlFiles.length} pages.`);
for (const w of warns) console.log(`WARN  ${w}`);
for (const f of fails) console.log(`FAIL  ${f}`);
console.log(fails.length ? `FAILED: ${fails.length}` : "PASSED");
process.exitCode = fails.length ? 1 : 0;

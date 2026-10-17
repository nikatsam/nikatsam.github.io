// Builds one sitemap.xml for the profile site from every project site's sitemap,
// and writes an audit report of anything broken, redirected or excluded.
//
// Run: node scripts/build-sitemap.mjs
// Needs Node 18+ (uses global fetch). No dependencies.
//
// Why URLs and not child sitemaps: the project sites are all on the same host
// (nikatsam.github.io), so their URLs can sit in one sitemap. Listing the final
// URLs is simpler to audit than a sitemap index and avoids cross-host rules.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

// Last commit date (YYYY-MM-DD) of a file in the public repo. Used for lastmod on profile pages.
// Set PUBLISH_DIR to the public repo checkout. Defaults to the local publish clone.
const PUBLISH_DIR = process.env.PUBLISH_DIR || path.join(process.env.TEMP || os.tmpdir(), "site-publish");
function gitDate(relPath) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", relPath], { cwd: PUBLISH_DIR, encoding: "utf8" }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

const ROOT = new URL("../", import.meta.url);
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;
const USER_AGENT = "profile-sitemap-audit/1.0 (+https://github.com/nikatsam)";

const config = JSON.parse(await readFile(new URL("data/projects.json", ROOT), "utf8"));
const siteUrl = new URL(config.siteUrl);

const report = {
  generatedAt: new Date().toISOString(),
  projects: [],
  included: [],
  excluded: [],
};

// Minimal XML entity decoding for <loc> values
const decodeXml = (s) =>
  s.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
   .replaceAll("&quot;", '"').replaceAll("&apos;", "'");

const encodeXml = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
   .replaceAll('"', "&quot;").replaceAll("'", "&apos;");

async function get(url, opts = {}) {
  return fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": USER_AGENT },
    ...opts,
  });
}

// Read a project's sitemap (or sitemap index) and return [{ loc, lastmod }]
async function readSitemap(url, depth = 0) {
  const res = await get(url);
  if (!res.ok) return { error: `HTTP ${res.status}`, entries: [] };
  const xml = await res.text();

  if (/<sitemapindex/i.test(xml) && depth < 2) {
    const children = [...xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)].map((m) => decodeXml(m[1].trim()));
    const entries = [];
    for (const child of children) {
      const sub = await readSitemap(child, depth + 1);
      entries.push(...sub.entries);
    }
    return { entries };
  }

  const entries = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)]
    .map((m) => ({ loc: decodeXml(m[1].trim()), lastmod: m[2]?.trim() }));
  return { entries };
}

// Check a URL without downloading the body where possible.
// Returns the status and, for redirects, the target.
async function checkUrl(url) {
  try {
    let res = await get(url, { method: "HEAD", redirect: "manual" });
    if (res.status === 405 || res.status >= 400) {
      res = await get(url, { method: "GET", redirect: "manual" });
    }
    const location = res.headers.get("location");
    return { status: res.status, location: location ? new URL(location, url).href : null };
  } catch (err) {
    return { status: 0, error: err.name === "TimeoutError" ? "timeout" : String(err.message || err) };
  }
}

// Simple worker pool
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// 1. Collect candidate URLs from every project sitemap
const candidates = new Map(); // loc -> { lastmod, sources }
const addCandidate = (loc, lastmod, source) => {
  const existing = candidates.get(loc);
  if (existing) {
    existing.sources.add(source);
    existing.lastmod ??= lastmod;
  } else {
    candidates.set(loc, { lastmod, sources: new Set([source]) });
  }
};

// The profile's own pages are always candidates
addCandidate(config.siteUrl, gitDate("index.html"), "profile");
// ...plus the profile's own app pages and the privacy page
for (const p of config.projects) {
  if (p.site || p.store) addCandidate(new URL(`apps/${p.slug}/`, config.siteUrl).href, gitDate(`apps/${p.slug}/index.html`), "app page");
}
addCandidate(new URL("privacy-first/", config.siteUrl).href, gitDate("privacy-first/index.html"), "profile");

// Translated profile pages (see scripts/build-i18n.mjs). Every version lists all the others as alternates.
const i18nGroups = JSON.parse(readFileSync(new URL("data/i18n-groups.json", ROOT), "utf8"));
const alternates = new Map();
const pageDate = (url) => gitDate(url.replace(config.siteUrl, "") + "index.html");
for (const group of i18nGroups) {
  const members = Object.entries(group);
  for (const [, url] of members) {
    alternates.set(url, { members, xdefault: group.en });
    addCandidate(url, pageDate(url), "translation");
  }
}

for (const project of config.projects) {
  if (!project.pagesUrl) {
    report.projects.push({ name: project.name, status: "skipped", reason: "no GitHub Pages site" });
    continue;
  }
  const sitemapUrl = new URL("sitemap.xml", project.pagesUrl).href;
  const { entries, error } = await readSitemap(sitemapUrl);
  if (error) {
    report.projects.push({ name: project.name, sitemap: sitemapUrl, status: "error", reason: error });
    continue;
  }
  report.projects.push({ name: project.name, sitemap: sitemapUrl, status: "ok", urls: entries.length });
  for (const e of entries) addCandidate(e.loc, e.lastmod, project.name);
  addCandidate(project.pagesUrl, undefined, project.name);
}

// 2. Filter: same host only, HTML-like paths only
const toCheck = [];
for (const [loc, info] of candidates) {
  let u;
  try { u = new URL(loc); } catch {
    report.excluded.push({ url: loc, reason: "invalid URL" });
    continue;
  }
  if (u.host !== siteUrl.host) {
    report.excluded.push({ url: loc, reason: "different host (not in this sitemap)" });
    continue;
  }
  const isHtml = u.pathname.endsWith("/") || u.pathname.endsWith(".html") || !/\.[a-z0-9]+$/i.test(u.pathname);
  if (!isHtml) {
    report.excluded.push({ url: loc, reason: "non-HTML file (e.g. .xml manifest)" });
    continue;
  }
  toCheck.push({ loc, ...info });
}

// 3. Check each URL: keep only 200s, record redirects and broken links
const checks = await mapPool(toCheck, CONCURRENCY, async (item) => ({ item, result: await checkUrl(item.loc) }));

for (const { item, result } of checks) {
  const sources = [...item.sources];
  if (result.status === 200) {
    report.included.push({ url: item.loc, lastmod: item.lastmod, sources });
  } else if (result.status >= 300 && result.status < 400) {
    report.excluded.push({ url: item.loc, status: result.status, location: result.location, sources, reason: "redirect: list the target instead" });
  } else {
    report.excluded.push({ url: item.loc, status: result.status, error: result.error, sources, reason: "broken or unreachable" });
  }
}

// 4. Write sitemap.xml (sorted, deduplicated)
report.included.sort((a, b) => a.url.localeCompare(b.url));
const urlBlocks = report.included.map((r) => {
  const lastmod = r.lastmod ? `\n    <lastmod>${encodeXml(r.lastmod)}</lastmod>` : "";
  const alt = alternates.get(r.url);
  const links = alt
    ? "\n" + [
        ...alt.members.map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${encodeXml(href)}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${encodeXml(alt.xdefault)}"/>`,
      ].join("\n")
    : "";
  return `  <url>\n    <loc>${encodeXml(r.url)}</loc>${lastmod}${links}\n  </url>`;
});
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="sitemap.xsl"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urlBlocks.join("\n")}\n</urlset>\n`;

await writeFile(new URL("sitemap.xml", ROOT), sitemap, "utf8");

await mkdir(new URL("reports/", ROOT), { recursive: true });
await writeFile(new URL("reports/sitemap-audit.json", ROOT), JSON.stringify(report, null, 2) + "\n", "utf8");

// 5. Summary to the console
const broken = report.excluded.filter((e) => e.reason.startsWith("broken"));
const redirects = report.excluded.filter((e) => e.reason.startsWith("redirect"));
console.log(`Projects read:   ${report.projects.filter((p) => p.status === "ok").length}/${config.projects.length}`);
console.log(`URLs in sitemap: ${report.included.length}`);
console.log(`Redirects:       ${redirects.length}`);
console.log(`Broken:          ${broken.length}`);
console.log(`Excluded total:  ${report.excluded.length}`);
console.log("Report: reports/sitemap-audit.json");

// Exit non-zero only if a project sitemap could not be read at all.
// Broken pages are reported, not failed, so a flaky link does not block the deploy.
if (report.projects.some((p) => p.status === "error")) process.exitCode = 1;

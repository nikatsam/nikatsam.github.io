// Shared helpers for the site build scripts. Reads data/projects.json, the single source of truth.
import { readFile } from "node:fs/promises";

export const ROOT = new URL("../", import.meta.url);

export async function loadConfig() {
  return JSON.parse(await readFile(new URL("data/projects.json", ROOT), "utf8"));
}

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const storeUrl = (id) => `https://apps.microsoft.com/detail/${id}`;

export const reportUrl = (cfg, repo) =>
  `https://github.com/${cfg.owner}/${repo}/issues/new?template=bug_report.md&title=Bug:%20`;

export const statusText = { live: "Live", soon: "Coming to Store", repo: "Source only" };
export const statusClass = { live: "live", soon: "soon", repo: "repo" };

// Public page for each project on the profile site
export const detailPath = (p) => `apps/${p.slug}/`;

// Project cards get a preview image only when we have a captured screenshot file
export const previewPath = (p) => `assets/previews/${p.slug}.webp`;

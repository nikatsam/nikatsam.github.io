// Writes feed.xml (Atom) from data/updates.json, newest first. Maintain updates.json by hand
// for now. Later it can be filled from each public repo's GitHub Releases.
import { readFile, writeFile } from "node:fs/promises";
import { ROOT, loadConfig, esc } from "./lib.mjs";

const cfg = await loadConfig();
const updates = JSON.parse(await readFile(new URL("data/updates.json", ROOT), "utf8"))
  .sort((a, b) => b.date.localeCompare(a.date));
const self = `${cfg.siteUrl}feed.xml`;
const updated = updates[0] ? new Date(updates[0].date).toISOString() : "2026-10-16T00:00:00.000Z";

const entries = updates.map((u) => {
  const link = u.url || cfg.siteUrl;
  return `  <entry>
    <title>${esc(u.title)}</title>
    <id>${esc(link)}#${esc(u.date)}</id>
    <link href="${esc(link)}"/>
    <updated>${new Date(u.date).toISOString()}</updated>
    <summary>${esc(u.summary || "")}</summary>
  </entry>`;
});

const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Nikatsam updates</title>
  <id>${cfg.siteUrl}</id>
  <link href="${self}" rel="self"/>
  <link href="${cfg.siteUrl}"/>
  <updated>${updated}</updated>
${entries.join("\n")}
</feed>
`;
await writeFile(new URL("feed.xml", ROOT), xml, "utf8");
console.log(`feed.xml: ${updates.length} entries`);

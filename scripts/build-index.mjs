// Rebuilds the project cards, their detail dialogs, hero counts and ItemList data in index.html
// from data/projects.json. Edit the JSON, then run: node scripts/build-index.mjs
import { readFile, writeFile, access } from "node:fs/promises";
import { ROOT, loadConfig, esc, storeUrl, reportUrl, statusText, statusClass, detailPath, previewPath } from "./lib.mjs";

const cfg = await loadConfig();
const htmlUrl = new URL("index.html", ROOT);
let html = await readFile(htmlUrl, "utf8");
const exists = (rel) => access(new URL(rel, ROOT)).then(() => true, () => false);
const badgeText = (p) => (p.category === "game" ? "Game" : "Windows app");

const card = async (p) => {
  const preview = (await exists(previewPath(p)))
    ? `<figure class="preview"><img src="${previewPath(p)}" alt="${p.site ? `Screenshot of the ${esc(p.name)} website` : `Screenshot of ${esc(p.name)}`}" width="960" height="600" loading="lazy"></figure>`
    : "";
  return `        <article class="card reveal" data-cat="${p.category === "game" ? "game" : "app"}" data-name="${esc(p.name)}" data-added="${p.firstCommit}" data-search="${esc(`${p.name} ${p.tagline} ${badgeText(p)}`.toLowerCase())}">
          ${preview}
          <div class="card-top">
            <span class="badge">${badgeText(p)}</span>
            <span class="status ${statusClass[p.status]}">${statusText[p.status]}</span>
          </div>
          <h3>${esc(p.name)}</h3>
          <p class="tagline">${esc(p.tagline)}</p>
          <div class="card-actions">
            <button class="btn btn-ghost card-open" type="button" data-open="dlg-${p.slug}" aria-haspopup="dialog">Details</button>
          </div>
        </article>`;
};

const dialog = (p) => {
  const links = [
    p.store ? `<a class="btn btn-primary" href="${storeUrl(p.store)}">Microsoft Store</a>` : "",
    p.site ? `<a class="btn btn-ghost" href="${esc(p.site)}">Visit website</a>` : "",
    p.github ? `<a class="btn btn-ghost" href="${esc(p.github)}">View on GitHub</a>` : "",
  ].filter(Boolean).join("\n          ");
  const list = (items) => items.map((i) => `<li>${esc(i)}</li>`).join("");
  return `    <dialog class="project-dialog" id="dlg-${p.slug}" aria-labelledby="dlg-${p.slug}-title">
      <form method="dialog" class="dialog-close"><button class="btn btn-ghost" value="close">Close</button></form>
      <p class="eyebrow">${badgeText(p)} · <span class="status ${statusClass[p.status]}">${statusText[p.status]}</span></p>
      <h2 id="dlg-${p.slug}-title">${esc(p.name)}</h2>
      <p class="lead">${esc(p.excerpt)}</p>
      <p class="audience"><strong>Who it is for:</strong> ${esc(p.audience)}</p>
      ${p.features.length ? `<h3>What it does</h3><ul class="facts">${list(p.features)}</ul>` : ""}
      ${p.limits.length ? `<h3>What it doesn't do</h3><ul class="facts facts-no">${list(p.limits)}</ul>` : ""}
      <div class="dialog-links">
          ${links}
          ${(p.site || p.store) ? `<a class="btn btn-ghost" href="${detailPath(p)}">Full page</a>` : ""}
          ${p.bugRepo ? `<a class="btn btn-ghost" href="${reportUrl(cfg, p.bugRepo)}">Report a bug</a>` : ""}
      </div>
    </dialog>`;
};

const cards = (await Promise.all(cfg.projects.map(card))).join("\n\n");
html = html.replace(/<!-- cards:start -->[\s\S]*<!-- cards:end -->/, `<!-- cards:start -->\n${cards}\n        <!-- cards:end -->`);
html = html.replace(/<!-- dialogs:start -->[\s\S]*<!-- dialogs:end -->/, `<!-- dialogs:start -->\n${cfg.projects.map(dialog).join("\n")}\n    <!-- dialogs:end -->`);

// Hero counts
const live = cfg.projects.filter((p) => p.site).length;
const apps = cfg.projects.filter((p) => p.category !== "game").length;
const counts = [cfg.projects.length, live, apps];
let i = 0;
html = html.replace(/<strong data-count="\d+">\d+<\/strong>/g, () => {
  const n = counts[i++];
  return `<strong data-count="${n}">${n}</strong>`;
});

// ItemList for search engines: one entry per project, in page order
const items = cfg.projects.map((p, idx) => ({
  "@type": "ListItem",
  position: idx + 1,
  name: p.name,
  url: p.site || (p.store ? storeUrl(p.store) : p.github),
}));
const ld = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Person", "@id": `${cfg.siteUrl}#person`, name: "Nikatsam", description: "Solo developer making Windows tools and games for fun and side income.", url: cfg.siteUrl, sameAs: [`https://github.com/${cfg.owner}`] },
    { "@type": "WebSite", "@id": `${cfg.siteUrl}#website`, url: cfg.siteUrl, name: "Nikatsam Projects", publisher: { "@id": `${cfg.siteUrl}#person` } },
    { "@type": "ItemList", name: "Projects by Nikatsam", itemListElement: items },
  ],
};
html = html.replace(/<script type="application\/ld\+json" id="ld-projects">[\s\S]*?<\/script>/, () =>
  `<script type="application/ld+json" id="ld-projects">\n  ${JSON.stringify(ld, null, 2).replace(/\n/g, "\n  ")}\n  </script>`);

await writeFile(htmlUrl, html, "utf8");
console.log(`index.html: ${cfg.projects.length} cards and dialogs, counts ${counts.join("/")}`);

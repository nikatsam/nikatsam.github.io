// Writes one public page per project to apps/<slug>/index.html, from data/projects.json.
// Only facts we hold are shown. Screenshots come from the Store (data/screenshots.json).
import { writeFile, mkdir, access, readFile } from "node:fs/promises";
import { ROOT, loadConfig, esc, storeUrl, reportUrl, statusText, statusClass, previewPath } from "./lib.mjs";

const cfg = await loadConfig();
// Store screenshots, downloaded by scripts/fetch-store-screenshots.py
const shots = JSON.parse(await readFile(new URL("data/screenshots.json", ROOT), "utf8").catch(() => "{}"));
const exists = (rel) => access(new URL(rel, ROOT)).then(() => true, () => false);

const page = async (p) => {
  const url = `${cfg.siteUrl}apps/${p.slug}/`;
  const kind = p.category === "game" ? "Game" : "Windows app";
  const description = p.tagline;
  const actions = [
    p.store ? `<a class="btn btn-primary" href="${storeUrl(p.store)}">Get it on Microsoft Store</a>` : "",
    p.site ? `<a class="btn btn-ghost" href="${esc(p.site)}">Visit the website</a>` : "",
    p.github ? `<a class="btn btn-ghost" href="${esc(p.github)}">View on GitHub</a>` : "",
    p.bugRepo ? `<a class="btn btn-ghost" href="${reportUrl(cfg, p.bugRepo)}">Report a bug</a>` : "",
  ].filter(Boolean).join("\n        ");

  const items = shots[p.slug] || [];
  const gallery = items.length
    ? `<section class="gallery" aria-labelledby="shots-${p.slug}">
      <h2 id="shots-${p.slug}">Screenshots</h2>
      <ul class="shots">
        ${items.map((im, i) => `<li><figure><img src="../../assets/screens/${p.slug}/${im.file}" width="${im.width}" height="${im.height}" alt="${esc(p.name)} screenshot ${i + 1} of ${items.length}" loading="lazy"></figure></li>`).join("\n        ")}
      </ul>
    </section>`
    : "";

  const hasPreview = await exists(previewPath(p));
  const preview = hasPreview ? `<figure class="app-preview"><img src="../../${previewPath(p)}" alt="Screenshot of the ${esc(p.name)} website" width="1280" height="800"></figure>` : "";
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: p.name,
    description,
    operatingSystem: "Windows",
    applicationCategory: p.category === "game" ? "GameApplication" : "UtilitiesApplication",
    author: { "@type": "Person", name: "Nikatsam", url: cfg.siteUrl },
    url,
    ...(p.store ? { installUrl: storeUrl(p.store) } : {}),
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: cfg.siteUrl },
      { "@type": "ListItem", position: 2, name: p.name, item: url },
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(p.name)}: Windows ${p.category === "game" ? "game" : "app"} | Nikatsam</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#0b0d14">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(p.name)}: Windows ${p.category === "game" ? "game" : "app"} | Nikatsam">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${cfg.siteUrl}assets/social/${p.slug}.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${cfg.siteUrl}assets/social/${p.slug}.jpg">
  <script type="application/ld+json">
  ${JSON.stringify(schema, null, 2).replace(/\n/g, "\n  ")}
  </script>
  <script type="application/ld+json">
  ${JSON.stringify(crumbs, null, 2).replace(/\n/g, "\n  ")}
  </script>
  <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../../assets/styles.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="../../" aria-label="Back to Nikatsam home">
      <span class="brand-mark" aria-hidden="true">N</span>
      <span>Nikatsam</span>
    </a>
    <nav aria-label="Main"><a href="../../#projects">All projects</a></nav>
  </header>
  <main class="section app-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li><a href="../../">Home</a></li>
        <li aria-current="page">${esc(p.name)}</li>
      </ol>
    </nav>
    <p class="back"><a class="btn btn-ghost" href="../../#projects">&larr; Back to all projects</a></p>
    <p class="eyebrow">${kind} · <span class="status ${statusClass[p.status]}">${statusText[p.status]}</span></p>
    <h1>${esc(p.name)}</h1>
    <p class="lead">${esc(p.excerpt)}</p>
    <p class="audience"><strong>Who it is for:</strong> ${esc(p.audience)}</p>
    ${p.features.length ? `<h2>What it does</h2><ul class="facts">${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${p.limits.length ? `<h2>What it doesn't do</h2><ul class="facts facts-no">${p.limits.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    <div class="cta-row">
        ${actions}
    </div>
    ${gallery}
    ${preview}
    <p class="back back-bottom"><a class="btn btn-ghost" href="../../#projects">&larr; Back to all projects</a></p>
  </main>
  <footer class="site-footer">
    <p><a href="../../">Nikatsam</a> · <a href="../../#projects">All projects</a></p>
  </footer>
  <script src="../../assets/main.js" defer></script>
</body>
</html>
`;
};

for (const p of cfg.projects) {
  if (!p.site && !p.store) continue; // no public page for products without a site or Store listing
  await mkdir(new URL(`apps/${p.slug}/`, ROOT), { recursive: true });
  await writeFile(new URL(`apps/${p.slug}/index.html`, ROOT), await page(p), "utf8");
  console.log(`apps/${p.slug}/`);
}

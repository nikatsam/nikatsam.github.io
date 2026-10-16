// Builds the translated versions of the profile site: /es/, /fr/, /de/, /pt/.
// For each language it writes the home page, every product page and the privacy page,
// from data/i18n/<lang>.json and data/projects.json.
// It also adds hreflang links and a language switcher to the English pages, and writes
// data/i18n-groups.json so the sitemap can list every language version with its alternates.
//
// Run after build-index.mjs and build-app-pages.mjs:  node scripts/build-i18n.mjs
import { writeFile, mkdir, access, readFile } from "node:fs/promises";
import { ROOT, loadConfig, esc, storeUrl, reportUrl, statusText, statusClass, previewPath } from "./lib.mjs";

const LANGS = ["es", "fr", "de", "pt", "ja"];
const NATIVE = { en: "English", es: "Español", fr: "Français", de: "Deutsch", pt: "Português", ja: "日本語" };
const CLOSE = { es: "Cerrar", fr: "Fermer", de: "Schließen", pt: "Fechar", ja: "閉じる" };
const DIR = { es: "ltr", fr: "ltr", de: "ltr", pt: "ltr", ja: "ltr" };

const cfg = await loadConfig();
const SITE = cfg.siteUrl; // https://nikatsam.github.io/
const shots = JSON.parse(await readFile(new URL("data/screenshots.json", ROOT), "utf8").catch(() => "{}"));
const dict = {};
for (const l of LANGS) dict[l] = JSON.parse(await readFile(new URL(`data/i18n/${l}.json`, ROOT), "utf8"));
const exists = (rel) => access(new URL(rel, ROOT)).then(() => true, () => false);
const abs = (path) => SITE + path.replace(/^\//, "");

// English paths that have a translated version
const projects = cfg.projects.filter((p) => p.site || p.store);
const englishPaths = ["/", "/privacy-first/", ...projects.map((p) => `/apps/${p.slug}/`)];
const pathFor = (lang, P) => (lang === "en" ? P : `/${lang}${P}`);
const group = (P) => Object.fromEntries(["en", ...LANGS].map((l) => [l, abs(pathFor(l, P))]));

// --- shared pieces --------------------------------------------------------

const headLinks = (P) => {
  const g = group(P);
  return ["en", ...LANGS].map((l) => `<link rel="alternate" hreflang="${l}" href="${g[l]}">`).join("\n  ")
    + `\n  <link rel="alternate" hreflang="x-default" href="${g.en}">`;
};

const CODE = { en: "EN", es: "ES", fr: "FR", de: "DE", pt: "PT", ja: "JA" };
const switcher = (cur, P, label) => `<nav class="lang-switch" aria-label="${esc(label)}">${["en", ...LANGS]
  .map((l) => `<a href="${pathFor(l, P)}" hreflang="${l}" lang="${l}" title="${NATIVE[l]}"${l === cur ? ' aria-current="true"' : ""}>${CODE[l]}</a>`).join("")}</nav>`;

// The theme switch, shared by every page. main.js handles the click and the T key.
const THEME_BUTTON = `<button class="theme-toggle" type="button" id="theme-toggle" aria-label="Switch to light theme" title="Shortcut: T">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <span>Light</span>
      </button>`;
const headerTools = (cur, P, label) => `<div class="header-tools">${switcher(cur, P, label)}${THEME_BUTTON}</div>`;

const shell = ({ lang, title, desc, P, depth, header, main, ld }) => {
  const rel = "../".repeat(depth);
  return `<!doctype html>
<html lang="${lang}" dir="${DIR[lang]}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${abs(pathFor(lang, P))}">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#0b0d14">
  ${headLinks(P)}
  ${ld}
  <link rel="icon" href="${rel}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${rel}assets/styles.css">
</head>
<body>
${header}
${main}
  <script src="${rel}assets/main.js" defer></script>
</body>
</html>
`;
};

const siteHeader = (lang, P, home, ui, navLinks) => `  <header class="site-header">
    <a class="brand" href="${home}" aria-label="${esc(ui.home_title)}">
      <span class="brand-mark" aria-hidden="true">N</span>
      <span>Nikatsam</span>
    </a>
    <nav aria-label="Main">${navLinks}</nav>
    ${headerTools(lang, P, ui.lang_label)}
  </header>`;

const statusOf = (p, ui) => ({ label: ui["status_" + p.status] ?? statusText[p.status], cls: statusClass[p.status] });

// --- translated project card, dialog and page ----------------------------

const translated = (lang, p) => {
  const t = dict[lang].projects[p.slug] || {};
  return {
    tagline: t.tagline || p.tagline,
    excerpt: t.excerpt || p.excerpt,
    audience: t.audience || p.audience,
    features: t.features || p.features,
    limits: t.limits || p.limits,
  };
};

const card = (lang, p) => {
  const ui = dict[lang].ui;
  const tr = translated(lang, p);
  const badge = p.category === "game" ? ui.badge_game : ui.badge_app;
  const st = statusOf(p, ui);
  const primary = p.site ? `<a class="link-primary" href="${esc(p.site)}">${ui.btn_visit}</a>`
    : p.github ? `<a class="link-primary" href="${esc(p.github)}">${ui.btn_github}</a>` : "";
  const store = p.store ? `<a class="link-store" href="${storeUrl(p.store)}">${ui.btn_store}</a>` : "";
  const report = p.bugRepo ? `<a class="link-report" href="${reportUrl(cfg, p.bugRepo)}">${ui.btn_report}</a>` : "";
  return `        <article class="card reveal" data-cat="${p.category === "game" ? "game" : "app"}" data-name="${esc(p.name)}" data-added="${p.firstCommit}" data-search="${esc(`${p.name} ${tr.tagline} ${badge}`.toLowerCase())}">
          ${p.site || p.store ? "" : ""}
          <div class="card-top">
            <span class="badge">${badge}</span>
            <span class="status ${st.cls}">${st.label}</span>
          </div>
          <h3>${esc(p.name)}</h3>
          <p class="tagline">${esc(tr.tagline)}</p>
          <div class="card-actions">
            <button class="btn btn-ghost card-open" type="button" data-open="dlg-${lang}-${p.slug}" aria-haspopup="dialog">${ui.btn_details}</button>
          </div>
        </article>`;
};

const dialog = (lang, p) => {
  const ui = dict[lang].ui;
  const tr = translated(lang, p);
  const st = statusOf(p, ui);
  const links = [
    p.store ? `<a class="btn btn-primary" href="${storeUrl(p.store)}">${ui.btn_store}</a>` : "",
    p.site ? `<a class="btn btn-ghost" href="${esc(p.site)}">${ui.btn_visit}</a>` : "",
    p.github ? `<a class="btn btn-ghost" href="${esc(p.github)}">${ui.btn_github}</a>` : "",
    (p.site || p.store) ? `<a class="btn btn-ghost" href="apps/${p.slug}/">${ui.dialog_full}</a>` : "",
    p.bugRepo ? `<a class="btn btn-ghost" href="${reportUrl(cfg, p.bugRepo)}">${ui.btn_report}</a>` : "",
  ].filter(Boolean).join("\n          ");
  const list = (items) => items.map((i) => `<li>${esc(i)}</li>`).join("");
  return `    <dialog class="project-dialog" id="dlg-${lang}-${p.slug}" aria-labelledby="dlg-${lang}-${p.slug}-title">
      <form method="dialog" class="dialog-close"><button class="btn btn-ghost" value="close">${CLOSE[lang]}</button></form>
      <p class="eyebrow">${p.category === "game" ? ui.badge_game : ui.badge_app} · <span class="status ${st.cls}">${st.label}</span></p>
      <h2 id="dlg-${lang}-${p.slug}-title">${esc(p.name)}</h2>
      <p class="lead">${esc(tr.excerpt)}</p>
      <p class="audience"><strong>${ui.dialog_who}</strong> ${esc(tr.audience)}</p>
      ${tr.features.length ? `<h3>${ui.dialog_does}</h3><ul class="facts">${list(tr.features)}</ul>` : ""}
      ${tr.limits.length ? `<h3>${ui.dialog_doesnt}</h3><ul class="facts facts-no">${list(tr.limits)}</ul>` : ""}
      <div class="dialog-links">
          ${links}
      </div>
    </dialog>`;
};

const productPage = async (lang, p) => {
  const ui = dict[lang].ui;
  const tr = translated(lang, p);
  const st = statusOf(p, ui);
  const P = `/apps/${p.slug}/`;
  const url = abs(pathFor(lang, P));
  const home = `/${lang}/`;
  const actions = [
    p.store ? `<a class="btn btn-primary" href="${storeUrl(p.store)}">${ui.app_store}</a>` : "",
    p.site ? `<a class="btn btn-ghost" href="${esc(p.site)}">${ui.app_website}</a>` : "",
    p.github ? `<a class="btn btn-ghost" href="${esc(p.github)}">${ui.app_github}</a>` : "",
    p.bugRepo ? `<a class="btn btn-ghost" href="${reportUrl(cfg, p.bugRepo)}">${ui.app_bug}</a>` : "",
  ].filter(Boolean).join("\n        ");
  const items = shots[p.slug] || [];
  const gallery = items.length ? `<section class="gallery" aria-labelledby="shots-${p.slug}">
      <h2 id="shots-${p.slug}">${ui.app_shots}</h2>
      <ul class="shots">
        ${items.map((im, i) => `<li><figure><img src="../../../assets/screens/${p.slug}/${im.file}" width="${im.width}" height="${im.height}" alt="${esc(p.name)} ${i + 1}/${items.length}" loading="lazy"></figure></li>`).join("\n        ")}
      </ul>
    </section>` : "";
  const preview = (await exists(previewPath(p))) ? `<figure class="app-preview"><img src="../../../${previewPath(p)}" alt="${esc(p.name)}" width="1280" height="800"></figure>` : "";
  const ld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: p.name, description: tr.tagline,
    operatingSystem: "Windows", inLanguage: lang, url,
    applicationCategory: p.category === "game" ? "GameApplication" : "UtilitiesApplication",
    author: { "@type": "Person", name: "Nikatsam", url: SITE },
    ...(p.store ? { installUrl: storeUrl(p.store) } : {}),
  })}</script>
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: ui.crumb_home, item: abs(home) },
      { "@type": "ListItem", position: 2, name: p.name, item: url }] })}</script>`;
  const suffix = p.category === "game" ? ui.game_suffix : ui.app_suffix;
  return shell({
    lang, P, depth: 3, title: `${p.name}: ${suffix} | Nikatsam`, desc: tr.tagline, ld,
    header: siteHeader(lang, P, home, ui, `<a href="${home}#projects">${ui.nav_projects}</a>`),
    main: `  <main class="section app-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li><a href="${home}">${ui.crumb_home}</a></li>
        <li aria-current="page">${esc(p.name)}</li>
      </ol>
    </nav>
    <p class="back"><a class="btn btn-ghost" href="${home}#projects">${ui.app_back}</a></p>
    <p class="eyebrow">${p.category === "game" ? ui.badge_game : ui.badge_app} · <span class="status ${st.cls}">${st.label}</span></p>
    <h1>${esc(p.name)}</h1>
    <p class="lead">${esc(tr.excerpt)}</p>
    <p class="audience"><strong>${ui.app_who}</strong> ${esc(tr.audience)}</p>
    ${tr.features.length ? `<h2>${ui.app_what}</h2><ul class="facts">${tr.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${tr.limits.length ? `<h2>${ui.app_doesnt}</h2><ul class="facts facts-no">${tr.limits.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    <div class="cta-row">
        ${actions}
    </div>
    ${gallery}
    ${preview}
    <p class="back back-bottom"><a class="btn btn-ghost" href="${home}#projects">${ui.app_back}</a></p>
  </main>
  <footer class="site-footer">
    <p><a href="${home}">Nikatsam</a> · <a href="${home}#projects">${ui.nav_projects}</a></p>
    <p class="muted">${ui.footer_disclaimer}</p>
  </footer>`,
  });
};

// --- home and privacy ----------------------------------------------------

const homePage = (lang) => {
  const ui = dict[lang].ui;
  const home = `/${lang}/`;
  const live = projects.length;
  const liveSites = cfg.projects.filter((p) => p.site).length;
  const apps = cfg.projects.filter((p) => p.category !== "game").length;
  const ld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@graph": [
      { "@type": "Person", "@id": `${SITE}#person`, name: "Nikatsam", url: SITE, sameAs: [`https://github.com/${cfg.owner}`] },
      { "@type": "WebSite", "@id": `${SITE}#website`, url: abs(home), name: "Nikatsam", inLanguage: lang, publisher: { "@id": `${SITE}#person` } },
    ] })}</script>`;
  const points = ui.about_points.map((t, i) => `<li><span>${["W", "G", "&#9830;"][i]}</span> ${esc(t)}</li>`).join("\n        ");
  return shell({
    lang, P: "/", depth: 1, title: ui.home_title, desc: ui.home_desc, ld,
    header: siteHeader(lang, "/", home, ui, `<a href="#about">${ui.nav_about}</a><a href="#projects">${ui.nav_projects}</a><a href="privacy-first/">${ui.nav_privacy}</a><a href="#projects">${ui.nav_bugs}</a><a href="https://github.com/${cfg.owner}" rel="me">GitHub</a>`),
    main: `  <main id="top">
    <section class="hero">
      <div class="hero-bg" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="hero-inner reveal">
        <p class="eyebrow">${ui.eyebrow}</p>
        <h1>${esc(ui.title_before)}<span class="grad">${esc(ui.title_grad)}</span>${esc(ui.title_after)}</h1>
        <p class="lead">${esc(ui.lead)}</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="#projects">${ui.cta_explore}</a>
        </div>
        <ul class="stats" aria-label="${esc(ui.stat_projects)}">
          <li><strong>${live}</strong><span>${ui.stat_projects}</span></li>
          <li><strong>${liveSites}</strong><span>${ui.stat_sites}</span></li>
          <li><strong>${apps}</strong><span>${ui.stat_apps}</span></li>
        </ul>
      </div>
    </section>

    <section class="privacy-strip reveal" aria-label="${esc(ui.strip_link)}">
      <p>${ui.strip} <a class="trust-link" href="privacy-first/">${ui.strip_link}</a></p>
    </section>

    <section id="about" class="section split" aria-labelledby="about-title">
      <div class="reveal">
        <p class="eyebrow">${ui.about_eyebrow}</p>
        <h2 id="about-title">${esc(ui.about_title)}</h2>
        <p>${esc(ui.about_p1)}</p>
        <p>${esc(ui.about_p2)}</p>
      </div>
      <ul class="steps reveal">
        ${points}
      </ul>
    </section>

    <section id="projects" class="section" aria-labelledby="projects-title">
      <div class="section-head reveal">
        <p class="eyebrow">${ui.projects_eyebrow}</p>
        <h2 id="projects-title">${esc(ui.projects_title)}</h2>
        <p>${esc(ui.projects_lead)}</p>
      </div>
      <div class="filters reveal">
        <div class="filter-group" role="group" aria-label="${esc(ui.filter_label)}">
          <button class="chip is-active" type="button" aria-pressed="true" data-filter="all">${ui.filter_all}</button>
          <button class="chip" type="button" aria-pressed="false" data-filter="app">${ui.filter_apps}</button>
          <button class="chip" type="button" aria-pressed="false" data-filter="game">${ui.filter_games}</button>
        </div>
        <div class="filter-group" role="group" aria-label="${esc(ui.sort_label)}">
          <button class="chip" type="button" aria-pressed="false" data-sort="az">${ui.sort_az}</button>
          <button class="chip" type="button" aria-pressed="false" data-sort="oldest">${ui.sort_oldest}</button>
          <button class="chip" type="button" aria-pressed="false" data-sort="newest">${ui.sort_newest}</button>
        </div>
      </div>
      <div class="grid" id="project-grid">
${projects.map((p) => card(lang, p)).join("\n\n")}
      </div>
      <p class="empty" id="empty-state" hidden>${ui.no_projects}</p>
    </section>

${projects.map((p) => dialog(lang, p)).join("\n")}
  </main>
  <footer class="site-footer">
    <p>${ui.footer_built} <a href="https://github.com/${cfg.owner}">GitHub</a>.</p>
    <p class="muted">${ui.footer_disclaimer}</p>
  </footer>`,
  });
};

const privacyPage = (lang) => {
  const ui = dict[lang].ui;
  const pr = dict[lang].privacy;
  const P = "/privacy-first/";
  const home = `/${lang}/`;
  const sections = pr.sections.map((s) => `    <h2>${esc(s.h2)}</h2>
${s.list ? `    <ul class="plain-list">${s.list.map((li) => `<li>${li}</li>`).join("")}</ul>` : ""}${(s.paragraphs || []).map((para) => `    <p>${para}</p>`).join("\n")}`).join("\n\n");
  return shell({
    lang, P, depth: 2, title: pr.title, desc: pr.description,
    header: siteHeader(lang, P, home, ui, `<a href="${home}#projects">${ui.nav_projects}</a><a href="${home}#about">${ui.nav_about}</a>`),
    main: `  <main class="section app-page">
    <p class="eyebrow">${esc(pr.eyebrow)}</p>
    <h1>${esc(pr.h1)}</h1>
    <p class="lead">${esc(pr.lead)}</p>

${sections}
  </main>
  <footer class="site-footer">
    <p><a href="${home}">Nikatsam</a> · <a href="${home}#projects">${ui.nav_projects}</a></p>
  </footer>`,
    ld: "",
  });
};

// --- English pages: hreflang and switcher, kept between markers -----------

const injectEnglish = async (file, P) => {
  const path = new URL(file, ROOT);
  let t = await readFile(path, "utf8");
  t = t.replace(/\s*<!-- i18n-head -->[\s\S]*?<!-- \/i18n-head -->/g, "")
       .replace(/\s*<!-- i18n-switch -->[\s\S]*?<!-- \/i18n-switch -->/g, "");
  const head = `\n  <!-- i18n-head -->\n  ${headLinks(P)}\n  <!-- /i18n-head -->\n`;
  // Pages that already have a theme button (the hand-written home page) only get the language codes
  const hasTheme = /id="theme-toggle"/.test(t);
  const tools = hasTheme ? switcher("en", P, dict.es.ui.lang_label) : headerTools("en", P, dict.es.ui.lang_label);
  const sw = `\n    <!-- i18n-switch -->${tools}<!-- /i18n-switch -->\n  `;
  t = t.replace("</head>", `${head}</head>`).replace("</header>", `${sw}</header>`);
  await writeFile(path, t, "utf8");
};

// --- write everything -----------------------------------------------------

for (const lang of LANGS) {
  await mkdir(new URL(`${lang}/apps/`, ROOT), { recursive: true });
  await mkdir(new URL(`${lang}/privacy-first/`, ROOT), { recursive: true });
  await writeFile(new URL(`${lang}/index.html`, ROOT), homePage(lang), "utf8");
  await writeFile(new URL(`${lang}/privacy-first/index.html`, ROOT), privacyPage(lang), "utf8");
  for (const p of projects) {
    await mkdir(new URL(`${lang}/apps/${p.slug}/`, ROOT), { recursive: true });
    await writeFile(new URL(`${lang}/apps/${p.slug}/index.html`, ROOT), await productPage(lang, p), "utf8");
  }
  console.log(`${lang}: home, privacy and ${projects.length} product pages`);
}

for (const P of englishPaths) {
  const file = P === "/" ? "index.html" : `${P.slice(1)}index.html`;
  await injectEnglish(file, P);
}

await writeFile(new URL("data/i18n-groups.json", ROOT),
  JSON.stringify(englishPaths.map((P) => group(P)), null, 2) + "\n", "utf8");
console.log(`English pages updated: ${englishPaths.length}`);

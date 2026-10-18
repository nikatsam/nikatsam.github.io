// Adds the Google Analytics tag to every HTML page of the profile site, right after <head>.
// Kept between markers so re-running replaces the block instead of duplicating it.
// Run after the other build scripts:  node scripts/add-analytics.mjs
import { readdir, readFile, writeFile } from "node:fs/promises";
import { ROOT } from "./lib.mjs";

const ID = "G-S093L3PEBR";
const TAG = `<!-- ga:start -->
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${ID}');
</script>
<!-- ga:end -->`;

const SKIP_DIRS = new Set([".git", ".github", "node_modules", "reports", "scripts", "data"]);
// Search engine verification files must stay exactly as issued
const isVerificationFile = (name) => /^(google[0-9a-f]+|yandex_[0-9a-f]+)\.html$/i.test(name);

async function* htmlFiles(dirUrl) {
  for (const entry of await readdir(dirUrl, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* htmlFiles(new URL(`${entry.name}/`, dirUrl));
    } else if (entry.name.endsWith(".html") && !isVerificationFile(entry.name)) {
      yield new URL(entry.name, dirUrl);
    }
  }
}

let count = 0;
for await (const file of htmlFiles(ROOT)) {
  let html = await readFile(file, "utf8");
  html = html.replace(/\n?<!-- ga:start -->[\s\S]*?<!-- ga:end -->/g, "");
  if (!/<head[^>]*>/i.test(html)) continue;
  html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${TAG}`);
  await writeFile(file, html, "utf8");
  count++;
}
console.log(`Google Analytics tag added to ${count} pages`);

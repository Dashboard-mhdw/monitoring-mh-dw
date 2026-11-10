// Cache-busting: stamp every local stylesheet/script in index.html with a short content hash,
// and write an import map so each ES module (src/app/**/*.js) is also fetched by its hash.
// Browsers then pick up a changed file on the next normal load — no hard refresh needed.
// Run after changing any front-end file:  node scripts/stamp.mjs
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const hash = f => createHash("sha1").update(fs.readFileSync(path.join(ROOT, f))).digest("hex").slice(0, 8);
const walk = d => fs.readdirSync(path.join(ROOT, d), {withFileTypes: true})
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
// 1 · <link href="src/…css"> and <script src="core.js|src/…js">
html = html.replace(/(href|src)="((?:src\/|core\.js)[^"?]*)(\?v=[^"]*)?"/g, (m, attr, f) =>
  fs.existsSync(path.join(ROOT, f)) ? `${attr}="${f}?v=${hash(f)}"` : m);
// 2 · import map for the modules
const mods = walk("src/app").sort();
const map = {imports: Object.fromEntries(mods.map(f => ["./" + f, "./" + f + "?v=" + hash(f)]))};
const block = `<!-- stamp:importmap -->\n<script type="importmap">\n${JSON.stringify(map, null, 1)}\n</script>\n<!-- /stamp:importmap -->`;
html = /<!-- stamp:importmap -->[\s\S]*?<!-- \/stamp:importmap -->/.test(html)
  ? html.replace(/<!-- stamp:importmap -->[\s\S]*?<!-- \/stamp:importmap -->/, block)
  : html.replace(/<script type="module"/, block + "\n<script type=\"module\"");
fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log(`stamped index.html · ${mods.length} modules`);

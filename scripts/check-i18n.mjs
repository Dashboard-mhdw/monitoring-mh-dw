// Checks that Indonesian and English have the same keys and that every key used in the code exists.
// Run: node scripts/check-i18n.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import id from "../src/app/locales/id.js";
import en from "../src/app/locales/en.js";

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p); } })("src/app");
const used = new Set();
for (const f of [...files, "index.html"]) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/\bt\("([^"]+)"/g)) if (!m[1].endsWith(".")) used.add(m[1]);
  for (const m of s.matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g)) used.add(m[1]);
}
// Keys built at runtime from fixed lists.
["gMain", "gMore", "overview", "check", "h1", "alert", "reasons", "sites", "daily", "budget", "trend", "map", "more"].forEach(k => used.add("nav." + k));
["overview", "check", "budget", "sites", "more"].forEach(k => used.add("tab." + k));

["over", "nobudget", "early", "near", "ok", "none"].forEach(k => used.add("bstat." + k));
["alert", "over", "nobudget", "h1", "other"].forEach(k => used.add("reason.ctx." + k));
["nobar", "event", "backup", "admits", "kiosk", "training", "ops", "input", "other", "noreply", "sick"].forEach(k => used.add("reason.cat." + k));
["sheet", "local", "pending"].forEach(k => used.add("reason.saved." + k));
["recent", "sites", "pages", "months", "notes", "downloads", "dates"].forEach(k => used.add("search.g." + k));
["month", "csv", "alert", "budget", "trend", "reasons", "daily"].forEach(k => used.add("search.dl." + k));

["pkdw", "spkdw", "tpkdw", "pkwt", "total", "admits", "prod", "share"].forEach(k => used.add("daily.m." + k));
["code", "pkdw", "prod", "low"].forEach(k => used.add("daily.sort." + k));

const keys = d => new Set(Object.keys(d).filter(k => k !== "_cal"));
const problems = [];
for (const [name, d] of [["id", id], ["en", en]]) {
  for (const k of used) if (!(k in d)) problems.push(`${name}: missing "${k}"`);
}
for (const k of keys(id)) if (!keys(en).has(k)) problems.push(`en: missing "${k}" (present in id)`);
for (const k of keys(en)) if (!keys(id).has(k)) problems.push(`id: missing "${k}" (present in en)`);
for (const k of keys(id)) if (!used.has(k)) problems.push(`unused key "${k}"`);

if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`i18n OK · ${used.size} keys used · ${keys(id).size} per language`);

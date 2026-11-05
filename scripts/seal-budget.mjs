// Kunci budget bulanan per region: node scripts/seal-budget.mjs budget-2026-11.json [budget-2026-12.json ...]
// Input dari scripts/build-budget.mjs. Menulis secure/b/<YYYY-MM>/<all|r1..r6>.json:
// admin = semua site + kontrol budget perusahaan; region = site region itu saja (tanpa angka perusahaan).
// Memperbarui secure/index.json → "budgetMonths". Hanya pakai kunci publik.
import fs from "node:fs";
import path from "node:path";
import { SCOPES, slug, sealFor } from "./lib/seal.mjs";

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: node scripts/seal-budget.mjs budget-YYYY-MM.json ..."); process.exit(1); }
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const keys = JSON.parse(fs.readFileSync(path.join(ROOT, "secure", "keys.json"), "utf8")).scopes;
const sites = JSON.parse(fs.readFileSync(path.join(ROOT, "targets.json"), "utf8")).sites;
const idxPath = path.join(ROOT, "secure", "index.json");
const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, "utf8")) : {months: []};
idx.budgetMonths = idx.budgetMonths || [];
for (const f of files) {
  const b = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!b || !/^\d{4}-\d{2}$/.test(b.month || "") || !b.sites) { console.log(`skip ${f} (not a built budget month)`); continue; }
  const regionOf = c => (sites[c] && sites[c].region) || (b.sites[c] && b.sites[c].region) || null;
  const dir = path.join(ROOT, "secure", "b", b.month);
  fs.mkdirSync(dir, {recursive: true});
  for (const scope of SCOPES) {
    const part = scope === "ALL" ? b : {...b, control: {}, sites: Object.fromEntries(Object.entries(b.sites).filter(([c]) => regionOf(c) === scope))};
    fs.writeFileSync(path.join(dir, slug(scope) + ".json"), JSON.stringify(await sealFor(keys[scope], part)));
  }
  if (!idx.budgetMonths.includes(b.month)) idx.budgetMonths.push(b.month);
  console.log(`budget ${b.month}: ${Object.keys(b.sites).length} site sealed`);
}
idx.budgetMonths.sort();
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));

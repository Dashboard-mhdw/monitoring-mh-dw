// Seal data.json per scope: node scripts/seal-data.mjs [data.json]
// For every month in data.json writes secure/m/<YYYY-MM>/<all|r1..r6>.json (admin = all rows, region = its sites only)
// and updates secure/index.json (month list + generatedAt). Months not in data.json are left as they are,
// so the scheduled update only needs the current and previous month tabs. Uses public keys only.
import fs from "node:fs";
import path from "node:path";
import { SCOPES, slug, sealFor } from "./lib/seal.mjs";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const dataPath = process.argv[2] || path.join(ROOT, "data.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const keys = JSON.parse(fs.readFileSync(path.join(ROOT, "secure", "keys.json"), "utf8")).scopes;
const sites = JSON.parse(fs.readFileSync(path.join(ROOT, "targets.json"), "utf8")).sites;
const regionOf = name => { const c = String(name).split("-")[0]; return sites[c] ? sites[c].region : null; };

const idxPath = path.join(ROOT, "secure", "index.json");
const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, "utf8")) : {months: []};
const unknown = new Set();
for (const [key, packed] of Object.entries(data.months || {})) {
  const dir = path.join(ROOT, "secure", "m", key);
  fs.mkdirSync(dir, {recursive: true});
  for (const scope of SCOPES) {
    const rows = scope === "ALL" ? packed.rows : packed.rows.filter(r => regionOf(r[0]) === scope);
    if (scope === "ALL") packed.rows.forEach(r => { if (!regionOf(r[0])) unknown.add(r[0]); });
    fs.writeFileSync(path.join(dir, slug(scope) + ".json"), JSON.stringify(await sealFor(keys[scope], {...packed, rows})));
  }
  if (!idx.months.includes(key)) idx.months.push(key);
}
idx.months.sort();
idx.generatedAt = data.generatedAt || new Date().toISOString();
idx.source = data.source || idx.source || null;
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
console.log(`sealed ${Object.keys(data.months || {}).length} month(s) × ${SCOPES.length} scopes; index has ${idx.months.length} months, generatedAt ${idx.generatedAt}`);
if (unknown.size) console.log(`note: ${unknown.size} cinema(s) without a region in targets.json are visible to Admin only: ${[...unknown].join(", ")}`);

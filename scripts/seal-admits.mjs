// Kunci budget admits (dari file P&L, sheet "budget", kolom Asistentes) per region:
//   node scripts/seal-admits.mjs raw/admits-budget-2026.json
// Input: {source, year, months: {"YYYY-MM": {kodeSite: admits}}} — kodeSite = nomor depan nama site di dashboard ("7" = 7-SUN PLAZA).
// Menulis secure/a/<YYYY>/<all|r1..r6>.json dan memperbarui secure/index.json → "admitsYears".
// Dashboard memakai angka ini sebagai budget admits bulan itu (dibagi rata per hari ke minggu budget);
// site yang tidak punya angka di P&L tetap memakai Budget_Admits dari spreadsheet budget DW.
import fs from "node:fs";
import path from "node:path";
import { SCOPES, slug, sealFor } from "./lib/seal.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/seal-admits.mjs raw/admits-budget-YYYY.json"); process.exit(1); }
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const keys = JSON.parse(fs.readFileSync(path.join(ROOT, "secure", "keys.json"), "utf8")).scopes;
const sites = JSON.parse(fs.readFileSync(path.join(ROOT, "targets.json"), "utf8")).sites;
const a = JSON.parse(fs.readFileSync(file, "utf8"));
if (!a || !/^\d{4}$/.test(String(a.year)) || !a.months) throw new Error("format salah: butuh {year, months}");
const regionOf = c => (sites[c] && sites[c].region) || null;
const dir = path.join(ROOT, "secure", "a", String(a.year));
fs.mkdirSync(dir, {recursive: true});
for (const scope of SCOPES) {
  const months = Object.fromEntries(Object.entries(a.months).map(([k, v]) =>
    [k, scope === "ALL" ? v : Object.fromEntries(Object.entries(v).filter(([c]) => regionOf(c) === scope))]));
  fs.writeFileSync(path.join(dir, slug(scope) + ".json"), JSON.stringify(await sealFor(keys[scope], {source: a.source || "", year: a.year, months})));
}
const idxPath = path.join(ROOT, "secure", "index.json");
const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
idx.admitsYears = [...new Set([...(idx.admitsYears || []), String(a.year)])].sort();
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
console.log(`admits budget ${a.year}: ${Object.keys(a.months).length} bulan sealed`);

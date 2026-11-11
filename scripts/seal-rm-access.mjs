// Password region untuk email RM, dikunci HANYA untuk admin:
//   node scripts/seal-rm-access.mjs /path/pribadi/passwords.json
// Input sama dengan seal-vault.mjs ({"ADMIN": "...", "REGION 1": "...", ...}); password Admin TIDAK ikut disimpan.
// Menulis secure/p/all.json (hanya bisa dibuka dengan password Admin). Dashboard menampilkannya di email ke RM
// supaya tiap RM menerima link + password regionnya. Jalankan ulang setiap kali password region diganti.
import fs from "node:fs";
import path from "node:path";
import { sealFor } from "./lib/seal.mjs";

const f = process.argv[2];
if (!f) { console.error("usage: node scripts/seal-rm-access.mjs <passwords.json>"); process.exit(1); }
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const pw = JSON.parse(fs.readFileSync(f, "utf8"));
const regions = Object.fromEntries(Object.entries(pw).filter(([k]) => /^REGION \d+$/.test(k)));
const keys = JSON.parse(fs.readFileSync(path.join(ROOT, "secure", "keys.json"), "utf8")).scopes;
fs.mkdirSync(path.join(ROOT, "secure", "p"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "secure", "p", "all.json"), JSON.stringify(await sealFor(keys.ALL, {regions, sealedAt: new Date().toISOString()})));
console.log(`secure/p/all.json: ${Object.keys(regions).length} password region (admin only)`);

// Seal budget data per region: node scripts/seal-budget.mjs <budget.json> <passwords.json>
// Writes secure/vault.json. Plain budget + passwords stay OUTSIDE the repo.
// Each entry = AES-GCM(PBKDF2-SHA256(password, salt, ITER)) of {scope, label, budget}.
// One shared salt → the browser derives the key once and tries each entry; only the matching one decrypts.
import fs from "node:fs";
import path from "node:path";
import { webcrypto as crypto } from "node:crypto";

const [budgetPath, pwPath] = process.argv.slice(2);
if (!budgetPath || !pwPath) { console.error("usage: node scripts/seal-budget.mjs <budget.json> <passwords.json>"); process.exit(1); }
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
const pw = JSON.parse(fs.readFileSync(pwPath, "utf8"));
const targets = JSON.parse(fs.readFileSync(path.join(ROOT, "targets.json"), "utf8")).sites;
const ITER = 600000;
const b64 = u8 => Buffer.from(u8).toString("base64");

const salt = crypto.getRandomValues(new Uint8Array(16));
async function keyFor(password) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256"}, base, {name: "AES-GCM", length: 256}, false, ["encrypt"]);
}
const regionOf = code => (targets[code] && targets[code].region) || null;
const subset = scope => scope === "ALL" ? budget : {...budget, sites: Object.fromEntries(Object.entries(budget.sites).filter(([c]) => regionOf(c) === scope))};

const entries = [];
for (const [name, password] of Object.entries(pw)) {
  const scope = name === "ADMIN" ? "ALL" : name;
  const payload = {scope, label: name === "ADMIN" ? "Admin (semua region)" : name.replace(/^REGION/, "Region"), sealedAt: new Date().toISOString(), budget: subset(scope)};
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, await keyFor(password), new TextEncoder().encode(JSON.stringify(payload))));
  entries.push({iv: b64(iv), ct: b64(ct)});
  console.log(`${name}: ${Object.keys(payload.budget.sites).length} site`);
}
entries.sort(() => crypto.getRandomValues(new Uint8Array(1))[0] - 128);   // order says nothing about which region
fs.mkdirSync(path.join(ROOT, "secure"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "secure", "vault.json"), JSON.stringify({v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), entries}));
console.log("secure/vault.json written");

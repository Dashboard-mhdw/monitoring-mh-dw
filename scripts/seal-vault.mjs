// (Re)create the passwords' vault: node scripts/seal-vault.mjs <budget.json> <passwords.json>
// Generates NEW key pairs for all scopes → secure/keys.json (public) + secure/vault.json (private keys + budget,
// each entry locked with its password). Because the keys are new, run scripts/seal-data.mjs right after with a
// FULL data.json (all months), otherwise older months can no longer be opened.
// budget.json and passwords.json stay OUTSIDE the repo.
import fs from "node:fs";
import path from "node:path";
import { SCOPES, newKeyPair, sealWithPassword, randomBytes, b64 } from "./lib/seal.mjs";

const [budgetPath, pwPath] = process.argv.slice(2);
if (!budgetPath || !pwPath) { console.error("usage: node scripts/seal-vault.mjs <budget.json> <passwords.json>"); process.exit(1); }
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
const pw = JSON.parse(fs.readFileSync(pwPath, "utf8"));
const sites = JSON.parse(fs.readFileSync(path.join(ROOT, "targets.json"), "utf8")).sites;
const ITER = 600000, salt = randomBytes(16);
const pwOf = scope => pw[scope === "ALL" ? "ADMIN" : scope];
const subset = scope => scope === "ALL" ? budget : {...budget, sites: Object.fromEntries(Object.entries(budget.sites).filter(([c]) => sites[c] && sites[c].region === scope))};

const keys = {v: 1, note: "Public keys only. Private keys live in vault.json, locked by the passwords.", scopes: {}};
const entries = [];
for (const scope of SCOPES) {
  if (!pwOf(scope)) throw new Error("no password for " + scope);
  const kp = await newKeyPair();
  keys.scopes[scope] = kp.pub;
  const label = scope === "ALL" ? "Admin" : scope.replace(/^REGION/, "Region");
  entries.push(await sealWithPassword(pwOf(scope), salt, ITER, {scope, label, key: kp.priv, budget: subset(scope), sealedAt: new Date().toISOString()}));
  console.log(`${label}: ${Object.keys(subset(scope).sites).length} site budget`);
}
entries.sort(() => randomBytes(1)[0] - 128);   // the order says nothing about which password is which
fs.mkdirSync(path.join(ROOT, "secure"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "secure", "keys.json"), JSON.stringify(keys, null, 1));
fs.writeFileSync(path.join(ROOT, "secure", "vault.json"), JSON.stringify({v: 2, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), entries}));
console.log("secure/keys.json + secure/vault.json written — now run: node scripts/seal-data.mjs (with a full data.json)");

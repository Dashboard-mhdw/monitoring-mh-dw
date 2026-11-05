// (Re)create the passwords' vault: node scripts/seal-vault.mjs <passwords.json>
// Generates NEW key pairs for all scopes → secure/keys.json (public) + secure/vault.json (private keys,
// each entry locked with its password). Because the keys are new, re-seal everything right after:
//   node scripts/seal-data.mjs <full data.json>   and   node scripts/seal-budget.mjs <all budget-YYYY-MM.json>
// passwords.json stays OUTSIDE the repo.
import fs from "node:fs";
import path from "node:path";
import { SCOPES, newKeyPair, sealWithPassword, randomBytes, b64 } from "./lib/seal.mjs";

const [pwPath] = process.argv.slice(2);
if (!pwPath) { console.error("usage: node scripts/seal-vault.mjs <passwords.json>"); process.exit(1); }
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const pw = JSON.parse(fs.readFileSync(pwPath, "utf8"));
const ITER = 600000, salt = randomBytes(16);
const pwOf = scope => pw[scope === "ALL" ? "ADMIN" : scope];

const keys = {v: 1, note: "Public keys only. Private keys live in vault.json, locked by the passwords.", scopes: {}};
const entries = [];
for (const scope of SCOPES) {
  if (!pwOf(scope)) throw new Error("no password for " + scope);
  const kp = await newKeyPair();
  keys.scopes[scope] = kp.pub;
  const label = scope === "ALL" ? "Admin" : scope.replace(/^REGION/, "Region");
  entries.push(await sealWithPassword(pwOf(scope), salt, ITER, {scope, label, key: kp.priv, sealedAt: new Date().toISOString()}));
  console.log(`${label}: key sealed`);
}
entries.sort(() => randomBytes(1)[0] - 128);   // the order says nothing about which password is which
fs.mkdirSync(path.join(ROOT, "secure"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "secure", "keys.json"), JSON.stringify(keys, null, 1));
fs.writeFileSync(path.join(ROOT, "secure", "vault.json"), JSON.stringify({v: 2, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), entries}));
console.log("secure/keys.json + secure/vault.json written — now re-seal: scripts/seal-data.mjs (full data.json) + scripts/seal-budget.mjs (all budget months)");

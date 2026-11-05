// (Re)create the passwords' vault: node scripts/seal-vault.mjs <passwords.json> [--new-keys] [--tokens-out <file>]
// Each vault entry (locked with its password, PBKDF2-SHA256 → AES-GCM) holds:
//   key   = the scope's private ECDH key (opens secure/m and secure/b)
//   token = random write token for the online store (notes + budget transfers, scripts/dashboard-apps-script.gs)
// By default the existing key pairs are kept (opened with the same passwords), so sealed data stays readable.
// --new-keys makes fresh key pairs → re-seal everything afterwards (seal-data.mjs with a full data.json + seal-budget.mjs).
// --tokens-out writes {sha256(token): scope} for the Apps Script's TOKENS constant (hashes only, never the tokens).
// passwords.json stays OUTSIDE the repo.
import fs from "node:fs";
import path from "node:path";
import { webcrypto as crypto, createHash } from "node:crypto";
import { SCOPES, newKeyPair, sealWithPassword, randomBytes, b64 } from "./lib/seal.mjs";

const args = process.argv.slice(2);
const pwPath = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--tokens-out");
const NEW = args.includes("--new-keys");
const tokOut = args.includes("--tokens-out") ? args[args.indexOf("--tokens-out") + 1] : null;
if (!pwPath) { console.error("usage: node scripts/seal-vault.mjs <passwords.json> [--new-keys] [--tokens-out file]"); process.exit(1); }
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const pw = JSON.parse(fs.readFileSync(pwPath, "utf8"));
const pwOf = scope => pw[scope === "ALL" ? "ADMIN" : scope];
const vaultPath = path.join(ROOT, "secure", "vault.json"), keysPath = path.join(ROOT, "secure", "keys.json");
const un64 = s => Uint8Array.from(Buffer.from(s, "base64"));

async function openOld(password) {
  if (!fs.existsSync(vaultPath)) return null;
  const v = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name: "PBKDF2", salt: un64(v.salt), iterations: v.iter, hash: "SHA-256"}, base, {name: "AES-GCM", length: 256}, false, ["decrypt"]);
  for (const e of v.entries) { try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: "AES-GCM", iv: un64(e.iv)}, key, un64(e.ct)))); } catch (err) { /* next */ } }
  return null;
}

const oldKeys = fs.existsSync(keysPath) ? JSON.parse(fs.readFileSync(keysPath, "utf8")).scopes : {};
const ITER = 600000, salt = randomBytes(16);
const keys = {v: 1, note: "Public keys only. Private keys live in vault.json, locked by the passwords.", scopes: {}};
const entries = [], hashes = {};
for (const scope of SCOPES) {
  const password = pwOf(scope);
  if (!password) throw new Error("no password for " + scope);
  const old = NEW ? null : await openOld(password);
  let priv, pub;
  if (old && old.key && old.scope === scope && oldKeys[scope]) { priv = old.key; pub = oldKeys[scope]; }
  else { const kp = await newKeyPair(); priv = kp.priv; pub = kp.pub; }
  keys.scopes[scope] = pub;
  const token = b64(randomBytes(24));
  hashes[createHash("sha256").update(token).digest("hex")] = scope;
  const label = scope === "ALL" ? "Admin" : scope.replace(/^REGION/, "Region");
  entries.push(await sealWithPassword(password, salt, ITER, {scope, label, key: priv, token, sealedAt: new Date().toISOString()}));
  console.log(`${label}: ${old && old.key ? "key kept" : "NEW key"} + new token`);
}
entries.sort(() => randomBytes(1)[0] - 128);
fs.mkdirSync(path.join(ROOT, "secure"), {recursive: true});
fs.writeFileSync(keysPath, JSON.stringify(keys, null, 1));
fs.writeFileSync(vaultPath, JSON.stringify({v: 3, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), entries}));
if (tokOut) { fs.writeFileSync(tokOut, JSON.stringify(hashes, null, 1)); console.log("token hashes → " + tokOut); }
console.log("secure/keys.json + secure/vault.json written");

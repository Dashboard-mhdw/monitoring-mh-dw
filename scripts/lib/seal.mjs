// Shared crypto for the sealed dashboard data (Node ≥ 18 WebCrypto; the browser uses the same scheme in src/app/vault.js).
//  • Each scope (ALL = admin, REGION 1..6) has an ECDH P-256 key pair. The public key sits in secure/keys.json,
//    so the scheduled update can seal fresh data without knowing any password.
//  • The private key is stored only inside secure/vault.json, encrypted with that scope's password
//    (PBKDF2-SHA256 → AES-GCM-256).
//  • A sealed file = AES-GCM-256 with a key from ECDH(ephemeral key, scope public key).
import { webcrypto as crypto } from "node:crypto";

export const SCOPES = ["ALL", "REGION 1", "REGION 2", "REGION 3", "REGION 4", "REGION 5", "REGION 6"];
export const slug = scope => scope === "ALL" ? "all" : "r" + scope.replace(/\D/g, "");
export const b64 = u8 => Buffer.from(u8).toString("base64");
const enc = o => new TextEncoder().encode(JSON.stringify(o));
const ECDH = {name: "ECDH", namedCurve: "P-256"};

export async function newKeyPair() {
  const kp = await crypto.subtle.generateKey(ECDH, true, ["deriveKey"]);
  return {pub: await crypto.subtle.exportKey("jwk", kp.publicKey), priv: await crypto.subtle.exportKey("jwk", kp.privateKey)};
}

/** Seal any JSON value for a scope's public key (JWK). */
export async function sealFor(pubJwk, value) {
  const pub = await crypto.subtle.importKey("jwk", pubJwk, ECDH, false, []);
  const eph = await crypto.subtle.generateKey(ECDH, true, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name: "ECDH", public: pub}, eph.privateKey, {name: "AES-GCM", length: 256}, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, enc(value)));
  return {v: 1, epk: await crypto.subtle.exportKey("jwk", eph.publicKey), iv: b64(iv), ct: b64(ct)};
}

/** Encrypt a value with a password (used for the vault entries). */
export async function sealWithPassword(password, salt, iter, value) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name: "PBKDF2", salt, iterations: iter, hash: "SHA-256"}, base, {name: "AES-GCM", length: 256}, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, enc(value)));
  return {iv: b64(iv), ct: b64(ct)};
}

export const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));

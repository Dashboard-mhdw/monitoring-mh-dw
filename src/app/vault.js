// Password access. secure/vault.json holds one entry per password (6 regions + admin), each locked with
// PBKDF2-SHA256 → AES-GCM. An unlocked entry gives {scope, label, key (private ECDH key), budget}.
// The data itself lives in secure/m/<YYYY-MM>/<all|r1..r6>.json, sealed to that scope's public key by
// scripts/seal-data.mjs. The password never leaves the browser; the unlocked entry stays in sessionStorage
// only, so closing the tab locks the dashboard again. Built by scripts/seal-vault.mjs.
const KEY = "mhdw.vault.v2";
const un64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ECDH = {name: "ECDH", namedCurve: "P-256"};
const getJson = async path => { const r = await fetch(path + "?t=" + Date.now(), {cache: "no-store"}); if (!r.ok) throw new Error(path + " " + r.status); return r.json(); };

export const slug = scope => scope === "ALL" ? "all" : "r" + String(scope).replace(/\D/g, "");

/** Unlocked entry for this tab, or null. */
export function restore() {
  try { const s = sessionStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

export function forget() {
  try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked — nothing to clear */ }
}

/** Try a password against every entry. Resolves to the entry, or null when it matches none. */
export async function unlock(password) {
  const v = await getJson("secure/vault.json");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.trim()), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name: "PBKDF2", salt: un64(v.salt), iterations: v.iter, hash: "SHA-256"},
    base, {name: "AES-GCM", length: 256}, false, ["decrypt"]);
  for (const e of v.entries) {
    try {
      const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: un64(e.iv)}, key, un64(e.ct));
      const entry = JSON.parse(new TextDecoder().decode(pt));
      try { sessionStorage.setItem(KEY, JSON.stringify(entry)); } catch (err) { /* keep it in memory only */ }
      return entry;
    } catch (err) { /* not this entry — try the next */ }
  }
  return null;
}

/** Open one sealed file with the entry's private key. */
async function open(privKey, sealed) {
  const pub = await crypto.subtle.importKey("jwk", sealed.epk, ECDH, false, []);
  const aes = await crypto.subtle.deriveKey({name: "ECDH", public: pub}, privKey, {name: "AES-GCM", length: 256}, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: un64(sealed.iv)}, aes, un64(sealed.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/** Load every month this entry may see → the same shape as the old data.json. */
export async function loadData(entry) {
  const idx = await getJson("secure/index.json");
  const priv = await crypto.subtle.importKey("jwk", entry.key, ECDH, false, ["deriveKey"]);
  const s = slug(entry.scope), months = {};
  await Promise.all((idx.months || []).map(async k => {
    try { months[k] = await open(priv, await getJson(`secure/m/${k}/${s}.json`)); }
    catch (e) { console.warn("month", k, e); }
  }));
  if (!Object.keys(months).length) throw {code: "locked_stale", message: "no month could be opened"};
  return {generatedAt: idx.generatedAt, source: idx.source, months};
}

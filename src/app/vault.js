// Password-protected budget. secure/vault.json holds one AES-GCM entry per password
// (6 regions + admin), sealed by scripts/seal-budget.mjs. The password never leaves the browser;
// the decrypted budget is kept in sessionStorage only, so closing the tab locks it again.
const KEY = "mhdw.vault.v1";
const un64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** Previously unlocked payload for this tab, or null. */
export function restore() {
  try { const s = sessionStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

export function forget() {
  try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked — nothing to clear */ }
}

/** Try a password against every entry. Resolves to {scope, label, budget} or null when it matches none. */
export async function unlock(password) {
  const res = await fetch("secure/vault.json?t=" + Date.now(), {cache: "no-store"});
  if (!res.ok) throw new Error("vault " + res.status);
  const v = await res.json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.trim()), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name: "PBKDF2", salt: un64(v.salt), iterations: v.iter, hash: "SHA-256"},
    base, {name: "AES-GCM", length: 256}, false, ["decrypt"]);
  for (const e of v.entries) {
    try {
      const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: un64(e.iv)}, key, un64(e.ct));
      const payload = JSON.parse(new TextDecoder().decode(pt));
      try { sessionStorage.setItem(KEY, JSON.stringify(payload)); } catch (err) { /* keep it in memory only */ }
      return payload;
    } catch (err) { /* wrong entry for this password — try the next */ }
  }
  return null;
}

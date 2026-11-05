// Reasons (catatan dari CM) — data layer, no DOM.
// Stored in the Google Sheet "MH DW Notes" through an Apps Script web app (config.json → notesEndpoint,
// code in scripts/notes-apps-script.gs). Without an endpoint, or while the endpoint can't be reached,
// notes are kept in this browser and uploaded on the next successful load (the script ignores duplicate ids).

import { scopeCodes } from "./store.js";

const LS_PENDING = "mhdw.reasons.pending", LS_BY = "mhdw.reasons.by";
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let CFG = {}, LIST = [], MODE = "loading", ERR = null;
const subs = new Set();
const emit = () => subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

const newest = (a, b) => (b.date || "").localeCompare(a.date || "") || (b.ts || "").localeCompare(a.ts || "");
const fromRow = r => ({id: String(r.id), ts: String(r.timestamp || ""), site: String(r.site_code || ""), cinema: r.cinema || "",
  date: String(r.tanggal || "").slice(0, 10), context: r.konteks || "", category: r.kategori || "", reason: r.reason || "",
  source: r.sumber || "", by: r.dicatat_oleh || ""});

/** Notes the current password may see (region passwords: their own sites only). */
const visible = () => { const c = scopeCodes(); return c ? LIST.filter(n => c.has(n.site)) : LIST; };

export const reasons = {
  /** "loading" | "local" (no endpoint configured) | "sheet" (Google Sheet) | "offline" (endpoint unreachable) */
  get mode() { return MODE; },
  get error() { return ERR; },
  get all() { return visible().slice().sort(newest); },
  get pendingCount() { return visible().filter(n => n.local).length; },
  get lastBy() { return lsGet(LS_BY, ""); },
  forSite: code => visible().filter(n => n.site === String(code)).sort(newest),
  onDate: (code, iso) => visible().filter(n => n.site === String(code) && n.date === iso),
  inMonth: (code, key) => visible().filter(n => n.site === String(code) && (n.date || "").startsWith(key)),
};
export const onReasons = fn => subs.add(fn);

async function post(body) {
  try {
    const res = await fetch(CFG.notesEndpoint, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify({...body, key: CFG.notesKey}), redirect: "follow"});
    const j = await res.json();
    return !!(j && j.ok);
  } catch (e) { return false; }
}

export async function loadReasons() {
  try { const r = await fetch("config.json?t=" + Date.now(), {cache: "no-store"}); CFG = r.ok ? await r.json() : {}; } catch (e) { CFG = {}; }
  const pending = lsGet(LS_PENDING, []);
  if (!CFG.notesEndpoint) { MODE = "local"; ERR = null; LIST = pending.map(n => ({...n, local: true})); emit(); return; }
  try {
    const res = await fetch(CFG.notesEndpoint + (CFG.notesEndpoint.includes("?") ? "&" : "?") + "t=" + Date.now(), {cache: "no-store", redirect: "follow"});
    const j = await res.json();
    if (!j || !j.ok) throw new Error((j && j.error) || "endpoint");
    let remote = (j.notes || []).map(fromRow);
    const ids = new Set(remote.map(n => n.id));
    const toPush = pending.filter(n => !ids.has(n.id));
    if (toPush.length && await post({notes: toPush})) { remote = remote.concat(toPush); lsSet(LS_PENDING, []); }
    else if (toPush.length) remote = remote.concat(toPush.map(n => ({...n, local: true})));
    else lsSet(LS_PENDING, []);
    LIST = remote; MODE = "sheet"; ERR = null;
  } catch (e) {
    MODE = "offline"; ERR = (e && e.message) || String(e);
    LIST = pending.map(n => ({...n, local: true}));
  }
  emit();
}

/** Save a note. Returns "sheet" (saved to Google Sheet), "local" (no endpoint) or "pending" (kept locally, will retry). */
export async function addReason(n) {
  const note = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: new Date().toISOString(),
    site: String(n.site), cinema: n.cinema || "", date: n.date || "", context: n.context || "", category: n.category || "",
    reason: (n.reason || "").trim(), source: (n.source || "").trim(), by: (n.by || "").trim()};
  if (note.by) lsSet(LS_BY, note.by);
  let where = MODE === "local" ? "local" : "pending";
  if (MODE === "sheet" && await post({note})) where = "sheet";
  if (where !== "sheet") { lsSet(LS_PENDING, [...lsGet(LS_PENDING, []), note]); note.local = true; }
  LIST = [note, ...LIST];
  emit();
  return where;
}

export async function deleteReason(id) {
  const n = LIST.find(x => x.id === id); if (!n) return false;
  if (n.local) lsSet(LS_PENDING, lsGet(LS_PENDING, []).filter(x => x.id !== id));
  else if (!(await post({action: "delete", id}))) return false;
  LIST = LIST.filter(x => x.id !== id);
  emit();
  return true;
}

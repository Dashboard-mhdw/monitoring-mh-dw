// Online store — data layer, no DOM.
// Notes / reasons and budget transfers live in the budget spreadsheet through an Apps Script web app
// (config.json → apiEndpoint, code in scripts/dashboard-apps-script.gs). Every call carries the write token
// that came with the password (vault), so a region only sees and changes its own sites.
// Without an endpoint, or while it can't be reached, notes are kept in this browser and uploaded on the next
// successful load (the script ignores duplicate ids). Transfers need the endpoint.

import { scopeCodes, store } from "./store.js";

const LS_PENDING = "mhdw.reasons.pending", LS_BY = "mhdw.reasons.by";
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let CFG = {}, LIST = [], TRANSFERS = [], BUDGET_MONTH = null, MODE = "loading", ERR = null;
const subs = new Set();
const emit = () => subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

const newest = (a, b) => (b.date || "").localeCompare(a.date || "") || (b.ts || "").localeCompare(a.ts || "");
const endpoint = () => CFG.apiEndpoint || CFG.notesEndpoint || "";
const token = () => (store.access && store.access.token) || "";
const fromTr = r => ({id: String(r.id), ts: String(r.timestamp || ""), month: String(r.bulan || ""), region: r.region || "", from: String(r.dari_kode), fromName: r.dari_cinema,
  to: String(r.ke_kode), toName: r.ke_cinema, mh: +r.mh_dari || 0, mhTo: +r.mh_ke || 0, rateFrom: +r.rate_dari || 0, rateTo: +r.rate_ke || 0, amount: +r.amount || 0,
  fromBefore: +r.dari_sebelum, fromAfter: +r.dari_sesudah, toBefore: +r.ke_sebelum, toAfter: +r.ke_sesudah, reason: r.alasan || "", by: r.oleh || "", status: String(r.status || "ok")});
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
  /** Budget transfers the current password may see (server already filters by region). */
  get transfers() { return TRANSFERS.slice().sort((a, b) => b.ts.localeCompare(a.ts)); },
  /** Month the budget sheet is currently set to (from the server), e.g. 11. */
  get budgetMonth() { return BUDGET_MONTH; },
  get online() { return MODE === "sheet"; },
};
export const onReasons = fn => subs.add(fn);

async function call(body) {
  try {
    const res = await fetch(endpoint(), {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify({...body, token: token(), key: CFG.notesKey}), redirect: "follow"});
    return await res.json();
  } catch (e) { return {ok: false, error: (e && e.message) || "offline"}; }
}
async function post(body) { const j = await call(body); return !!(j && j.ok); }

let sig = "", timer = null;
const signature = () => JSON.stringify([LIST.map(n => n.id + (n.local ? "*" : "")).sort(), TRANSFERS.map(x => x.id + x.status).sort(), BUDGET_MONTH, MODE]);
/** Someone is typing or a dialog is open — don't re-render under their hands. */
const busy = () => { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || !!document.querySelector("dialog[open], .sheet.open, .modal.open"); };

/** Near real-time: re-read the sheet every 30 s while the tab is visible, and right away when it comes back into view. */
function startSync() {
  if (timer) return;
  const tick = () => { if (document.visibilityState === "visible" && endpoint() && token()) loadReasons({quiet: true}); };
  timer = setInterval(tick, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
  addEventListener("online", tick);
}

export async function loadReasons({quiet = false} = {}) {
  if (!quiet) { try { const r = await fetch("config.json?t=" + Date.now(), {cache: "no-store"}); CFG = r.ok ? await r.json() : {}; } catch (e) { CFG = {}; } }
  const pending = lsGet(LS_PENDING, []);
  if (!endpoint()) { MODE = "local"; ERR = null; LIST = pending.map(n => ({...n, local: true})); TRANSFERS = []; emit(); return; }
  try {
    const ep = endpoint();
    const res = await fetch(ep + (ep.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token()) + "&t=" + Date.now(), {cache: "no-store", redirect: "follow"});
    const j = await res.json();
    if (!j || !j.ok) throw new Error((j && j.error) || "endpoint");
    TRANSFERS = (j.transfers || []).map(fromTr); BUDGET_MONTH = j.budgetMonth || null;
    let remote = (j.notes || []).map(fromRow);
    const ids = new Set(remote.map(n => n.id));
    const toPush = pending.filter(n => !ids.has(n.id));
    if (toPush.length && await post({action: "note.add", notes: toPush})) { remote = remote.concat(toPush); lsSet(LS_PENDING, []); }
    else if (toPush.length) remote = remote.concat(toPush.map(n => ({...n, local: true})));
    else lsSet(LS_PENDING, []);
    LIST = remote; MODE = "sheet"; ERR = null;
    startSync();
  } catch (e) {
    if (quiet && MODE === "sheet") return;   // a missed background poll keeps what we have
    MODE = "offline"; ERR = (e && e.message) || String(e);
    LIST = pending.map(n => ({...n, local: true}));
  }
  const now = signature();
  if (quiet && (now === sig || busy())) return;   // nothing new, or the user is mid-input → next poll
  sig = now;
  emit();
}

/** Save a note. Returns "sheet" (saved to Google Sheet), "local" (no endpoint) or "pending" (kept locally, will retry). */
export async function addReason(n) {
  const note = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: new Date().toISOString(),
    site: String(n.site), cinema: n.cinema || "", date: n.date || "", context: n.context || "", category: n.category || "",
    reason: (n.reason || "").trim(), source: (n.source || "").trim(), by: (n.by || "").trim()};
  if (note.by) lsSet(LS_BY, note.by);
  let where = MODE === "local" ? "local" : "pending";
  if (MODE === "sheet" && await post({action: "note.add", note})) where = "sheet";
  if (where !== "sheet") { lsSet(LS_PENDING, [...lsGet(LS_PENDING, []), note]); note.local = true; }
  LIST = [note, ...LIST];
  emit();
  return where;
}

export async function deleteReason(id) {
  const n = LIST.find(x => x.id === id); if (!n) return false;
  if (n.local) lsSet(LS_PENDING, lsGet(LS_PENDING, []).filter(x => x.id !== id));
  else if (!(await post({action: "note.delete", id}))) return false;
  LIST = LIST.filter(x => x.id !== id);
  emit();
  return true;
}

/** Move MH DW budget from one site to another (rate-adjusted on the server). Resolves {ok, error?, mhTo, amount}. */
export async function addTransfer(t) {
  if (!endpoint()) return {ok: false, error: "offline"};
  const j = await call({action: "transfer.add", ...t});
  if (j && j.ok) { await loadReasons(); }
  return j || {ok: false};
}

export async function cancelTransfer(id, by) {
  const j = await call({action: "transfer.cancel", id, by});
  if (j && j.ok) await loadReasons();
  return j || {ok: false};
}

// Data layer — unlocks the sealed data (see vault.js) and exposes domain queries.
// No DOM, no strings: views decide how to present what this returns.
import { TODAY, isoOf } from "./format.js";
import * as Vault from "./vault.js";

const Core = globalThis.MHCore;
const bust = () => "?t=" + Date.now();

let DATA = null, TARGETS = null, BUDGET = null, ACCESS = null;  // ACCESS = {scope:"ALL"|"REGION n", label}
let cache = {};

export const store = {
  get generatedAt() { return DATA && DATA.generatedAt ? new Date(DATA.generatedAt).getTime() : null; },
  get targets() { return TARGETS; },
  get budget() { return BUDGET; },
  /** Who unlocked the budget: {scope, label}, or null while locked. */
  get access() { return ACCESS; },
  /** Month keys (YYYY-MM), newest first. */
  months() { return Object.keys((DATA && DATA.months) || {}).sort().reverse(); },
  has(key) { return !!(DATA && DATA.months && DATA.months[key]); },
};

async function getJson(path, required) {
  const res = await fetch(path + bust(), {cache: "no-store"});
  if (!res.ok) { if (required) throw {code: "no_data", message: path + " " + res.status}; return null; }
  return res.json();
}

export async function loadAll() {
  TARGETS = await getJson("targets.json").catch(() => null);
  const entry = Vault.restore();
  if (!entry) { DATA = null; setAccess(null); throw {code: "locked"}; }
  try { DATA = await Vault.loadData(entry); }
  catch (e) { if (e && e.code === "locked_stale") { Vault.forget(); setAccess(null); throw {code: "locked"}; } throw e; }
  setAccess(entry);
  cache = {};
}

/** Parsed month + stats, memoised. Returns null when the tab doesn't exist. */
export function getMonth(key) {
  if (!store.has(key)) return null;
  if (!cache[key]) {
    const m = Core.unpack(DATA.months[key]); m.key = key;
    cache[key] = {m, st: Core.stats(m, TODAY)};
  }
  return cache[key];
}

/** Rows that have not filled in Station PKWT on a given date. */
export function missingOn(iso) {
  const g = getMonth(iso.slice(0, 7)); if (!g) return null;
  const i = g.m.dates.findIndex(d => d.iso === iso); if (i < 0) return null;
  const missing = g.st.rows.filter(r => !r.days[i].filled)
    .map(r => ({...r, monthMiss: r.days.slice(0, i + 1).filter(x => !x.filled).length}));
  const bySite = new Map();
  missing.forEach(r => { if (!bySite.has(r.code)) bySite.set(r.code, []); bySite.get(r.code).push(r); });
  return {g, i, missing, bySite, total: g.m.rows.length};
}

/** Productivity alerts for a date (uses up to 8 days back across month boundaries). */
export function alertsOn(iso) {
  const ms = {};
  for (let n = 0; n >= -7; n--) { const k = Core.isoAdd(iso, n).slice(0, 7); const g = getMonth(k); if (g) ms[k] = g.m; }
  return Core.prodAlerts(k => ms[k] || null, iso, TARGETS || {});
}

function setAccess(p) {
  BUDGET = p ? p.budget : null;
  ACCESS = p ? {scope: p.scope, label: p.label} : null;
}

/** Unlock the dashboard with a region/admin password. Resolves true when it matched (data loads on the next loadAll). */
export async function unlock(password) { return !!(await Vault.unlock(password)); }

/** Lock again: forget the password entry and all data in memory. */
export function lock() { Vault.forget(); setAccess(null); DATA = null; cache = {}; }

/** Site codes visible to the current password (null = all). */
export function scopeCodes() {
  if (!ACCESS || ACCESS.scope === "ALL") return null;
  const T = (TARGETS && TARGETS.sites) || {};
  return new Set(Object.keys(T).filter(c => T[c].region === ACCESS.scope));
}

/** Budget vs actual for a month up to a cut-off date, limited to the unlocked region. */
export function budgetVsActual(key, cut) {
  const g = getMonth(key);
  if (!g || !BUDGET) return null;
  const codes = scopeCodes();
  const m = codes ? {...g.m, rows: g.m.rows.filter(r => codes.has(r.code))} : g.m;
  return Core.budgetVsActual(m, BUDGET, cut);
}

/** PKDW per site across months, for the trend view. */
export function trend(keys) {
  const ok = keys.filter(k => { const g = getMonth(k); return g && g.m.rows.length; });
  const idx = new Map();
  ok.forEach(k => getMonth(k).st.sites.forEach(s => {
    if (!idx.has(s.code)) idx.set(s.code, {code: s.code, cinema: s.cinema, v: {}});
    const e = idx.get(s.code); e.cinema = s.cinema; e.v[k] = s.pkdw;
  }));
  const sites = [...idx.values()].map(s => ({...s, sum: ok.reduce((a, k) => a + (s.v[k] || 0), 0)})).sort((a, b) => b.sum - a.sum);
  return {ok, failed: keys.filter(k => !ok.includes(k)), sites, tot: k => getMonth(k).st.tot};
}

export { isoOf };

/** Productivity alerts over a date range (inclusive). Each row carries its own `date`.
 *  Flagged rows are grouped by region → cinema → date, so a site flagged on several days sits together. */
export function alertsRange(from, to) {
  if (from > to) [from, to] = [to, from];
  const days = [], missing = [];
  for (let d = from; d <= to; d = Core.isoAdd(d, 1)) { const a = alertsOn(d); if (a) days.push(a); else missing.push(d); if (days.length + missing.length > 62) break; }
  if (!days.length) return null;
  const last = days[days.length - 1];
  const regionNo = r => parseInt(String(r).replace(/\D/g, ""), 10) || 99;
  const order = (a, b) => regionNo(a.region) - regionNo(b.region) || a.cinema.localeCompare(b.cinema) || a.date.localeCompare(b.date);
  const tag = a => r => ({...r, date: a.date});
  const uniq = arr => [...new Map(arr.map(r => [r.code, r])).values()];
  return {
    multi: days.length > 1, from: days[0].date, date: last.date, dates: days.map(a => a.date), missingDates: missing,
    tolerance: last.tolerance, window: last.window,
    flagged: days.flatMap(a => a.flagged.map(tag(a))).sort(order),
    rows: days.flatMap(a => a.rows.map(tag(a))).sort(order),
    noTarget: uniq(days.flatMap(a => a.noTarget)),
    missingWindow: [...new Set(days.flatMap(a => a.missingWindow))],
  };
}

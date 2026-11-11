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
  let got;
  try { got = await Vault.loadData(entry); }
  catch (e) { if (e && e.code === "locked_stale") { Vault.forget(); setAccess(null); throw {code: "locked"}; } throw e; }
  DATA = got.data;
  setAccess(entry, got.budget);
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

function setAccess(p, budget = null) {
  BUDGET = p ? budget : null;
  ACCESS = p ? {scope: p.scope, label: p.label, token: p.token || ""} : null;
}

/** Returns the access label ("Region 4", "Admin") when the password matches, otherwise false. */
export async function unlock(password) { const e = await Vault.unlock(password); return e ? (e.label || "OK") : false; }

/** Lock again: forget the password entry and all data in memory. */
export function lock() { Vault.forget(); setAccess(null); DATA = null; cache = {}; }

/** Site codes visible to the current password (null = all). */
export function scopeCodes() {
  if (!ACCESS || ACCESS.scope === "ALL") return null;
  const T = (TARGETS && TARGETS.sites) || {};
  return new Set(Object.keys(T).filter(c => T[c].region === ACCESS.scope));
}

/** Apply budget transfers made after the budget was last read from the sheet (the sheet itself is already updated;
 *  the dashboard picks that up at the next scheduled update). Each transfer moves MH from its date to month end. */
function withTransfers(b, key, transfers) {
  const built = b.builtAt ? Date.parse(b.builtAt) : 0;
  const list = (transfers || []).filter(x => x.status === "ok" && x.month === key && Date.parse(x.ts) > built);
  if (!list.length) return b;
  const sites = JSON.parse(JSON.stringify(b.sites || {}));
  const spread = (site, mh, fromIso) => {
    const s = sites[site]; if (!s) return;
    const w = (b.periods || []).map(p => p.end < fromIso ? 0 : (Date.parse(p.end) - Date.parse(p.start < fromIso ? fromIso : p.start)) / 864e5 + 1);
    const tot = w.reduce((a, v) => a + v, 0) || 1;
    s.mh = (s.mh || []).map((v, i) => v + mh * w[i] / tot);
    s.mhMonth = (s.mhMonth || 0) + mh;
    s.amountMonth = (s.amountMonth || 0) + mh * (s.rate || 0);
  };
  list.forEach(x => { const d = x.ts.slice(0, 10); spread(x.from, -x.mh, d); spread(x.to, x.mhTo, d); });
  return {...b, sites, pendingTransfers: list.length};
}

/** Replace each site's monthly admits budget with the P&L figure (spread over the budget weeks by days).
 *  Sites without a P&L figure keep Budget_Admits from the DW budget sheet. */
function withAdmitsPL(b, pl) {
  if (!pl || !Object.keys(pl).length) return b;
  const P = b.periods || [], days = P.map(p => (Date.parse(p.end) - Date.parse(p.start)) / 864e5 + 1), tot = days.reduce((a, v) => a + v, 0) || 1;
  const sites = {};
  Object.entries(b.sites || {}).forEach(([c, s]) => { sites[c] = Array.isArray(s) ? {mh: s} : {...s}; });
  Object.entries(pl).forEach(([c, v]) => {
    if (!(v > 0)) return;
    const s = sites[c] || (sites[c] = {mh: P.map(() => 0)});
    s.admits = days.map(d => Math.round(v * d / tot * 10) / 10);
    s.admitsMonth = v; s.admitsSource = "pl";
  });
  return {...b, sites, admitsSource: "pl"};
}

/** Budget vs actual for a month up to a cut-off date, limited to the unlocked region. */
export function budgetVsActual(key, cut, transfers) {
  const g = getMonth(key);
  if (!g || !BUDGET) return null;
  const codes = scopeCodes();
  let b = BUDGET.byMonth && BUDGET.byMonth[key];
  if (!b) return null;
  b = withAdmitsPL(withTransfers(b, key, transfers), BUDGET.admitsPL && BUDGET.admitsPL[key]);
  const m = codes ? {...g.m, rows: g.m.rows.filter(r => codes.has(r.code))} : g.m;
  const r = Core.budgetVsActual(m, b, cut);
  if (r) enrichAmounts(r, b);
  return r;
}

/** Add Rupiah, FT, rate and region to a budget-vs-actual result (rate = Rp per MH DW from the budget sheet). */
function enrichAmounts(r, b) {
  const S = b.sites || {}, T = (TARGETS && TARGETS.sites) || {};
  r.rows.forEach(x => {
    const s = S[x.code] || {};
    x.rate = s.rate || 0; x.ft = s.ft || 0; x.nobar = s.nobar || 0;
    x.region = (T[x.code] && T[x.code].region) || s.region || "";
    x.city = (T[x.code] && T[x.code].city || "").replace(/\s*\(perlu dicek\)/, "");
    x.target = (T[x.code] && T[x.code].target) || s.prod || null;
    x.amountMonth = s.amountMonth != null ? s.amountMonth : x.budgetMonth * x.rate;
    x.amountActual = x.actual * x.rate;
    x.amountToDate = x.budgetToDate * x.rate;
    x.amountRemaining = x.amountMonth - x.amountActual;
  });
  const sum = k => r.rows.reduce((a, x) => a + (x[k] || 0), 0);
  Object.assign(r.tot, {amountMonth: sum("amountMonth"), amountActual: sum("amountActual"), amountToDate: sum("amountToDate"), amountRemaining: sum("amountRemaining"), ft: sum("ft")});
  r.control = b.control || {};
  r.pendingTransfers = b.pendingTransfers || 0;
  r.periodsDef = b.periods || [];
  r.source = b.source || "";
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

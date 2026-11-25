// Global search (Spotlight-style): sites, pages, months, dates, notes and downloads in one box.
// Opens with ⌘K / Ctrl+K, "/" or the search buttons; arrows + Enter to pick, Esc to close.
import { t, _dicts } from "../i18n.js";
import { fmt, monthName, dateLong, dateShort, YESTERDAY, TODAY, pad } from "../format.js";
import { esc, ICON } from "../ui/dom.js";
import { store, getMonth, missingOn, alertsOn } from "../store.js";
import { state, MONTH_VIEWS } from "../state.js";
import { reasons } from "../reasons.js";
import { ACTIONS } from "./exports.js";
import { openSite } from "./site-detail.js";
import { openReason, exportReasons } from "./reasons.js";
import { exportDaily } from "./daily.js";

const LS_RECENT = "mhdw.search.recent";
const LANGS = Object.values(_dicts);
const both = key => LANGS.map(d => d[key] || "").join(" ");
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const PAGES = [
  ["overview", ICON.grid, "dashboard summary ringkasan"],
  ["h1", ICON.checklist, "h-1 h1 reminder belum isi pengisian kemarin"],
  ["alert", ICON.alert, "productivity alert email warning flag target"],
  ["reasons", ICON.note, "reason catatan note cm history riwayat"],
  ["sites", ICON.sites, "pkdw 59 site laporan bulanan report excel"],
  ["daily", ICON.table, "harian daily per hari matrix admits productivity prod pkwt"],
  ["budget", ICON.budget, "budget actual payroll cinthia over"],
  ["trend", ICON.trend, "tren trend bulanan monthly"],
  ["map", ICON.map, "peta map heatmap pengisian kalender calendar"],
];
const DOWNLOADS = [
  ["xlsx", "search.dl.month", "excel pkdw 59 site bulanan report"],
  ["csv", "search.dl.csv", "csv pkdw"],
  ["alert-xlsx", "search.dl.alert", "excel productivity alert dailyworker"],
  ["budget-xlsx", "search.dl.budget", "excel budget actual"],
  ["budget-mail-xlsx", "search.dl.mail", "excel lampiran email kak cinthia bulk booking nobar"],
  ["trend-xlsx", "search.dl.trend", "excel tren trend"],
  ["daily-xlsx", "search.dl.daily", "excel harian daily admits productivity"],
  ["reasons-xlsx", "search.dl.reasons", "excel reason catatan"],
];

const recent = {
  get() { try { return JSON.parse(localStorage.getItem(LS_RECENT)) || []; } catch (e) { return []; } },
  add(code) { try { localStorage.setItem(LS_RECENT, JSON.stringify([code, ...this.get().filter(c => c !== code)].slice(0, 5))); } catch (e) {} },
};

/** Score a haystack against query tokens: every token must appear; word starts and exact codes rank higher. */
function score(hay, tokens, code) {
  let s = 0;
  for (const tk of tokens) {
    if (code && tk === code) { s += 12; continue; }
    const i = hay.indexOf(tk);
    if (i < 0) return 0;
    s += (i === 0 || hay[i - 1] === " " || hay[i - 1] === "-") ? 3 : 1;
  }
  return s;
}

/** "12/10", "12-10-2026", "12 okt", "12 october", "2026-10-12" → ISO date (only past dates with data). */
function parseDate(q) {
  let d, m, y;
  let r = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [, y, m, d] = r;
  else if ((r = q.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/))) [, d, m, y] = r;
  else if ((r = q.match(/^(\d{1,2}) ([a-z]{3,})(?: (\d{4}))?$/))) {
    const mi = LANGS.map(L => L._cal.months.findIndex(n => norm(n).startsWith(r[2]))).find(i => i >= 0);
    if (mi == null) return null;
    [d, m, y] = [r[1], mi + 1, r[3]];
  } else return null;
  y = y ? (String(y).length === 2 ? "20" + y : y) : TODAY.slice(0, 4);
  const iso = `${y}-${pad(+m)}-${pad(+d)}`;
  const chk = new Date(iso + "T00:00:00");
  if (isNaN(chk) || chk.getDate() !== +d) return null;
  return iso < TODAY && store.has(iso.slice(0, 7)) ? iso : null;
}

/** Everything searchable, built once per open (cheap: ~60 sites). */
function index(app) {
  const key = store.has(state.month) ? state.month : store.months()[0];
  const g = key && getMonth(key);
  const miss = missingOn(YESTERDAY), al = alertsOn(YESTERDAY);
  const flagged = new Set(al ? al.flagged.map(r => String(r.code)) : []);
  const targets = (store.targets && store.targets.sites) || {};
  const sites = new Map();
  // Latest month first so names/formats are current; older months add sites that have since closed.
  [key, ...store.months().filter(k => k !== key).slice(0, 3)].filter(Boolean).forEach(k => {
    const gm = getMonth(k); if (!gm) return;
    gm.st.sites.forEach(s => { if (!sites.has(s.code)) sites.set(s.code, {...s, monthKey: k}); });
  });
  const items = [];
  sites.forEach(s => {
    const tg = targets[s.code] || {}, notes = reasons.forSite(s.code).length;
    const chips = [];
    if (miss && miss.bySite.has(s.code)) chips.push(["blue", t("search.chipH1")]);
    if (flagged.has(String(s.code))) chips.push(["orange", t("search.chipAlert")]);
    if (notes) chips.push(["", ICON.note + notes]);
    items.push({group: "sites", code: norm(s.code), hay: norm(`${s.code} ${s.name} ${s.cinema} ${(s.formats || []).join(" ")} ${tg.region || ""}`),
      icon: `<span class="spot-code">${esc(s.code)}</span>`, title: esc(s.name || s.cinema),
      sub: [tg.region, (s.formats || []).join(", "), s.monthKey === key ? `PKDW ${fmt(s.pkdw)} MH · ${monthName(key)}` : monthName(s.monthKey)].filter(Boolean).map(esc).join(" · "),
      chips, recentCode: s.code,
      run: () => { recent.add(s.code); openSite(s.code, s.monthKey); }});
  });
  PAGES.forEach(([v, ic, words]) => items.push({group: "pages", hay: norm(`${both("nav." + v)} ${words}`), icon: ic, title: t("nav." + v), run: () => app.go(v)}));
  store.months().forEach(k => items.push({group: "months", hay: norm(`${LANGS.map(L => L._cal.months[+k.slice(5) - 1]).join(" ")} ${k.slice(0, 4)} ${k}`), icon: ICON.calendar,
    title: monthName(k), sub: t("search.monthSub", {v: t("nav." + (MONTH_VIEWS.includes(state.view) ? state.view : "sites"))}),
    run: () => app.setMonth(k, MONTH_VIEWS.includes(state.view) ? state.view : "sites")}));
  DOWNLOADS.forEach(([act, label, words]) => items.push({group: "downloads", hay: norm(`${both(label)} ${both("common.downloadExcel")} download unduh ${words}`), icon: ICON.down,
    title: t(label), sub: ["xlsx", "csv", "daily-xlsx"].includes(act) && key ? monthName(key) : "", run: () => (act === "reasons-xlsx" ? exportReasons() : act === "daily-xlsx" ? exportDaily() : ACTIONS[act]())}));
  reasons.all.forEach(n => items.push({group: "notes", hay: norm(`${n.site} ${n.cinema} ${n.reason} ${n.category} ${n.context} ${n.source} ${n.by}`), icon: ICON.note,
    title: `${esc(n.cinema)} · ${n.date ? dateShort(n.date) : "–"}`, sub: esc(n.reason.length > 110 ? n.reason.slice(0, 110) + "…" : n.reason),
    run: () => openReason({site: n.site, cinema: n.cinema, date: n.date, context: "other"}, app)}));
  return {items, sites};
}

const GROUPS = ["dates", "sites", "pages", "months", "notes", "downloads"];
const LIMIT = {sites: 8, pages: 4, months: 3, notes: 5, downloads: 3, dates: 2};

function results(q, idx, app) {
  const nq = norm(q);
  if (!nq) {
    const rec = recent.get().map(c => idx.items.find(i => i.recentCode === c)).filter(Boolean).map(i => ({...i, group: "recent"}));
    const pages = idx.items.filter(i => i.group === "pages");
    return [...rec, ...pages];
  }
  const tokens = nq.split(" ");
  const out = [];
  const iso = parseDate(nq);
  if (iso) {
    out.push({group: "dates", icon: ICON.checklist, title: t("search.dateH1"), sub: dateLong(iso), run: () => { state.h1Date = iso; app.go("h1"); }, s: 99});
    out.push({group: "dates", icon: ICON.alert, title: t("search.dateAlert"), sub: dateLong(iso), run: () => { state.alertDate = iso; state.alertFrom = iso; app.go("alert"); }, s: 98});
  }
  idx.items.forEach(i => { const s = score(i.hay, tokens, i.code); if (s) out.push({...i, s}); });
  return GROUPS.flatMap(gr => out.filter(i => i.group === gr).sort((a, b) => b.s - a.s).slice(0, LIMIT[gr]));
}

let closeFn = null;

export function openSearch(app, initial = "") {
  if (closeFn) return;
  const idx = index(app);
  const prev = document.activeElement;
  const scrim = document.createElement("div");
  scrim.className = "scrim spot-scrim";
  scrim.innerHTML = `<div class="spot" role="dialog" aria-modal="true" aria-label="${esc(t("search.title"))}">
    <div class="spot-field">${ICON.search}<input id="spotQ" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(t("search.ph"))}" aria-label="${esc(t("search.title"))}" aria-controls="spotList" role="combobox" aria-expanded="true"><kbd class="spot-esc">esc</kbd></div>
    <div class="spot-list" id="spotList" role="listbox"></div>
    <div class="spot-foot"><span><kbd>↑</kbd><kbd>↓</kbd>${t("search.kNav")}</span><span><kbd>↵</kbd>${t("search.kOpen")}</span><span class="spot-hint">${t("search.hint")}</span></div></div>`;
  const input = scrim.querySelector("#spotQ"), list = scrim.querySelector("#spotList");
  let rows = [], active = 0;

  const draw = () => {
    rows = results(input.value, idx, app);
    active = Math.min(active, Math.max(0, rows.length - 1));
    if (!rows.length) { list.innerHTML = `<div class="spot-empty"><b>${t("search.none", {q: esc(input.value.trim())})}</b><span>${t("search.noneSub")}</span></div>`; return; }
    let last = "";
    list.innerHTML = rows.map((r, i) => {
      const head = r.group !== last ? `<div class="spot-group">${t("search.g." + r.group)}</div>` : "";
      last = r.group;
      return head + `<div class="spot-item" role="option" id="spot-${i}" data-i="${i}" aria-selected="${i === active}">
        <span class="spot-ic">${r.icon}</span><span class="spot-t"><b>${r.title}</b>${r.sub ? `<span>${r.sub}</span>` : ""}</span>
        ${(r.chips || []).map(([tone, txt]) => `<span class="tag ${tone}">${txt}</span>`).join("")}<span class="spot-go">${ICON.chev}</span></div>`;
    }).join("");
    input.setAttribute("aria-activedescendant", "spot-" + active);
  };
  const highlight = () => {
    list.querySelectorAll(".spot-item").forEach(el => el.setAttribute("aria-selected", +el.dataset.i === active));
    const el = list.querySelector(`[data-i="${active}"]`); if (el) el.scrollIntoView({block: "nearest"});
    input.setAttribute("aria-activedescendant", "spot-" + active);
  };
  const pick = i => { const r = rows[i]; if (!r) return; close(); r.run(); };
  const close = () => { scrim.remove(); document.removeEventListener("keydown", onKey, true); closeFn = null; if (prev && prev.focus) prev.focus(); };
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return close(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!rows.length) return; active = (active + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length; highlight(); }
    else if (e.key === "Enter" && document.activeElement === input) { e.preventDefault(); pick(active); }
  };
  input.addEventListener("input", () => { active = 0; draw(); list.scrollTop = 0; });
  list.addEventListener("pointermove", e => { const el = e.target.closest(".spot-item"); if (el && +el.dataset.i !== active) { active = +el.dataset.i; highlight(); } });
  list.addEventListener("click", e => { const el = e.target.closest(".spot-item"); if (el) pick(+el.dataset.i); });
  scrim.addEventListener("click", e => { if (e.target === scrim) close(); });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(scrim);
  input.value = initial; draw(); input.focus();
  closeFn = close;
}

/** Global shortcuts: ⌘K / Ctrl+K anywhere, "/" when not typing. */
export function wireSearch(app) {
  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); closeFn ? closeFn() : openSearch(app); }
    else if (e.key === "/" && !typing && !closeFn && !document.querySelector(".scrim")) { e.preventDefault(); openSearch(app); }
  });
}
export const shortcutLabel = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";

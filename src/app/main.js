// App entry — builds the shell, routes between features, wires global events.
import { t, getLang, setLang, onLangChange, translateDom } from "./i18n.js";
import { monthName, stamp, YESTERDAY } from "./format.js";
import { $, esc, ICON, initTooltip } from "./ui/dom.js";
import { header, notice } from "./ui/components.js";
import { store, loadAll, missingOn, alertsOn, lock } from "./store.js";
import { renderGate } from "./features/gate.js";
import { state, persist, applyTheme, MONTH_VIEWS } from "./state.js";
import { ACTIONS } from "./features/exports.js";
import { openSite } from "./features/site-detail.js";
import { SHEET_URL } from "./features/shared.js";
import overview from "./features/overview.js";
import h1 from "./features/h1.js";
import alert from "./features/alert.js";
import sites from "./features/sites.js";
import budget from "./features/budget.js";
import trend from "./features/trend.js";
import daily from "./features/daily.js";
import map from "./features/map.js";
import check from "./features/check.js";
import calc from "./features/calc.js";
import more from "./features/more.js";
import reasonsView, { openReason, exportReasons, needCount } from "./features/reasons.js";
import { loadReasons, onReasons } from "./reasons.js";
import { openSearch, wireSearch, shortcutLabel } from "./features/search.js";

const FEATURES = {overview, check, h1, alert, reasons: reasonsView, calc, sites, daily, budget, trend, map, more};

// Navigation model — one source for sidebar and tab bar.
const NAV = [
  {group: "nav.gMain", items: [["overview", ICON.grid], ["check", ICON.alert, "check"], ["budget", ICON.budget], ["calc", ICON.calc], ["sites", ICON.sites], ["trend", ICON.trend], ["reasons", ICON.note, "reasons"]]},
  {group: "nav.gMore", items: [["map", ICON.map]]},
];
const TABS = [["overview", ICON.grid, "tab.overview"], ["check", ICON.alert, "tab.check", "check"], ["budget", ICON.budget, "tab.budget"], ["sites", ICON.sites, "tab.sites"], ["more", ICON.more, "tab.more"]];
// Old page ids (bookmarks / saved state) → new pages
const ALIAS = {h1: "check", alert: "check", daily: "sites"};
const badges = {check: 0, reasons: 0};

const app = {
  go(view, sub) {
    if (ALIAS[view]) { if (view === "h1" || view === "alert") state.checkTab = view; if (view === "daily") state.siteView = "daily"; view = ALIAS[view]; }
    if (sub) { if (view === "check") state.checkTab = sub; if (view === "sites") state.siteView = sub; }
    if (!FEATURES[view]) return;
    state.view = view; persist();
    window.scrollTo(0, 0);
    renderChrome(); render();
  },
  rerender: () => render(),
  setMonth(key, view) {
    if (!store.has(key)) return;
    state.month = key; state.budgetCut = null; $("monthSel").value = key;
    if (view && view !== state.view) app.go(view); else { window.scrollTo(0, 0); render(); }
  },
};

/* ---------- Shell ---------- */
function renderChrome() {
  const badge = k => k && badges[k] ? `<span class="badge">${badges[k]}</span>` : "";
  const cur = v => (v === state.view || (state.view !== "more" && v === "more" && ["trend", "map", "reasons"].includes(state.view))) ? ' aria-current="page"' : "";
  $("sideNav").innerHTML = NAV.map(g => `<div class="side-label">${t(g.group)}</div>` +
    g.items.map(([v, ic, b]) => `<button class="nav-item" type="button" data-go="${v}"${v === state.view ? ' aria-current="page"' : ""}>${ic}<span>${t("nav." + v)}</span>${badge(b)}</button>`).join("")).join("");
  $("tabbar").innerHTML = TABS.map(([v, ic, l, b]) => `<button type="button" data-go="${v}"${cur(v)}>${ic}${t(l)}${badge(b)}</button>`).join("");
  document.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === getLang()));
  document.querySelectorAll("#sideFoot [data-thm]").forEach(b => b.setAttribute("aria-pressed", b.dataset.thm === state.theme));
  $("compactTitle").textContent = t("nav." + state.view);
  $("who").innerHTML = store.access ? `<span class="who-label">${ICON.lock}${esc(store.access.label)}</span><button type="button" class="btn plain who-out" data-act="logout">${t("lock.signOut")}</button>` : "";
  $("monthSel").hidden = !MONTH_VIEWS.includes(state.view);
  document.title = t("nav." + state.view) + " · Monitoring MH DW";
}

function fillMonths() {
  const keys = store.months();
  if (!store.has(state.month) && keys.length) state.month = keys[0];
  $("monthSel").innerHTML = keys.map(k => `<option value="${k}">${monthName(k)}</option>`).join("");
  $("monthSel").value = state.month;
}

function setSync(kind, text) { $("sync").className = "sync " + kind; $("syncText").textContent = text; }
function syncStatus() {
  const ts = store.generatedAt;
  if (!ts) return;
  const ageH = (Date.now() - ts) / 36e5;
  setSync(ageH > 26 ? "err" : "live", t("common.dataAsOf", {t: stamp(ts)}));
  $("dataStamp").textContent = t("side.stamp", {t: stamp(ts)});
}

/* ---------- Render ---------- */
function errorCopy(err) {
  if (err && err.code === "no_data") return [t("err.noData"), t("err.noDataSub")];
  if (location.protocol === "file:") return [t("err.file"), t("err.fileSub")];
  return [t("err.generic"), (err && err.message) || t("err.genericSub")];
}
function render() {
  const c = $("content");
  try { FEATURES[state.view].render(c, app); }
  catch (err) { console.error(err); const [a, b] = errorCopy(err); c.innerHTML = header(t("nav." + state.view)) + notice(a, esc(b), "err"); }
}

/* ---------- Events (delegated once) ---------- */
function wireGlobal() {
  // Reason buttons sit inside clickable rows: handle them first (capture) so the row's own action doesn't fire.
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("[data-reason]");
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    try { openReason(JSON.parse(el.dataset.reason), app); } catch (err) { console.error(err); }
  }, true);
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("[data-go],[data-site],[data-act],[data-lang],[data-thm]");
    if (!el) return;
    if (el.dataset.go) return app.go(el.dataset.go, el.dataset.sub);
    if (el.dataset.lang) return setLang(el.dataset.lang);
    if (el.dataset.thm) { state.theme = el.dataset.thm; persist(); applyTheme(); renderChrome(); if (state.view === "more") render(); return; }
    if (el.dataset.act === "search") return openSearch(app);
    if (el.dataset.act === "logout") { lock(); return boot(); }
    if (el.dataset.act === "reasons-xlsx") return exportReasons();
    if (el.dataset.act && ACTIONS[el.dataset.act]) return ACTIONS[el.dataset.act]();
    if (el.dataset.site) {
      const key = el.dataset.month || (state.view === "check" ? state.h1Date.slice(0, 7) : state.month);
      return openSite(el.dataset.site, key);
    }
  });
  $("monthSel").addEventListener("change", e => { state.month = e.target.value; state.budgetCut = null; render(); });
  $("refreshBtn").addEventListener("click", () => boot());
  addEventListener("scroll", () => $("navbar").classList.toggle("scrolled", scrollY > 24), {passive: true});
  onLangChange(() => { translateDom(); fillMonths(); syncStatus(); renderChrome(); render(); });
}

/* ---------- Boot ---------- */
function showGate() {
  document.body.classList.add("locked");
  badges.check = badges.reasons = 0;
  setSync("", ""); $("dataStamp").textContent = "";
  renderChrome();
  document.title = "Monitoring MH DW";
  renderGate($("content"), () => boot());
}

async function boot() {
  $("refreshBtn").disabled = true; setSync("busy", t("common.loading"));
  try {
    await loadAll();
    fillMonths();
    const miss = missingOn(YESTERDAY), al = alertsOn(YESTERDAY);
    badges.check = (miss ? miss.bySite.size : 0) + (al ? al.flagged.length : 0);
    renderChrome(); render(); syncStatus();
    loadReasons();
    document.body.classList.remove("locked");
  } catch (err) {
    if (err && err.code === "locked") { showGate(); return; }
    console.error(err);
    setSync("err", t("err.failed"));
    const [a, b] = errorCopy(err);
    $("content").innerHTML = header("Monitoring MH DW") + notice(a, esc(b), "err");
  } finally { $("refreshBtn").disabled = false; }
}

onReasons(() => { if (!store.access) return; try { badges.reasons = needCount(); } catch (e) { badges.reasons = 0; } renderChrome(); render(); });

applyTheme();
$("sheetLink").href = SHEET_URL;
translateDom();
renderChrome();
initTooltip();
wireGlobal();
wireSearch(app);
$("sideKbd").textContent = shortcutLabel();
boot();

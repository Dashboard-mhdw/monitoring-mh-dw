// Site — one simple table per site for the month (PKDW, days on DW, productivity vs target, filling),
// plus the day-by-day view (daily.js) behind the "Per hari" switch.
import { t, locale } from "../i18n.js";
import { fmt, pct, f1, monthName, prevKey, signed } from "../format.js";
import { esc, ICON, on } from "../ui/dom.js";
import { header, kpi, kpis, notice, segmented, btn, tag } from "../ui/components.js";
import { getMonth, store } from "../store.js";
import { state } from "../state.js";
import dailyView from "./daily.js";

/** Tiny bar sparkline of daily PKDW. */
const spark = (vals, max) => `<span class="spark">${vals.map(v => `<i style="height:${v ? Math.max(12, v / max * 100) : 4}%;${v ? "" : "opacity:.25"}"></i>`).join("")}</span>`;

export default {
  id: "sites",
  render(c, app) {
    const view = state.siteView === "daily" ? "daily" : "month";
    const sw = `<div class="row">${segmented("sview", view, [["month", t("sites.vMonth")], ["daily", t("sites.vDaily")]], t("nav.sites"))}</div>`;
    if (view === "daily") {
      c.innerHTML = `<div class="subpage" id="siteSub"></div>`;
      const sub = c.querySelector("#siteSub");
      dailyView.render(sub, app);
      sub.querySelector(".large-title")?.insertAdjacentHTML("afterend", sw);
      on(c, "[data-sview]", "click", b => { state.siteView = b.dataset.sview; app.rerender(); });
      return;
    }
    const key = state.month, cur = getMonth(key), prev = getMonth(prevKey(key)), title = t("nav.sites");
    if (!cur) { c.innerHTML = header(title, monthName(key)) + sw + notice(t("common.noTab", {month: monthName(key)})); on(c, "[data-sview]", "click", b => { state.siteView = b.dataset.sview; app.rerender(); }); return; }
    const {st} = cur, T = st.tot, TG = (store.targets && store.targets.sites) || {};
    const prevSite = {}; if (prev) prev.st.sites.forEach(s => prevSite[s.code] = s.pkdw);
    const last = st.lastIdx;

    let items = st.sites.map(s => {
      const g = TG[s.code] || {}, prod = s.total ? s.admits / s.total : null, target = g.target || 14;
      return {...s, region: g.region || "", target, prod, gap: prod == null ? null : prod - target, prev: prevSite[s.code], delta: prevSite[s.code] == null ? null : s.pkdw - prevSite[s.code],
        days: s.daily.slice(0, last + 1)};
    });
    const f = state.siteFilter;
    if (f === "dw") items = items.filter(s => s.pkdw > 0);
    if (f === "nodw") items = items.filter(s => s.pkdw === 0);
    if (f === "late") items = items.filter(s => s.missed > 0);
    if (f === "below") items = items.filter(s => s.pkdw > 0 && s.gap != null && s.gap < -1);
    const q = state.q.trim().toLowerCase();
    if (q) items = items.filter(s => s.cinema.toLowerCase().includes(q) || s.region.toLowerCase().includes(q));
    const {k, dir} = state.sort;
    items.sort((a, b) => { const av = a[k], bv = b[k]; if (typeof av === "string") return av.localeCompare(bv, locale(), {numeric: true}) * dir; return ((av ?? -Infinity) - (bv ?? -Infinity)) * dir; });

    const maxP = Math.max(1, ...items.map(s => s.pkdw)), maxD = Math.max(1, ...items.flatMap(s => s.days));
    const all = st.sites.map(s => ({...s, prod: s.total ? s.admits / s.total : null, target: (TG[s.code] || {}).target || 14}));
    const below = all.filter(s => s.pkdw > 0 && s.prod != null && s.prod < s.target - 1).length;
    const th = (key2, label, r = true) => `<th class="${r ? "r" : ""}"><button type="button" data-sort="${key2}">${label}${state.sort.k === key2 ? (state.sort.dir < 0 ? " ↓" : " ↑") : ""}</button></th>`;

    c.innerHTML = header(title, t("sites.sub2", {month: monthName(key)}),
        btn("CSV", {act: "csv", icon: ICON.down}) + btn(t("common.downloadExcel"), {act: "xlsx", filled: true, icon: ICON.down})) + sw +
      kpis(
        kpi({label: t("common.totalPkdw"), value: fmt(T.pkdw), unit: "MH", tone: "hero", sub: t("sites.kSub", {n: T.dwSites, s: T.sites})}),
        kpi({label: t("sites.kProd"), icon: ICON.trend, tint: "orange", value: f1(T.total ? T.admits / T.total : null), sub: t("sites.kProdSub", {n: below})}),
        kpi({label: t("sites.kLate"), icon: ICON.checklist, tint: "red", value: all.filter(s => s.missed > 0).length, unit: t("unit.sites"), sub: t("sites.kLateSub", {n: fmt(T.missed)})}),
      ) + `
      <div class="row">
        ${segmented("filter", state.siteFilter, [["all", t("sites.fAll")], ["dw", t("sites.fDw")], ["below", t("sites.fBelow", {n: below})], ["late", t("sites.fLate")], ["nodw", t("sites.fNoDw")]], t("sites.filterAria"))}
        <span class="spacer"></span>
        <input type="search" class="search" id="siteQ" placeholder="${esc(t("sites.search"))}" value="${esc(state.q)}" aria-label="${esc(t("sites.search"))}">
      </div>
      <div class="table-wrap"><table class="stable">
        <thead><tr><th class="rank">#</th>${th("cinema", t("col.site"), false)}${th("pkdw", "PKDW (MH)")}<th>${t("sites.colDaily")}</th>${th("dwDays", t("sites.colDays"))}${th("prod", "Prod")}${th("share", "% DW")}${prev ? th("delta", t("sites.colDelta")) : ""}${th("missed", t("col.missed"))}</tr></thead>
        <tbody>${items.map((s, i) => `<tr class="click" data-site="${s.code}">
          <td class="rank">${i + 1}</td>
          <td class="site"><b>${esc(s.cinema)}</b><span class="muted sub">${esc(s.region.replace(/^REGION/, "Region"))}${s.formats.filter(x => x !== "Regular").map(x => " · " + esc(x)).join("")}</span></td>
          <td class="r"><div class="inbar"><i style="width:${Math.round(s.pkdw / maxP * 70)}px"></i><b>${fmt(s.pkdw)}</b></div></td>
          <td>${spark(s.days, maxD)}</td>
          <td class="r">${s.dwDays || `<span class="muted">0</span>`}</td>
          <td class="r">${s.prod == null ? "–" : `<span class="pill ${s.gap < -1 ? "bad" : s.gap < 0 ? "warn" : "ok"}">${f1(s.prod)}<small> / ${s.target}</small></span>`}</td>
          <td class="r">${pct(s.share)}</td>
          ${prev ? `<td class="r">${s.delta == null ? "–" : `<span class="delta ${s.delta > 0 ? "up" : s.delta < 0 ? "down" : ""}">${signed(s.delta)}</span>`}</td>` : ""}
          <td class="r">${s.missed ? tag(s.missed, s.missed >= 3 ? "red" : "orange") : `<span class="muted">0</span>`}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">${t("sites.empty")}</td></tr>`}</tbody>
      </table></div>
      <p class="foot">${t("sites.foot2")}</p>`;

    on(c, "[data-sview]", "click", b => { state.siteView = b.dataset.sview; app.rerender(); });
    on(c, "[data-sort]", "click", b => { const k2 = b.dataset.sort; state.sort = state.sort.k === k2 ? {k: k2, dir: -state.sort.dir} : {k: k2, dir: k2 === "cinema" ? 1 : -1}; app.rerender(); });
    on(c, "[data-filter]", "click", b => { state.siteFilter = b.dataset.filter; app.rerender(); });
    on(c, "#siteQ", "input", el => {
      state.q = el.value; clearTimeout(el._t);
      el._t = setTimeout(() => { app.rerender(); const n = document.getElementById("siteQ"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 220);
    });
  },
};

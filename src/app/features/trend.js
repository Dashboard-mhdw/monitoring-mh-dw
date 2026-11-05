// Tren Bulanan / Monthly trend — PKDW per month and site × month matrix.
import { t } from "../i18n.js";
import { fmt, pct, monthName, monthShort, TODAY } from "../format.js";
import { esc, ICON, on } from "../ui/dom.js";
import { header, segmented, btn, notes, legend, kpi, kpis } from "../ui/components.js";
import { columnChart } from "../ui/charts.js";
import { store, trend } from "../store.js";
import { state } from "../state.js";

/** Same selection the view shows; reused by the Excel export. */
export function trendData() {
  const all = store.months().slice().reverse();
  const n = state.trendN === 0 ? all.length : state.trendN;
  return trend(all.slice(-n));
}

export default {
  id: "trend",
  render(c, app) {
    const {ok, failed, sites, tot} = trendData(), curKey = TODAY.slice(0, 7), title = t("nav.trend");
    const tools = segmented("n", state.trendN, [[3, t("trend.n3")], [6, t("trend.n6")], [12, t("trend.n12")], [0, t("trend.nAll")]], t("trend.rangeAria")) +
      btn(t("trend.download"), {act: "trend-xlsx", filled: true, icon: ICON.down});
    const every = ok.length > 12 ? 2 : 1;
    const chart = columnChart(ok.map((k, i) => { const x = tot(k); return {
      value: x.pkdw, cls: k === curKey ? "dim" : "", tick: (ok.length - 1 - i) % every === 0 ? monthShort(k) : "",
      tip: `${monthName(k)}${k === curKey ? " (" + t("trend.running") + ")" : ""}|PKDW ${fmt(x.pkdw)} MH|${t("trend.tipSites", {n: x.dwSites, p: pct(x.share)})}`,
    }; }), {H: 240, aria: t("trend.chartTitle")});
    const maxCell = Math.max(1, ...sites.flatMap(s => ok.map(k => s.v[k] || 0)));
    const full = ok.filter(k => k !== curKey), lastK = full[full.length - 1], prevK = full[full.length - 2];
    const lastV = lastK ? tot(lastK).pkdw : 0, prevV = prevK ? tot(prevK).pkdw : 0;
    const avgV = full.length ? full.reduce((a, k) => a + tot(k).pkdw, 0) / full.length : 0;
    const peakK = full.slice().sort((a, b) => tot(b).pkdw - tot(a).pkdw)[0];
    const showAll = state.trendAll, shown = showAll ? sites : sites.slice(0, 15);
    const lastCol = lastK && prevK;

    c.innerHTML = header(title, ok.length ? t("trend.sub", {from: monthName(ok[0]), to: monthName(ok[ok.length - 1])}) : "", tools) +
      notes(failed.length ? [[t("trend.failed", {n: failed.length}), failed.map(monthName).join(", ")]] : []) +
      (lastK ? kpis(
        kpi({label: t("trend.kLast", {m: monthName(lastK)}), tone: "hero", value: fmt(lastV), unit: "MH", sub: prevK ? `<span class="delta ${lastV > prevV ? "up" : "down"}">${lastV >= prevV ? "▲" : "▼"} ${pct(prevV ? Math.abs(lastV / prevV - 1) : 0, 0)}</span> ${t("trend.vsPrev", {m: monthName(prevK)})}` : ""}),
        kpi({label: t("trend.kAvg"), icon: ICON.calendar, tint: "indigo", value: fmt(avgV), unit: "MH", sub: t("trend.kAvgSub", {n: full.length})}),
        kpi({label: t("trend.kPeak"), icon: ICON.trend, tint: "orange", value: peakK ? monthShort(peakK) : "–", sub: peakK ? fmt(tot(peakK).pkdw) + " MH" : ""}),
      ) : "") + `
      <div class="card chart"><div class="card-head"><h2>${t("trend.chartTitle")}</h2>${legend([["var(--blue)", t("trend.fullMonth")], ["var(--fill)", t("trend.runMonth")]])}</div>${chart}</div>
      <div class="row"><h2 class="section-head" style="margin:0">${t("trend.matrix")}</h2><span class="spacer"></span>${sites.length > 15 ? `<button type="button" class="btn plain" id="trAll">${showAll ? t("trend.top15") : t("trend.showAll", {n: sites.length})}</button>` : ""}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>${t("col.site")}</th>${ok.map(k => `<th class="r">${monthShort(k)}</th>`).join("")}<th class="r">Total</th><th class="r">${t("trend.avgMonth")}</th>${lastCol ? `<th class="r">${t("trend.colChg")}</th>` : ""}</tr></thead>
        <tbody>${shown.map(s => `<tr class="click" data-site="${s.code}"><td class="site"><b>${esc(s.cinema)}</b></td>${ok.map(k => { const v = s.v[k], a = v ? (0.06 + 0.42 * v / maxCell) : 0;
          return `<td class="r" style="${v ? `background:color-mix(in srgb,var(--blue) ${(a * 100).toFixed(0)}%,transparent)` : ""}">${v == null ? "<span class='muted'>·</span>" : fmt(v)}</td>`; }).join("")}<td class="r"><b>${fmt(s.sum)}</b></td><td class="r">${fmt(s.sum / ok.length)}</td>${lastCol ? (() => { const d = (s.v[lastK] || 0) - (s.v[prevK] || 0); return `<td class="r"><span class="delta ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "+" : ""}${fmt(d)}</span></td>`; })() : ""}</tr>`).join("")}</tbody>
        <tfoot><tr><td>${t("trend.totalRow", {n: sites.length})}</td>${ok.map(k => `<td class="r">${fmt(tot(k).pkdw)}</td>`).join("")}<td class="r">${fmt(sites.reduce((a, s) => a + s.sum, 0))}</td><td></td>${lastCol ? "<td></td>" : ""}</tr></tfoot>
      </table></div>
      <p class="foot">${t("trend.foot")}</p>`;
    on(c, "[data-n]", "click", b => { state.trendN = +b.dataset.n; app.rerender(); });
    on(c, "#trAll", "click", () => { state.trendAll = !state.trendAll; app.rerender(); });
  },
};

// Budget vs Actual — DW man-hours to date against the weekly budget (budget.json).
import { t } from "../i18n.js";
import { fmt, signed, monthName, monthOnly, monthEnd, dateLong, YESTERDAY } from "../format.js";
import { esc, ICON, on, copyText, copyRich } from "../ui/dom.js";
import * as Mail from "./budget-mail.js";
import { header, kpi, kpis, notice, segmented, btn, tag, legend } from "../ui/components.js";
import { groupedChart } from "../ui/charts.js";
import { openSheet } from "../ui/sheet.js";
import { budgetVsActual, store } from "../store.js";
import { state } from "../state.js";
import { reasonBtn, reasonSection } from "./reasons.js";

const TONE = {over: "red", nobudget: "orange", early: "orange", near: "orange", ok: "green", none: ""};
export const statusLabel = s => t("bstat." + s);
export const statusTag = s => tag(statusLabel(s), TONE[s]);

/** Cut-off date for a month: chosen date, else yesterday, clamped into the month. */
export function cutFor(key) {
  const end = monthEnd(key), start = key + "-01";
  let c = state.budgetCut && state.budgetCut.slice(0, 7) === key ? state.budgetCut : (YESTERDAY < end ? YESTERDAY : end);
  return c < start ? start : c;
}
export const bvaCurrent = () => budgetVsActual(state.month, cutFor(state.month));

const diff = v => v > 0.5 ? `<span class="delta bad">${signed(v)}</span>` : v < -0.5 ? `<span class="delta down">${fmt(v)}</span>` : `<span class="muted">0</span>`;
const meter = u => {
  if (u == null) return `<span class="muted">–</span>`;
  const col = u > 1 ? "var(--red)" : u >= 0.9 ? "var(--orange)" : "var(--green)";
  return `<span class="usage"><span class="meter"><i style="width:${Math.min(100, u * 100)}%;background:${col}"></i></span>${fmt(u * 100)}%</span>`;
};
const periodTip = p => [
  `${t("budget.week")} ${p.week} · ${p.label}`,
  `Budget ${fmt(p.budget)} MH${p.elapsed && p.elapsed < p.days ? " (" + t("budget.toDate") + " " + fmt(p.budgetToDate) + ")" : ""}`,
  `Actual ${fmt(p.actual)} MH${p.elapsed === 0 ? " · " + t("budget.notStarted") : ""}`,
  ...(p.elapsed && p.admitsBudget ? [t("budget.tipAdmits", {a: fmt(p.admitsActual), b: fmt(p.admitsBudget * p.elapsed / p.days)})] : []),
].join("|");

function summaryText(r) {
  const T = r.tot, d = +r.cut.slice(8);
  const over = r.rows.filter(x => x.status === "over").sort((a, b) => b.variance - a.variance);
  const nob = r.rows.filter(x => x.status === "nobudget" || x.status === "early").sort((a, b) => b.actual - a.actual);
  return [
    t("budget.waTitle", {month: monthName(r.month), d}), "",
    t("budget.waActual", {a: fmt(T.actual), b: fmt(T.budgetToDate), p: fmt(T.usage * 100)}),
    t("budget.waMonth", {b: fmt(T.budgetMonth), r: fmt(T.remaining)}),
    ...(r.hasAdmits ? [t("budget.waAdmits", {a: fmt(T.admitsActual), f: fmt(T.admitsBudgetToDate), p: signed(T.admitsVar * 100, 1)})] : []),
    t("budget.waOver", {n: over.length}) + (over.length ? "\n" + over.slice(0, 8).map(x => `   - ${x.cinema}: ${fmt(x.actual)} vs ${fmt(x.budgetToDate)} (${signed(x.variance)})`).join("\n") : ""),
    t("budget.waNoBudget", {n: nob.length}) + (nob.length ? "\n" + nob.slice(0, 8).map(x => `   - ${x.cinema}: ${fmt(x.actual)} MH`).join("\n") + (nob.length > 8 ? "\n   - " + t("budget.waMore", {n: nob.length - 8}) : "") : ""),
    "", t("budget.waLink", {url: location.href.split("#")[0]}),
  ].join("\n");
}

function openBudgetSite(r, code) {
  const x = r.rows.find(y => y.code === code); if (!x) return;
  const A = r.hasAdmits;
  openSheet({title: x.cinema, sub: `${monthName(r.month)} · ${t("budget.until")} ${dateLong(r.cut)}`, body:
    kpis(
      kpi({label: t("budget.actualToDate"), value: fmt(x.actual), unit: "MH", sub: t("budget.budgetToDateV", {v: fmt(x.budgetToDate)})}),
      kpi({label: t("budget.monthBudget"), value: fmt(x.budgetMonth), unit: "MH", sub: t("budget.remainingV", {v: fmt(x.remaining)})}),
      A ? kpi({label: t("budget.kpiAdmits"), value: fmt(x.admitsActual), sub: t("budget.vsForecast", {v: fmt(x.admitsBudgetToDate)})}) : "",
      kpi({label: "Status", value: statusTag(x.status), sub: x.usage == null ? t("budget.noBudgetToDate") : t("budget.usageV", {v: fmt(x.usage * 100)})}),
    ) +
    `<div class="table-wrap"><table><thead><tr><th>${t("budget.week")}</th><th>${t("budget.dates")}</th>${A ? `<th class="r">${t("budget.admBudget")}</th><th class="r">${t("budget.admActual")}</th>` : ""}<th class="r">DW budget</th><th class="r">${t("budget.colToDate")}</th><th class="r">DW actual</th><th class="r">${t("budget.colVar")}</th></tr></thead>
    <tbody>${x.periods.map(p => `<tr><td>W${p.week}</td><td>${p.label}${p.elapsed && p.elapsed < p.days ? " " + tag(t("budget.running", {e: p.elapsed, d: p.days})) : p.elapsed === 0 ? ` <span class="muted">${t("budget.notYet")}</span>` : ""}</td>${A ? `<td class="r">${fmt(p.admitsBudget)}</td><td class="r">${p.elapsed ? fmt(p.admitsActual) : "–"}</td>` : ""}<td class="r">${fmt(p.budget)}</td><td class="r">${fmt(p.budgetToDate)}</td><td class="r"><b>${fmt(p.actual)}</b></td><td class="r">${p.elapsed ? diff(p.actual - p.budgetToDate) : "–"}</td></tr>`).join("")}</tbody></table></div>` +
    reasonSection({site: x.code, cinema: x.cinema, date: r.cut, month: r.month, context: x.status === "over" ? "over" : x.status === "nobudget" || x.status === "early" ? "nobudget" : "other"})});
}

export default {
  id: "budget",
  render(c, app) {
    const key = state.month, cut = cutFor(key), title = t("nav.budget");
    const tools = `<label class="muted" for="bvCut" style="font-size:var(--t-subhead)">${t("budget.until")}</label><input type="date" class="datefield" id="bvCut" value="${cut}" min="${key}-01" max="${monthEnd(key)}">`;
    const wireCut = () => on(c, "#bvCut", "change", el => { if (el.value) { state.budgetCut = el.value; app.rerender(); } });
    if (!store.budget) { c.innerHTML = header(title, monthName(key)) + notice(t("budget.noBudget"), t("budget.noBudgetSub")); return; }
    const who = "";
    const r = budgetVsActual(key, cut);
    if (!r) { c.innerHTML = header(title, monthName(key), who + tools) + notice(t("budget.noMonth", {month: monthName(key)}), t("budget.noMonthSub")); wireCut(); return; }

    const T = r.tot, A = r.hasAdmits, flt = state.budgetFilter || "active";
    const match = x => flt === "active" ? x.status !== "none" : flt === "all" ? true : flt === "ok" ? (x.status === "ok" || x.status === "near")
      : flt === "nobudget" ? (x.status === "nobudget" || x.status === "early") : x.status === flt;
    const list = r.rows.filter(match).sort((a, b) => b.variance - a.variance || b.actual - a.actual);
    const filters = [["active", t("budget.fActive")], ["over", t("budget.fOver", {n: r.counts.over})], ["nobudget", t("budget.fNoBudget", {n: r.counts.nobudget + r.counts.early})], ["ok", t("budget.fOk", {n: r.counts.ok + r.counts.near})]];
    filters.push(["all", t("budget.fAll")]);
    const periods = r.periods.map(p => ({label: p.label, sub: "W" + p.week, budget: p.budget, actual: p.actual, hl: p.actual > p.budgetToDate && p.elapsed, tip: periodTip(p)}));
    const sumOf = k => fmt(list.reduce((a, x) => a + (x[k] || 0), 0));

    c.innerHTML = header(title, t("budget.sub", {month: monthName(key), date: dateLong(r.cut)}),
        who + tools + btn(t("budget.copy"), {id: "bvCopy", icon: ICON.copy}) + btn(t("common.downloadExcel"), {act: "budget-xlsx", filled: true, icon: ICON.down})) +
      kpis(
        kpi({label: t("budget.kpiActual", {d: +r.cut.slice(8), m: monthOnly(key).slice(0, 3)}), tone: "hero", value: fmt(T.actual), unit: "/ " + fmt(T.budgetToDate) + " MH", sub: `<span class="delta ${T.usage > 1 ? "bad" : ""}">${t("budget.pctOf", {p: fmt((T.usage || 0) * 100)})}</span> ${t("budget.varV", {v: signed(T.variance)})}`}),
        kpi({label: t("budget.kpiMonth", {m: monthOnly(key)}), icon: ICON.calendar, tint: "indigo", value: fmt(T.budgetMonth), unit: "MH", sub: t("budget.kpiMonthSub", {v: `<b style="color:${T.remaining < 0 ? "var(--red-text)" : "inherit"}">${fmt(T.remaining)}</b>`})}),
        A ? kpi({label: t("budget.kpiAdmits"), icon: ICON.person, value: fmt(T.admitsActual), sub: `<span class="delta ${T.admitsVar >= 0 ? "down" : "up"}">${signed(T.admitsVar * 100, 1)}%</span> ${t("budget.vsForecast", {v: fmt(T.admitsBudgetToDate)})}`}) : "",
        kpi({label: t("budget.attention"), icon: ICON.warn, tint: "red", tone: "bad", value: r.counts.over, unit: "over", sub: t("budget.attentionSub", {n: `<b style="color:var(--orange-text)">${r.counts.nobudget + r.counts.early}</b>`})}),
      ) + `
      <div class="card chart"><div class="card-head"><h2>${t("budget.chartTitle")}</h2>${legend([["var(--label-3)", "Budget"], ["var(--blue)", "Actual"], ["var(--orange)", t("budget.legendOver")]])}</div>${groupedChart(periods, {aria: t("budget.chartTitle")})}</div>
      <div class="row">${segmented("bf", flt, filters, "Filter")}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>${t("col.site")}</th>${A ? `<th class="r">${t("budget.admBudget")}</th><th class="r">${t("budget.admActual")}</th><th class="r">Δ admits</th>` : ""}<th class="r">${t("budget.colDwToDate")}</th><th class="r">DW actual</th><th class="r">${t("budget.colVar")}</th><th>${t("budget.colUsage")}</th><th class="r">${t("budget.colRemaining")}</th><th>Status</th><th>Reason</th></tr></thead>
        <tbody>${list.map(x => `<tr class="click" data-bsite="${x.code}">
          <td class="site"><b>${esc(x.cinema)}</b>${x.admitsMissingDays ? tag(t("budget.admitsEmptyDays", {n: x.admitsMissingDays}), "orange") : ""}</td>${A ? `<td class="r">${fmt(x.admitsBudgetToDate)}</td><td class="r">${fmt(x.admitsActual)}</td><td class="r">${x.admitsVar == null ? "–" : `<span class="delta ${x.admitsVar >= 0 ? "down" : "up"}">${signed(x.admitsVar * 100)}%</span>`}</td>` : ""}
          <td class="r">${fmt(x.budgetToDate)}</td><td class="r"><b>${fmt(x.actual)}</b></td>
          <td class="r">${diff(x.variance)}</td>
          <td>${meter(x.usage)}</td>
          <td class="r" style="${x.remaining < 0 ? "color:var(--red-text);font-weight:600" : ""}">${fmt(x.remaining)}</td>
          <td>${statusTag(x.status)}</td>
          <td>${x.status !== "none" ? reasonBtn({site: x.code, cinema: x.cinema, date: r.cut, month: key, context: x.status === "over" ? "over" : x.status === "nobudget" || x.status === "early" ? "nobudget" : "other"}) : ""}</td></tr>`).join("") || `<tr><td colspan="12" class="muted">${t("budget.emptyFilter")}</td></tr>`}</tbody>
        <tfoot><tr><td>${t("budget.totalRow", {n: list.length})}</td>${(A ? ["admitsBudgetToDate", "admitsActual", null, "budgetToDate", "actual", "variance"] : ["budgetToDate", "actual", "variance"]).map(k => `<td class="r">${k ? sumOf(k) : ""}</td>`).join("")}<td></td><td class="r">${fmt(list.reduce((a, x) => a + x.remaining, 0))}</td><td></td><td></td></tr></tfoot>
      </table></div>
      <p class="foot">${t("budget.foot")} ${t("budget.source", {s: esc(store.budget.source || "budget.json")})}</p>
      ${store.access && store.access.scope !== "ALL" ? "" : `<div class="row" style="margin-top:var(--s4)"><h2 class="section-head" style="margin:0">${t("budget.mailTitle")}</h2><span class="spacer"></span>
        ${btn(t("budget.copySubject"), {id: "bmSubj", icon: ICON.copy})}${btn(t("budget.copyMail"), {id: "bmCopy", filled: true, icon: ICON.copy})}</div>
      <p class="foot" style="margin-top:-8px">${t("budget.mailNote")}</p>
      <div class="mail-paper"><p style="font-family:Arial;font-size:13px;color:#555;margin:0 0 12px"><b>Subject:</b> ${esc(Mail.subject(r))}</p>${Mail.mailHTML(r)}</div>`}`;

    wireCut();
    on(c, "[data-bf]", "click", b => { state.budgetFilter = b.dataset.bf; app.rerender(); });
    on(c, "[data-bsite]", "click", row => openBudgetSite(r, row.dataset.bsite));
    on(c, "#bvCopy", "click", () => copyText(summaryText(r), t("budget.copied")));
    on(c, "#bmCopy", "click", () => copyRich(Mail.mailHTML(r), Mail.mailText(r), t("budget.mailCopied")));
    on(c, "#bmSubj", "click", () => copyText(Mail.subject(r), t("budget.subjectCopied")));
  },
};

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
      kpi({label: t("budget.actualToDate"), value: fmt(x.actual), unit: "MH", sub: `${rp(x.amountActual)} · ${t("budget.budgetToDateV", {v: fmt(x.budgetToDate)})}`}),
      kpi({label: t("budget.monthBudget"), value: fmt(x.budgetMonth), unit: "MH", sub: `${rp(x.amountMonth)} · ${t("budget.remainingV", {v: fmt(x.remaining)})}`}),
      kpi({label: t("budget.siteInfo"), value: fmt(x.ft), unit: "FT", sub: t("budget.siteInfoSub", {r: x.rate ? rpFull(x.rate) : "–", tg: x.target || "–"})}),
      A ? kpi({label: t("budget.kpiAdmits"), value: fmt(x.admitsActual), sub: t("budget.vsForecast", {v: fmt(x.admitsBudgetToDate)})}) : "",
      kpi({label: "Status", value: statusTag(x.status), sub: x.usage == null ? t("budget.noBudgetToDate") : t("budget.usageV", {v: fmt(x.usage * 100)})}),
    ) +
    `<div class="table-wrap"><table><thead><tr><th>${t("budget.week")}</th><th>${t("budget.dates")}</th>${A ? `<th class="r">${t("budget.admBudget")}</th><th class="r">${t("budget.admActual")}</th>` : ""}<th class="r">DW budget</th><th class="r">${t("budget.colToDate")}</th><th class="r">DW actual</th><th class="r">${t("budget.colVar")}</th></tr></thead>
    <tbody>${x.periods.map(p => `<tr><td>W${p.week}</td><td>${p.label}${p.elapsed && p.elapsed < p.days ? " " + tag(t("budget.running", {e: p.elapsed, d: p.days})) : p.elapsed === 0 ? ` <span class="muted">${t("budget.notYet")}</span>` : ""}</td>${A ? `<td class="r">${fmt(p.admitsBudget)}</td><td class="r">${p.elapsed ? fmt(p.admitsActual) : "–"}</td>` : ""}<td class="r">${fmt(p.budget)}</td><td class="r">${fmt(p.budgetToDate)}</td><td class="r"><b>${fmt(p.actual)}</b></td><td class="r">${p.elapsed ? diff(p.actual - p.budgetToDate) : "–"}</td></tr>`).join("")}</tbody></table></div>` +
    reasonSection({site: x.code, cinema: x.cinema, date: r.cut, month: r.month, context: x.status === "over" ? "over" : x.status === "nobudget" || x.status === "early" ? "nobudget" : "other"})});
}

const rp = v => {   // compact Rupiah: Rp 9,4 jt / Rp 950 rb
  if (v == null || isNaN(v)) return "–";
  const a = Math.abs(v), sg = v < 0 ? "−" : "";
  return a >= 1e9 ? `${sg}Rp ${fmt(a / 1e9, 2)} M` : a >= 1e6 ? `${sg}Rp ${fmt(a / 1e6, 1)} jt` : a >= 1e3 ? `${sg}Rp ${fmt(a / 1e3)} rb` : `${sg}Rp ${fmt(a)}`;
};
const rpFull = v => "Rp " + fmt(v);
const daysIn = key => +monthEnd(key).slice(8);

/** Progress bar: filled = used, tick = where the schedule says we should be by now. */
const progress = (used, plan, total, cls = "") => {
  const u = total ? Math.min(100, used / total * 100) : 0, pl = total ? Math.min(100, plan / total * 100) : 0;
  const col = used > plan * 1.0001 && plan > 0 ? "var(--red)" : total && used / total >= 0.9 ? "var(--orange)" : "var(--green)";
  return `<div class="bprog ${cls}"><i style="width:${u}%;background:${col}"></i>${plan ? `<b style="left:${pl}%" title="${t("budget.planMark")}"></b>` : ""}</div>`;
};

/** Region cards (admin): one card per region, click to filter the site table. */
function regionCards(r, sel) {
  const g = new Map();
  r.rows.forEach(x => { const k = x.region || "–"; if (!g.has(k)) g.set(k, {region: k, mb: 0, ma: 0, mt: 0, ab: 0, aa: 0, ft: 0, over: 0, nob: 0, n: 0});
    const o = g.get(k); o.mb += x.budgetMonth; o.ma += x.actual; o.mt += x.budgetToDate; o.ab += x.amountMonth || 0; o.aa += x.amountActual || 0; o.ft += x.ft || 0; o.n++;
    if (x.status === "over") o.over++; if (x.status === "nobudget" || x.status === "early") o.nob++; });
  const list = [...g.values()].sort((a, b) => a.region.localeCompare(b.region, undefined, {numeric: true}));
  return `<div class="rcards">${list.map(o => `<button type="button" class="rcard${sel === o.region ? " on" : ""}" data-breg="${esc(o.region)}">
      <span class="rc-h"><b>${esc(o.region.replace(/^REGION/, "Region"))}</b>${o.over ? tag(t("budget.nOver", {n: o.over}), "red") : o.nob ? tag(t("budget.nNoBudget", {n: o.nob}), "orange") : tag(t("budget.allOk"), "green")}</span>
      ${progress(o.ma, o.mt, o.mb)}
      <span class="rc-v">${rp(o.aa)} <small>/ ${rp(o.ab)}</small></span>
      <span class="rc-s">${t("budget.rcSub", {a: fmt(o.ma), b: fmt(o.mb), r: rp(o.ab - o.aa), ft: fmt(o.ft)})}</span>
    </button>`).join("")}</div>`;
}

export default {
  id: "budget",
  render(c, app) {
    const key = state.month, cut = cutFor(key), title = t("nav.budget");
    const tools = `<label class="muted" for="bvCut" style="font-size:var(--t-subhead)">${t("budget.until")}</label><input type="date" class="datefield" id="bvCut" value="${cut}" min="${key}-01" max="${monthEnd(key)}">`;
    const wireCut = () => on(c, "#bvCut", "change", el => { if (el.value) { state.budgetCut = el.value; app.rerender(); } });
    if (!store.budget) { c.innerHTML = header(title, monthName(key)) + notice(t("budget.noBudget"), t("budget.noBudgetSub")); return; }
    const r = budgetVsActual(key, cut);
    if (!r) { c.innerHTML = header(title, monthName(key), tools) + notice(t("budget.noMonth", {month: monthName(key)}), t("budget.noMonthSub")); wireCut(); return; }

    const T = r.tot, A = r.hasAdmits, admin = !store.access || store.access.scope === "ALL";
    const regs = [...new Set(r.rows.map(x => x.region).filter(Boolean))];
    const reg = admin && regs.includes(state.budgetRegion) ? state.budgetRegion : "";
    const flt = state.budgetFilter || "active";
    const match = x => (!reg || x.region === reg) && (flt === "active" ? x.status !== "none" : flt === "all" ? true : flt === "ok" ? (x.status === "ok" || x.status === "near")
      : flt === "nobudget" ? (x.status === "nobudget" || x.status === "early") : x.status === flt);
    const scoped = r.rows.filter(x => !reg || x.region === reg);
    const cnt = st => scoped.filter(x => st.includes(x.status)).length;
    const list = r.rows.filter(match).sort((a, b) => (b.amountActual - b.amountToDate) - (a.amountActual - a.amountToDate) || b.actual - a.actual);
    const filters = [["active", t("budget.fActive")], ["over", t("budget.fOver", {n: cnt(["over"])})], ["nobudget", t("budget.fNoBudget", {n: cnt(["nobudget", "early"])})], ["ok", t("budget.fOk", {n: cnt(["ok", "near"])})], ["all", t("budget.fAll")]];
    const periods = r.periods.map(p => ({label: p.label, sub: "W" + p.week, budget: p.budget, actual: p.actual, hl: p.actual > p.budgetToDate && p.elapsed, tip: periodTip(p)}));

    // Month status in plain words
    const dIn = daysIn(key), dDone = +r.cut.slice(8), dLeft = dIn - dDone;
    const proj = dDone ? T.amountActual / dDone * dIn : 0;
    const ahead = T.amountActual > T.amountToDate * 1.0001;
    const state0 = T.amountActual > T.amountMonth ? ["bad", t("budget.stOver")] : ahead ? ["warn", t("budget.stAhead")] : ["good", t("budget.stOk")];
    const ctl = r.control || {};
    const companyCard = admin && ctl.budgetAmount ? `<div class="card ctl"><div class="card-head"><h2>${t("budget.ctlTitle")}</h2></div>
        <div class="ctl-grid">
          <div><span>${t("budget.ctlBudget")}</span><b title="${rpFull(ctl.budgetAmount)}">${rp(ctl.budgetAmount)}</b></div>
          <div><span>${t("budget.ctlAllocated")}</span><b title="${rpFull(T.amountMonth)}">${rp(T.amountMonth)}</b></div>
          <div><span>${t("budget.ctlReserve")}</span><b title="${rpFull(ctl.budgetAmount - T.amountMonth)}" style="color:${ctl.budgetAmount - T.amountMonth < 0 ? "var(--red-text)" : "var(--green-text)"}">${rp(ctl.budgetAmount - T.amountMonth)}</b></div>
          <div><span>${t("budget.ctlLeftCompany")}</span><b title="${rpFull(ctl.budgetAmount - T.amountActual)}">${rp(ctl.budgetAmount - T.amountActual)}</b></div>
        </div></div>` : "";

    c.innerHTML = header(title, t("budget.sub", {month: monthName(key), date: dateLong(r.cut)}),
        tools + btn(t("budget.copy"), {id: "bvCopy", icon: ICON.copy}) + btn(t("common.downloadExcel"), {act: "budget-xlsx", filled: true, icon: ICON.down})) + `
      <div class="card bhero">
        <div class="bh-top"><span class="bh-k">${t("budget.heroK", {m: monthOnly(key)})}</span>${tag(state0[1], state0[0] === "bad" ? "red" : state0[0] === "warn" ? "orange" : "green")}</div>
        <div class="bh-v"><b>${rp(T.amountActual)}</b><span>${t("budget.heroOf", {b: rp(T.amountMonth), p: fmt(T.amountMonth ? T.amountActual / T.amountMonth * 100 : 0)})}</span></div>
        ${progress(T.amountActual, T.amountToDate, T.amountMonth, "big")}
        <p class="bh-s">${t("budget.heroLine", {plan: rp(T.amountToDate), left: rp(T.amountRemaining), d: dLeft, perDay: rp(dLeft > 0 ? T.amountRemaining / dLeft : 0)})}</p>
      </div>` +
      kpis(
        kpi({label: t("budget.kBudget"), icon: ICON.calendar, tint: "indigo", value: fmt(T.budgetMonth), unit: "MH", sub: rp(T.amountMonth)}),
        kpi({label: t("budget.kUsed", {d: dDone}), icon: ICON.person, value: fmt(T.actual), unit: "MH", sub: `${rp(T.amountActual)} · ${t("budget.planV", {v: fmt(T.budgetToDate)})}`}),
        kpi({label: t("budget.kLeft"), icon: ICON.check, tint: "green", tone: T.remaining < 0 ? "bad" : "good", value: fmt(T.remaining), unit: "MH", sub: rp(T.amountRemaining)}),
        kpi({label: t("budget.kProj"), icon: ICON.trend, tint: proj > T.amountMonth ? "red" : "blue", tone: proj > T.amountMonth ? "bad" : "", value: rp(proj), sub: proj > T.amountMonth ? t("budget.projOver", {v: rp(proj - T.amountMonth)}) : t("budget.projOk", {v: rp(T.amountMonth - proj)})}),
      ) + companyCard +
      (admin && regs.length > 1 ? `<div class="row"><h2 class="section-head" style="margin:0">${t("budget.byRegion")}</h2><span class="spacer"></span>${reg ? `<button type="button" class="btn plain" data-breg="">${t("budget.allRegions")}</button>` : ""}</div>${regionCards(r, reg)}` : "") + `
      <div class="card chart"><div class="card-head"><h2>${t("budget.chartTitle")}</h2>${legend([["var(--label-3)", "Budget"], ["var(--blue)", "Actual"], ["var(--orange)", t("budget.legendOver")]])}</div>${groupedChart(periods, {aria: t("budget.chartTitle")})}</div>
      <div class="row"><h2 class="section-head" style="margin:0">${t("budget.perSite")}${reg ? " · " + esc(reg.replace(/^REGION/, "Region")) : ""}</h2><span class="spacer"></span>${segmented("bf", flt, filters, "Filter")}</div>
      <div class="table-wrap"><table class="btable">
        <thead><tr><th>${t("col.site")}</th><th class="r">FT</th><th class="r">${t("budget.colRate")}</th><th class="r">${t("budget.colBudgetM")}</th><th class="r">${t("budget.colUsed")}</th><th>${t("budget.colPace")}</th><th class="r">${t("budget.colLeftMh")}</th><th class="r">${t("budget.colLeftRp")}</th><th>Status</th><th>Reason</th></tr></thead>
        <tbody>${list.map(x => `<tr class="click" data-bsite="${x.code}">
          <td class="site"><b>${esc(x.cinema)}</b>${admin && !reg ? `<span class="muted sub">${esc((x.region || "").replace(/^REGION/, "Region"))}</span>` : ""}</td>
          <td class="r">${x.ft || "–"}</td><td class="r muted">${x.rate ? fmt(x.rate) : "–"}</td>
          <td class="r">${fmt(x.budgetMonth)}</td><td class="r"><b>${fmt(x.actual)}</b></td>
          <td>${x.budgetMonth ? progress(x.actual, x.budgetToDate, x.budgetMonth, "sm") : `<span class="muted">${t("budget.noBudgetShort")}</span>`}</td>
          <td class="r" style="${x.remaining < 0 ? "color:var(--red-text);font-weight:600" : ""}">${fmt(x.remaining)}</td>
          <td class="r" style="${x.amountRemaining < 0 ? "color:var(--red-text);font-weight:600" : ""}" title="${rpFull(x.amountRemaining)}">${rp(x.amountRemaining)}</td>
          <td>${statusTag(x.status)}</td>
          <td>${x.status !== "none" ? reasonBtn({site: x.code, cinema: x.cinema, date: r.cut, month: key, context: x.status === "over" ? "over" : x.status === "nobudget" || x.status === "early" ? "nobudget" : "other"}) : ""}</td></tr>`).join("") || `<tr><td colspan="10" class="muted">${t("budget.emptyFilter")}</td></tr>`}</tbody>
        <tfoot><tr><td>${t("budget.totalRow", {n: list.length})}</td><td class="r">${fmt(list.reduce((a, x) => a + (x.ft || 0), 0))}</td><td></td><td class="r">${fmt(list.reduce((a, x) => a + x.budgetMonth, 0))}</td><td class="r">${fmt(list.reduce((a, x) => a + x.actual, 0))}</td><td></td><td class="r">${fmt(list.reduce((a, x) => a + x.remaining, 0))}</td><td class="r">${rp(list.reduce((a, x) => a + (x.amountRemaining || 0), 0))}</td><td></td><td></td></tr></tfoot>
      </table></div>
      <p class="foot">${t("budget.footNew")} ${r.source ? t("budget.source", {s: esc(r.source)}) : ""}</p>
      ${!admin ? "" : `<div class="row" style="margin-top:var(--s4)"><h2 class="section-head" style="margin:0">${t("budget.mailTitle")}</h2><span class="spacer"></span>
        ${btn(t("budget.copySubject"), {id: "bmSubj", icon: ICON.copy})}${btn(t("budget.copyMail"), {id: "bmCopy", filled: true, icon: ICON.copy})}</div>
      <p class="foot" style="margin-top:-8px">${t("budget.mailNote")}</p>
      <div class="mail-paper"><p style="font-family:Arial;font-size:13px;color:#555;margin:0 0 12px"><b>Subject:</b> ${esc(Mail.subject(r))}</p>${Mail.mailHTML(r)}</div>`}`;

    wireCut();
    on(c, "[data-breg]", "click", b => { state.budgetRegion = b.dataset.breg; app.rerender(); });
    on(c, "[data-bf]", "click", b => { state.budgetFilter = b.dataset.bf; app.rerender(); });
    on(c, "[data-bsite]", "click", row => openBudgetSite(r, row.dataset.bsite));
    on(c, "#bvCopy", "click", () => copyText(summaryText(r), t("budget.copied")));
    on(c, "#bmCopy", "click", () => copyRich(Mail.mailHTML(r), Mail.mailText(r), t("budget.mailCopied")));
    on(c, "#bmSubj", "click", () => copyText(Mail.subject(r), t("budget.subjectCopied")));
  },
};

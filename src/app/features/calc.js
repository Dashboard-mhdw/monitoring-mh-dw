// Kalkulator Alokasi — simulate moving MH DW budget between sites of one region before submitting it.
// Need per site = what it will probably use by month end (pace so far × remaining days) − its budget.
// Moves are valued in Rupiah, so the MH a site receives = MH given × rate asal ÷ rate tujuan.
import { t } from "../i18n.js";
import { reasons, addTransfer } from "../reasons.js";
import { fmt, monthName, monthEnd, dateLong, rp } from "../format.js";
import { esc, ICON, on, copyText, hud } from "../ui/dom.js";
import { header, kpi, kpis, notice, btn, tag } from "../ui/components.js";
import { budgetVsActual, store } from "../store.js";
import { state } from "../state.js";
import { cutFor } from "./budget.js";

const half = v => Math.floor(v * 2 + 1e-9) / 2;           // round down to 0,5 MH
const one = v => Math.round(v * 10) / 10;
const regName = r => String(r || "").replace(/^REGION/, "Region");

/** Pair givers (adj < 0) with receivers (adj > 0) by value. Returns [{from, to, mh, mhTo, amount}]. */
function pairsFrom(rows, adj) {
  const give = rows.filter(x => (adj[x.code] || 0) < 0).map(x => ({x, rp: -adj[x.code] * x.rate})).sort((a, b) => b.rp - a.rp);
  const take = rows.filter(x => (adj[x.code] || 0) > 0).map(x => ({x, rp: adj[x.code] * x.rate})).sort((a, b) => b.rp - a.rp);
  const out = [];
  for (const r of take) {
    for (const g of give) {
      if (r.rp < 1 || g.rp < 1) continue;
      const amt = Math.min(r.rp, g.rp), mh = one(amt / g.x.rate);
      if (mh < 0.1) continue;
      out.push({from: g.x, to: r.x, mh, mhTo: one(mh * g.x.rate / r.x.rate), amount: Math.round(mh * g.x.rate)});
      r.rp -= amt; g.rp -= amt;
    }
  }
  return out;
}

/** Suggest moves: sites expected to run short receive from sites expected to have spare (keeping a buffer). */
function suggest(rows, buffer) {
  const adj = {};
  const need = rows.filter(x => x.need > 0.5).map(x => ({x, rp: x.need * x.rate})).sort((a, b) => b.rp - a.rp);
  const spare = rows.map(x => ({x, mh: half(Math.min(x.left, x.budgetMonth - x.forecast * (1 + buffer)))})).filter(s => s.mh >= 0.5)
    .map(s => ({...s, rp: s.mh * s.x.rate})).sort((a, b) => b.rp - a.rp);
  for (const n of need) for (const s of spare) {
    if (n.rp < 1 || s.rp < 1) continue;
    const mh = half(Math.min(n.rp, s.rp) / s.x.rate);
    if (mh < 0.5) continue;
    const amt = mh * s.x.rate;
    adj[s.x.code] = one((adj[s.x.code] || 0) - mh);
    adj[n.x.code] = one((adj[n.x.code] || 0) + amt / n.x.rate);
    s.rp -= amt; n.rp -= amt;
  }
  return adj;
}

export default {
  id: "calc",
  render(c, app) {
    const key = state.month, title = t("nav.calc");
    if (!store.budget) { c.innerHTML = header(title, monthName(key)) + notice(t("budget.noBudget"), t("budget.noBudgetSub")); return; }
    const cut = cutFor(key), r = budgetVsActual(key, cut, reasons.transfers);
    if (!r) { c.innerHTML = header(title, monthName(key)) + notice(t("budget.noMonth", {month: monthName(key)}), t("budget.noMonthSub")); return; }

    const admin = !store.access || store.access.scope === "ALL";
    const regs = [...new Set(r.rows.map(x => x.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
    if (!regs.includes(state.calcRegion)) state.calcRegion = regs[0] || "";
    const reg = state.calcRegion;
    const dIn = +monthEnd(key).slice(8), dDone = +r.cut.slice(8), dLeft = Math.max(0, dIn - dDone);
    const buffer = state.calcBuffer, basis = state.calcBasis === "pace" ? "pace" : "plan";
    const rows = r.rows.filter(x => x.rate && x.region === reg && (x.budgetMonth > 0 || x.actual > 0)).map(x => {
      // "plan": the rest of the month is assumed to use at least its planned budget (safe for givers);
      // "pace": the rest of the month follows the usage so far.
      const perDay = dDone ? x.actual / dDone : 0, planLeft = Math.max(0, x.budgetMonth - x.budgetToDate);
      const forecast = !dDone ? x.budgetMonth : x.actual + (basis === "pace" ? perDay * dLeft : Math.max(perDay * dLeft, planLeft));
      return {...x, perDay, forecast, need: forecast - x.budgetMonth, left: x.budgetMonth - x.actual};
    }).sort((a, b) => b.need * b.rate - a.need * a.rate);

    const store0 = state.calcAdj[key + "|" + reg] || {};
    const adj = {}; rows.forEach(x => { if (store0[x.code]) adj[x.code] = store0[x.code]; });
    const balance = rows.reduce((a, x) => a + (adj[x.code] || 0) * x.rate, 0);
    const moved = rows.reduce((a, x) => a + Math.max(0, -(adj[x.code] || 0)) * x.rate, 0);
    const pairs = pairsFrom(rows, adj);
    const gives = x => Math.max(0, -(adj[x.code] || 0)), tooMuch = rows.filter(x => gives(x) > Math.max(0, x.left) + 1e-9);
    const short = rows.filter(x => x.need > 0.5), spare = rows.filter(x => x.budgetMonth - x.forecast * (1 + buffer) >= 0.5);
    const T = k => rows.reduce((a, x) => a + x[k] * x.rate, 0);
    const afterShort = rows.filter(x => x.forecast > x.budgetMonth + (adj[x.code] || 0) + 0.5).length;
    const tol = Math.max(10000, moved * 0.01), balTone = Math.abs(balance) < tol ? "good" : balance > 0 ? "bad" : "warn";

    const sheetMonth = reasons.budgetMonth, monthOk = !sheetMonth || +key.slice(5) === +sheetMonth;
    const canApply = reasons.online && monthOk && pairs.length && !tooMuch.length && balance < tol;

    const statusAfter = x => {
      const nb = x.budgetMonth + (adj[x.code] || 0), gap = x.forecast - nb;
      return gap > 0.5 ? tag(t("calc.stShort", {v: fmt(gap, 1)}), "red") : nb - x.forecast * (1 + buffer) >= 0.5 ? tag(t("calc.stSpare", {v: fmt(nb - x.forecast, 1)}), "") : tag(t("calc.stOk"), "green");
    };

    c.innerHTML = header(title, t("calc.sub", {month: monthName(key), date: dateLong(r.cut)}),
        btn(t("calc.backBudget"), {go: "budget", icon: ICON.budget})) + `
      <div class="card calc-intro"><p>${basis === "pace" ? t("calc.howPace", {d: dDone, left: dLeft}) : t("calc.howPlan", {d: dDone, left: dLeft})} ${t("calc.how2")}</p></div>
      <div class="row calc-tools">
        ${admin && regs.length > 1 ? `<label class="field"><span>Region</span><select class="popup" id="cReg">${regs.map(g => `<option value="${esc(g)}"${g === reg ? " selected" : ""}>${esc(regName(g))}</option>`).join("")}</select></label>`
          : `<span class="calc-reg">${ICON.lock}${esc(regName(reg))}</span>`}
        <label class="field"><span>${t("calc.basis")}</span><select class="popup" id="cBasis"><option value="plan"${basis === "plan" ? " selected" : ""}>${t("calc.basisPlan")}</option><option value="pace"${basis === "pace" ? " selected" : ""}>${t("calc.basisPace")}</option></select></label>
        <label class="field"><span>${t("calc.buffer")}</span><select class="popup" id="cBuf">${[0, 0.05, 0.1, 0.2].map(v => `<option value="${v}"${v === buffer ? " selected" : ""}>${v ? "+" + v * 100 + "%" : t("calc.noBuffer")}</option>`).join("")}</select></label>
        <span class="spacer"></span>
        <button type="button" class="btn" id="cReset">${t("calc.reset")}</button>
        <button type="button" class="btn filled" id="cAuto">${ICON.trend}${t("calc.auto")}</button>
      </div>` +
      kpis(
        kpi({label: t("calc.kBudget"), icon: ICON.budget, tint: "indigo", value: rp(T("budgetMonth")), sub: t("calc.kBudgetSub", {n: rows.length})}),
        kpi({label: t("calc.kForecast"), icon: ICON.trend, tint: T("forecast") > T("budgetMonth") ? "red" : "blue", tone: T("forecast") > T("budgetMonth") ? "bad" : "", value: rp(T("forecast")),
          sub: T("forecast") > T("budgetMonth") ? t("calc.kOver", {v: rp(T("forecast") - T("budgetMonth"))}) : t("calc.kUnder", {v: rp(T("budgetMonth") - T("forecast"))})}),
        kpi({label: t("calc.kShort"), icon: ICON.alert, tint: "red", value: short.length, unit: "site", sub: t("calc.kShortSub", {n: spare.length})}),
        kpi({label: t("calc.kBalance"), icon: ICON.check, tint: balTone === "good" ? "green" : balTone === "bad" ? "red" : "orange", tone: balTone,
          value: (balance > 0 ? "+" : "") + rp(balance), sub: balTone === "good" ? t("calc.balOk", {v: rp(moved)}) : balance > 0 ? t("calc.balOver") : t("calc.balUnder")}),
      ) + `
      <div class="table-wrap"><table class="ctable">
        <thead><tr><th>${t("col.site")}</th><th class="r">${t("budget.colRate")}</th><th class="r">${t("calc.colBudget")}</th><th class="r">${t("calc.colUsed")}</th><th class="r">${t("calc.colForecast")}</th><th class="r">${t("calc.colNeed")}</th><th class="c">${t("calc.colAdj")}</th><th class="r">${t("calc.colNew")}</th><th class="r">${t("calc.colRp")}</th><th>${t("calc.colAfter")}</th></tr></thead>
        <tbody>${rows.map(x => { const a = adj[x.code] || 0, bad = gives(x) > Math.max(0, x.left) + 1e-9; return `<tr${a ? ` class="${a > 0 ? "c-in" : "c-out"}"` : ""}>
          <td class="site"><b>${esc(x.cinema)}</b><span class="muted sub">${t("calc.perDay", {v: fmt(x.perDay, 1)})}</span></td>
          <td class="r muted">${fmt(x.rate)}</td>
          <td class="r">${fmt(x.budgetMonth, 1)}</td>
          <td class="r">${fmt(x.actual, 1)}<span class="muted sub">${t("calc.leftShort", {v: fmt(x.left, 1)})}</span></td>
          <td class="r">${fmt(x.forecast, 1)}</td>
          <td class="r">${x.need > 0.5 ? `<span class="delta bad">+${fmt(x.need, 1)}</span>` : x.need < -0.5 ? `<span class="delta down">${fmt(x.need, 1)}</span>` : `<span class="muted">0</span>`}</td>
          <td class="c"><div class="stepper${bad ? " bad" : ""}"><button type="button" data-step="-1" data-code="${x.code}" aria-label="−">−</button><input type="number" step="0.5" inputmode="decimal" data-adj="${x.code}" value="${a ? one(a) : ""}" placeholder="0"><button type="button" data-step="1" data-code="${x.code}" aria-label="+">+</button></div></td>
          <td class="r"><b>${fmt(x.budgetMonth + a, 1)}</b></td>
          <td class="r">${a ? `<span class="delta ${a > 0 ? "" : "down"}">${a > 0 ? "+" : "−"}${rp(Math.abs(a * x.rate))}</span>` : `<span class="muted">–</span>`}</td>
          <td>${statusAfter(x)}</td></tr>`; }).join("") || `<tr><td colspan="10" class="muted">${t("calc.empty")}</td></tr>`}</tbody>
      </table></div>
      ${tooMuch.length ? notice(t("calc.tooMuch", {list: esc(tooMuch.map(x => x.cinema).join(", "))}), "", "err") : ""}
      <div class="card">
        <div class="card-head"><h2>${t("calc.planTitle")}</h2>${pairs.length ? `<button type="button" class="btn plain" id="cCopy">${ICON.copy}${t("calc.copy")}</button>` : ""}</div>
        ${pairs.length ? `<ol class="cplan">${pairs.map(p => `<li><span class="cp-from"><b>${esc(p.from.cinema)}</b><small>−${fmt(p.mh, 1)} MH</small></span><span class="cp-arrow">→ ${rp(p.amount)} →</span><span class="cp-to"><b>${esc(p.to.cinema)}</b><small>+${fmt(p.mhTo, 1)} MH</small></span></li>`).join("")}</ol>
          <p class="foot" style="margin:0">${t("calc.after", {n: afterShort})}</p>
          ${canApply ? `<div class="row"><input type="text" class="datefield" id="cBy" placeholder="${esc(t("budget.trBy"))}" value="${esc(reasons.lastBy)}" style="max-width:220px"><input type="text" class="datefield" id="cWhy" placeholder="${esc(t("budget.trReasonPh"))}" style="flex:1;min-width:200px"><button type="button" class="btn filled" id="cApply">${t("calc.apply", {n: pairs.length})}</button></div>`
            : `<p class="muted" style="margin:0">${!reasons.online ? t("calc.offline") : !monthOk ? t("budget.trWrongMonth", {m: monthName(key)}) : balance >= tol ? t("calc.fixBalance") : tooMuch.length ? t("calc.fixTooMuch") : ""}</p>`}`
          : `<p class="muted" style="margin:0">${t("calc.noPlan")}</p>`}
      </div>
      <p class="foot">${t("calc.foot")}</p>`;

    const save = next => { state.calcAdj[key + "|" + reg] = next; app.rerender(); };
    on(c, "#cReg", "change", el => { state.calcRegion = el.value; app.rerender(); });
    on(c, "#cBasis", "change", el => { state.calcBasis = el.value; app.rerender(); });
    on(c, "#cBuf", "change", el => { state.calcBuffer = +el.value; app.rerender(); });
    on(c, "#cReset", "click", () => save({}));
    on(c, "#cAuto", "click", () => { const s = suggest(rows, buffer); save(s); hud(Object.keys(s).length ? t("calc.autoDone") : t("calc.autoNone")); });
    on(c, "[data-step]", "click", b => { const k = b.dataset.code, v = one((adj[k] || 0) + (+b.dataset.step) * 0.5); const n = {...adj}; if (v) n[k] = v; else delete n[k]; save(n); });
    on(c, "[data-adj]", "change", el => { const k = el.dataset.adj, v = one(+String(el.value).replace(",", ".") || 0); const n = {...adj}; if (v) n[k] = v; else delete n[k]; save(n); });
    on(c, "#cCopy", "click", () => {
      const txt = [t("calc.copyHead", {r: regName(reg), m: monthName(key)}), ...pairs.map((p, i) => `${i + 1}. ${p.from.cinema} → ${p.to.cinema}: −${fmt(p.mh, 1)} MH / +${fmt(p.mhTo, 1)} MH (${rp(p.amount)})`)].join("\n");
      copyText(txt).then(() => hud(t("calc.copied")));
    });
    on(c, "#cApply", "click", async b => {
      const by = c.querySelector("#cBy").value.trim(), why = c.querySelector("#cWhy").value.trim() || t("calc.reasonDefault");
      b.disabled = true; let ok = 0;
      for (const p of pairs) {
        b.textContent = t("calc.applying", {i: ok + 1, n: pairs.length});
        const res = await addTransfer({month: key, from: p.from.code, to: p.to.code, mh: p.mh, reason: why, by});
        if (!res.ok) { hud(t("budget.trFail", {e: res.error || "?"})); break; }
        ok++;
      }
      if (ok === pairs.length) { state.calcAdj[key + "|" + reg] = {}; hud(t("calc.applied", {n: ok})); }
      app.rerender();
    });
  },
};

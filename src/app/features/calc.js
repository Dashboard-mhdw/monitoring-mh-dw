// Kalkulator Alokasi — in three steps:
//   1 · Budget sekarang: what each site in the region has, has used, has left, and will probably need.
//   2 · Simulasi: add (and delete) moves "dari site A → ke site B, x MH". Moves are valued in Rupiah,
//       so the MH a site receives = MH given × rate asal ÷ rate tujuan.
//   3 · Hasil: the region after the moves, ready to copy or submit to the budget sheet.
import { t } from "../i18n.js";
import { reasons, addTransfer } from "../reasons.js";
import { fmt, monthName, monthEnd, dateLong, rp } from "../format.js";
import { esc, ICON, on, copyText, hud } from "../ui/dom.js";
import { header, notice, btn, tag } from "../ui/components.js";
import { budgetVsActual, store } from "../store.js";
import { state } from "../state.js";
import { cutFor } from "./budget.js";

const half = v => Math.floor(v * 2 + 1e-9) / 2;           // round down to 0,5 MH
const one = v => Math.round(v * 10) / 10;
const regName = r => String(r || "").replace(/^REGION/, "Region");
const short = s => String(s || "").replace(/^\d+-/, "");

// A move is {from, to, mh} between two sites, {from, to: "pool", mh} = "kurangi saja" (kept as region reserve),
// or {from: "pool", to, rp} = hand reserve to a site.
const POOL = "pool";

/** Apply moves → {delta: {code: ±MH}, list, pool (Rp not yet given to a site)} */
function applyMoves(rows, moves) {
  const by = Object.fromEntries(rows.map(x => [x.code, x])), delta = {}, list = [];
  let pool = 0;
  const add = (code, v) => { delta[code] = one((delta[code] || 0) + v); };
  for (const m of moves) {
    if (m.from === POOL) {
      const to = by[m.to]; if (!to) continue;
      const mhTo = one(m.rp / to.rate); add(to.code, mhTo); pool -= m.rp;
      list.push({...m, f: null, to, mh: 0, mhTo, amount: Math.round(m.rp)});
    } else if (m.to === POOL) {
      const f = by[m.from]; if (!f) continue;
      add(f.code, -m.mh); pool += m.mh * f.rate;
      list.push({...m, f, to: null, mhTo: 0, amount: Math.round(m.mh * f.rate)});
    } else {
      const f = by[m.from], to = by[m.to]; if (!f || !to) continue;
      const mhTo = one(m.mh * f.rate / to.rate); add(f.code, -m.mh); add(to.code, mhTo);
      list.push({...m, f, to, mhTo, amount: Math.round(m.mh * f.rate)});
    }
  }
  return {delta, list, pool: Math.max(0, Math.round(pool))};
}

/**
 * Suggest extra moves on top of what is already in the simulation:
 * first hand the reserve (sites reduced without a target) to sites expected to run short,
 * then move spare from sites expected to have too much (keeping a buffer). Returns only the new moves.
 */
function suggest(rows, buffer, moves) {
  const {delta, pool} = applyMoves(rows, moves), out = [];
  const nb = x => x.budgetMonth + (delta[x.code] || 0);
  const need = rows.map(x => ({x, rp: (x.forecast - nb(x)) * x.rate})).filter(n => n.rp > 0.5 * n.x.rate).sort((a, b) => b.rp - a.rp);
  let left = pool;
  for (const n of need) { if (left < 1000) break; const g = Math.min(left, n.rp); out.push({from: POOL, to: n.x.code, rp: Math.round(g)}); n.rp -= g; left -= g; }
  const spare = rows.map(x => ({x, mh: half(Math.min(x.left + (delta[x.code] || 0), nb(x) - x.forecast * (1 + buffer)))})).filter(s => s.mh >= 0.5)
    .map(s => ({...s, rp: s.mh * s.x.rate})).sort((a, b) => b.rp - a.rp);
  for (const n of need) for (const sp of spare) {
    if (n.rp < 1000 || sp.rp < 1000 || sp.x.code === n.x.code) continue;
    const mh = half(Math.min(n.rp, sp.rp) / sp.x.rate);
    if (mh < 0.5) continue;
    out.push({from: sp.x.code, to: n.x.code, mh});
    sp.rp -= mh * sp.x.rate; n.rp -= mh * sp.x.rate;
  }
  return {moves: out, needCount: need.length};
}

/** Turn the simulation into site → site transfers the budget sheet understands (reserve is matched up by value). */
function toTransfers(list) {
  const out = list.filter(m => m.f && m.to).map(m => ({from: m.f, to: m.to, mh: m.mh}));
  const give = list.filter(m => m.f && !m.to).map(m => ({x: m.f, rp: m.amount}));
  for (const r of list.filter(m => !m.f && m.to).map(m => ({x: m.to, rp: m.amount}))) for (const g of give) {
    if (r.rp < 1 || g.rp < 1) continue;
    const amt = Math.min(r.rp, g.rp), mh = one(amt / g.x.rate);
    if (mh >= 0.1) out.push({from: g.x, to: r.x, mh});
    r.rp -= amt; g.rp -= amt;
  }
  return out;
}

const status = (x, budget, buffer) => {
  const gap = x.forecast - budget;
  return gap > 0.5 ? tag(t("calc.stShort", {v: fmt(gap, 1)}), "red")
    : budget - x.forecast * (1 + buffer) >= 0.5 ? tag(t("calc.stSpare", {v: fmt(budget - x.forecast, 1)}), "")
    : tag(t("calc.stOk"), "green");
};
const bar = (used, budget) => {
  const p = budget > 0 ? Math.min(1, used / budget) : (used > 0 ? 1 : 0), over = used > budget + 0.01;
  return `<span class="cbar${over ? " over" : ""}"><i style="width:${(p * 100).toFixed(1)}%"></i></span>`;
};

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
    const reg = state.calcRegion, sk = key + "|" + reg;
    const dIn = +monthEnd(key).slice(8), dDone = +r.cut.slice(8), dLeft = Math.max(0, dIn - dDone);
    const buffer = state.calcBuffer, basis = state.calcBasis === "pace" ? "pace" : "plan";
    const rows = r.rows.filter(x => x.rate && x.region === reg && (x.budgetMonth > 0 || x.actual > 0)).map(x => {
      // "plan": the rest of the month uses at least its planned budget (safe for givers); "pace": it follows usage so far.
      const perDay = dDone ? x.actual / dDone : 0, planLeft = Math.max(0, x.budgetMonth - x.budgetToDate);
      const forecast = !dDone ? x.budgetMonth : x.actual + (basis === "pace" ? perDay * dLeft : Math.max(perDay * dLeft, planLeft));
      return {...x, perDay, forecast, need: forecast - x.budgetMonth, left: x.budgetMonth - x.actual};
    }).sort((a, b) => a.cinema.localeCompare(b.cinema, undefined, {numeric: true}));
    const by = Object.fromEntries(rows.map(x => [x.code, x]));

    const ok = c2 => c2 === POOL || by[c2];
    const moves = (state.calcMoves[sk] || []).filter(m => ok(m.from) && ok(m.to));
    const {delta, list, pool} = applyMoves(rows, moves);
    const avail = code => Math.max(0, by[code].left + (delta[code] || 0));        // what a site can still give
    const S = (k, f = x => x[k]) => rows.reduce((a, x) => a + f(x) * x.rate, 0);
    const totB = S("budgetMonth"), totU = S("actual"), totF = S("forecast");
    const nShort = rows.filter(x => x.need > 0.5).length, nAfter = rows.filter(x => x.forecast > x.budgetMonth + (delta[x.code] || 0) + 0.5).length;
    const moved = list.filter(m => m.f).reduce((a, m) => a + m.amount, 0);   // count money once: when it leaves a site
    const touched = rows.filter(x => delta[x.code]);

    const sheetMonth = reasons.budgetMonth, monthOk = !sheetMonth || +key.slice(5) === +sheetMonth;
    const transfers = toTransfers(list);
    const canApply = reasons.online && monthOk && transfers.length;
    const F = state.calcForm;
    if (!by[F.from]) F.from = (rows.slice().sort((a, b) => avail(b.code) * b.rate - avail(a.code) * a.rate)[0] || {}).code || "";
    if (F.to !== POOL && (!by[F.to] || F.to === F.from)) { const n = rows.filter(x => x.code !== F.from && x.need > 0.5).sort((a, b) => b.need * b.rate - a.need * a.rate)[0]; F.to = n ? n.code : POOL; }
    const opt = (sel, fn) => rows.map(x => `<option value="${x.code}"${x.code === sel ? " selected" : ""}>${esc(short(x.cinema))} — ${fn(x)}</option>`).join("");

    c.innerHTML = header(title, t("calc.sub", {month: monthName(key), date: dateLong(r.cut)}), btn(t("calc.backBudget"), {go: "budget", icon: ICON.budget})) + `
      <div class="row calc-tools">
        ${admin && regs.length > 1 ? `<select class="popup" id="cReg" aria-label="Region">${regs.map(g => `<option value="${esc(g)}"${g === reg ? " selected" : ""}>${esc(regName(g))}</option>`).join("")}</select>`
          : `<span class="calc-reg">${ICON.lock}${esc(regName(reg))}</span>`}
        <span class="muted">${t("calc.days", {d: dDone, n: dIn, left: dLeft})}</span>
      </div>

      <section class="cstep">
        <h2 class="cstep-h"><span>1</span>${t("calc.s1")}</h2>
        <div class="ctiles">
          <div class="ctile"><small>${t("calc.tBudget")}</small><b>${rp(totB)}</b><span>${fmt(rows.reduce((a, x) => a + x.budgetMonth, 0), 1)} MH · ${rows.length} site</span></div>
          <div class="ctile"><small>${t("calc.tUsed", {d: dateLong(r.cut)})}</small><b>${rp(totU)}</b><span>${bar(totU, totB)}${totB ? Math.round(totU / totB * 100) : 0}% ${t("calc.ofBudget")}</span></div>
          <div class="ctile ${totB - totU < 0 ? "bad" : ""}"><small>${t("calc.tLeft")}</small><b>${rp(totB - totU)}</b><span>${t("calc.tLeftSub", {d: dLeft})}</span></div>
          <div class="ctile ${totF > totB ? "bad" : "good"}"><small>${t("calc.tForecast")}</small><b>${rp(totF)}</b><span>${totF > totB ? t("calc.kOver", {v: rp(totF - totB)}) : t("calc.kUnder", {v: rp(totB - totF)})}</span></div>
        </div>
        <div class="table-wrap"><table class="ctable">
          <thead><tr><th>${t("col.site")}</th><th class="r">${t("calc.colBudget")}</th><th>${t("calc.colUsed")}</th><th class="r">${t("calc.colLeft")}</th><th class="r">${t("calc.colForecast")}</th><th>${t("calc.colStatus")}</th></tr></thead>
          <tbody>${rows.map(x => `<tr>
            <td class="site"><b>${esc(x.cinema)}</b><span class="muted sub">Rp ${fmt(x.rate)}/MH · ${t("calc.perDay", {v: fmt(x.perDay, 1)})}</span></td>
            <td class="r">${fmt(x.budgetMonth, 1)}</td>
            <td><div class="cused">${bar(x.actual, x.budgetMonth)}<span>${fmt(x.actual, 1)}</span></div></td>
            <td class="r ${x.left < 0 ? "neg" : ""}">${fmt(x.left, 1)}</td>
            <td class="r">${fmt(x.forecast, 1)}</td>
            <td>${status(x, x.budgetMonth, buffer)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">${t("calc.empty")}</td></tr>`}</tbody>
        </table></div>
        <details class="cset"><summary>${t("calc.settings")}</summary>
          <div class="row">
            <label class="field"><span>${t("calc.basis")}</span><select class="popup" id="cBasis"><option value="plan"${basis === "plan" ? " selected" : ""}>${t("calc.basisPlan")}</option><option value="pace"${basis === "pace" ? " selected" : ""}>${t("calc.basisPace")}</option></select></label>
            <label class="field"><span>${t("calc.buffer")}</span><select class="popup" id="cBuf">${[0, 0.05, 0.1, 0.2].map(v => `<option value="${v}"${v === buffer ? " selected" : ""}>${v ? "+" + v * 100 + "%" : t("calc.noBuffer")}</option>`).join("")}</select></label>
          </div>
          <p class="muted">${basis === "pace" ? t("calc.howPace", {d: dDone, left: dLeft}) : t("calc.howPlan", {d: dDone, left: dLeft})}</p>
        </details>
      </section>

      <section class="cstep">
        <h2 class="cstep-h"><span>2</span>${t("calc.s2")}</h2>
        <div class="card cform">
          <label class="field"><span>${t("calc.from")}</span><select class="popup" id="cFrom">${opt(F.from, x => t("calc.optLeft", {v: fmt(avail(x.code), 1)}))}</select></label>
          <span class="cform-arrow" aria-hidden="true">→</span>
          <label class="field"><span>${t("calc.to")}</span><select class="popup" id="cTo"><option value="${POOL}"${F.to === POOL ? " selected" : ""}>${t("calc.toPool")}</option>${opt(F.to, x => x.need > 0.5 ? t("calc.optNeed", {v: fmt(x.need, 1)}) : t("calc.optOk"))}</select></label>
          <label class="field cmh"><span>${t("calc.mh")}</span><input type="number" id="cMh" min="0.5" step="0.5" inputmode="decimal" value="${F.mh || ""}" placeholder="0"></label>
          <button type="button" class="btn filled" id="cAdd">${ICON.plus || "+"} ${t("calc.add")}</button>
          <p class="cprev" id="cPrev"></p>
        </div>
        <div class="row">
          <button type="button" class="btn" id="cAuto">${ICON.trend}${t("calc.auto")}</button>
          ${list.length ? `<button type="button" class="btn plain" id="cClear">${t("calc.reset")}</button>` : ""}
          <span class="spacer"></span>
          <span class="muted">${t("calc.autoHint", {n: nShort})}</span>
        </div>
        ${list.length ? `<ol class="cplan">${list.map((m, i) => `<li>
            <span class="cp-from">${m.f ? `<b>${esc(short(m.f.cinema))}</b><small>−${fmt(m.mh, 1)} MH</small>` : `<b class="cp-pool">${t("calc.pool")}</b><small>${t("calc.poolUse")}</small>`}</span>
            <span class="cp-arrow">→ ${rp(m.amount)} →</span>
            <span class="cp-to">${m.to ? `<b>${esc(short(m.to.cinema))}</b><small>+${fmt(m.mhTo, 1)} MH</small>` : `<b class="cp-pool">${t("calc.pool")}</b><small>${t("calc.poolKeep")}</small>`}</span>
            <button type="button" class="cp-del" data-del="${i}" aria-label="${esc(t("calc.del"))}" title="${esc(t("calc.del"))}">×</button></li>`).join("")}</ol>`
          : `<p class="muted cempty">${t("calc.noPlan")}</p>`}
      </section>

      <section class="cstep">
        <h2 class="cstep-h"><span>3</span>${t("calc.s3")}</h2>
        ${list.length ? `
        <div class="ctiles">
          <div class="ctile"><small>${t("calc.rMoved")}</small><b>${rp(moved)}</b><span>${t("calc.rMoves", {n: list.length})}</span></div>
          ${pool ? `<div class="ctile warn"><small>${t("calc.rPool")}</small><b>${rp(pool)}</b><span>${nAfter ? t("calc.rPoolUse") : t("calc.rPoolKeep")}</span></div>` : ""}
          <div class="ctile ${nAfter ? "bad" : "good"}"><small>${t("calc.rShort")}</small><b>${nAfter} <em>/ ${nShort}</em></b><span>${nAfter ? t("calc.rShortSub") : t("calc.rAllOk")}</span></div>
        </div>
        <div class="table-wrap"><table class="ctable">
          <thead><tr><th>${t("col.site")}</th><th class="r">${t("calc.colBudget")}</th><th class="r">${t("calc.colChange")}</th><th class="r">${t("calc.colNew")}</th><th class="r">${t("calc.colLeftNew")}</th><th>${t("calc.colStatus")}</th></tr></thead>
          <tbody>${touched.map(x => { const d = delta[x.code], nb = x.budgetMonth + d; return `<tr class="${d > 0 ? "c-in" : "c-out"}">
            <td class="site"><b>${esc(x.cinema)}</b></td>
            <td class="r muted">${fmt(x.budgetMonth, 1)}</td>
            <td class="r"><b class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${fmt(Math.abs(d), 1)}</b><span class="muted sub">${d > 0 ? "+" : "−"}${rp(Math.abs(d * x.rate))}</span></td>
            <td class="r"><b>${fmt(nb, 1)}</b></td>
            <td class="r">${fmt(nb - x.actual, 1)}</td>
            <td>${status(x, nb, buffer)}</td></tr>`; }).join("")}</tbody>
        </table></div>
        <div class="row">
          <button type="button" class="btn" id="cCopy">${ICON.copy}${t("calc.copy")}</button>
          <span class="spacer"></span>
          ${canApply ? `<input type="text" class="datefield" id="cBy" placeholder="${esc(t("budget.trBy"))}" value="${esc(reasons.lastBy)}" style="max-width:200px">
            <input type="text" class="datefield" id="cWhy" placeholder="${esc(t("budget.trReasonPh"))}" style="flex:1;min-width:180px">
            <button type="button" class="btn filled" id="cApply">${t("calc.apply", {n: transfers.length})}</button>`
            : `<span class="muted">${!reasons.online ? t("calc.offline") : !monthOk ? t("budget.trWrongMonth", {m: monthName(key)}) : t("calc.poolOnly")}</span>`}
        </div>` : `<p class="muted cempty">${t("calc.s3Empty")}</p>`}
      </section>
      <p class="foot">${t("calc.foot")}</p>`;

    // Live preview of the move being typed (no re-render, so the cursor stays put).
    const prev = () => {
      const f = by[c.querySelector("#cFrom").value], to = by[c.querySelector("#cTo").value], mh = +String(c.querySelector("#cMh").value).replace(",", ".");
      F.from = f && f.code; F.to = to && to.code; F.mh = mh || "";
      const el = c.querySelector("#cPrev"), add = c.querySelector("#cAdd");
      let msg = "", ok = false;
      const toPool = c.querySelector("#cTo").value === POOL;
      if (toPool) F.to = POOL;
      if (!f || (!to && !toPool)) msg = "";
      else if (to && f.code === to.code) msg = `<span class="bad">${t("calc.eSame")}</span>`;
      else if (!(mh > 0)) msg = t("calc.pHint", {v: fmt(avail(f.code), 1), s: esc(short(f.cinema))});
      else if (mh > avail(f.code) + 1e-9) msg = `<span class="bad">${t("calc.eTooMuch", {v: fmt(avail(f.code), 1), s: esc(short(f.cinema))})}</span>`;
      else if (toPool) { ok = true; msg = t("calc.previewPool", {a: esc(short(f.cinema)), mh: fmt(mh, 1), left: fmt(avail(f.code) - mh, 1), rp: rp(mh * f.rate)}); }
      else {
        const mhTo = one(mh * f.rate / to.rate); ok = true;
        msg = t("calc.preview", {a: esc(short(f.cinema)), mh: fmt(mh, 1), left: fmt(avail(f.code) - mh, 1), rp: rp(mh * f.rate),
          b: esc(short(to.cinema)), mhTo: fmt(mhTo, 1), nb: fmt(to.budgetMonth + (delta[to.code] || 0) + mhTo, 1)});
      }
      el.innerHTML = msg; add.disabled = !ok;
    };
    prev();
    const save = next => { state.calcMoves[sk] = next; app.rerender(); };
    on(c, "#cFrom", "change", prev); on(c, "#cTo", "change", prev); on(c, "#cMh", "input", prev);
    on(c, "#cAdd", "click", () => { const mh = one(+String(c.querySelector("#cMh").value).replace(",", ".")); F.mh = ""; save([...moves, {from: F.from, to: F.to, mh}]); });
    on(c, "#cMh", "keydown", (el, e) => { if (e && e.key === "Enter" && !c.querySelector("#cAdd").disabled) c.querySelector("#cAdd").click(); });
    on(c, "[data-del]", "click", b => save(moves.filter((_, i) => i !== +b.dataset.del)));
    on(c, "#cClear", "click", () => save([]));
    on(c, "#cAuto", "click", () => {
      const s = suggest(rows, buffer, moves);
      if (s.moves.length) { save([...moves, ...s.moves]); hud(t("calc.autoDone")); }
      else hud(!s.needCount ? t("calc.autoNoNeed", {r: regName(reg)}) : t("calc.autoNoSpare"));
    });
    on(c, "#cReg", "change", el => { state.calcRegion = el.value; app.rerender(); });
    on(c, "#cBasis", "change", el => { state.calcBasis = el.value; app.rerender(); });
    on(c, "#cBuf", "change", el => { state.calcBuffer = +el.value; app.rerender(); });
    on(c, "#cCopy", "click", () => {
      const txt = [t("calc.copyHead", {r: regName(reg), m: monthName(key)}),
        ...list.map((m, i) => `${i + 1}. ${m.f ? m.f.cinema + " −" + fmt(m.mh, 1) + " MH" : t("calc.pool")} → ${m.to ? m.to.cinema + " +" + fmt(m.mhTo, 1) + " MH" : t("calc.pool")} (${rp(m.amount)})`),
        ...(pool ? [t("calc.copyPool", {v: rp(pool)})] : [])].join("\n");
      copyText(txt).then(() => hud(t("calc.copied")));
    });
    on(c, "#cApply", "click", async b => {
      const who = c.querySelector("#cBy").value.trim(), why = c.querySelector("#cWhy").value.trim() || t("calc.reasonDefault");
      b.disabled = true; let ok = 0;
      for (const m of transfers) {
        b.textContent = t("calc.applying", {i: ok + 1, n: transfers.length});
        const res = await addTransfer({month: key, from: m.from.code, to: m.to.code, mh: m.mh, reason: why, by: who});
        if (!res.ok) { hud(t("budget.trFail", {e: res.error || "?"})); break; }
        ok++;
      }
      if (ok === transfers.length) { state.calcMoves[sk] = []; hud(t("calc.applied", {n: ok})); }
      app.rerender();
    });
  },
};

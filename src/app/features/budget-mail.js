// "FYI" email to payroll control (Kak Cinthia), in rupiah, in two versions:
//   actual, and actual excl. bulk booking outside the DW budget (email only — the dashboard always shows actual).
//   1. national · 2. per region · 3. sites over budget MTD · 4. bulk booking left out (site, dates + admits, MH DW)
// Always Bahasa Indonesia, id-ID number format. Inline styles so it survives copy-paste into Outlook/Gmail.
import { esc } from "../ui/dom.js";
import { _dicts } from "../i18n.js";

const CAL = _dicts.id._cal;
const DASH = "https://dashboard-mhdw.github.io/monitoring-mh-dw/";
const n0 = v => Math.round(v || 0).toLocaleString("id-ID");
const pct = v => Math.round((v || 0) * 100) + "%";
const sgn = v => (v > 0 ? "+" : "") + Math.round(v * 100) + "%";
const rpS = v => (v < 0 ? "−" : "") + "Rp " + (Math.abs(v) >= 1e9 ? (Math.abs(v) / 1e9).toLocaleString("id-ID", {maximumFractionDigits: 2}) + " M"
  : Math.abs(v) >= 1e5 ? (Math.abs(v) / 1e6).toLocaleString("id-ID", {minimumFractionDigits: 1, maximumFractionDigits: 1}) + " jt" : n0(Math.abs(v)));
const dS = iso => `${+iso.slice(8)} ${CAL.monthsShort[+iso.slice(5, 7) - 1]}`;
const monthId = key => CAL.months[+key.slice(5, 7) - 1];
const daysIn = key => { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const regLabel = s => String(s || "").replace(/^REGION/i, "Region");


const INK = "#1d1d1f", MUT = "#6e6e73", LINE = "#d2d2d7", BLU = "#0a84ff", ORG = "#b25000", RED = "#d70015", GRN = "#248a3d", PUR = "#6e3fc9";
const FONT = "font-family:Calibri,Arial,Helvetica,sans-serif";
const XL = "Excl. bulk booking";

/** All numbers the email needs (rupiah = MH × rate MH DW of each site). ex = bulk booking DW outside budget, per site. */
function pack(r) {
  const rows = r.rows, T = r.tot, bk = r.bulk;
  const left = daysIn(r.month) - +r.cut.slice(8);
  const ex = new Map(); if (bk) bk.sites.forEach(x => ex.set(x.code, x));
  const exMh = x => (ex.get(x.code) || {}).dw || 0, exRp = x => (ex.get(x.code) || {}).amount || 0;
  const N = {bm: T.amountMonth || 0, bt: T.amountToDate || 0, ac: T.amountActual || 0, mhB: T.budgetMonth};
  N.ex = rows.reduce((a, x) => a + exRp(x), 0); N.exMh = rows.reduce((a, x) => a + exMh(x), 0); N.acX = N.ac - N.ex;
  const g = new Map();
  rows.forEach(x => {
    const k = x.region || "Tanpa region";
    if (!g.has(k)) g.set(k, {region: k, bm: 0, bt: 0, ac: 0, ex: 0});
    const o = g.get(k); o.bm += x.amountMonth || 0; o.bt += x.amountToDate || 0; o.ac += x.amountActual || 0; o.ex += exRp(x);
  });
  const regions = [...g.values()].map(o => ({...o, acX: o.ac - o.ex})).sort((a, b) => a.region.localeCompare(b.region, undefined, {numeric: true}));
  const over = rows.filter(x => x.actual > x.budgetToDate + 0.5).map(x => {
    const rate = x.rate || 0, o = x.actual - x.budgetToDate, oX = Math.max(0, o - exMh(x));
    return {...x, overRp: o * rate, overRpX: oX * rate, overMhX: oX};
  }).sort((a, b) => b.overRp - a.overRp);
  return {N, regions, over, overX: over.filter(x => x.overMhX > 0.5).length, left};
}

export function subject(r) {
  return `FYI – Pemakaian MH DW ${monthId(r.month)} MTD (s.d. ${dS(r.cut)}) vs Budget`;
}

const vs = (ac, bt) => bt ? sgn(ac / bt - 1) : "–";
const vsCol = (ac, bt) => ac > bt * 1.0001 ? RED : GRN;

/** Opening paragraph. */
export function paragraph(r, P = pack(r), html = false) {
  const {N, left} = P, M = monthId(r.month), D = dS(r.cut);
  const b = (s, col) => html ? `<b style="color:${col}">${s}</b>` : s;
  let s = `FYI Kak, berikut pemakaian MH DW ${M} s.d. ${D}. Budget ${M} ${rpS(N.bm)}, budget MTD ${rpS(N.bt)}. `;
  s += `Actual terpakai ${b(rpS(N.ac), vsCol(N.ac, N.bt))} (${vs(N.ac, N.bt)} vs budget MTD), sisa ${rpS(N.bm - N.ac)}${left > 0 ? ` untuk ${left} hari` : ""}.`;
  if (N.ex > 0) s += ` Di dalamnya ada ${rpS(N.ex)} (${n0(N.exMh)} MH) untuk bulk booking di luar budget DW; tanpa itu terpakai ${b(rpS(N.acX), vsCol(N.acX, N.bt))} (${vs(N.acX, N.bt)}), sisa ${rpS(N.bm - N.acX)}.`;
  return s;
}

const h2 = s => `<p style="margin:22px 0 6px;font-size:15px;font-weight:bold">${s}</p>`;
const sub = (v, col) => `<div style="font-size:11px;color:${col}">${v}</div>`;

export function mailHTML(r) {
  const P = pack(r), {N, regions, over, overX} = P, M = monthId(r.month), D = dS(r.cut), X = N.ex > 0, bk = r.bulk;
  const td = `border:1px solid ${LINE};padding:6px 10px;font-size:13px;color:${INK};vertical-align:top`;
  const th = `border:1px solid ${LINE};background:#f5f5f7;padding:6px 10px;font-size:12px;color:${MUT};font-weight:bold;text-align:left`;
  const thX = `${th};background:#f1ecfb;color:${PUR}`;
  const tf = `${th};color:${INK}`, R = ";text-align:right";
  const money = (ac, bt, col = INK) => `<b style="color:${col}">${rpS(ac)}</b>${sub(vs(ac, bt) + " vs MTD", vsCol(ac, bt))}`;
  const tbl = inner => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:820px">${inner}</table>`;

  // 1 + 2: national row on top of the region table
  const regRow = (o, last) => { const st = last ? tf : td;
    return `<tr><td style="${st};white-space:nowrap">${last ? "Nasional" : `<b>${esc(regLabel(o.region))}</b>`}</td><td style="${st + R}">${rpS(o.bm)}</td><td style="${st + R}">${rpS(o.bt)}</td>
<td style="${st + R}">${money(o.ac, o.bt)}</td>${X ? `<td style="${st + R}">${money(o.acX, o.bt, PUR)}</td>` : ""}<td style="${st + R};color:${o.bm - o.ac < 0 ? RED : INK}">${rpS(o.bm - o.ac)}${X ? sub(`excl.: ${rpS(o.bm - o.acX)}`, PUR) : ""}</td></tr>`; };
  const nat = {bm: N.bm, bt: N.bt, ac: N.ac, acX: N.acX};

  const ov = over.map(x => `<tr><td style="${td}">${esc(x.cinema)}${sub(esc(regLabel(x.region)), MUT)}</td><td style="${td + R}">${x.budgetMonth ? n0(x.budgetToDate) : `<span style="color:${ORG}">tanpa budget</span>`}</td><td style="${td + R}">${n0(x.actual)}</td>
<td style="${td + R};color:${RED};font-weight:bold">${rpS(x.overRp)}</td>${X ? `<td style="${td + R};color:${x.overMhX > 0.5 ? RED : GRN}">${x.overMhX > 0.5 ? rpS(x.overRpX) : "aman"}</td>` : ""}</tr>`).join("");

  const days = x => x.use.map(d => `${+d.iso.slice(8)} <span style="color:${MUT}">(${n0(d.admits)})</span>`).join(", ") + " " + CAL.monthsShort[+r.cut.slice(5, 7) - 1];
  const bkRows = X ? bk.sites.map(x => `<tr><td style="${td}">${esc(x.cinema)}${sub(esc(regLabel(x.region)) + " · " + (x.type === "none" ? "tanpa budget DW" : `budget DW habis ${dS(x.from)}`), x.type === "none" ? ORG : RED)}</td>
<td style="${td};font-size:12px">${days(x)}</td><td style="${td + R}">${n0(x.admits)}</td><td style="${td + R}">${n0(x.dw)}</td><td style="${td + R};font-weight:bold;color:${PUR}">${rpS(x.amount)}</td></tr>`).join("") : "";

  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:860px">
<p style="margin:0 0 12px">Dear Kak Cinthia,</p>
<p style="margin:0 0 6px">${paragraph(r, P, true)}</p>
<!--jpg-->${h2(`1. Pemakaian amount per region · ${M} s.d. ${D}`)}
${tbl(`<tr><th style="${th}">Region</th><th style="${th + R}">Budget bulan</th><th style="${th + R}">Budget MTD</th><th style="${th + R}">Actual</th>${X ? `<th style="${thX + R}">${XL}</th>` : ""}<th style="${th + R}">Sisa</th></tr>
${regions.map(o => regRow(o, false)).join("")}${regRow(nat, true)}`)}
${h2(`2. Site over budget MTD (${over.length}${X ? ` · ${overX} jika bulk booking dikeluarkan` : ""})`)}
${over.length ? tbl(`<tr><th style="${th}">Site</th><th style="${th + R}">Budget MTD (MH)</th><th style="${th + R}">Actual (MH)</th><th style="${th + R}">Over</th>${X ? `<th style="${thX + R}">Over excl. bulk</th>` : ""}</tr>${ov}`)
  : `<p style="margin:0;color:${GRN}">Tidak ada site yang over budget MTD.</p>`}
${X ? h2(`3. Bulk booking di luar budget DW (${bk.tot.sites} site · ${n0(bk.tot.dw)} MH · ${rpS(bk.tot.amount)})`) + tbl(`<tr><th style="${th}">Site</th><th style="${th}">Tanggal (admits nobar)</th><th style="${th + R}">Admits</th><th style="${th + R}">MH DW</th><th style="${thX + R}">Amount</th></tr>${bkRows}
<tr><td style="${tf}" colspan="2">Total · ${bk.tot.none} site tanpa budget DW, ${bk.tot.habis} site budget DW habis</td><td style="${tf + R}">${n0(bk.tot.admits)}</td><td style="${tf + R}">${n0(bk.tot.dw)}</td><td style="${tf + R};color:${PUR}">${rpS(bk.tot.amount)}</td></tr>`) : ""}
<p style="font-size:11px;color:${MUT};margin:8px 0 14px">Amount = MH DW × rate tiap site. ${X ? `${XL} = actual dikurangi MH DW di hari bulk booking pada site tanpa budget DW, atau setelah budget DW bulan ini habis. Hari bulk booking &amp; admits nobar = estimasi dari lonjakan admits harian. ` : ""}Detail: <a href="${DASH}" style="color:${BLU}">dashboard Monitoring MH DW</a>.</p>
<!--/jpg--><p style="margin:0 0 12px">Terima kasih.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

export function mailText(r) {
  const P = pack(r), {N, regions, over} = P, X = N.ex > 0, bk = r.bulk;
  return ["Dear Kak Cinthia,", "", paragraph(r, P, false), "",
    "1. Per region (actual" + (X ? " / excl. bulk booking" : "") + " vs budget MTD):",
    ...regions.map(o => `${regLabel(o.region)}: ${rpS(o.ac)} (${vs(o.ac, o.bt)})` + (X ? ` / ${rpS(o.acX)} (${vs(o.acX, o.bt)})` : "") + ` · budget MTD ${rpS(o.bt)}`), "",
    `2. Site over budget MTD (${over.length}):`, ...(over.length ? over.map(x => `${x.cinema}: over ${rpS(x.overRp)}` + (X ? ` · excl. bulk ${x.overMhX > 0.5 ? rpS(x.overRpX) : "aman"}` : "")) : ["Tidak ada."]), "",
    ...(X ? [`3. Bulk booking di luar budget DW (${bk.tot.sites} site, ${n0(bk.tot.dw)} MH, ${rpS(bk.tot.amount)}):`,
      ...bk.sites.map(x => `${x.cinema} (${x.type === "none" ? "tanpa budget DW" : "budget DW habis " + dS(x.from)}): ${x.use.map(d => `${dS(d.iso)} ${n0(d.admits)} adm`).join(", ")} · ${n0(x.dw)} MH · ${rpS(x.amount)}`), ""] : []),
    `Detail: ${DASH}`, "", "Terima kasih.", "", "Best regards,", "Ivan"].join("\n");
}

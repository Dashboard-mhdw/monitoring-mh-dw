// "FYI" email to payroll control (Kak Cinthia), in rupiah:
//   1. national amount (budget month, used MTD vs budget MTD, left)
//   2. usage per region
//   3. sites over budget MTD (incl. sites using DW without budget)
//   4. nobar / bulk booking outside the nobar budget (sites without nobar budget + sites whose nobar budget ran out)
// Sections 1–3 show two versions: actual, and actual excl. the DW used for that non-budget nobar (email only —
// the dashboard always shows the plain actual).
// Always Bahasa Indonesia, id-ID number format. Inline styles + table-based bars so it survives copy-paste into Outlook/Gmail.
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


const INK = "#1d1d1f", MUT = "#6e6e73", LINE = "#d2d2d7", BLU = "#0a84ff", ORG = "#ff9f0a", RED = "#d70015", GRN = "#248a3d", PUR = "#6e3fc9";
const FONT = "font-family:Calibri,Arial,Helvetica,sans-serif";

/** All numbers the email needs (rupiah = MH × rate MH DW of each site).
 *  ex = DW used for nobar outside the nobar budget, per site — left out in the "excl. nobar" version. */
function pack(r) {
  const rows = r.rows, T = r.tot, nb = r.nobar;
  const dIn = daysIn(r.month), dDone = +r.cut.slice(8), left = dIn - dDone;
  const ex = new Map();
  if (nb) [...nb.non.sites, ...nb.over.sites].forEach(x => ex.set(x.code, {mh: x.dw, rp: x.amount}));
  const exOf = x => ex.get(x.code) || {mh: 0, rp: 0};
  const N = {bm: T.amountMonth || 0, bt: T.amountToDate || 0, ac: T.amountActual || 0, mhB: T.budgetMonth, mhT: T.budgetToDate, mhA: T.actual};
  N.exRp = rows.reduce((a, x) => a + exOf(x).rp, 0); N.exMh = rows.reduce((a, x) => a + exOf(x).mh, 0);
  N.acX = N.ac - N.exRp; N.left = N.bm - N.ac; N.leftX = N.bm - N.acX;
  N.vs = N.bt ? N.ac / N.bt - 1 : null; N.vsX = N.bt ? N.acX / N.bt - 1 : null;
  const g = new Map();
  rows.forEach(x => {
    const k = x.region || "Tanpa region";
    if (!g.has(k)) g.set(k, {region: k, bm: 0, bt: 0, ac: 0, ex: 0, over: 0, overX: 0});
    const o = g.get(k); o.bm += x.amountMonth || 0; o.bt += x.amountToDate || 0; o.ac += x.amountActual || 0; o.ex += exOf(x).rp;
  });
  const over = rows.filter(x => x.actual > x.budgetToDate + 0.5)
    .map(x => { const e = exOf(x), oX = Math.max(0, x.actual - e.mh - x.budgetToDate);
      return {...x, overMh: x.actual - x.budgetToDate, overRp: (x.actual - x.budgetToDate) * (x.rate || 0), exMh: e.mh, overMhX: oX, overRpX: oX * (x.rate || 0)}; })
    .sort((a, b) => b.overRp - a.overRp || b.overMh - a.overMh);
  over.forEach(x => { const o = g.get(x.region || "Tanpa region"); if (o) { o.over++; if (x.overMhX > 0.5) o.overX++; } });
  const regions = [...g.values()].map(o => ({...o, acX: o.ac - o.ex})).sort((a, b) => a.region.localeCompare(b.region, undefined, {numeric: true}));
  return {N, regions, over, overX: over.filter(x => x.overMhX > 0.5).length, left, dDone, dIn};
}

export function subject(r) {
  return `FYI – Pemakaian MH DW ${monthId(r.month)} MTD (s.d. ${dS(r.cut)}) vs Budget`;
}

const vsWord = (v, bt, b) => v == null ? "" : v > 0.05 ? `${b(`${sgn(v)} di atas budget MTD`, RED)}` : v < -0.05 ? `${b(`${sgn(v)} di bawah budget MTD`, GRN)}` : "sesuai budget MTD";

/** Opening paragraph — wording adapts to the numbers. */
export function paragraph(r, P = pack(r), html = false) {
  const {N, over, overX, left} = P, M = monthId(r.month), D = dS(r.cut);
  const b = (s, col) => html ? `<b style="color:${col}">${s}</b>` : s;
  let s = `FYI Kak, berikut pemakaian MH DW nasional bulan ${M} s.d. ${D}. `;
  s += `Budget DW ${M} sebesar ${rpS(N.bm)} (${n0(N.mhB)} MH), budget MTD ${rpS(N.bt)}. `;
  s += `Pemakaian actual ${rpS(N.ac)} (${vsWord(N.vs, N.bt, b)}), sisa ${rpS(N.left)}${left > 0 ? ` untuk ${left} hari lagi` : ""}. `;
  if (N.exRp > 0) s += `Jika pemakaian DW untuk nobar/bulk booking di luar budget nobar (${n0(N.exMh)} MH, ${rpS(N.exRp)}) dikeluarkan, pemakaian menjadi ${rpS(N.acX)} (${vsWord(N.vsX, N.bt, b)}) dengan sisa ${rpS(N.leftX)}. `;
  s += over.length ? `Site over budget MTD: ${over.length} site (actual)${N.exRp > 0 ? `, ${overX} site setelah nobar dikeluarkan` : ""}.` : "Tidak ada site yang over budget MTD.";
  return s;
}

const kpi = (l, v, s, col = INK) => `<td style="border:1px solid ${LINE};padding:10px 12px;vertical-align:top;width:25%"><div style="font-size:12px;color:${MUT}">${l}</div><div style="font-size:20px;font-weight:bold;color:${col};line-height:1.3">${v}</div><div style="font-size:12px;color:${MUT}">${s}</div></td>`;
const h2 = s => `<p style="margin:20px 0 6px;font-size:15px;font-weight:bold">${s}</p>`;
const vsCol = (ac, bt) => ac > bt * 1.0001 ? RED : GRN;

export function mailHTML(r) {
  const P = pack(r), {N, regions, over, overX, left} = P, M = monthId(r.month), D = dS(r.cut), X = N.exRp > 0;
  const td = `border:1px solid ${LINE};padding:6px 10px;font-size:13px;color:${INK}`;
  const th = `border:1px solid ${LINE};background:#f5f5f7;padding:6px 10px;font-size:12px;color:${MUT};font-weight:bold;text-align:left`;
  const thX = `${th};background:#f1ecfb;color:${PUR}`;
  const tf = `${th};color:${INK}`, R = ";text-align:right";

  // 1. national, both versions
  const v1 = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px;margin:8px 0 0">
<tr><th style="${th}">Versi</th><th style="${th + R}">Budget ${M}</th><th style="${th + R}">Budget MTD</th><th style="${th + R}">Terpakai</th><th style="${th + R}">vs budget MTD</th><th style="${th + R}">Sisa budget</th></tr>
<tr><td style="${td}"><b>Actual</b></td><td style="${td + R}">${rpS(N.bm)}</td><td style="${td + R}">${rpS(N.bt)}</td><td style="${td + R};font-weight:bold">${rpS(N.ac)}</td><td style="${td + R};color:${vsCol(N.ac, N.bt)}">${N.vs != null ? sgn(N.vs) : "–"}</td><td style="${td + R};color:${N.left < 0 ? RED : INK}">${rpS(N.left)}</td></tr>
<tr><td style="${td};color:${PUR}"><b>Excl. nobar di luar budget</b></td><td style="${td + R}">${rpS(N.bm)}</td><td style="${td + R}">${rpS(N.bt)}</td><td style="${td + R};font-weight:bold;color:${PUR}">${rpS(N.acX)}</td><td style="${td + R};color:${vsCol(N.acX, N.bt)}">${N.vsX != null ? sgn(N.vsX) : "–"}</td><td style="${td + R};color:${N.leftX < 0 ? RED : INK}">${rpS(N.leftX)}</td></tr>
<tr><td style="${tf}" colspan="3">Nobar di luar budget yang dikeluarkan (${n0(N.exMh)} MH, lihat tabel 4)</td><td style="${tf + R};color:${PUR}">−${rpS(N.exRp)}</td><td style="${tf}"></td><td style="${tf + R};color:${PUR}">+${rpS(N.exRp)}</td></tr>
</table>`;

  // 2. per region, both versions
  const reg = regions.map(o => `<tr><td style="${td};white-space:nowrap"><b>${esc(regLabel(o.region))}</b></td><td style="${td + R}">${rpS(o.bm)}</td><td style="${td + R}">${rpS(o.bt)}</td>
<td style="${td + R};font-weight:bold">${rpS(o.ac)}</td><td style="${td + R};color:${vsCol(o.ac, o.bt)}">${o.bt ? sgn(o.ac / o.bt - 1) : "–"}</td><td style="${td + R};color:${o.bm - o.ac < 0 ? RED : INK}">${rpS(o.bm - o.ac)}</td>
${X ? `<td style="${td + R};color:${o.ex ? PUR : MUT}">${o.ex ? "−" + rpS(o.ex) : "–"}</td><td style="${td + R};font-weight:bold;color:${PUR}">${rpS(o.acX)}</td><td style="${td + R};color:${vsCol(o.acX, o.bt)}">${o.bt ? sgn(o.acX / o.bt - 1) : "–"}</td><td style="${td + R};color:${o.bm - o.acX < 0 ? RED : INK}">${rpS(o.bm - o.acX)}</td>` : ""}</tr>`).join("");
  const regHead = `<tr><th style="${th}" rowspan="2">Region</th><th style="${th + R}" rowspan="2">Budget bulan</th><th style="${th + R}" rowspan="2">Budget MTD</th><th style="${th};text-align:center" colspan="3">Actual</th>${X ? `<th style="${thX};text-align:center" colspan="4">Excl. nobar di luar budget</th>` : ""}</tr>
<tr><th style="${th + R}">Terpakai</th><th style="${th + R}">vs MTD</th><th style="${th + R}">Sisa</th>${X ? `<th style="${thX + R}">Nobar</th><th style="${thX + R}">Terpakai</th><th style="${thX + R}">vs MTD</th><th style="${thX + R}">Sisa</th>` : ""}</tr>`;
  const regFoot = `<tr><td style="${tf}">Nasional</td><td style="${tf + R}">${rpS(N.bm)}</td><td style="${tf + R}">${rpS(N.bt)}</td><td style="${tf + R}">${rpS(N.ac)}</td><td style="${tf + R}">${N.vs != null ? sgn(N.vs) : "–"}</td><td style="${tf + R}">${rpS(N.left)}</td>
${X ? `<td style="${tf + R};color:${PUR}">−${rpS(N.exRp)}</td><td style="${tf + R};color:${PUR}">${rpS(N.acX)}</td><td style="${tf + R}">${N.vsX != null ? sgn(N.vsX) : "–"}</td><td style="${tf + R}">${rpS(N.leftX)}</td>` : ""}</tr>`;

  // 3. over budget sites
  const ov = over.map(x => `<tr><td style="${td};white-space:nowrap">${esc(regLabel(x.region))}</td><td style="${td}">${esc(x.cinema)}</td><td style="${td + R}">${x.budgetMonth ? n0(x.budgetToDate) : `<span style="color:${ORG}">tanpa budget</span>`}</td><td style="${td + R};font-weight:bold">${n0(x.actual)}</td><td style="${td + R};color:${RED};font-weight:bold">+${n0(x.overMh)}</td><td style="${td + R};color:${RED}">${rpS(x.overRp)}</td>
${X ? `<td style="${td + R};color:${x.exMh ? PUR : MUT}">${x.exMh ? "−" + n0(x.exMh) : "–"}</td><td style="${td + R};color:${x.overMhX > 0.5 ? RED : GRN};font-weight:bold">${x.overMhX > 0.5 ? "+" + n0(x.overMhX) + " · " + rpS(x.overRpX) : "aman"}</td>` : ""}</tr>`).join("");
  const ovTot = {mh: over.reduce((a, x) => a + x.overMh, 0), rp: over.reduce((a, x) => a + x.overRp, 0), mhX: over.reduce((a, x) => a + x.overMhX, 0), rpX: over.reduce((a, x) => a + x.overRpX, 0), ex: over.reduce((a, x) => a + x.exMh, 0)};

  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:960px">
<p style="margin:0 0 12px">Dear Kak Cinthia,</p>
<p style="margin:0 0 16px">${paragraph(r, P, true)}</p>
<!--jpg-->${h2(`1. Amount nasional · ${M} s.d. ${D}`)}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:900px;margin:0 0 6px"><tr>
${kpi("Budget DW " + M, rpS(N.bm), n0(N.mhB) + " MH")}${kpi("Terpakai (actual)", rpS(N.ac), `${pct(N.bm ? N.ac / N.bm : 0)} · budget MTD ${rpS(N.bt)}`, N.ac > N.bt * 1.0001 ? RED : INK)}${X ? kpi("Terpakai excl. nobar", rpS(N.acX), `${pct(N.bm ? N.acX / N.bm : 0)} · nobar −${rpS(N.exRp)}`, PUR) : ""}${kpi("Sisa budget", rpS(X ? N.leftX : N.left), X ? `actual ${rpS(N.left)} · excl. nobar ${rpS(N.leftX)}` : `${n0(N.mhB - N.mhA)} MH · ${left} hari lagi`, (X ? N.leftX : N.left) < 0 ? RED : GRN)}
</tr></table>
${X ? v1 : ""}
${h2("2. Pemakaian amount per region")}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:960px">
${regHead}
${reg}
${regFoot}
</table>
${h2(`3. Site over budget MTD (${over.length} actual${X ? ` · ${overX} excl. nobar` : ""})`)}
${over.length ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:960px">
<tr><th style="${th}">Region</th><th style="${th}">Site</th><th style="${th + R}">Budget MTD (MH)</th><th style="${th + R}">Terpakai (MH)</th><th style="${th + R}">Over (MH)</th><th style="${th + R}">Over (Rp)</th>${X ? `<th style="${thX + R}">Nobar (MH)</th><th style="${thX + R}">Over excl. nobar</th>` : ""}</tr>
${ov}
<tr><td style="${tf}" colspan="4">Total ${over.length} site</td><td style="${tf + R};color:${RED}">+${n0(ovTot.mh)}</td><td style="${tf + R};color:${RED}">${rpS(ovTot.rp)}</td>${X ? `<td style="${tf + R};color:${PUR}">−${n0(ovTot.ex)}</td><td style="${tf + R}">+${n0(ovTot.mhX)} · ${rpS(ovTot.rpX)}</td>` : ""}</tr>
</table>` : `<p style="margin:0;color:${GRN}">Tidak ada site yang over budget MTD s.d. ${D}.</p>`}
${nobarHTML(r, {td, th, tf, R})}
<p style="font-size:11px;color:${MUT};margin:6px 0 14px">Amount = MH DW × rate MH DW tiap site. Budget MTD = budget per minggu dihitung sampai ${D}. Over = terpakai − budget MTD; site tanpa budget dihitung over sebesar seluruh pemakaiannya. Versi <b>excl. nobar</b> = actual dikurangi MH DW untuk nobar/bulk booking di luar budget nobar (tabel 4); dashboard tetap menampilkan actual. Detail: <a href="${DASH}" style="color:${BLU}">dashboard Monitoring MH DW</a>.</p>
<!--/jpg--><p style="margin:0 0 12px">Terima kasih.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

/** 4. Nobar / bulk booking outside the nobar budget: (a) no nobar budget, (b) nobar budget used up. Dates + admits per day. */
function nobarHTML(r, {td, th, tf, R}) {
  const nb = r.nobar; if (!nb) return "";
  const D = dS(r.cut), A = nb.non, B = nb.over;
  const days = x => x.use.map(d => `<div style="white-space:nowrap">${dS(d.iso)}: <b>${n0(d.admits)}</b> admits · ${n0(d.dw)} MH</div>`).join("");
  const name = x => `<td style="${td};white-space:nowrap;vertical-align:top">${esc(regLabel(x.region))}</td><td style="${td};vertical-align:top">${esc(x.cinema)}</td>`;
  const cell = (v, st = "") => `<td style="${td + R};vertical-align:top${st}">${v}</td>`;
  const tbl = (cols, rows, foot) => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:960px;margin:0 0 4px">
<tr>${cols.map(([c, right]) => `<th style="${th + (right ? R : "")}">${c}</th>`).join("")}</tr>${rows}${foot}</table>`;
  const T = {mh: A.tot.dw + B.tot.dw, rp: A.tot.amount + B.tot.amount};
  let h = h2(`4. Nobar / bulk booking di luar budget nobar s.d. ${D}`);
  h += `<p style="margin:0 0 8px">Total yang dikeluarkan dari actual: <b>${n0(T.mh)} MH DW (${rpS(T.rp)})</b>, terdiri dari a. site tanpa budget nobar ${n0(A.tot.dw)} MH dan b. site yang budget nobarnya sudah habis ${n0(B.tot.dw)} MH.</p>`;
  h += `<p style="margin:0 0 6px"><b>a. Site tanpa budget nobar (${A.tot.sites} site)</b></p>`;
  h += A.tot.sites ? tbl([["Region"], ["Site"], ["Tanggal pemakaian (admits nobar · MH DW)"], ["Admits nobar", 1], ["MH DW", 1], ["Amount DW", 1]],
    A.sites.map(x => `<tr>${name(x)}<td style="${td};font-size:12px">${days(x)}</td>${cell(n0(x.used), ";font-weight:bold")}${cell(n0(x.dw))}${cell(rpS(x.amount))}</tr>`).join(""),
    `<tr><td style="${tf}" colspan="3">Total ${A.tot.sites} site</td>${[n0(A.tot.used), n0(A.tot.dw), rpS(A.tot.amount)].map(v => `<td style="${tf + R}">${v}</td>`).join("")}</tr>`)
    : `<p style="margin:0 0 4px;color:${GRN}">Tidak ada.</p>`;
  h += `<p style="margin:14px 0 6px"><b>b. Site dengan budget nobar yang sudah habis, tetap ada nobar (${B.tot.sites} site)</b></p>`;
  h += B.tot.sites ? tbl([["Region"], ["Site"], ["Budget nobar", 1], ["Admits nobar", 1], ["Tanggal setelah budget habis (admits · MH DW)"], ["Lebih dari budget", 1], ["MH DW setelah habis", 1], ["Amount DW", 1]],
    B.sites.map(x => `<tr>${name(x)}${cell(n0(x.budget))}${cell(n0(x.used))}<td style="${td};font-size:12px">${days(x)}</td>${cell("+" + n0(x.after), `;color:${RED};font-weight:bold`)}${cell(n0(x.dw))}${cell(rpS(x.amount))}</tr>`).join(""),
    `<tr><td style="${tf}" colspan="2">Total ${B.tot.sites} site</td>${[n0(B.tot.budget), n0(B.tot.used)].map(v => `<td style="${tf + R}">${v}</td>`).join("")}<td style="${tf}"></td>${["+" + n0(B.tot.after), n0(B.tot.dw), rpS(B.tot.amount)].map(v => `<td style="${tf + R}">${v}</td>`).join("")}</tr>`)
    : `<p style="margin:0 0 4px;color:${GRN}">Tidak ada, semua masih dalam budget nobar.</p>`;
  return h + `<p style="font-size:11px;color:${MUT};margin:6px 0 0">Admits nobar = estimasi dari lonjakan admits harian (hari dengan admits ≥ 1,6× hari normal dan selisih ≥ 300; libur/film besar dan promo rutin tidak dihitung). MH DW = MH DW di hari nobar tersebut; di hari budget nobar habis, hanya porsi setelah habis yang dihitung. Budget nobar = Forecast Nobar di sheet budget.</p>`;
}

export function mailText(r) {
  const P = pack(r), {N, regions, over} = P, D = dS(r.cut), X = N.exRp > 0;
  return ["Dear Kak Cinthia,", "", paragraph(r, P, false), "",
    `1. Amount nasional: budget ${rpS(N.bm)} | budget MTD ${rpS(N.bt)}`,
    `   Actual: terpakai ${rpS(N.ac)} | sisa ${rpS(N.left)}`,
    ...(X ? [`   Excl. nobar di luar budget: terpakai ${rpS(N.acX)} | sisa ${rpS(N.leftX)} (nobar −${rpS(N.exRp)}, ${n0(N.exMh)} MH)`] : []), "",
    "2. Per region (budget bulan / budget MTD / terpakai actual / sisa" + (X ? " / terpakai excl. nobar / sisa excl." : "") + "):",
    ...regions.map(o => `${regLabel(o.region)}: ${rpS(o.bm)} / ${rpS(o.bt)} / ${rpS(o.ac)} / ${rpS(o.bm - o.ac)}` + (X ? ` / ${rpS(o.acX)} / ${rpS(o.bm - o.acX)}` : "")), "",
    `3. Site over budget MTD s.d. ${D} (${over.length}):`, ...(over.length ? over.map(x => `${regLabel(x.region)} · ${x.cinema}: ${n0(x.actual)} vs ${x.budgetMonth ? n0(x.budgetToDate) : "tanpa budget"} MH → +${n0(x.overMh)} MH (${rpS(x.overRp)})` + (X && x.exMh ? `; excl. nobar ${x.overMhX > 0.5 ? "+" + n0(x.overMhX) + " MH" : "aman"}` : "")) : ["Tidak ada."]), "",
    ...nobarText(r),
    `Detail: ${DASH}`, "", "Terima kasih.", "", "Best regards,", "Ivan"].join("\n");
}

function nobarText(r) {
  const nb = r.nobar; if (!nb) return [];
  const A = nb.non, B = nb.over;
  const days = x => x.use.map(d => `${dS(d.iso)} ${n0(d.admits)} adm/${n0(d.dw)} MH`).join(", ");
  return [`4. Nobar / bulk booking di luar budget nobar s.d. ${dS(r.cut)} (dikeluarkan: ${n0(A.tot.dw + B.tot.dw)} MH, ${rpS(A.tot.amount + B.tot.amount)})`,
    `a. Tanpa budget nobar (${A.tot.sites} site): ${n0(A.tot.used)} admits, ${n0(A.tot.dw)} MH DW (${rpS(A.tot.amount)})`,
    ...A.sites.map(x => `   ${regLabel(x.region)} · ${x.cinema}: ${n0(x.used)} admits, ${n0(x.dw)} MH DW [${days(x)}]`),
    `b. Budget nobar sudah habis (${B.tot.sites} site): +${n0(B.tot.after)} admits di atas budget, ${n0(B.tot.dw)} MH DW setelah habis (${rpS(B.tot.amount)})`,
    ...B.sites.map(x => `   ${regLabel(x.region)} · ${x.cinema}: budget ${n0(x.budget)}, terpakai ${n0(x.used)} (+${n0(x.after)}), ${n0(x.dw)} MH DW setelah habis [${days(x)}]`), ""];
}

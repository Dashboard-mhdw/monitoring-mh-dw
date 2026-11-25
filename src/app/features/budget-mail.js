// "FYI" email to payroll control (Kak Cinthia), in rupiah, against the FULL-MONTH DW budget. Three tables:
//   1. per region: budget, terpakai total, terpakai excl. bulk booking (Region 1 & 5 only), sisa
//   2. sites over their monthly budget
//   3. bulk booking left out (per site summary)
// Per-site and per-day breakdown goes to the Excel attachment (attachment()). Email only — the dashboard shows plain actual.
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

/** All numbers (rupiah = MH × rate MH DW of each site). ex = bulk booking DW left out, per site (Region 1 & 5). */
function pack(r) {
  const rows = r.rows, bk = r.bulk;
  const ex = new Map(); if (bk) bk.sites.forEach(x => ex.set(x.code, x));
  const exMh = x => (ex.get(x.code) || {}).dw || 0, exRp = x => (ex.get(x.code) || {}).amount || 0;
  const site = rows.map(x => ({...x, bm: x.amountMonth || 0, ac: x.amountActual || 0, exMh: exMh(x), ex: exRp(x)}))
    .map(x => ({...x, acX: x.ac - x.ex, mhX: x.actual - x.exMh, overMh: x.actual - x.budgetMonth, overMhX: x.actual - x.exMh - x.budgetMonth}));
  const sum = (list, k) => list.reduce((a, x) => a + (x[k] || 0), 0);
  const N = {bm: sum(site, "bm"), ac: sum(site, "ac"), ex: sum(site, "ex"), exMh: sum(site, "exMh"), mhB: sum(site, "budgetMonth"), mhA: sum(site, "actual")}; N.acX = N.ac - N.ex;
  const g = new Map();
  site.forEach(x => { const k = x.region || "Tanpa region"; if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
  const regions = [...g.entries()].map(([region, l]) => ({region, bm: sum(l, "bm"), ac: sum(l, "ac"), ex: sum(l, "ex"), acX: sum(l, "acX")}))
    .sort((a, b) => a.region.localeCompare(b.region, undefined, {numeric: true}));
  const over = site.filter(x => x.overMh > 0.5).sort((a, b) => b.overMh * (b.rate || 0) - a.overMh * (a.rate || 0));
  return {N, regions, over, overX: over.filter(x => x.overMhX > 0.5).length, site};
}

export function subject(r) {
  return `FYI – Pemakaian MH DW ${monthId(r.month)} (s.d. ${dS(r.cut)}) vs Budget`;
}

const of = (v, b) => b ? pct(v / b) : "–";

/** Opening paragraph. */
export function paragraph(r, P = pack(r), html = false) {
  const {N} = P, M = monthId(r.month), D = dS(r.cut);
  const b = s => html ? `<b>${s}</b>` : s;
  let s = `FYI Kak, berikut pemakaian MH DW ${M} s.d. ${D} dibanding budget 1 bulan (${rpS(N.bm)}). `;
  s += `Terpakai total ${b(rpS(N.ac))} (${of(N.ac, N.bm)}), sisa ${rpS(N.bm - N.ac)}.`;
  if (N.ex > 0) s += ` Jika bulk booking Region 1 & 5 di luar budget DW (${n0(N.exMh)} MH, ${rpS(N.ex)}) dikeluarkan, terpakai menjadi ${b(rpS(N.acX))} (${of(N.acX, N.bm)}), sisa ${rpS(N.bm - N.acX)}.`;
  s += " Rincian per site terlampir di Excel.";
  return s;
}

const h2 = s => `<p style="margin:22px 0 6px;font-size:15px;font-weight:bold">${s}</p>`;
const small = (v, col = MUT) => `<div style="font-size:11px;color:${col}">${v}</div>`;

export function mailHTML(r) {
  const P = pack(r), {N, regions, over, overX} = P, M = monthId(r.month), D = dS(r.cut), X = N.ex > 0, bk = r.bulk;
  const td = `border:1px solid ${LINE};padding:6px 10px;font-size:13px;color:${INK};vertical-align:top`;
  const th = `border:1px solid ${LINE};background:#f5f5f7;padding:6px 10px;font-size:12px;color:${MUT};font-weight:bold;text-align:left`;
  const thX = `${th};background:#f1ecfb;color:${PUR}`;
  const tf = `${th};color:${INK}`, R = ";text-align:right";
  const tbl = inner => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:760px">${inner}</table>`;
  const used = (v, bm, col = INK) => `<b style="color:${col}">${rpS(v)}</b>${small(of(v, bm) + " dari budget", v > bm * 1.0001 ? RED : MUT)}`;

  // 1. per region
  const regRow = (o, foot) => { const st = foot ? tf : td, left = o.bm - o.ac, leftX = o.bm - o.acX;
    return `<tr><td style="${st};white-space:nowrap">${foot ? "Total" : `<b>${esc(regLabel(o.region))}</b>`}</td><td style="${st + R}">${rpS(o.bm)}</td>
<td style="${st + R}">${used(o.ac, o.bm)}</td>${X ? `<td style="${st + R}">${o.ex ? used(o.acX, o.bm, PUR) : `<span style="color:${MUT}">sama</span>`}</td>` : ""}
<td style="${st + R};color:${left < 0 ? RED : INK}">${rpS(left)}${X && o.ex ? small(`excl.: ${rpS(leftX)}`, PUR) : ""}</td></tr>`; };
  const t1 = tbl(`<tr><th style="${th}">Region</th><th style="${th + R}">Budget ${M}</th><th style="${th + R}">Terpakai total</th>${X ? `<th style="${thX + R}">${XL}</th>` : ""}<th style="${th + R}">Sisa</th></tr>
${regions.map(o => regRow(o, false)).join("")}${regRow({bm: N.bm, ac: N.ac, acX: N.acX, ex: N.ex}, true)}`);

  // 2. over the monthly budget
  const t2 = over.length ? tbl(`<tr><th style="${th}">Site</th><th style="${th + R}">Budget (MH)</th><th style="${th + R}">Terpakai (MH)</th><th style="${th + R}">Over</th>${X ? `<th style="${thX + R}">Over excl. bulk</th>` : ""}</tr>
${over.map(x => `<tr><td style="${td}">${esc(x.cinema)}${small(esc(regLabel(x.region)))}</td><td style="${td + R}">${x.budgetMonth ? n0(x.budgetMonth) : `<span style="color:${ORG}">tanpa budget</span>`}</td><td style="${td + R}">${n0(x.actual)}</td>
<td style="${td + R};color:${RED};font-weight:bold">${n0(x.overMh)} MH${small(rpS(x.overMh * (x.rate || 0)), RED)}</td>${X ? `<td style="${td + R};color:${x.overMhX > 0.5 ? RED : GRN}">${x.ex ? (x.overMhX > 0.5 ? `${n0(x.overMhX)} MH` : "aman") : `<span style="color:${MUT}">sama</span>`}</td>` : ""}</tr>`).join("")}`)
    : `<p style="margin:0;color:${GRN}">Belum ada site yang melewati budget 1 bulan.</p>`;

  // 3. bulk booking left out
  const t3 = X ? tbl(`<tr><th style="${th}">Site</th><th style="${th}">Kondisi</th><th style="${th + R}">Hari</th><th style="${th + R}">Admits</th><th style="${th + R}">MH DW</th><th style="${thX + R}">Amount</th></tr>
${bk.sites.map(x => `<tr><td style="${td}">${esc(x.cinema)}${small(esc(regLabel(x.region)))}</td><td style="${td};color:${x.type === "none" ? ORG : RED}">${x.type === "none" ? "Tanpa budget DW" : `Budget habis ${dS(x.from)}`}</td>
<td style="${td + R}">${x.use.length}</td><td style="${td + R}">${n0(x.admits)}</td><td style="${td + R}">${n0(x.dw)}</td><td style="${td + R};font-weight:bold;color:${PUR}">${rpS(x.amount)}</td></tr>`).join("")}
<tr><td style="${tf}" colspan="2">Total ${bk.tot.sites} site</td><td style="${tf + R}">${bk.sites.reduce((a, x) => a + x.use.length, 0)}</td><td style="${tf + R}">${n0(bk.tot.admits)}</td><td style="${tf + R}">${n0(bk.tot.dw)}</td><td style="${tf + R};color:${PUR}">${rpS(bk.tot.amount)}</td></tr>`) : "";

  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:800px">
<p style="margin:0 0 12px">Dear Kak Cinthia,</p>
<p style="margin:0 0 6px">${paragraph(r, P, true)}</p>
<!--jpg-->${h2(`1. Pemakaian per region · ${M} s.d. ${D}`)}${t1}
${h2(`2. Site melewati budget 1 bulan (${over.length}${X ? ` · ${overX} excl. bulk booking` : ""})`)}${t2}
${X ? h2(`3. Bulk booking Region 1 &amp; 5 di luar budget DW`) + t3 : ""}
<p style="font-size:11px;color:${MUT};margin:8px 0 14px">Amount = MH DW × rate tiap site. Budget = budget DW 1 bulan.${X ? ` ${XL} = terpakai total dikurangi MH DW bulk booking Region 1 &amp; 5 pada site tanpa budget DW, atau setelah budget DW-nya habis. Region lain tidak berubah.` : ""} Detail: <a href="${DASH}" style="color:${BLU}">dashboard Monitoring MH DW</a>.</p>
<!--/jpg--><p style="margin:0 0 12px">Terima kasih.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

export function mailText(r) {
  const P = pack(r), {N, regions, over} = P, X = N.ex > 0, bk = r.bulk;
  return ["Dear Kak Cinthia,", "", paragraph(r, P, false), "",
    "1. Per region (budget / terpakai total" + (X ? " / excl. bulk booking" : "") + " / sisa):",
    ...regions.map(o => `${regLabel(o.region)}: ${rpS(o.bm)} / ${rpS(o.ac)}` + (X ? ` / ${o.ex ? rpS(o.acX) : "sama"}` : "") + ` / ${rpS(o.bm - o.ac)}`),
    `Total: ${rpS(N.bm)} / ${rpS(N.ac)}` + (X ? ` / ${rpS(N.acX)}` : "") + ` / ${rpS(N.bm - N.ac)}`, "",
    `2. Site melewati budget 1 bulan (${over.length}):`, ...(over.length ? over.map(x => `${x.cinema}: ${n0(x.actual)} vs ${x.budgetMonth ? n0(x.budgetMonth) : "tanpa budget"} MH (+${n0(x.overMh)})` + (X && x.ex ? ` · excl. bulk ${x.overMhX > 0.5 ? "+" + n0(x.overMhX) + " MH" : "aman"}` : "")) : ["Tidak ada."]), "",
    ...(X ? ["3. Bulk booking Region 1 & 5 di luar budget DW:", ...bk.sites.map(x => `${x.cinema} (${x.type === "none" ? "tanpa budget DW" : "budget habis " + dS(x.from)}): ${x.use.length} hari, ${n0(x.admits)} admits, ${n0(x.dw)} MH, ${rpS(x.amount)}`), ""] : []),
    "Rincian per site: lampiran Excel.", `Detail: ${DASH}`, "", "Terima kasih.", "", "Best regards,", "Ivan"].join("\n");
}

/** Excel attachment: sheets as array-of-arrays + column widths. Clean: one title line, one header row, one total row. */
export function attachment(r) {
  const P = pack(r), {N, site} = P, bk = r.bulk, M = monthId(r.month), D = dS(r.cut);
  const rd = v => Math.round(v || 0), r1 = v => Math.round((v || 0) * 10) / 10;
  const regNo = x => parseInt(String(x.region).replace(/\D/g, ""), 10) || 99;
  const rows = site.slice().sort((a, b) => regNo(a) - regNo(b) || +a.code - +b.code);
  const ket = x => { const b = bk && bk.sites.find(y => y.code === x.code);
    return [!x.budgetMonth && x.actual ? "Tanpa budget DW" : x.overMh > 0.5 ? "Melewati budget" : "", b ? (b.type === "none" ? "bulk booking" : `bulk booking setelah budget habis ${dS(b.from)}`) : ""].filter(Boolean).join(" · "); };
  const s1 = [[`Pemakaian MH DW ${M} s.d. ${D} vs budget 1 bulan`], [],
    ["Region", "Site", "Budget (MH)", "Terpakai total (MH)", "Bulk booking (MH)", "Terpakai excl. bulk (MH)", "Sisa excl. bulk (MH)", "Budget (Rp)", "Terpakai total (Rp)", "Bulk booking (Rp)", "Terpakai excl. bulk (Rp)", "Sisa excl. bulk (Rp)", "Keterangan"],
    ...rows.map(x => [regLabel(x.region), x.cinema, r1(x.budgetMonth), r1(x.actual), r1(x.exMh), r1(x.mhX), r1(x.budgetMonth - x.mhX), rd(x.bm), rd(x.ac), rd(x.ex), rd(x.acX), rd(x.bm - x.acX), ket(x)]),
    ["TOTAL", `${rows.length} site`, r1(N.mhB), r1(N.mhA), r1(N.exMh), r1(N.mhA - N.exMh), r1(N.mhB - N.mhA + N.exMh), rd(N.bm), rd(N.ac), rd(N.ex), rd(N.acX), rd(N.bm - N.acX), ""]];
  const sheets = [{name: "Per Site", aoa: s1, cols: [11, 34, 12, 18, 17, 22, 19, 14, 18, 17, 22, 19, 40]}];
  if (bk && bk.sites.length) {
    const days = bk.sites.flatMap(x => x.use.map(d => ({x, d}))).sort((p, q) => regNo(p.x) - regNo(q.x) || +p.x.code - +q.x.code || p.d.iso.localeCompare(q.d.iso));
    sheets.push({name: "Bulk Booking R1 & R5", cols: [11, 34, 24, 12, 16, 10, 14], aoa: [[`Bulk booking Region 1 & 5 di luar budget DW · ${M} s.d. ${D}`], [],
      ["Region", "Site", "Kondisi", "Tanggal", "Admits nobar", "MH DW", "Amount (Rp)"],
      ...days.map(({x, d}) => [regLabel(x.region), x.cinema, x.type === "none" ? "Tanpa budget DW" : `Budget habis ${dS(x.from)}`, d.iso, rd(d.admits), r1(d.dw), rd(d.dw * (x.amount / (x.dw || 1)))]),
      ["TOTAL", `${bk.tot.sites} site`, "", `${days.length} hari`, rd(bk.tot.admits), r1(bk.tot.dw), rd(bk.tot.amount)]]});
  }
  return {sheets, filename: `MH_DW_${M}_sd_${r.cut}_lampiran.xlsx`};
}

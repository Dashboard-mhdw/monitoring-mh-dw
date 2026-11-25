// "FYI" email to payroll control (Kak Cinthia), in rupiah, against the FULL-MONTH DW budget. Original layout, three tables:
//   1. national amount · 2. per region · 3. sites over their monthly budget
//   each with an extra "excl. bulk booking" figure (bulk booking DW outside the DW budget, Region 1 & 5 only).
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

const h2 = s => `<p style="margin:20px 0 6px;font-size:15px;font-weight:bold">${s}</p>`;
const small = (v, col = MUT) => `<div style="font-size:11px;color:${col}">${v}</div>`;
const kpi = (l, v, s, col = INK) => `<td style="border:1px solid ${LINE};padding:10px 12px;vertical-align:top;width:25%"><div style="font-size:12px;color:${MUT}">${l}</div><div style="font-size:20px;font-weight:bold;color:${col};line-height:1.3">${v}</div><div style="font-size:12px;color:${MUT}">${s}</div></td>`;
const meter = (u, col, W = 90) => {
  const f = Math.round(W * Math.min(Math.max(u, 0), 1));
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;display:inline-table;vertical-align:middle"><tr>${f ? `<td style="background:${col};width:${f}px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}${W - f ? `<td style="background:#ececf0;width:${W - f}px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr></table> <span style="font-size:12px;color:${col};font-weight:bold">${pct(u)}</span>`;
};
const uCol = u => u > 1 ? RED : u >= 0.9 ? ORG : GRN;

export function mailHTML(r) {
  const P = pack(r), {N, regions, over, overX} = P, M = monthId(r.month), D = dS(r.cut), X = N.ex > 0;
  const td = `border:1px solid ${LINE};padding:6px 10px;font-size:13px;color:${INK}`;
  const th = `border:1px solid ${LINE};background:#f5f5f7;padding:6px 10px;font-size:12px;color:${MUT};font-weight:bold;text-align:left`;
  const thX = `${th};background:#f1ecfb;color:${PUR}`;
  const tf = `${th};color:${INK}`, R = ";text-align:right";
  const left = N.bm - N.ac, leftX = N.bm - N.acX;

  // 2. per region
  const oc = new Map(), ocX = new Map();
  over.forEach(x => { oc.set(x.region, (oc.get(x.region) || 0) + 1); if (x.overMhX > 0.5) ocX.set(x.region, (ocX.get(x.region) || 0) + 1); });
  const reg = regions.map(o => { const u = o.bm ? o.ac / o.bm : 0, uX = o.bm ? o.acX / o.bm : 0, n = oc.get(o.region) || 0;
    return `<tr><td style="${td};white-space:nowrap"><b>${esc(regLabel(o.region))}</b></td><td style="${td + R}">${rpS(o.bm)}</td><td style="${td + R};font-weight:bold">${rpS(o.ac)}</td>
<td style="${td};white-space:nowrap">${o.bm ? meter(u, uCol(u)) : `<span style="color:${MUT}">tanpa budget</span>`}</td><td style="${td + R};color:${o.bm - o.ac < 0 ? RED : INK}">${rpS(o.bm - o.ac)}</td>
${X ? (o.ex ? `<td style="${td + R};font-weight:bold;color:${PUR}">${rpS(o.acX)}</td><td style="${td};white-space:nowrap">${meter(uX, uCol(uX))}</td><td style="${td + R};color:${o.bm - o.acX < 0 ? RED : INK}">${rpS(o.bm - o.acX)}</td>`
      : `<td style="${td};color:${MUT};text-align:center" colspan="3">sama</td>`) : ""}<td style="${td + R};color:${n ? RED : MUT}">${n || "–"}</td></tr>`; }).join("");

  // 3. sites over the monthly budget
  const ov = over.map(x => `<tr><td style="${td};white-space:nowrap">${esc(regLabel(x.region))}</td><td style="${td}">${esc(x.cinema)}</td><td style="${td + R}">${x.budgetMonth ? n0(x.budgetMonth) : `<span style="color:${ORG}">tanpa budget</span>`}</td><td style="${td + R};font-weight:bold">${n0(x.actual)}</td>
<td style="${td + R};color:${RED};font-weight:bold">+${n0(x.overMh)}</td><td style="${td + R};color:${RED}">${rpS(x.overMh * (x.rate || 0))}</td>${X ? `<td style="${td + R};color:${!x.ex ? MUT : x.overMhX > 0.5 ? RED : GRN}">${!x.ex ? "sama" : x.overMhX > 0.5 ? "+" + n0(x.overMhX) : "aman"}</td>` : ""}</tr>`).join("");
  const ovT = {mh: over.reduce((a, x) => a + x.overMh, 0), rp: over.reduce((a, x) => a + x.overMh * (x.rate || 0), 0), mhX: over.reduce((a, x) => a + Math.max(0, x.overMhX), 0)};

  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:900px">
<p style="margin:0 0 12px">Dear Kak Cinthia,</p>
<p style="margin:0 0 16px">${paragraph(r, P, true)}</p>
<!--jpg-->${h2(`1. Amount nasional · ${M} s.d. ${D}`)}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:880px;margin:0 0 6px"><tr>
${kpi("Budget DW " + M, rpS(N.bm), n0(N.mhB) + " MH")}${kpi("Terpakai total", rpS(N.ac), `${pct(N.bm ? N.ac / N.bm : 0)} dari budget`, N.ac > N.bm ? RED : INK)}${X ? kpi(XL + " R1 &amp; R5", rpS(N.acX), `${pct(N.bm ? N.acX / N.bm : 0)} · bulk booking −${rpS(N.ex)}`, PUR) : ""}${kpi("Sisa budget", rpS(left), X ? `excl. bulk booking: ${rpS(leftX)}` : `${n0(N.mhB - N.mhA)} MH`, left < 0 ? RED : GRN)}
</tr></table>
${h2("2. Pemakaian amount per region")}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th + R}">Budget bulan</th><th style="${th + R}">Terpakai total</th><th style="${th}">Terpakai vs budget</th><th style="${th + R}">Sisa</th>${X ? `<th style="${thX + R}">${XL}</th><th style="${thX}">vs budget</th><th style="${thX + R}">Sisa</th>` : ""}<th style="${th + R}">Site over</th></tr>
${reg}
<tr><td style="${tf}">Nasional</td><td style="${tf + R}">${rpS(N.bm)}</td><td style="${tf + R}">${rpS(N.ac)}</td><td style="${tf}">${pct(N.bm ? N.ac / N.bm : 0)}</td><td style="${tf + R}">${rpS(left)}</td>${X ? `<td style="${tf + R};color:${PUR}">${rpS(N.acX)}</td><td style="${tf}">${pct(N.bm ? N.acX / N.bm : 0)}</td><td style="${tf + R}">${rpS(leftX)}</td>` : ""}<td style="${tf + R}">${over.length || "–"}</td></tr>
</table>
${h2(`3. Site melewati budget 1 bulan (${over.length}${X ? ` · ${overX} excl. bulk booking` : ""})`)}
${over.length ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th}">Site</th><th style="${th + R}">Budget (MH)</th><th style="${th + R}">Terpakai (MH)</th><th style="${th + R}">Over (MH)</th><th style="${th + R}">Over (Rp)</th>${X ? `<th style="${thX + R}">Over excl. bulk (MH)</th>` : ""}</tr>
${ov}
<tr><td style="${tf}" colspan="4">Total ${over.length} site</td><td style="${tf + R};color:${RED}">+${n0(ovT.mh)}</td><td style="${tf + R};color:${RED}">${rpS(ovT.rp)}</td>${X ? `<td style="${tf + R}">+${n0(ovT.mhX)}</td>` : ""}</tr>
</table>` : `<p style="margin:0;color:${GRN}">Belum ada site yang melewati budget 1 bulan s.d. ${D}.</p>`}
<p style="font-size:11px;color:${MUT};margin:6px 0 14px">Amount = MH DW × rate MH DW tiap site. Budget = budget DW 1 bulan; site tanpa budget dihitung over sebesar seluruh pemakaiannya.${X ? ` ${XL} = terpakai total dikurangi MH DW bulk booking Region 1 &amp; 5 pada site tanpa budget DW atau setelah budget DW-nya habis; region lain sama. Rincian per site dan per tanggal ada di Excel lampiran.` : ""} Detail: <a href="${DASH}" style="color:${BLU}">dashboard Monitoring MH DW</a>.</p>
<!--/jpg--><p style="margin:0 0 12px">Terima kasih.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

export function mailText(r) {
  const P = pack(r), {N, regions, over} = P, X = N.ex > 0, bk = r.bulk;
  return ["Dear Kak Cinthia,", "", paragraph(r, P, false), "",
    `1. Amount nasional: budget ${rpS(N.bm)} | terpakai total ${rpS(N.ac)}` + (X ? ` | excl. bulk booking R1 & R5 ${rpS(N.acX)}` : "") + ` | sisa ${rpS(N.bm - N.ac)}`, "",
    "2. Per region (budget / terpakai total" + (X ? " / excl. bulk booking" : "") + " / sisa):",
    ...regions.map(o => `${regLabel(o.region)}: ${rpS(o.bm)} / ${rpS(o.ac)}` + (X ? ` / ${o.ex ? rpS(o.acX) : "sama"}` : "") + ` / ${rpS(o.bm - o.ac)}`),
    `Total: ${rpS(N.bm)} / ${rpS(N.ac)}` + (X ? ` / ${rpS(N.acX)}` : "") + ` / ${rpS(N.bm - N.ac)}`, "",
    `3. Site melewati budget 1 bulan (${over.length}):`, ...(over.length ? over.map(x => `${x.cinema}: ${n0(x.actual)} vs ${x.budgetMonth ? n0(x.budgetMonth) : "tanpa budget"} MH (+${n0(x.overMh)})` + (X && x.ex ? ` · excl. bulk ${x.overMhX > 0.5 ? "+" + n0(x.overMhX) + " MH" : "aman"}` : "")) : ["Tidak ada."]), "",
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

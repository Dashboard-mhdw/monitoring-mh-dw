// "FYI" email to payroll control (Kak Cinthia), in rupiah, against the FULL-MONTH DW budget. Original layout, three tables:
//   1. national amount · 2. per region · 3. sites over their monthly budget
//   each with an extra "excl. bulk booking" figure (bulk booking DW outside the DW budget, Region 1 & 5 only).
// Per-site and per-day breakdown goes to the Excel attachment (attachment()). Email only — the dashboard shows plain actual.
// Always English, en-US number format (Rp …M). Inline styles so it survives copy-paste into Outlook/Gmail.
import { esc } from "../ui/dom.js";
import { _dicts } from "../i18n.js";

const CAL = _dicts.en._cal;
const DASH = "https://dashboard-mhdw.github.io/monitoring-mh-dw/";
const n0 = v => Math.round(v || 0).toLocaleString("en-US");
const pct = v => Math.round((v || 0) * 100) + "%";
const sgn = v => (v > 0 ? "+" : "") + Math.round(v * 100) + "%";
const rpS = v => (v < 0 ? "−" : "") + "Rp " + (Math.abs(v) >= 1e9 ? (Math.abs(v) / 1e9).toLocaleString("en-US", {maximumFractionDigits: 2}) + "B"
  : Math.abs(v) >= 1e5 ? (Math.abs(v) / 1e6).toLocaleString("en-US", {minimumFractionDigits: 1, maximumFractionDigits: 1}) + "M" : n0(Math.abs(v)));
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
  site.forEach(x => { const k = x.region || "No region"; if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
  const regions = [...g.entries()].map(([region, l]) => ({region, bm: sum(l, "bm"), ac: sum(l, "ac"), ex: sum(l, "ex"), acX: sum(l, "acX")}))
    .sort((a, b) => a.region.localeCompare(b.region, undefined, {numeric: true}));
  const over = site.filter(x => x.overMh > 0.5).sort((a, b) => b.overMh * (b.rate || 0) - a.overMh * (a.rate || 0));
  return {N, regions, over, overX: over.filter(x => x.overMhX > 0.5).length, site};
}

export function subject(r) {
  return `FYI – DW Man Hour Usage ${monthId(r.month)} (up to ${dS(r.cut)}) vs Budget`;
}

const of = (v, b) => b ? pct(v / b) : "–";

/** Opening paragraph. */
export function paragraph(r, P = pack(r), html = false) {
  const {N} = P, M = monthId(r.month), D = dS(r.cut);
  const b = s => html ? `<b>${s}</b>` : s;
  let s = `FYI Kak, here is the DW man hour usage for ${M} up to ${D} against the full-month budget (${rpS(N.bm)}). `;
  s += `Total used is ${b(rpS(N.ac))} (${of(N.ac, N.bm)}), leaving ${rpS(N.bm - N.ac)}.`;
  if (N.ex > 0) s += ` Excluding Region 1 & 5 bulk bookings outside the DW budget (${n0(N.exMh)} MH, ${rpS(N.ex)}), usage is ${b(rpS(N.acX))} (${of(N.acX, N.bm)}), leaving ${rpS(N.bm - N.acX)}.`;
  s += " The per-site breakdown is in the attached Excel.";
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
<td style="${td};white-space:nowrap">${o.bm ? meter(u, uCol(u)) : `<span style="color:${MUT}">no budget</span>`}</td><td style="${td + R};color:${o.bm - o.ac < 0 ? RED : INK}">${rpS(o.bm - o.ac)}</td>
${X ? (o.ex ? `<td style="${td + R};font-weight:bold;color:${PUR}">${rpS(o.acX)}</td><td style="${td};white-space:nowrap">${meter(uX, uCol(uX))}</td><td style="${td + R};color:${o.bm - o.acX < 0 ? RED : INK}">${rpS(o.bm - o.acX)}</td>`
      : `<td style="${td};color:${MUT};text-align:center" colspan="3">unchanged</td>`) : ""}<td style="${td + R};color:${n ? RED : MUT}">${n || "–"}</td></tr>`; }).join("");

  // 3. sites over the monthly budget
  const ov = over.map(x => `<tr><td style="${td};white-space:nowrap">${esc(regLabel(x.region))}</td><td style="${td}">${esc(x.cinema)}</td><td style="${td + R}">${x.budgetMonth ? n0(x.budgetMonth) : `<span style="color:${ORG}">no budget</span>`}</td><td style="${td + R};font-weight:bold">${n0(x.actual)}</td>
<td style="${td + R};color:${RED};font-weight:bold">+${n0(x.overMh)}</td><td style="${td + R};color:${RED}">${rpS(x.overMh * (x.rate || 0))}</td>${X ? `<td style="${td + R};color:${!x.ex ? MUT : x.overMhX > 0.5 ? RED : GRN}">${!x.ex ? "unchanged" : x.overMhX > 0.5 ? "+" + n0(x.overMhX) : "within budget"}</td>` : ""}</tr>`).join("");
  const ovT = {mh: over.reduce((a, x) => a + x.overMh, 0), rp: over.reduce((a, x) => a + x.overMh * (x.rate || 0), 0), mhX: over.reduce((a, x) => a + Math.max(0, x.overMhX), 0)};

  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:900px">
<p style="margin:0 0 12px">Dear Kak Cinthia,</p>
<p style="margin:0 0 16px">${paragraph(r, P, true)}</p>
<!--jpg-->${h2(`1. National amount · ${M} up to ${D}`)}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:880px;margin:0 0 6px"><tr>
${kpi("DW budget " + M, rpS(N.bm), n0(N.mhB) + " MH")}${kpi("Total used", rpS(N.ac), `${pct(N.bm ? N.ac / N.bm : 0)} of budget`, N.ac > N.bm ? RED : INK)}${X ? kpi(XL + " R1 &amp; R5", rpS(N.acX), `${pct(N.bm ? N.acX / N.bm : 0)} · bulk booking −${rpS(N.ex)}`, PUR) : ""}${kpi("Budget remaining", rpS(left), X ? `excl. bulk booking: ${rpS(leftX)}` : `${n0(N.mhB - N.mhA)} MH`, left < 0 ? RED : GRN)}
</tr></table>
${h2("2. Amount used per region")}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th + R}">Monthly budget</th><th style="${th + R}">Total used</th><th style="${th}">Used vs budget</th><th style="${th + R}">Remaining</th>${X ? `<th style="${thX + R}">${XL}</th><th style="${thX}">vs budget</th><th style="${thX + R}">Remaining</th>` : ""}<th style="${th + R}">Site over</th></tr>
${reg}
<tr><td style="${tf}">National</td><td style="${tf + R}">${rpS(N.bm)}</td><td style="${tf + R}">${rpS(N.ac)}</td><td style="${tf}">${pct(N.bm ? N.ac / N.bm : 0)}</td><td style="${tf + R}">${rpS(left)}</td>${X ? `<td style="${tf + R};color:${PUR}">${rpS(N.acX)}</td><td style="${tf}">${pct(N.bm ? N.acX / N.bm : 0)}</td><td style="${tf + R}">${rpS(leftX)}</td>` : ""}<td style="${tf + R}">${over.length || "–"}</td></tr>
</table>
${h2(`3. Sites over the monthly budget (${over.length}${X ? ` · ${overX} excl. bulk booking` : ""})`)}
${over.length ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th}">Site</th><th style="${th + R}">Budget (MH)</th><th style="${th + R}">Used (MH)</th><th style="${th + R}">Over (MH)</th><th style="${th + R}">Over (Rp)</th>${X ? `<th style="${thX + R}">Over excl. bulk (MH)</th>` : ""}</tr>
${ov}
<tr><td style="${tf}" colspan="4">Total ${over.length} sites</td><td style="${tf + R};color:${RED}">+${n0(ovT.mh)}</td><td style="${tf + R};color:${RED}">${rpS(ovT.rp)}</td>${X ? `<td style="${tf + R}">+${n0(ovT.mhX)}</td>` : ""}</tr>
</table>` : `<p style="margin:0;color:${GRN}">No site is over its monthly budget up to ${D}.</p>`}
<p style="font-size:11px;color:${MUT};margin:6px 0 14px">Amount = DW MH × each site's DW rate. Budget = full-month DW budget; a site without budget counts all its usage as over.${X ? ` ${XL} = total used minus DW MH for Region 1 &amp; 5 bulk bookings at sites without DW budget or after their DW budget ran out; other regions unchanged. Per-site and per-date details are in the attached Excel.` : ""} Details: <a href="${DASH}" style="color:${BLU}">dashboard Monitoring MH DW</a>.</p>
<!--/jpg--><p style="margin:0 0 12px">Thank you.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

export function mailText(r) {
  const P = pack(r), {N, regions, over} = P, X = N.ex > 0, bk = r.bulk;
  return ["Dear Kak Cinthia,", "", paragraph(r, P, false), "",
    `1. National amount: budget ${rpS(N.bm)} | total used ${rpS(N.ac)}` + (X ? ` | excl. bulk booking R1 & R5 ${rpS(N.acX)}` : "") + ` | remaining ${rpS(N.bm - N.ac)}`, "",
    "2. Per region (budget / total used" + (X ? " / excl. bulk booking" : "") + " / remaining):",
    ...regions.map(o => `${regLabel(o.region)}: ${rpS(o.bm)} / ${rpS(o.ac)}` + (X ? ` / ${o.ex ? rpS(o.acX) : "unchanged"}` : "") + ` / ${rpS(o.bm - o.ac)}`),
    `Total: ${rpS(N.bm)} / ${rpS(N.ac)}` + (X ? ` / ${rpS(N.acX)}` : "") + ` / ${rpS(N.bm - N.ac)}`, "",
    `3. Sites over the monthly budget (${over.length}):`, ...(over.length ? over.map(x => `${x.cinema}: ${n0(x.actual)} vs ${x.budgetMonth ? n0(x.budgetMonth) : "no budget"} MH (+${n0(x.overMh)})` + (X && x.ex ? ` · excl. bulk ${x.overMhX > 0.5 ? "+" + n0(x.overMhX) + " MH" : "within budget"}` : "")) : ["None."]), "",
    "Per-site breakdown: attached Excel.", `Details: ${DASH}`, "", "Thank you.", "", "Best regards,", "Ivan"].join("\n");
}

/** Excel attachment: sheets as array-of-arrays + column widths. Clean: one title line, one header row, one total row. */
export function attachment(r) {
  const P = pack(r), {N, site} = P, bk = r.bulk, M = monthId(r.month), D = dS(r.cut);
  const rd = v => Math.round(v || 0), r1 = v => Math.round((v || 0) * 10) / 10;
  const regNo = x => parseInt(String(x.region).replace(/\D/g, ""), 10) || 99;
  const rows = site.slice().sort((a, b) => regNo(a) - regNo(b) || +a.code - +b.code);
  const ket = x => { const b = bk && bk.sites.find(y => y.code === x.code);
    return [!x.budgetMonth && x.actual ? "No DW budget" : x.overMh > 0.5 ? "Over budget" : "", b ? (b.type === "none" ? "bulk booking" : `bulk booking after budget ran out ${dS(b.from)}`) : ""].filter(Boolean).join(" · "); };
  const s1 = [[`DW man hour usage ${M} up to ${D} vs full-month budget`], [],
    ["Region", "Site", "Budget (MH)", "Total used (MH)", "Bulk booking (MH)", "Used excl. bulk (MH)", "Remaining excl. bulk (MH)", "Budget (Rp)", "Total used (Rp)", "Bulk booking (Rp)", "Used excl. bulk (Rp)", "Remaining excl. bulk (Rp)", "Note"],
    ...rows.map(x => [regLabel(x.region), x.cinema, r1(x.budgetMonth), r1(x.actual), r1(x.exMh), r1(x.mhX), r1(x.budgetMonth - x.mhX), rd(x.bm), rd(x.ac), rd(x.ex), rd(x.acX), rd(x.bm - x.acX), ket(x)]),
    ["TOTAL", `${rows.length} sites`, r1(N.mhB), r1(N.mhA), r1(N.exMh), r1(N.mhA - N.exMh), r1(N.mhB - N.mhA + N.exMh), rd(N.bm), rd(N.ac), rd(N.ex), rd(N.acX), rd(N.bm - N.acX), ""]];
  const sheets = [{name: "Per Site", aoa: s1, cols: [11, 34, 12, 18, 17, 22, 19, 14, 18, 17, 22, 19, 40]}];
  if (bk && bk.sites.length) {
    const days = bk.sites.flatMap(x => x.use.map(d => ({x, d}))).sort((p, q) => regNo(p.x) - regNo(q.x) || +p.x.code - +q.x.code || p.d.iso.localeCompare(q.d.iso));
    sheets.push({name: "Bulk Booking R1 & R5", cols: [11, 34, 24, 12, 16, 10, 14], aoa: [[`Region 1 & 5 bulk bookings outside the DW budget · ${M} up to ${D}`], [],
      ["Region", "Site", "Condition", "Date", "Bulk booking admits", "DW MH", "Amount (Rp)"],
      ...days.map(({x, d}) => [regLabel(x.region), x.cinema, x.type === "none" ? "No DW budget" : `Budget ran out ${dS(x.from)}`, d.iso, rd(d.admits), r1(d.dw), rd(d.dw * (x.amount / (x.dw || 1)))]),
      ["TOTAL", `${bk.tot.sites} sites`, "", `${days.length} days`, rd(bk.tot.admits), r1(bk.tot.dw), rd(bk.tot.amount)]]});
  }
  return {sheets, filename: `DW_MH_${M}_to_${r.cut}_attachment.xlsx`};
}

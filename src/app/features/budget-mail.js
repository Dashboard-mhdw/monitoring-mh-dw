// "FYI" email to payroll control (Kak Cinthia), in rupiah:
//   1. national amount (budget month, used MTD vs budget MTD, left, projection)
//   2. weekly trend (budget vs actual per budget week)
//   3. usage per region
//   4. sites over budget MTD (incl. sites using DW without budget)
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

const INK = "#1d1d1f", MUT = "#6e6e73", LINE = "#d2d2d7", GRY = "#c7c7cc", BLU = "#0a84ff", ORG = "#ff9f0a", RED = "#d70015", GRN = "#248a3d";
const FONT = "font-family:Calibri,Arial,Helvetica,sans-serif";

/** All numbers the email needs (rupiah = MH × rate MH DW of each site). */
function pack(r) {
  const rows = r.rows, T = r.tot;
  const dIn = daysIn(r.month), dDone = +r.cut.slice(8), left = dIn - dDone;
  const N = {bm: T.amountMonth || 0, bt: T.amountToDate || 0, ac: T.amountActual || 0, mhB: T.budgetMonth, mhT: T.budgetToDate, mhA: T.actual};
  N.left = N.bm - N.ac; N.proj = dDone ? N.ac / dDone * dIn : 0; N.vs = N.bt ? N.ac / N.bt - 1 : null;
  const weeks = r.periods.map((p, i) => ({...p,
    rpB: rows.reduce((a, x) => a + (x.periods[i].budget || 0) * (x.rate || 0), 0),
    rpT: rows.reduce((a, x) => a + (x.periods[i].budgetToDate || 0) * (x.rate || 0), 0),
    rpA: rows.reduce((a, x) => a + (x.periods[i].actual || 0) * (x.rate || 0), 0)}));
  const g = new Map();
  rows.forEach(x => {
    const k = x.region || "Tanpa region";
    if (!g.has(k)) g.set(k, {region: k, bm: 0, bt: 0, ac: 0, mhA: 0, mhT: 0, over: 0, n: 0});
    const o = g.get(k); o.bm += x.amountMonth || 0; o.bt += x.amountToDate || 0; o.ac += x.amountActual || 0; o.mhA += x.actual; o.mhT += x.budgetToDate; o.n++;
  });
  const over = rows.filter(x => x.actual > x.budgetToDate + 0.5)
    .map(x => ({...x, overMh: x.actual - x.budgetToDate, overRp: (x.actual - x.budgetToDate) * (x.rate || 0)}))
    .sort((a, b) => b.overRp - a.overRp || b.overMh - a.overMh);
  over.forEach(x => { const o = g.get(x.region || "Tanpa region"); if (o) o.over++; });
  const regions = [...g.values()].sort((a, b) => a.region.localeCompare(b.region, undefined, {numeric: true}));
  return {N, weeks, regions, over, left, dDone, dIn};
}

export function subject(r) {
  return `FYI – Pemakaian MH DW ${monthId(r.month)} MTD (s.d. ${dS(r.cut)}) vs Budget`;
}

/** Opening paragraph — wording adapts to the numbers. */
export function paragraph(r, P = pack(r), html = false) {
  const {N, over, left} = P, M = monthId(r.month), D = dS(r.cut);
  const b = (s, col) => html ? `<b style="color:${col}">${s}</b>` : s;
  let s = `FYI Kak, berikut pemakaian MH DW nasional bulan ${M} s.d. ${D}. `;
  s += `Budget DW ${M} sebesar ${rpS(N.bm)} (${n0(N.mhB)} MH), sudah terpakai ${rpS(N.ac)} (${pct(N.bm ? N.ac / N.bm : 0)}) dengan sisa ${rpS(N.left)}${left > 0 ? ` untuk ${left} hari lagi` : ""}. `;
  if (N.vs != null) s += N.vs > 0.05 ? `Pemakaian ini ${b(`${sgn(N.vs)} di atas budget MTD`, RED)} (${rpS(N.bt)}). `
    : N.vs < -0.05 ? `Pemakaian masih ${b("di bawah budget MTD", GRN)} (${rpS(N.bt)}). ` : `Pemakaian sesuai budget MTD (${rpS(N.bt)}). `;
  s += N.proj > N.bm ? `Kalau tren ini berlanjut, perkiraan akhir bulan ${b(rpS(N.proj), RED)}, over ${rpS(N.proj - N.bm)}.`
    : `Perkiraan akhir bulan ${rpS(N.proj)}, masih di bawah budget.`;
  s += over.length ? ` Ada ${over.length} site yang over budget MTD (lihat tabel paling bawah).` : " Tidak ada site yang over budget MTD.";
  return s;
}

const kpi = (l, v, s, col = INK) => `<td style="border:1px solid ${LINE};padding:10px 12px;vertical-align:top;width:25%"><div style="font-size:12px;color:${MUT}">${l}</div><div style="font-size:20px;font-weight:bold;color:${col};line-height:1.3">${v}</div><div style="font-size:12px;color:${MUT}">${s}</div></td>`;
const hbar = (v, max, col, label, w = 260) => {
  const px = Math.max(v > 0 ? 2 : 0, Math.round(w * Math.min(v, max) / (max || 1)));
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${px ? `<td style="background:${col};width:${px}px;height:12px;font-size:0;line-height:0">&nbsp;</td>` : ""}<td style="padding-left:6px;font-size:12px;color:${INK};white-space:nowrap">${label}</td></tr></table>`;
};
const meter = (u, col, W = 110) => {
  const f = Math.round(W * Math.min(Math.max(u, 0), 1));
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;display:inline-table;vertical-align:middle"><tr>${f ? `<td style="background:${col};width:${f}px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}${W - f ? `<td style="background:#ececf0;width:${W - f}px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr></table> <span style="font-size:12px;color:${col};font-weight:bold">${pct(u)}</span>`;
};
const dot = c => `<span style="background:${c};display:inline-block;width:10px;height:10px">&nbsp;</span>`;
const h2 = s => `<p style="margin:20px 0 6px;font-size:15px;font-weight:bold">${s}</p>`;

export function mailHTML(r) {
  const P = pack(r), {N, weeks, regions, over, left} = P, M = monthId(r.month), D = dS(r.cut);
  const td = `border:1px solid ${LINE};padding:6px 10px;font-size:13px;color:${INK}`;
  const th = `border:1px solid ${LINE};background:#f5f5f7;padding:6px 10px;font-size:12px;color:${MUT};font-weight:bold;text-align:left`;
  const tf = `${th};color:${INK}`, R = ";text-align:right";

  // 2. weekly trend
  const maxW = Math.max(1, ...weeks.map(p => Math.max(p.rpB, p.rpA)));
  const wk = weeks.map(p => {
    const hot = p.elapsed && p.rpA > p.rpT * 1.0001;
    return `<tr><td style="border-bottom:1px solid ${LINE};padding:6px 10px 6px 0;font-size:12px;color:${INK};white-space:nowrap;vertical-align:middle"><b>W${p.week}</b><br><span style="color:${MUT}">${+p.start.slice(8)}–${dS(p.end)}</span></td>
<td style="border-bottom:1px solid ${LINE};padding:6px 0">${hbar(p.rpB, maxW, GRY, rpS(p.rpB))}<div style="height:3px;font-size:0;line-height:0">&nbsp;</div>${p.elapsed ? hbar(p.rpA, maxW, hot ? ORG : BLU, rpS(p.rpA) + (p.elapsed < p.days ? ` <span style="color:${MUT}">(${p.elapsed}/${p.days} hari)</span>` : "")) : `<span style="font-size:12px;color:${MUT}">belum berjalan</span>`}</td></tr>`;
  }).join("");

  // 3. per region
  const reg = regions.map(o => {
    const u = o.bm ? o.ac / o.bm : 0, hot = o.ac > o.bt * 1.0001, col = hot ? RED : u >= 0.9 ? ORG : GRN;
    return `<tr><td style="${td}"><b>${esc(regLabel(o.region))}</b></td><td style="${td + R}">${rpS(o.bm)}</td><td style="${td + R}">${rpS(o.bt)}</td><td style="${td + R};font-weight:bold;color:${hot ? RED : INK}">${rpS(o.ac)}</td>
<td style="${td + R};color:${hot ? RED : GRN}">${o.bt ? sgn(o.ac / o.bt - 1) : "–"}</td><td style="${td};white-space:nowrap">${o.bm ? meter(u, col) : `<span style="color:${MUT}">tanpa budget</span>`}</td><td style="${td + R};color:${o.bm - o.ac < 0 ? RED : INK}">${rpS(o.bm - o.ac)}</td><td style="${td + R};color:${o.over ? RED : MUT}">${o.over || "–"}</td></tr>`;
  }).join("");

  // 4. over budget sites
  const ov = over.map(x => `<tr><td style="${td}">${esc(regLabel(x.region))}</td><td style="${td}">${esc(x.cinema)}</td><td style="${td + R}">${x.budgetMonth ? n0(x.budgetToDate) : `<span style="color:${ORG}">tanpa budget</span>`}</td><td style="${td + R};font-weight:bold">${n0(x.actual)}</td><td style="${td + R};color:${RED};font-weight:bold">+${n0(x.overMh)}</td><td style="${td + R};color:${RED}">${rpS(x.overRp)}</td></tr>`).join("");
  const ovTot = {mh: over.reduce((a, x) => a + x.overMh, 0), rp: over.reduce((a, x) => a + x.overRp, 0)};

  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:900px">
<p style="margin:0 0 12px">Dear Kak Cinthia,</p>
<p style="margin:0 0 16px">${paragraph(r, P, true)}</p>
${h2(`1. Amount nasional · ${M} s.d. ${D}`)}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:880px;margin:0 0 6px"><tr>
${kpi("Budget DW " + M, rpS(N.bm), n0(N.mhB) + " MH")}${kpi("Terpakai s.d. " + D, rpS(N.ac), `${pct(N.bm ? N.ac / N.bm : 0)} · budget MTD ${rpS(N.bt)}`, N.ac > N.bt * 1.0001 ? RED : INK)}${kpi("Sisa budget", rpS(N.left), `${n0(N.mhB - N.mhA)} MH · ${left} hari lagi`, N.left < 0 ? RED : GRN)}${kpi("Perkiraan akhir bulan", rpS(N.proj), N.proj > N.bm ? `over ${rpS(N.proj - N.bm)}` : `di bawah budget ${rpS(N.bm - N.proj)}`, N.proj > N.bm ? RED : GRN)}
</tr></table>
<p style="font-size:11px;color:${MUT};margin:0">Perkiraan = rata-rata pemakaian per hari s.d. ${D} × ${P.dIn} hari.</p>
${h2("2. Trend weekly (Rp)")}
<p style="margin:0 0 6px;font-size:12px;color:${MUT}">${dot(GRY)} Budget &nbsp; ${dot(BLU)} Actual &nbsp; ${dot(ORG)} Actual &gt; budget MTD minggu itu</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 6px">${wk}</table>
${h2("3. Pemakaian amount per region")}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th + R}">Budget bulan</th><th style="${th + R}">Budget MTD</th><th style="${th + R}">Terpakai</th><th style="${th + R}">vs budget MTD</th><th style="${th}">Terpakai vs budget bulan</th><th style="${th + R}">Sisa</th><th style="${th + R}">Site over</th></tr>
${reg}
<tr><td style="${tf}">Nasional</td><td style="${tf + R}">${rpS(N.bm)}</td><td style="${tf + R}">${rpS(N.bt)}</td><td style="${tf + R}">${rpS(N.ac)}</td><td style="${tf + R}">${N.vs != null ? sgn(N.vs) : "–"}</td><td style="${tf}">${pct(N.bm ? N.ac / N.bm : 0)}</td><td style="${tf + R}">${rpS(N.left)}</td><td style="${tf + R}">${over.length || "–"}</td></tr>
</table>
${h2(`4. Site over budget MTD (${over.length})`)}
${over.length ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th}">Site</th><th style="${th + R}">Budget MTD (MH)</th><th style="${th + R}">Terpakai (MH)</th><th style="${th + R}">Over (MH)</th><th style="${th + R}">Over (Rp)</th></tr>
${ov}
<tr><td style="${tf}" colspan="4">Total ${over.length} site</td><td style="${tf + R};color:${RED}">+${n0(ovTot.mh)}</td><td style="${tf + R};color:${RED}">${rpS(ovTot.rp)}</td></tr>
</table>` : `<p style="margin:0;color:${GRN}">Tidak ada site yang over budget MTD s.d. ${D}.</p>`}
<p style="font-size:11px;color:${MUT};margin:6px 0 14px">Amount = MH DW × rate MH DW tiap site. Budget MTD = budget per minggu dihitung sampai ${D}. Over = terpakai − budget MTD; site tanpa budget dihitung over sebesar seluruh pemakaiannya. Detail: <a href="${DASH}" style="color:${BLU}">dashboard Monitoring MH DW</a>.</p>
<p style="margin:0 0 12px">Terima kasih.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

export function mailText(r) {
  const P = pack(r), {N, weeks, regions, over} = P, D = dS(r.cut);
  return ["Dear Kak Cinthia,", "", paragraph(r, P, false), "",
    `1. Amount nasional: budget ${rpS(N.bm)} | terpakai ${rpS(N.ac)} (budget MTD ${rpS(N.bt)}) | sisa ${rpS(N.left)} | perkiraan akhir bulan ${rpS(N.proj)}`, "",
    "2. Trend weekly (budget / actual):", ...weeks.map(p => `W${p.week} ${+p.start.slice(8)}–${dS(p.end)}: ${rpS(p.rpB)} / ${p.elapsed ? rpS(p.rpA) : "belum berjalan"}`), "",
    "3. Per region (budget bulan / budget MTD / terpakai / sisa):", ...regions.map(o => `${regLabel(o.region)}: ${rpS(o.bm)} / ${rpS(o.bt)} / ${rpS(o.ac)}${o.bt ? ` (${sgn(o.ac / o.bt - 1)})` : ""} / ${rpS(o.bm - o.ac)}`), "",
    `4. Site over budget MTD s.d. ${D} (${over.length}):`, ...(over.length ? over.map(x => `${regLabel(x.region)} · ${x.cinema}: ${n0(x.actual)} vs ${x.budgetMonth ? n0(x.budgetToDate) : "tanpa budget"} MH → +${n0(x.overMh)} MH (${rpS(x.overRp)})`) : ["Tidak ada."]), "",
    `Detail: ${DASH}`, "", "Terima kasih.", "", "Best regards,", "Ivan"].join("\n");
}

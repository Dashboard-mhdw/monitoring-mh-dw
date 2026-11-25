// "FYI" email to payroll control (Kak Cinthia), in rupiah:
//   1. national amount (budget month, used MTD vs budget MTD, left)
//   2. usage per region
//   3. sites over budget MTD (incl. sites using DW without budget)
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

const dList = days => { const ds = days.map(d => +d.iso.slice(8)); return ds.join(", ") + " " + CAL.monthsShort[+days[0].iso.slice(5, 7) - 1]; };

const INK = "#1d1d1f", MUT = "#6e6e73", LINE = "#d2d2d7", BLU = "#0a84ff", ORG = "#ff9f0a", RED = "#d70015", GRN = "#248a3d";
const FONT = "font-family:Calibri,Arial,Helvetica,sans-serif";

/** All numbers the email needs (rupiah = MH × rate MH DW of each site). */
function pack(r) {
  const rows = r.rows, T = r.tot;
  const dIn = daysIn(r.month), dDone = +r.cut.slice(8), left = dIn - dDone;
  const N = {bm: T.amountMonth || 0, bt: T.amountToDate || 0, ac: T.amountActual || 0, mhB: T.budgetMonth, mhT: T.budgetToDate, mhA: T.actual};
  N.left = N.bm - N.ac; N.vs = N.bt ? N.ac / N.bt - 1 : null;
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
  return {N, regions, over, left, dDone, dIn};
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
  s += over.length ? `Ada ${over.length} site yang over budget MTD (lihat tabel 3).` : "Tidak ada site yang over budget MTD.";
  const nb = r.nobar;
  if (nb && nb.tot.sites) s += ` Selain itu ada indikasi nobar/bulk booking di ${nb.tot.sites} site yang tidak punya budget nobar: ±${n0(nb.tot.nobar)} admits dengan ${n0(nb.tot.dw)} MH DW (${rpS(nb.tot.amount)}) di hari-hari tersebut (lihat tabel 4).`;
  return s;
}

const kpi = (l, v, s, col = INK) => `<td style="border:1px solid ${LINE};padding:10px 12px;vertical-align:top;width:33%"><div style="font-size:12px;color:${MUT}">${l}</div><div style="font-size:20px;font-weight:bold;color:${col};line-height:1.3">${v}</div><div style="font-size:12px;color:${MUT}">${s}</div></td>`;
const meter = (u, col, W = 110) => {
  const f = Math.round(W * Math.min(Math.max(u, 0), 1));
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;display:inline-table;vertical-align:middle"><tr>${f ? `<td style="background:${col};width:${f}px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}${W - f ? `<td style="background:#ececf0;width:${W - f}px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr></table> <span style="font-size:12px;color:${col};font-weight:bold">${pct(u)}</span>`;
};
const h2 = s => `<p style="margin:20px 0 6px;font-size:15px;font-weight:bold">${s}</p>`;

export function mailHTML(r) {
  const P = pack(r), {N, regions, over, left} = P, M = monthId(r.month), D = dS(r.cut);
  const td = `border:1px solid ${LINE};padding:6px 10px;font-size:13px;color:${INK}`;
  const th = `border:1px solid ${LINE};background:#f5f5f7;padding:6px 10px;font-size:12px;color:${MUT};font-weight:bold;text-align:left`;
  const tf = `${th};color:${INK}`, R = ";text-align:right";

  // 2. per region
  const reg = regions.map(o => {
    const u = o.bm ? o.ac / o.bm : 0, hot = o.ac > o.bt * 1.0001, col = hot ? RED : u >= 0.9 ? ORG : GRN;
    return `<tr><td style="${td}"><b>${esc(regLabel(o.region))}</b></td><td style="${td + R}">${rpS(o.bm)}</td><td style="${td + R}">${rpS(o.bt)}</td><td style="${td + R};font-weight:bold;color:${hot ? RED : INK}">${rpS(o.ac)}</td>
<td style="${td + R};color:${hot ? RED : GRN}">${o.bt ? sgn(o.ac / o.bt - 1) : "–"}</td><td style="${td};white-space:nowrap">${o.bm ? meter(u, col) : `<span style="color:${MUT}">tanpa budget</span>`}</td><td style="${td + R};color:${o.bm - o.ac < 0 ? RED : INK}">${rpS(o.bm - o.ac)}</td><td style="${td + R};color:${o.over ? RED : MUT}">${o.over || "–"}</td></tr>`;
  }).join("");

  // 3. over budget sites
  const ov = over.map(x => `<tr><td style="${td}">${esc(regLabel(x.region))}</td><td style="${td}">${esc(x.cinema)}</td><td style="${td + R}">${x.budgetMonth ? n0(x.budgetToDate) : `<span style="color:${ORG}">tanpa budget</span>`}</td><td style="${td + R};font-weight:bold">${n0(x.actual)}</td><td style="${td + R};color:${RED};font-weight:bold">+${n0(x.overMh)}</td><td style="${td + R};color:${RED}">${rpS(x.overRp)}</td></tr>`).join("");
  const ovTot = {mh: over.reduce((a, x) => a + x.overMh, 0), rp: over.reduce((a, x) => a + x.overRp, 0)};

  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:900px">
<p style="margin:0 0 12px">Dear Kak Cinthia,</p>
<p style="margin:0 0 16px">${paragraph(r, P, true)}</p>
<!--jpg-->${h2(`1. Amount nasional · ${M} s.d. ${D}`)}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:880px;margin:0 0 6px"><tr>
${kpi("Budget DW " + M, rpS(N.bm), n0(N.mhB) + " MH")}${kpi("Terpakai s.d. " + D, rpS(N.ac), `${pct(N.bm ? N.ac / N.bm : 0)} · budget MTD ${rpS(N.bt)}`, N.ac > N.bt * 1.0001 ? RED : INK)}${kpi("Sisa budget", rpS(N.left), `${n0(N.mhB - N.mhA)} MH · ${left} hari lagi`, N.left < 0 ? RED : GRN)}
</tr></table>
${h2("2. Pemakaian amount per region")}
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th + R}">Budget bulan</th><th style="${th + R}">Budget MTD</th><th style="${th + R}">Terpakai</th><th style="${th + R}">vs budget MTD</th><th style="${th}">Terpakai vs budget bulan</th><th style="${th + R}">Sisa</th><th style="${th + R}">Site over</th></tr>
${reg}
<tr><td style="${tf}">Nasional</td><td style="${tf + R}">${rpS(N.bm)}</td><td style="${tf + R}">${rpS(N.bt)}</td><td style="${tf + R}">${rpS(N.ac)}</td><td style="${tf + R}">${N.vs != null ? sgn(N.vs) : "–"}</td><td style="${tf}">${pct(N.bm ? N.ac / N.bm : 0)}</td><td style="${tf + R}">${rpS(N.left)}</td><td style="${tf + R}">${over.length || "–"}</td></tr>
</table>
${h2(`3. Site over budget MTD (${over.length})`)}
${over.length ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th}">Site</th><th style="${th + R}">Budget MTD (MH)</th><th style="${th + R}">Terpakai (MH)</th><th style="${th + R}">Over (MH)</th><th style="${th + R}">Over (Rp)</th></tr>
${ov}
<tr><td style="${tf}" colspan="4">Total ${over.length} site</td><td style="${tf + R};color:${RED}">+${n0(ovTot.mh)}</td><td style="${tf + R};color:${RED}">${rpS(ovTot.rp)}</td></tr>
</table>` : `<p style="margin:0;color:${GRN}">Tidak ada site yang over budget MTD s.d. ${D}.</p>`}
${nobarHTML(r, {td, th, tf, R})}
<p style="font-size:11px;color:${MUT};margin:6px 0 14px">Amount = MH DW × rate MH DW tiap site. Budget MTD = budget per minggu dihitung sampai ${D}. Over = terpakai − budget MTD; site tanpa budget dihitung over sebesar seluruh pemakaiannya. Detail: <a href="${DASH}" style="color:${BLU}">dashboard Monitoring MH DW</a>.</p>
<!--/jpg--><p style="margin:0 0 12px">Terima kasih.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

/** 4. Nobar / bulk booking at sites with no nobar budget. */
function nobarHTML(r, {td, th, tf, R}) {
  const nb = r.nobar; if (!nb) return "";
  const D = dS(r.cut), T = nb.tot;
  const head = h2(`4. Nobar / bulk booking non-budget (${T.sites} site)`);
  if (!T.sites) return head + `<p style="margin:0;color:${GRN}">Tidak ada indikasi nobar/bulk booking di site tanpa budget nobar s.d. ${D}.</p>`;
  const rows = nb.sites.map(x => `<tr><td style="${td};white-space:nowrap">${esc(regLabel(x.region))}</td><td style="${td}">${esc(x.cinema)}</td><td style="${td}">${dList(x.days)} <span style="color:${MUT}">(${x.n} hari)</span></td>
<td style="${td + R};font-weight:bold">${n0(x.nobar)}</td><td style="${td + R}">${n0(x.dw)}</td><td style="${td + R};color:${x.dwExtra ? ORG : MUT}">${x.dwExtra ? "+" + n0(x.dwExtra) : "–"}</td><td style="${td + R}">${rpS(x.amount)}</td></tr>`).join("");
  return head + `<p style="margin:0 0 8px">Site berikut <b>tidak punya budget nobar</b> (Forecast Nobar = 0) tetapi admits hariannya melonjak jauh di atas hari normal, sehingga terindikasi nobar/bulk booking. Total ±<b>${n0(T.nobar)} admits</b> nobar di ${T.days} hari, dengan <b>${n0(T.dw)} MH DW</b> terpakai di hari-hari tersebut (${rpS(T.amount)}); ${n0(T.dwExtra)} MH di antaranya di atas pemakaian DW hari normal.</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Region</th><th style="${th}">Site</th><th style="${th}">Tanggal nobar</th><th style="${th + R}">Admits nobar (est.)</th><th style="${th + R}">MH DW hari nobar</th><th style="${th + R}">MH DW di atas normal</th><th style="${th + R}">Amount DW</th></tr>
${rows}
<tr><td style="${tf}" colspan="3">Total ${T.sites} site · ${T.days} hari</td><td style="${tf + R}">${n0(T.nobar)}</td><td style="${tf + R}">${n0(T.dw)}</td><td style="${tf + R}">+${n0(T.dwExtra)}</td><td style="${tf + R}">${rpS(T.amount)}</td></tr>
</table>
<p style="font-size:11px;color:${MUT};margin:6px 0 0">Admits nobar (est.) = admits hari itu − admits normal site tsb. Admits normal = median admits di hari yang sama (Senin, Selasa, …) 3 bulan terakhir, disesuaikan dengan tren nasional hari itu (libur/film besar tidak ikut terhitung). Hari ditandai nobar bila admits ≥ 1,6× normal dan selisihnya ≥ 300. MH DW di atas normal = MH DW hari itu − MH DW median hari yang sama. Angka ini estimasi; konfirmasi CM lewat Reason kategori Nobar.</p>`;
}

export function mailText(r) {
  const P = pack(r), {N, regions, over} = P, D = dS(r.cut);
  return ["Dear Kak Cinthia,", "", paragraph(r, P, false), "",
    `1. Amount nasional: budget ${rpS(N.bm)} | terpakai ${rpS(N.ac)} (budget MTD ${rpS(N.bt)}) | sisa ${rpS(N.left)}`, "",
    "2. Per region (budget bulan / budget MTD / terpakai / sisa):", ...regions.map(o => `${regLabel(o.region)}: ${rpS(o.bm)} / ${rpS(o.bt)} / ${rpS(o.ac)}${o.bt ? ` (${sgn(o.ac / o.bt - 1)})` : ""} / ${rpS(o.bm - o.ac)}`), "",
    `3. Site over budget MTD s.d. ${D} (${over.length}):`, ...(over.length ? over.map(x => `${regLabel(x.region)} · ${x.cinema}: ${n0(x.actual)} vs ${x.budgetMonth ? n0(x.budgetToDate) : "tanpa budget"} MH → +${n0(x.overMh)} MH (${rpS(x.overRp)})`) : ["Tidak ada."]), "",
    ...nobarText(r),
    `Detail: ${DASH}`, "", "Terima kasih.", "", "Best regards,", "Ivan"].join("\n");
}

function nobarText(r) {
  const nb = r.nobar; if (!nb) return [];
  const T = nb.tot;
  if (!T.sites) return [`4. Nobar/bulk booking non-budget: tidak ada s.d. ${dS(r.cut)}.`, ""];
  return [`4. Nobar/bulk booking di site tanpa budget nobar (${T.sites} site, ${T.days} hari): ±${n0(T.nobar)} admits, ${n0(T.dw)} MH DW (${rpS(T.amount)}), +${n0(T.dwExtra)} MH di atas normal`,
    ...nb.sites.map(x => `${regLabel(x.region)} · ${x.cinema} (${dList(x.days)}): ±${n0(x.nobar)} admits, ${n0(x.dw)} MH DW${x.dwExtra ? ` (+${n0(x.dwExtra)} di atas normal)` : ""}, ${rpS(x.amount)}`), ""];
}

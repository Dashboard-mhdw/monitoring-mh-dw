// Weekly (Wednesday) reminder email to each Region Manager: region budget vs used, weekly chart, per-site table.
// Only that region's numbers (no national/other-region figures). Always Bahasa Indonesia, id-ID number format.
// Inline styles + table-based bars so it survives copy-paste into Outlook/Gmail.
import { esc } from "../ui/dom.js";
import { _dicts } from "../i18n.js";

const CAL = _dicts.id._cal;
const DASH = "https://dashboard-mhdw.github.io/monitoring-mh-dw/";
const n0 = v => Math.round(v || 0).toLocaleString("id-ID");
const pct = v => Math.round((v || 0) * 100) + "%";
const rpS = v => "Rp " + (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("id-ID", {maximumFractionDigits: 1}) + " jt" : n0(v));
const dS = iso => `${+iso.slice(8)} ${CAL.monthsShort[+iso.slice(5, 7) - 1]}`;
const monthId = key => CAL.months[+key.slice(5, 7) - 1];
const regLabel = s => String(s || "").replace(/^REGION/i, "Region");
const daysLeft = (cut, key) => { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() - +cut.slice(8); };

const INK = "#1d1d1f", MUT = "#6e6e73", LINE = "#d2d2d7", GRY = "#c7c7cc", BLU = "#0a84ff", ORG = "#ff9f0a", RED = "#d70015", GRN = "#248a3d";
const FONT = "font-family:Calibri,Arial,Helvetica,sans-serif";

/** Regions present in a budget-vs-actual result. */
export const regions = r => [...new Set(r.rows.filter(x => x.status !== "none").map(x => x.region).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));

/** Everything the email needs for one region. */
function pack(r, region) {
  const rows = r.rows.filter(x => x.region === region && x.status !== "none");
  const S = f => rows.reduce((a, x) => a + (f(x) || 0), 0);
  const G = {bm: S(x => x.budgetMonth), bt: S(x => x.budgetToDate), ac: S(x => x.actual), rpB: S(x => x.amountMonth), rpA: S(x => x.amountActual)};
  const per = r.periods.map((p, i) => ({...p, budget: S(x => x.periods[i].budget), btd: S(x => x.periods[i].budgetToDate), actual: S(x => x.periods[i].actual)}));
  const list = rows.slice().sort((a, b) => (b.actual - b.budgetToDate) - (a.actual - a.budgetToDate) || b.actual - a.actual);
  return {rows: list, G, per, left: daysLeft(r.cut, r.month)};
}

export function subject(r, region) {
  return `Reminder Budget MH DW ${regLabel(region)} – ${monthId(r.month)} (s.d. ${dS(r.cut)})`;
}

function paragraph(r, region, P, html) {
  const {G, rows, left} = P, M = monthId(r.month), D = dS(r.cut), R = regLabel(region);
  const used = G.bm ? G.ac / G.bm : 0, vs = G.bt ? G.ac / G.bt - 1 : 0;
  const b = (s, col) => html ? `<b style="color:${col}">${s}</b>` : s;
  let s = `Berikut update pemakaian MH DW ${R} bulan ${M} s.d. ${D}. `;
  s += G.ac > G.bm
    ? `Budget bulan ini ${n0(G.bm)} MH dan sudah terpakai ${n0(G.ac)} MH, artinya ${b(`over ${n0(G.ac - G.bm)} MH`, RED)}${left > 0 ? ` dengan sisa ${left} hari lagi` : ""}.`
    : `Dari budget ${n0(G.bm)} MH, sudah terpakai ${n0(G.ac)} MH (${pct(used)}) dengan sisa ${n0(G.bm - G.ac)} MH${left > 0 ? ` untuk ${left} hari lagi` : ""}.`;
  if (G.bt > 0) s += vs > 0.05 ? ` Pemakaian ini ${b(`${pct(vs)} di atas jadwal`, RED)} (jadwal s.d. ${D}: ${n0(G.bt)} MH), jadi mohon dibantu kontrol pemakaian DW minggu ini.`
    : vs < -0.05 ? ` Pemakaian masih ${b("di bawah jadwal", GRN)} (jadwal s.d. ${D}: ${n0(G.bt)} MH).` : ` Pemakaian sesuai jadwal (${n0(G.bt)} MH s.d. ${D}).`;
  const over = rows.filter(x => x.budgetToDate > 0 && x.actual > x.budgetToDate).length;
  const nob = rows.filter(x => x.budgetMonth === 0 && x.actual > 0).length;
  const bits = [over && `${over} site sudah melewati jadwal`, nob && `${nob} site memakai DW tanpa budget`].filter(Boolean);
  if (bits.length) s += ` Ada ${bits.join(" dan ")} (lihat tabel di bawah).`;
  return s;
}

const hbar = (v, max, col, w = 240) => {
  const px = Math.max(v > 0 ? 2 : 0, Math.round(w * Math.min(v, max) / (max || 1)));
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${px ? `<td style="background:${col};width:${px}px;height:12px;font-size:0;line-height:0">&nbsp;</td>` : ""}<td style="padding-left:6px;font-size:12px;color:${INK};white-space:nowrap">${n0(v)}</td></tr></table>`;
};
const kpi = (l, v, s, col = INK) => `<td style="border:1px solid ${LINE};padding:10px 14px;vertical-align:top;width:33%"><div style="font-size:12px;color:${MUT}">${l}</div><div style="font-size:20px;font-weight:bold;color:${col};line-height:1.3">${v}</div><div style="font-size:12px;color:${MUT}">${s}</div></td>`;
const dot = c => `<span style="background:${c};display:inline-block;width:10px;height:10px">&nbsp;</span>`;

export function mailHTML(r, region) {
  const P = pack(r, region), {G, per, rows, left} = P, M = monthId(r.month), D = dS(r.cut), R = esc(regLabel(region));
  const used = G.bm ? G.ac / G.bm : 0;
  const maxW = Math.max(1, ...per.map(p => Math.max(p.budget, p.actual)));
  const wk = per.map(p => {
    const hot = p.elapsed && p.actual > p.btd * 1.0001;
    return `<tr><td style="border-bottom:1px solid ${LINE};padding:6px 10px 6px 0;font-size:12px;color:${INK};white-space:nowrap;vertical-align:middle"><b>W${p.week}</b><br><span style="color:${MUT}">${+p.start.slice(8)}–${dS(p.end)}</span></td>
<td style="border-bottom:1px solid ${LINE};padding:6px 0">${hbar(p.budget, maxW, GRY)}<div style="height:3px;font-size:0;line-height:0">&nbsp;</div>${p.elapsed ? hbar(p.actual, maxW, hot ? ORG : BLU) : `<span style="font-size:12px;color:${MUT}">belum berjalan</span>`}</td></tr>`;
  }).join("");
  const td = `border:1px solid ${LINE};padding:6px 10px;font-size:13px;color:${INK}`;
  const th = `border:1px solid ${LINE};background:#f5f5f7;padding:6px 10px;font-size:12px;color:${MUT};font-weight:bold;text-align:left`;
  const tf = `${th};color:${INK}`;
  const site = x => {
    const u = x.budgetMonth ? x.actual / x.budgetMonth : 0, hot = x.budgetToDate > 0 ? x.actual > x.budgetToDate : x.actual > 0;
    const col = hot ? RED : u >= 0.9 ? ORG : GRN, W = 120, f = Math.round(W * Math.min(u, 1));
    const meter = x.budgetMonth ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;display:inline-table;vertical-align:middle"><tr>${f ? `<td style="background:${col};width:${f}px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}${W - f ? `<td style="background:#ececf0;width:${W - f}px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr></table> <span style="font-size:12px;color:${col};font-weight:bold">${pct(u)}</span>`
      : `<span style="color:${MUT}">tanpa budget</span>`;
    return `<tr><td style="${td}">${esc(x.cinema)}</td><td style="${td};text-align:right">${n0(x.budgetMonth)}</td><td style="${td};text-align:right">${n0(x.budgetToDate)}</td><td style="${td};text-align:right;font-weight:bold;color:${hot ? RED : INK}">${n0(x.actual)}</td><td style="${td};white-space:nowrap">${meter}</td></tr>`;
  };
  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:760px">
<p style="margin:0 0 12px">Dear Bapak/Ibu RM ${R},</p>
<p style="margin:0 0 16px">${paragraph(r, region, P, true)}</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px;margin:0 0 6px"><tr>
${kpi("Budget " + M, n0(G.bm) + " MH", rpS(G.rpB))}${kpi("Terpakai s.d. " + D, n0(G.ac) + " MH", pct(used) + " · jadwal " + n0(G.bt) + " MH", G.ac > G.bt ? RED : INK)}${kpi("Sisa MH", n0(G.bm - G.ac) + " MH", rpS(G.rpB - G.rpA) + " · " + left + " hari lagi", G.bm - G.ac < 0 ? RED : GRN)}
</tr></table>
<p style="margin:18px 0 6px;font-size:15px;font-weight:bold">Budget vs actual per minggu · ${R}</p>
<p style="margin:0 0 6px;font-size:12px;color:${MUT}">${dot(GRY)} Budget &nbsp; ${dot(BLU)} Actual &nbsp; ${dot(ORG)} Actual &gt; budget s.d. tgl</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 6px">${wk}</table>
<p style="margin:18px 0 6px;font-size:15px;font-weight:bold">Per site · ${R}</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:720px">
<tr><th style="${th}">Site</th><th style="${th};text-align:right">Budget bulan (MH)</th><th style="${th};text-align:right">Jadwal s.d. ${D}</th><th style="${th};text-align:right">Terpakai (MH)</th><th style="${th}">Pemakaian vs budget bulan</th></tr>
${rows.map(site).join("")}
<tr><td style="${tf}">Total ${rows.length} site</td><td style="${tf};text-align:right">${n0(G.bm)}</td><td style="${tf};text-align:right">${n0(G.bt)}</td><td style="${tf};text-align:right">${n0(G.ac)}</td><td style="${tf}">${pct(used)}</td></tr>
</table>
<p style="font-size:11px;color:${MUT};margin:6px 0 14px">Merah = terpakai melewati jadwal s.d. ${D} · oranye = ≥ 90% budget bulan · hijau = aman. Detail &amp; alasan: <a href="${DASH}" style="color:${BLU}">dashboard Monitoring MH DW</a>.</p>
<p style="margin:0 0 12px">Mohon dibantu dicek dan dikontrol pemakaian DW di site masing-masing. Terima kasih.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

export function mailText(r, region) {
  const P = pack(r, region), {G, per, rows} = P, R = regLabel(region);
  return [`Dear Bapak/Ibu RM ${R},`, "", paragraph(r, region, P, false), "",
    `Budget ${monthId(r.month)}: ${n0(G.bm)} MH | Terpakai: ${n0(G.ac)} MH (${pct(G.bm ? G.ac / G.bm : 0)}) | Sisa: ${n0(G.bm - G.ac)} MH`, "",
    "Per minggu (budget / actual):", ...per.map(p => `W${p.week} ${+p.start.slice(8)}–${dS(p.end)}: ${n0(p.budget)} / ${p.elapsed ? n0(p.actual) : "belum berjalan"}`), "",
    "Per site (budget bulan / jadwal s.d. tgl / terpakai):", ...rows.map(x => `${x.cinema}: ${n0(x.budgetMonth)} / ${n0(x.budgetToDate)} / ${n0(x.actual)}${x.budgetMonth ? ` (${pct(x.actual / x.budgetMonth)})` : " (tanpa budget)"}`), "",
    `Detail: ${DASH}`, "", "Mohon dibantu dicek dan dikontrol pemakaian DW di site masing-masing. Terima kasih.", "", "Best regards,", "Ivan"].join("\n");
}

// Weekly (Wednesday) reminder email to each Region Manager: region budget vs used, weekly chart, per-site table.
// Only that region's numbers (no national/other-region figures). Always Bahasa Indonesia, id-ID number format.
// Inline styles + table-based bars so it survives copy-paste into Outlook/Gmail.
import { esc } from "../ui/dom.js";
import { _dicts } from "../i18n.js";
import { store } from "../store.js";

const CAL = _dicts.id._cal;
const DASH = "https://dashboard-mhdw.github.io/monitoring-mh-dw/";
const n0 = v => Math.round(v || 0).toLocaleString("id-ID");
const pct = v => Math.round((v || 0) * 100) + "%";
const rpS = v => "Rp " + (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("id-ID", {maximumFractionDigits: 1}) + " jt" : n0(v));
const d1 = v => v == null ? "–" : v.toLocaleString("id-ID", {minimumFractionDigits: 1, maximumFractionDigits: 1});
const cityOf = x => x.city ? ` <span style="color:${"#6e6e73"};font-size:11px">· ${esc(x.city)}</span>` : "";
const dS = iso => `${+iso.slice(8)} ${CAL.monthsShort[+iso.slice(5, 7) - 1]}`;
const monthId = key => CAL.months[+key.slice(5, 7) - 1];
const regLabel = s => String(s || "").replace(/^REGION/i, "Region");
const RM = {1: "Kak Viana", 2: "Bang Faisal", 3: "Bang Cesaro", 4: "Bang Meidiyan", 5: "Bang Edwink", 6: "Bang Baldi"};
const greet = region => { const n = +(String(region).match(/\d+/) || [])[0]; return `Dear ${RM[n] || "Kakak-kakak RM " + regLabel(region)},`; };
const daysLeft = (cut, key) => { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() - +cut.slice(8); };

// Regions whose RM email also shows "excl. bulk booking" (DW for bulk booking outside the DW budget, from r.bulk).
const BULK_RM = ["REGION 1"];
const PUR = "#6e3fc9";
const INK = "#1d1d1f", MUT = "#6e6e73", LINE = "#d2d2d7", GRY = "#c7c7cc", BLU = "#0a84ff", ORG = "#ff9f0a", RED = "#d70015", GRN = "#248a3d";
const FONT = "font-family:Calibri,Arial,Helvetica,sans-serif";

/** Regions present in a budget-vs-actual result. */
export const regions = r => [...new Set(r.rows.map(x => x.region).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));

/** Everything the email needs for one region — every site in the region, with or without a DW budget. */
function pack(r, region) {
  const rows = r.rows.filter(x => x.region === region);
  const S = f => rows.reduce((a, x) => a + (f(x) || 0), 0);
  const G = {bm: S(x => x.budgetMonth), bt: S(x => x.budgetToDate), ac: S(x => x.actual), rpB: S(x => x.amountMonth), rpA: S(x => x.amountActual),
    adm: S(x => x.admitsActual), admB: S(x => x.admitsBudgetMonth), admBt: S(x => x.admitsBudgetToDate), mhT: S(x => x.mhTotal)};
  G.prod = G.mhT > 0 ? G.adm / G.mhT : null;   // total admits ÷ total MH (PKWT + PKDW)
  const tw = S(x => x.target && x.mhTotal ? x.target * x.mhTotal : 0), tm = S(x => x.target && x.mhTotal ? x.mhTotal : 0);
  G.target = tm ? tw / tm : null;              // target prod, weighted by total MH
  const per = r.periods.map((p, i) => ({...p, budget: S(x => x.periods[i].budget), btd: S(x => x.periods[i].budgetToDate), actual: S(x => x.periods[i].actual)}));
  const list = rows.slice().sort((a, b) => (b.actual - b.budgetToDate) - (a.actual - a.budgetToDate) || b.actual - a.actual);
  // bulk booking left out (only for regions in BULK_RM)
  const bk = new Map();
  if (BULK_RM.includes(region) && r.bulk) r.bulk.sites.filter(x => x.region === region).forEach(x => bk.set(x.code, x));
  list.forEach(x => { const b = bk.get(x.code); x.bulkMh = b ? b.dw : 0; x.bulkInfo = b || null; });
  G.ex = S(x => x.bulkMh); G.acX = G.ac - G.ex; G.exRp = [...bk.values()].reduce((a, x) => a + x.amount, 0);
  return {rows: list, G, per, left: daysLeft(r.cut, r.month), X: G.ex > 0, bulk: [...bk.values()]};
}

/** "Berikut link dashboard … + password" line (password only when the admin data has it). */
function access(region, html) {
  const pw = store.rmPassword(region), R = regLabel(region);
  if (!html) return `Berikut link dashboard Monitoring MH DW untuk detail lebih lanjut: ${DASH}` + (pw ? `\nPassword ${R}: ${pw}` : "");
  return `<p style="margin:0 0 12px">Berikut link dashboard Monitoring MH DW untuk detail lebih lanjut:<br><a href="${DASH}" style="color:${BLU}">${DASH}</a>${pw ? `<br>Password ${esc(R)}: <b>${esc(pw)}</b>` : ""}</p>`;
}

export function subject(r, region) {
  return `Reminder Budget MH DW ${regLabel(region)} – ${monthId(r.month)} (s.d. ${dS(r.cut)})`;
}

function paragraph(r, region, P, html) {
  const {G, left} = P, M = monthId(r.month), D = dS(r.cut), R = regLabel(region);
  const vs = G.bt ? G.ac / G.bt - 1 : 0;
  const b = (s, col) => html ? `<b style="color:${col}">${s}</b>` : s;
  const sisa = left > 0 ? ` untuk ${left} hari lagi` : "";
  let s = `Berikut update MH DW ${R} bulan ${M} s.d. ${D}: terpakai ${n0(G.ac)} dari ${n0(G.bm)} MH (${pct(G.bm ? G.ac / G.bm : 0)}). `;
  if (G.ac > G.bm) s += `Sudah ${b(`over ${n0(G.ac - G.bm)} MH`, RED)} dari budget bulan ini, mohon dibantu kontrol pemakaian DW.`;
  else if (G.bt > 0 && vs > 0.05) s += `Sisa ${n0(G.bm - G.ac)} MH${sisa}, tapi sudah ${b(`${pct(vs)} di atas budget MTD`, RED)}, mohon dibantu kontrol pemakaian DW minggu ini.`;
  else s += `Sisa ${n0(G.bm - G.ac)} MH${sisa}, ${G.bt > 0 && vs < -0.05 ? b("masih di bawah budget MTD", GRN) : "sesuai budget MTD"}.`;
  if (P.X) s += ` Di dalamnya ada ${n0(G.ex)} MH untuk bulk booking di luar budget DW (${P.bulk.length} site); jika dikeluarkan, terpakai menjadi ${b(`${n0(G.acX)} MH (${pct(G.bm ? G.acX / G.bm : 0)})`, PUR)} dengan sisa ${n0(G.bm - G.acX)} MH.`;
  return s;
}

const hbar = (v, max, col, w = 240) => {
  const px = Math.max(v > 0 ? 2 : 0, Math.round(w * Math.min(v, max) / (max || 1)));
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${px ? `<td style="background:${col};width:${px}px;height:12px;font-size:0;line-height:0">&nbsp;</td>` : ""}<td style="padding-left:6px;font-size:12px;color:${INK};white-space:nowrap">${n0(v)}</td></tr></table>`;
};
const kpi = (l, v, s, col = INK) => `<td style="border:1px solid ${LINE};padding:10px 12px;vertical-align:top;width:20%"><div style="font-size:12px;color:${MUT}">${l}</div><div style="font-size:20px;font-weight:bold;color:${col};line-height:1.3">${v}</div><div style="font-size:12px;color:${MUT}">${s}</div></td>`;
const dot = c => `<span style="background:${c};display:inline-block;width:10px;height:10px">&nbsp;</span>`;

export function mailHTML(r, region) {
  const P = pack(r, region), {G, per, rows, left, X} = P, M = monthId(r.month), D = dS(r.cut), R = esc(regLabel(region));
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
    const lowP = x.prodActual != null && x.target && x.prodActual < x.target;
    const b = x.bulkInfo;
    const exCell = !X ? "" : b ? `<td style="${td};text-align:right;color:${PUR}"><b>${n0(x.actual - x.bulkMh)}</b><div style="font-size:11px">bulk −${n0(x.bulkMh)} · ${b.use.length} hari</div></td>` : `<td style="${td};text-align:right;color:${MUT}">sama</td>`;
    return `<tr><td style="${td}">${esc(x.cinema)}${cityOf(x)}</td><td style="${td};text-align:right">${n0(x.budgetMonth)}</td><td style="${td};text-align:right">${n0(x.budgetToDate)}</td><td style="${td};text-align:right;font-weight:bold;color:${hot ? RED : INK}">${n0(x.actual)}</td>${exCell}<td style="${td};white-space:nowrap">${meter}</td><td style="${td};text-align:right">${n0(x.admitsActual)}</td><td style="${td};text-align:right;color:${lowP ? RED : INK}">${d1(x.prodActual)}${x.target ? `<span style="color:${MUT};font-size:11px"> / ${d1(x.target)}</span>` : ""}</td></tr>`;
  };
  return `<div style="${FONT};font-size:14px;color:${INK};line-height:1.5;max-width:920px">
<p style="margin:0 0 12px">${esc(greet(region))}</p>
<p style="margin:0 0 16px">${paragraph(r, region, P, true)}</p>
<!--jpg--><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:900px;margin:0 0 6px"><tr>
${kpi("Budget " + M, n0(G.bm) + " MH", rpS(G.rpB))}${kpi("Terpakai s.d. " + D, n0(G.ac) + " MH", pct(used) + " · budget MTD " + n0(G.bt) + " MH" + (X ? `<br><span style="color:${PUR}">excl. bulk booking: <b>${n0(G.acX)} MH</b> (${pct(G.bm ? G.acX / G.bm : 0)})</span>` : ""), G.ac > G.bt ? RED : INK)}${kpi("Sisa MH", n0(G.bm - G.ac) + " MH", rpS(G.rpB - G.rpA) + " · " + left + " hari lagi" + (X ? `<br><span style="color:${PUR}">excl. bulk booking: <b>${n0(G.bm - G.acX)} MH</b></span>` : ""), G.bm - G.ac < 0 ? RED : GRN)}${kpi("Actual admits MTD", n0(G.adm), G.admB ? `vs budget s.d. ${D}: ${n0(G.admBt)} (${G.admBt ? (G.adm >= G.admBt ? "+" : "") + pct(G.adm / G.admBt - 1) : "–"})<br>budget 1 bulan: ${n0(G.admB)}` : "budget admits –", G.admBt && G.adm < G.admBt ? RED : INK)}${kpi("Prod MTD", d1(G.prod), `admits ÷ total MH${G.target ? " · target " + d1(G.target) : ""}`, G.prod != null && G.target && G.prod < G.target ? RED : G.prod != null && G.target ? GRN : INK)}
</tr></table>
<p style="margin:18px 0 6px;font-size:15px;font-weight:bold">Budget vs actual per minggu · ${R}</p>
<p style="margin:0 0 6px;font-size:12px;color:${MUT}">${dot(GRY)} Budget &nbsp; ${dot(BLU)} Actual &nbsp; ${dot(ORG)} Actual &gt; budget s.d. tgl</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 6px">${wk}</table>
<p style="margin:18px 0 6px;font-size:15px;font-weight:bold">Per site · ${R}</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:900px">
<tr><th style="${th}">Site</th><th style="${th};text-align:right">Budget bulan (MH)</th><th style="${th};text-align:right">Budget MTD s.d. ${D}</th><th style="${th};text-align:right">Terpakai (MH)</th>${X ? `<th style="${th};text-align:right;background:#f1ecfb;color:${PUR}">Excl. bulk booking (MH)</th>` : ""}<th style="${th}">Pemakaian vs budget bulan</th><th style="${th};text-align:right">Admits MTD</th><th style="${th};text-align:right">Prod / target</th></tr>
${rows.map(site).join("")}
<tr><td style="${tf}">Total ${rows.length} site</td><td style="${tf};text-align:right">${n0(G.bm)}</td><td style="${tf};text-align:right">${n0(G.bt)}</td><td style="${tf};text-align:right">${n0(G.ac)}</td>${X ? `<td style="${tf};text-align:right;color:${PUR}">${n0(G.acX)}</td>` : ""}<td style="${tf}">${pct(used)}</td><td style="${tf};text-align:right">${n0(G.adm)}</td><td style="${tf};text-align:right">${d1(G.prod)}</td></tr>
</table>
<p style="font-size:11px;color:${MUT};margin:6px 0 14px">Merah = terpakai melewati budget MTD s.d. ${D} · oranye = ≥ 90% budget bulan · hijau = aman. Prod = total admits ÷ total MH (PKWT + PKDW), merah = di bawah target.${X ? ` Excl. bulk booking = terpakai dikurangi MH DW di hari bulk booking pada site tanpa budget DW, atau setelah budget DW site itu habis.` : ""}</p>
<!--/jpg--><p style="margin:0 0 12px">Mohon dibantu dicek dan dikontrol pemakaian DW di site masing-masing.</p>
${access(region, true)}
<p style="margin:0 0 12px">Terima kasih.</p>
<p style="margin:0">Best regards,<br>Ivan</p></div>`;
}

export function mailText(r, region) {
  const P = pack(r, region), {G, per, rows} = P, R = regLabel(region);
  return [greet(region), "", paragraph(r, region, P, false), "",
    `Budget ${monthId(r.month)}: ${n0(G.bm)} MH | Terpakai: ${n0(G.ac)} MH (${pct(G.bm ? G.ac / G.bm : 0)}) | Sisa: ${n0(G.bm - G.ac)} MH`,
    ...(P.X ? [`Excl. bulk booking: terpakai ${n0(G.acX)} MH (${pct(G.bm ? G.acX / G.bm : 0)}) | sisa ${n0(G.bm - G.acX)} MH`] : []),
    `Actual admits MTD: ${n0(G.adm)}${G.admB ? ` (budget s.d. tgl ${n0(G.admBt)})` : ""} | Prod MTD: ${d1(G.prod)}${G.target ? ` (target ${d1(G.target)})` : ""}`, "",
    "Per minggu (budget / actual):", ...per.map(p => `W${p.week} ${+p.start.slice(8)}–${dS(p.end)}: ${n0(p.budget)} / ${p.elapsed ? n0(p.actual) : "belum berjalan"}`), "",
    "Per site (budget bulan / budget MTD / terpakai · admits MTD · prod):", ...rows.map(x => `${x.cinema}: ${n0(x.budgetMonth)} / ${n0(x.budgetToDate)} / ${n0(x.actual)}${x.budgetMonth ? ` (${pct(x.actual / x.budgetMonth)})` : " (tanpa budget)"}${x.bulkMh ? ` · excl. bulk booking ${n0(x.actual - x.bulkMh)}` : ""} · ${n0(x.admitsActual)} · ${d1(x.prodActual)}`), "",
    "Mohon dibantu dicek dan dikontrol pemakaian DW di site masing-masing.", "", access(region, false), "", "Terima kasih.", "", "Best regards,", "Ivan"].join("\n");
}

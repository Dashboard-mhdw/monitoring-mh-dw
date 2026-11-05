// Budget bulanan dari spreadsheet budget (raw data):
//   node scripts/build-budget.mjs <get_spreadsheet response .json> [outDir]
// Input = respons Google Sheets get_spreadsheet (includeGridData) untuk range
//   'Budget per cinema'!A1:V75, 'Alokasi per Week'!A1:J70, 'Budget Region'!A1:K20
// Output = budget-<YYYY-MM>.json (lokal, di-.gitignore) dengan bentuk yang dipakai dashboard:
//   {month, source, periods:[{start,end,week}], control:{budgetAmount, amountBefore, amountAfter, remaining},
//    sites:{code:{region, mh:[per period], admits:[...], fth:[...], prod, rate, ft, nobar, admitsMonth, mhBefore, amountBefore, mhMonth, amountMonth}}}
import fs from "node:fs";
import path from "node:path";

const [inPath, outDir = "."] = process.argv.slice(2);
if (!inPath) { console.error("usage: node scripts/build-budget.mjs <get_spreadsheet.json> [outDir]"); process.exit(1); }
const res = JSON.parse(fs.readFileSync(inPath, "utf8"));
const sheets = {};
for (const sh of res.sheets || []) {
  const rows = ((sh.data && sh.data[0] && sh.data[0].rowData) || []).map(r => (r.values || []).map(c => {
    const ev = c.effectiveValue || {};
    return ev.numberValue != null ? ev.numberValue : ev.stringValue != null ? ev.stringValue : (c.formattedValue || "");
  }));
  sheets[sh.properties.title] = rows;
}
const per = sheets["Budget per cinema"], wk = sheets["Alokasi per Week"];
if (!per || !wk) { console.error("butuh sheet 'Budget per cinema' dan 'Alokasi per Week'"); process.exit(2); }

// Header → kolom (nama kolom bisa sedikit berubah tiap bulan, cari dengan kata kunci)
const H = per[0].map(h => String(h).trim().toLowerCase());
const col = (...keys) => { const i = H.findIndex(h => keys.every(k => h.includes(k))); if (i < 0) throw new Error("kolom tidak ketemu: " + keys.join(" ")); return i; };
const C = {region: col("region"), cinema: col("cinema"), target: col("target"), admits: col("budget_admits"), nobar: col("nobar"), total: col("total admits"),
  ft: col("hc_ft"), rate: col("rate"), before: col("before"), amountBefore: col("amount before"), after: col("mh dw after"), amount: H.findIndex(h => h === "amount"), mhFt: col("mh ft")};
const MON = {jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12};
const mName = (H[C.admits].match(/budget_admits\s+([a-z]+)/) || [])[1];
const mNum = mName && MON[mName.slice(0, 3)];
if (!mNum) throw new Error("bulan tidak terbaca dari header: " + per[0][C.admits]);
const now = new Date(Date.now() + 7 * 3600e3);
let year = now.getUTCFullYear(); if (mNum < now.getUTCMonth() + 1 - 6) year++; if (mNum > now.getUTCMonth() + 1 + 6) year--;
const key = `${year}-${String(mNum).padStart(2, "0")}`;
const num = v => typeof v === "number" ? v : (v === "" || v == null || /^\s*-\s*$/.test(v) ? 0 : +String(v).replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1") || 0);

// Minggu fiskal Rabu–Selasa, dipotong per bulan; nomor minggu = minggu ISO dari hari Rabu awalnya.
const iso = d => d.toISOString().slice(0, 10);
const isoWeek = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };
const days = new Date(Date.UTC(year, mNum, 0)).getUTCDate();
const periods = [];
for (let d = 1; d <= days; ) {
  const s = new Date(Date.UTC(year, mNum - 1, d));
  let e = d; while (e < days && new Date(Date.UTC(year, mNum - 1, e + 1)).getUTCDay() !== 3) e++;
  const wed = new Date(s); while (wed.getUTCDay() !== 3) wed.setUTCDate(wed.getUTCDate() - 1);
  periods.push({start: iso(s), end: iso(new Date(Date.UTC(year, mNum - 1, e))), week: isoWeek(wed), days: e - d + 1});
  d = e + 1;
}
// Alokasi per Week: A region, B cinema, C total, D.. = jam per minggu (sejumlah periode), lalu total
const weekly = {};
for (const r of wk) { const name = String(r[1] || ""); const code = name.split("-")[0]; if (!/^\d+$/.test(code)) continue; weekly[code] = periods.map((p, i) => num(r[3 + i])); }

const sites = {};
for (const r of per.slice(1)) {
  const name = String(r[C.cinema] || ""), code = name.split("-")[0];
  if (!/^\d+$/.test(code)) continue;
  const mhMonth = num(r[C.after]), share = periods.map(p => p.days / days);
  const w = weekly[code] && Math.abs(weekly[code].reduce((a, b) => a + b, 0) - mhMonth) < 0.6 ? weekly[code] : share.map(f => Math.round(mhMonth * f * 10) / 10);
  const totalAdm = num(r[C.total]) || num(r[C.admits]);
  sites[code] = {cinema: name, region: String(r[C.region] || "").trim(), prod: num(r[C.target]) || 14,
    mh: w, admits: share.map(f => Math.round(totalAdm * f * 10) / 10), fth: share.map(f => Math.round(num(r[C.mhFt]) * f * 10) / 10),
    rate: num(r[C.rate]), ft: num(r[C.ft]), nobar: num(r[C.nobar]), admitsMonth: num(r[C.admits]), admitsTotal: totalAdm,
    mhBefore: num(r[C.before]), amountBefore: num(r[C.amountBefore]), mhMonth, amountMonth: C.amount >= 0 ? num(r[C.amount]) : mhMonth * num(r[C.rate])};
}
// Kontrol perusahaan (baris label di bawah tabel)
const ctl = {}; for (const r of per) { const l = String(r[1] || "").toLowerCase(); const v = num(r[2]);
  if (l.startsWith("budget amount")) ctl.budgetAmount = v; else if (l.startsWith("forecast amount")) ctl.amountBefore = v;
  else if (l.startsWith("amount mh dw after")) ctl.amountAfter = v; else if (l.startsWith("sisa")) ctl.remaining = v; }
const out = {month: key, source: "Spreadsheet budget · Budget per cinema + Alokasi per Week", builtAt: new Date().toISOString(),
  periods: periods.map(({start, end, week}) => ({start, end, week})), control: ctl, sites};
const file = path.join(outDir, `budget-${key}.json`);
fs.writeFileSync(file, JSON.stringify(out));
const T = Object.values(sites);
console.log(`${file}: ${T.length} site, ${periods.length} minggu, MH ${T.reduce((a, s) => a + s.mhMonth, 0).toFixed(1)}, amount ${Math.round(T.reduce((a, s) => a + s.amountMonth, 0)).toLocaleString("en-US")}, budget amount ${ctl.budgetAmount}`);

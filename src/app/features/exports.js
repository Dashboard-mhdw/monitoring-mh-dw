// Excel / CSV exports. Headers follow the active language; file names stay stable.
import { t, locale } from "../i18n.js";
import { monthName, monthShort, prevKey, TODAY } from "../format.js";
import { hud } from "../ui/dom.js";
import { getMonth, alertsOn, alertsRange } from "../store.js";
import { state } from "../state.js";
import { trendData } from "./trend.js";
import { bvaCurrent, statusLabel } from "./budget.js";
import * as Mail from "./budget-mail.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const fileMonth = k => monthName(k).replace(" ", "_");

function save(filename, data) {
  const type = filename.endsWith(".csv") ? "text/csv;charset=utf-8" : XLSX_MIME;
  const url = URL.createObjectURL(new Blob([data], {type}));
  const a = Object.assign(document.createElement("a"), {href: url, download: filename});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  hud(t("toast.downloading", {f: filename}));
}
export function workbook() {
  if (typeof XLSX === "undefined") { hud(t("toast.xlsxMissing")); return null; }
  const wb = XLSX.utils.book_new();
  const add = (name, aoa, cols) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (cols) ws["!cols"] = cols.map(w => ({wch: w})); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); };
  const write = name => save(name, new Uint8Array(XLSX.write(wb, {bookType: "xlsx", type: "array"})));
  return {add, write};
}
const now = () => new Date().toLocaleString(locale());
const r1 = v => +(+v || 0).toFixed(1);

const siteHead = () => ["No", t("x.code"), t("col.site"), "Format", "Station PKDW", "Training PKDW", "Total PKDW", t("col.dwDays"), t("x.avgDw"), "MH PKWT", "Total MH", "% DW", "Admits", t("col.missed")];
const siteRow = (s, i) => [i + 1, +s.code, s.cinema, s.formats.join(", "), s.spkdw, s.tpkdw, s.pkdw, s.dwDays, s.dwDays ? r1(s.pkdw / s.dwDays) : 0, s.pkwt, s.total, r1(s.share * 100), s.admits, s.missed];

function exportMonth() {
  const key = state.month, g = getMonth(key); if (!g) return;
  const W = workbook(); if (!W) return;
  const prev = getMonth(prevKey(key)), {m, st} = g, T = st.tot;
  const sites = st.sites.slice().sort((a, b) => +a.code - +b.code);
  W.add(t("x.sSummary"), [
    [t("x.reportTitle", {month: monthName(key)})],
    [t("x.reportSub", {tab: m.title, last: st.lastIdx >= 0 ? m.dates[st.lastIdx].label : "-", now: now()})], [],
    [t("x.metric"), t("x.value"), t("x.note")],
    [t("x.mTotal"), T.pkdw, t("x.mTotalN")],
    ["Station PKDW (MH)", T.spkdw, ""], ["Training PKDW (MH)", T.tpkdw, ""],
    [t("x.mPrev"), prev ? prev.st.tot.pkdw : "-", prev ? monthName(prevKey(key)) : t("x.noTab")],
    [t("x.mSites"), T.sites, t("x.mSitesN", {n: T.rows})],
    [t("ov.kpiSites"), T.dwSites, ""],
    [t("x.mAvg"), r1(T.avgPerDay), t("ov.kpiAvgSub", {n: st.lastIdx + 1})],
    ["MH PKWT", T.pkwt, "Station + Training PKWT + Back Up MOD"],
    ["Total MH", T.total, "PKDW + PKWT"],
    [t("x.mShare"), r1(T.share * 100), "PKDW ÷ Total MH"],
    [t("x.mCompliance"), r1(T.compliance * 100), t("x.mComplianceN", {m: T.missed, s: T.slots})],
  ], [34, 16, 44]);
  W.add(t("x.sSites"), [siteHead(), ...sites.map(siteRow), ["", "", "TOTAL", "", T.spkdw, T.tpkdw, T.pkdw, "", "", T.pkwt, T.total, r1(T.share * 100), T.admits, T.missed]], [5, 6, 34, 16, 13, 14, 12, 13, 22, 10, 10, 7, 10, 14]);
  W.add(t("x.sFormat"), [[t("x.code"), t("col.site"), "Format", "Station PKDW", "Training PKDW", "Total PKDW", "MH PKWT", "Total MH", "% DW", t("col.missed")], ...st.rows.map(r => [+r.code, r.cinema, r.format, r.spkdw, r.tpkdw, r.pkdw, r.pkwt, r.total, r1(r.share * 100), r.missed])], [6, 34, 10, 13, 14, 12, 10, 10, 7, 14]);
  W.add(t("x.sDailySite"), [[t("x.code"), t("col.site"), ...m.dates.map(d => d.label), "Total"], ...sites.map(s => [+s.code, s.cinema, ...s.daily, s.pkdw]), ["", "TOTAL", ...st.daily.map(d => d.pkdw), T.pkdw]], [6, 34, ...m.dates.map(() => 11), 10]);
  W.add(t("x.sDaily"), [[t("x.date"), "Station PKDW", "Training PKDW", "Total PKDW", t("x.dwSites"), t("x.rowsFilled"), t("x.rowsMissing")], ...st.daily.map(d => [d.label, d.spkdw, d.tpkdw, d.pkdw, d.dwSites, d.filled, d.due ? T.rows - d.filled : ""])], [12, 13, 14, 12, 13, 12, 15]);
  W.add(t("x.sCompliance"), [[t("col.site"), "Format", ...m.dates.map(d => d.label), t("x.totalMissing")], ...st.rows.map(r => [r.cinema, r.format, ...r.days.map((x, i) => m.dates[i].iso >= TODAY ? "" : x.filled ? "✓" : t("x.missingMark")), r.missed])], [34, 10, ...m.dates.map(() => 11), 15]);
  W.write(`Laporan_MH_DW_${fileMonth(key)}.xlsx`);
}

function exportCsv() {
  const g = getMonth(state.month); if (!g) return;
  const sites = g.st.sites.slice().sort((a, b) => +a.code - +b.code);
  const cell = v => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  save(`PKDW_59_Site_${fileMonth(state.month)}.csv`, "﻿" + [siteHead(), ...sites.map(siteRow)].map(r => r.map(cell).join(",")).join("\n"));
}

function exportTrend() {
  const {ok, sites, tot} = trendData(); if (!ok.length) return;
  const W = workbook(); if (!W) return;
  W.add(t("x.sTrendTotal"), [[t("x.month"), "Total PKDW", "Station PKDW", "Training PKDW", t("x.dwSites"), "MH PKWT", "Total MH", "% DW"], ...ok.map(k => { const x = tot(k); return [monthName(k), x.pkdw, x.spkdw, x.tpkdw, x.dwSites, x.pkwt, x.total, r1(x.share * 100)]; })], [18, 12, 13, 14, 13, 10, 10, 7]);
  W.add(t("x.sTrendSite"), [[t("x.code"), t("col.site"), ...ok.map(monthName), "Total", t("trend.avgMonth")], ...sites.map(s => [+s.code, s.cinema, ...ok.map(k => s.v[k] ?? ""), s.sum, r1(s.sum / ok.length)]), ["", "TOTAL", ...ok.map(k => tot(k).pkdw), sites.reduce((a, s) => a + s.sum, 0), ""]], [6, 34, ...ok.map(() => 14), 10, 15]);
  W.write(`Tren_PKDW_${monthShort(ok[0]).replace(" ", "")}-${monthShort(ok[ok.length - 1]).replace(" ", "")}.xlsx`);
}

function exportAlert() {
  const a = alertsRange(state.alertFrom || state.alertDate, state.alertDate); if (!a) return;
  const W = workbook(); if (!W) return;
  // Same layout as the reference file DailyWorker_Productivity.xlsx (sheets "Flagged" + "All cinemas").
  // HitDay / HitYTD (concession hit rate) are not in the Man Hour sheet, so those columns stay empty.
  // For a date range a leading "Date" column is added (one row per site per day).
  const D = a.multi ? ["Date"] : [];
  const head = [...D, "REGION", "CinemaSite", "WeekWarnings", "Productivity", "Target", "DW", "StationPKDW", "TrainingPKDW", "Admits", "ManHours", "HitDay", "HitYTD"];
  const row = r => [...(a.multi ? [r.date] : []), r.region, r.cinema, r.warn, r.prod == null ? 0 : r.prod, r.target, r.pkdw, r.spkdw, r.tpkdw, r.admits || 0, r.mh, "", ""];
  const cols = [...(a.multi ? [11] : []), 12, 32, 13, 12, 8, 6, 12, 13, 9, 10, 8, 8];
  W.add("Flagged", [head, ...a.flagged.map(row)], cols);
  W.add("All cinemas", [[...head, "Flag"], ...a.rows.map(r => [...row(r), r.flag])], [...cols, 7]);
  W.write(`DailyWorker_Productivity_${a.multi ? a.from + "_to_" + a.date : a.date}.xlsx`);
}

function exportBudget() {
  const key = state.month, r = bvaCurrent(); if (!r) return;
  const W = workbook(); if (!W) return;
  const rows = r.rows.slice().sort((a, b) => b.variance - a.variance);
  const head = [t("x.code"), t("col.site"), t("x.bMonth"), t("x.bToDate"), t("x.bActual"), t("budget.colVar"), t("budget.colUsage"), t("budget.colRemaining"), "Status", t("x.bAdmB"), t("budget.admActual"), "Δ Admits %"];
  const adm = x => r.hasAdmits ? [+(x.admitsBudgetToDate || 0).toFixed(0), x.admitsActual || 0, x.admitsVar == null ? "" : r1(x.admitsVar * 100)] : [];
  W.add("Budget vs Actual", [[t("x.bTitle", {month: monthName(key), cut: r.cut})], [t("x.bSub", {now: now()})], [], head,
    ...rows.map(x => [+x.code, x.cinema, r1(x.budgetMonth), r1(x.budgetToDate), x.actual, r1(x.variance), x.usage == null ? "" : r1(x.usage * 100), r1(x.remaining), statusLabel(x.status), ...adm(x)]),
    ["", "TOTAL", r1(r.tot.budgetMonth), r1(r.tot.budgetToDate), r.tot.actual, r1(r.tot.variance), r.tot.usage == null ? "" : r1(r.tot.usage * 100), r1(r.tot.remaining), "", ...adm(r.tot)]],
    [6, 34, 15, 16, 16, 10, 12, 16, 18, 18, 14, 11, 14, 14]);
  const ph = r.periods.flatMap(p => [`W${p.week} ${p.label} Budget`, `W${p.week} ${p.label} Actual`]);
  W.add(t("x.sWeekly"), [[t("x.code"), t("col.site"), ...ph], ...rows.map(x => [+x.code, x.cinema, ...x.periods.flatMap(p => [p.budget, p.actual])])], [6, 34, ...ph.map(() => 12)]);
  W.write(`DW_Budget_vs_Actual_${fileMonth(key)}_sd_${r.cut}.xlsx`);
}

function exportBudgetMail() {
  const r = bvaCurrent(); if (!r) return;
  const W = workbook(); if (!W) return;
  const a = Mail.attachment(r);
  a.sheets.forEach(sh => W.add(sh.name, sh.aoa, sh.cols));
  W.write(a.filename);
}

/** data-act value → handler */
export const ACTIONS = {xlsx: exportMonth, csv: exportCsv, "trend-xlsx": exportTrend, "alert-xlsx": exportAlert, "budget-xlsx": exportBudget, "budget-mail-xlsx": exportBudgetMail};

// Productivity Alert email — always English (it goes to Regional Managers and cinemas).
import { esc } from "../ui/dom.js";
import { dateEN, f1, fInt } from "../format.js";

const EN_DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const asD = iso => new Date(iso + "T00:00:00");
const dayName = iso => EN_DAY[asD(iso).getDay()];
const wkStart = iso => { const d = asD(iso); return `${EN_DAY[d.getDay()].slice(0, 3)} ${String(d.getDate()).padStart(2, "0")} ${EN_MON[d.getMonth()]}`; };
// Footnote — same wording as the reference e-mail.
const foot = a => a.multi
  ? `Productivity = Admits / total man-hours. Target is 14 (12 for protected cinemas); actual within ${a.tolerance} point of target is acceptable. Each row is one day. <b>Warnings this week</b> = how many days in that day's fiscal week (Wednesday to Tuesday) up to and including that day the cinema was flagged, so a repeat count is a pattern, not one bad day. Automated reminder.`
  : `Productivity = Admits / total man-hours. Target is 14 (12 for protected cinemas); actual within ${a.tolerance} point of target is acceptable. <b>Warnings this week</b> = how many days in the running week (from ${wkStart(a.window[0])}) up to and including ${dayName(a.date)} this cinema was flagged - the fiscal week runs Wednesday to Tuesday, so a repeat count is a pattern, not one bad day. Previous-day figures only. Automated reminder.`;
const dShortEN = iso => { const d = asD(iso); return `${EN_DAY[d.getDay()].slice(0, 3)} ${d.getDate()} ${EN_MON[d.getMonth()]}`; };
const when = a => a.multi ? `<b>${dateEN(a.from)}</b> to <b>${dateEN(a.date)}</b>` : `<b>${dateEN(a.date)}</b>`;
const whenTxt = a => a.multi ? `${dateEN(a.from)} to ${dateEN(a.date)}` : dateEN(a.date);
export { dShortEN };

const dwTxt = r => `${fInt(r.pkdw)} (${fInt(r.spkdw)} + ${fInt(r.tpkdw)}${r.kpkdw ? " + " + fInt(r.kpkdw) + " kiosk" : ""})`;
export { dwTxt };

const greet = a => a.region ? `Dear ${a.region.replace(/^REGION/i, "Region")} Regional Manager and Cinema teams,` : "Dear Regional Managers and Cinema teams,";

export function mailHTML(a) {
  const th = 'style="background:#4a5785;color:#ffffff;padding:8px 10px;border:1px solid #9aa3c0;font-weight:bold;text-align:center"';
  const td = (v, al = "left", extra = "") => `<td style="padding:6px 10px;border:1px solid #c9cdd8;text-align:${al};${extra}">${v}</td>`;
  const warnC = "color:#d9622b;font-weight:bold";
  const rows = a.flagged.map(r => `<tr>${a.multi ? td(dShortEN(r.date), "left", "white-space:nowrap") : ""}${td(esc(r.region))}${td(esc(r.cinema))}${td(r.warn + "x this week", "center", warnC)}${td(f1(r.prod), "center", warnC)}${td(r.target, "center")}${td(dwTxt(r), "center")}${td(fInt(r.admits), "right")}${td(fInt(r.mh), "right")}</tr>`).join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
<p>${greet(a)}</p>
<p>The cinemas below used <b>daily-worker man-hours</b> on ${when(a)} while their <b>productivity fell short of target</b> (beyond the ±${a.tolerance} tolerance). Please review the daily-worker usage against the productivity outcome for these sites.</p>
<table style="border-collapse:collapse;font-size:13px">
<tr>${a.multi ? `<th ${th}>Date</th>` : ""}<th ${th}>Region</th><th ${th}>Cinema</th><th ${th}>Warnings<br>this week</th><th ${th}>Productivity</th><th ${th}>Target</th><th ${th}>Daily-worker hrs<br>(Station + Training)</th><th ${th}>Admits</th><th ${th}>Total MH</th></tr>
${rows}
</table>
<p style="font-size:12px;color:#8a8f99">${foot(a)}</p>
</div>`;
}

export function mailText(a) {
  const lines = a.flagged.map((r, i) => `${i + 1}. ${a.multi ? dShortEN(r.date) + " | " : ""}${r.region} | ${r.cinema} | ${r.warn}x this week | Prod ${f1(r.prod)} vs target ${r.target} | DW ${dwTxt(r)} hrs | Admits ${fInt(r.admits)} | Total MH ${fInt(r.mh)}`);
  return `${greet(a)}\n\nThe cinemas below used daily-worker man-hours on ${whenTxt(a)} while their productivity fell short of target (beyond the ±${a.tolerance} tolerance). Please review the daily-worker usage against the productivity outcome for these sites.\n\n${lines.join("\n")}\n\n${foot(a).replace(/<\/?b>/g, "")}`;
}

/** Subject line, e.g. "Reminder: daily-worker usage vs productivity - 15 Oct 2026" or "... - 16-18 Oct 2026". */
export function mailSubject(a) {
  const p = iso => { const d = asD(iso); return {d: d.getDate(), m: EN_MON[d.getMonth()], y: d.getFullYear()}; };
  const t = p(a.date);
  let when = `${t.d} ${t.m} ${t.y}`;
  if (a.multi) {
    const f = p(a.from);
    when = f.y !== t.y ? `${f.d} ${f.m} ${f.y} - ${when}` : f.m !== t.m ? `${f.d} ${f.m} - ${when}` : `${f.d}-${when}`;
  }
  return `Reminder: daily-worker usage vs productivity - ${when}${a.region ? " - " + a.region.replace(/^REGION/i, "Region") : ""}`;
}

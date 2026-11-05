// Productivity Alert — sites that used DW while productivity < target − tolerance.
import { t } from "../i18n.js";
import { fmt, dateLong, dateShort, dateEN, f1, TODAY, YESTERDAY } from "../format.js";
import { esc, ICON, on, hud, copyRich, copyText } from "../ui/dom.js";
import { header, kpi, kpis, notice, notes, segmented, btn, tag } from "../ui/components.js";
import { alertsRange, store } from "../store.js";
import { state } from "../state.js";
import { mailHTML, mailText, dwTxt, mailSubject } from "./alert-mail.js";
import { reasonBtn } from "./reasons.js";

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
/** Most recent Sunday up to yesterday, and the Friday before it. */
const weekendTo = () => { let d = YESTERDAY; while (new Date(d + "T00:00:00").getDay() !== 0) d = addDays(d, -1); return d; };
const weekendFrom = () => addDays(weekendTo(), -2);

export default {
  id: "alert",
  render(c, app) {
    const to = state.alertDate, from = state.alertFrom && state.alertFrom <= to ? state.alertFrom : to, title = t("nav.alert");
    const preset = from === to && to === YESTERDAY ? "y" : (from === weekendFrom() && to === weekendTo()) ? "we" : (from === addDays(YESTERDAY, -6) && to === YESTERDAY) ? "7" : "";
    const tools = `<label class="muted" for="alFrom" style="font-size:var(--t-subhead)">${t("alert.from")}</label><input type="date" class="datefield" id="alFrom" value="${from}" max="${TODAY}" aria-label="${esc(t("alert.from"))}">
      <label class="muted" for="alDate" style="font-size:var(--t-subhead)">${t("alert.to")}</label><input type="date" class="datefield" id="alDate" value="${to}" max="${TODAY}" aria-label="${esc(t("alert.to"))}">`;
    const presets = segmented("apre", preset, [["y", t("common.yesterday")], ["we", t("alert.pWeekend")], ["7", t("alert.p7")]], t("alert.range"));
    const a = alertsRange(from, to);
    const wireDate = () => {
      on(c, "#alFrom", "change", el => { if (el.value) { state.alertFrom = el.value; if (el.value > state.alertDate) state.alertDate = el.value; app.rerender(); } });
      on(c, "#alDate", "change", el => { if (el.value) { state.alertDate = el.value; if (el.value < (state.alertFrom || el.value)) state.alertFrom = el.value; app.rerender(); } });
      on(c, "[data-apre]", "click", b => {
        const k = b.dataset.apre;
        if (k === "y") { state.alertFrom = state.alertDate = YESTERDAY; }
        if (k === "we") { state.alertFrom = weekendFrom(); state.alertDate = weekendTo(); }
        if (k === "7") { state.alertFrom = addDays(YESTERDAY, -6); state.alertDate = YESTERDAY; }
        app.rerender();
      });
    };
    const rangeLabel = from === to ? dateLong(to) : `${dateLong(from)} – ${dateLong(to)}`;
    if (!a) { c.innerHTML = header(title, rangeLabel, tools) + `<div class="row">${presets}</div>` + notice(t("alert.noDate"), t("alert.noDateSub")); wireDate(); return; }

    // Email per region (admin only): the preview and copy buttons follow the chosen region.
    const regs = [...new Set(a.flagged.map(r => r.region))].sort((x, y) => x.localeCompare(y, undefined, {numeric: true}));
    const admin = store.access && store.access.scope === "ALL";
    const mReg = admin && regs.includes(state.alertMailRegion) ? state.alertMailRegion : "";
    const am = mReg ? {...a, flagged: a.flagged.filter(r => r.region === mReg), region: mReg} : a;
    const F = a.flagged, dwSum = F.reduce((s, r) => s + r.pkdw, 0);
    const fSites = new Set(F.map(r => r.code)).size;
    const heavy = new Set(F.filter(r => r.warn >= 5).map(r => r.code)).size;
    const dwUsers = new Set(a.rows.filter(r => r.pkdw > 0).map(r => r.code)).size;
    const nSites = new Set(a.rows.map(r => r.code)).size;
    const list = state.alertMode === "flagged" ? F : a.rows;
    const M = a.multi;
    const T = store.targets;
    const caveats = [];
    if (!T) caveats.push([t("alert.noTargets"), t("alert.noTargetsSub")]);
    if (a.noTarget.length) caveats.push([t("alert.noTarget", {n: a.noTarget.length}), t("alert.noTargetSub", {list: a.noTarget.map(r => esc(r.cinema)).join(", "), d: (T && T.defaultTarget) || 14})]);
    if (a.missingDates.length) caveats.push([t("alert.missingDates", {n: a.missingDates.length}), a.missingDates.map(d => dateShort(d)).join(", ")]);
    if (a.missingWindow.length) caveats.push([t("alert.window"), t("alert.windowSub", {list: a.missingWindow.join(", ")})]);
    const missAdm = F.filter(r => r.admitsMissing);
    if (missAdm.length) caveats.push([t("alert.admits", {n: missAdm.length}), t("alert.admitsSub", {list: missAdm.map(r => esc(r.cinema)).join(", ")})]);

    c.innerHTML = header(title, `${rangeLabel} · ${t("alert.sub", {tol: a.tolerance})}`,
        tools + btn(t("common.downloadExcel"), {act: "alert-xlsx", icon: ICON.down}) + btn(t("alert.copyMail"), {id: "copyMail", filled: true, icon: ICON.copy})) +
      `<div class="row">${presets}${M ? `<span class="muted" style="font-size:var(--t-subhead)">${t("alert.rangeInfo", {n: a.dates.length})}</span>` : ""}</div>` +
      notes(caveats) +
      kpis(
        kpi({label: t("alert.flagged"), icon: ICON.warn, tint: "orange", tone: F.length ? "warn" : "good", value: M ? fSites : F.length, unit: t("alert.flaggedUnit", {n: dwUsers}), sub: M ? t("alert.flaggedSubRange", {n: F.length, d: a.dates.length}) : t("alert.flaggedSub", {n: nSites})}),
        kpi({label: t("alert.dwHours"), icon: ICON.person, value: fmt(dwSum), unit: "MH", sub: t("common.stationTraining", {s: fmt(F.reduce((s, r) => s + r.spkdw, 0)), tr: fmt(F.reduce((s, r) => s + r.tpkdw, 0))})}),
        kpi({label: t("alert.heavy"), icon: ICON.calendar, tint: "red", value: heavy, unit: t("unit.sites"), sub: M ? t("alert.heavyRange") : t("alert.window7", {from: dateShort(a.window[0]), to: dateShort(a.date)})}),
      ) + `
      <div class="row">${segmented("amode", state.alertMode, [["flagged", t("alert.mFlagged", {n: F.length})], ["all", t("alert.mAll", {n: a.rows.length})]])}<span class="spacer"></span><button class="btn plain" id="copyText" type="button">${t("alert.copyWa")}</button></div>
      <div class="table-wrap"><table>
        <thead><tr>${M ? `<th>${t("x.date")}</th>` : ""}<th>Region</th><th>Cinema</th><th class="r">${t("alert.colWarn")}</th><th class="r">Productivity</th><th class="r">Target</th><th class="r">${t("alert.colDw")}</th><th class="r">Admits</th><th class="r">Total MH</th><th>Status</th><th>Reason</th></tr></thead>
        <tbody>${list.map(r => `<tr class="click" data-site="${r.code}" data-month="${r.date.slice(0, 7)}" data-tip="${esc(r.cinema)}|${r.warn ? t("alert.tipWarn", {list: r.warnDates.map(d => d.slice(8) + "/" + d.slice(5, 7)).join(", ")}) : t("alert.tipNone")}">
          ${M ? `<td style="white-space:nowrap">${dateShort(r.date)}</td>` : ""}<td>${esc(r.region)}</td><td class="site"><b>${esc(r.cinema)}</b>${r.admitsMissing ? tag(t("alert.admitsEmpty"), "orange") : ""}</td>
          <td class="r">${r.warn ? tag(t("alert.warnN", {n: r.warn}), r.warn >= 5 ? "red" : "orange") : `<span class="muted">0</span>`}</td>
          <td class="r" style="${r.prod != null && r.prod < r.target - a.tolerance ? "color:var(--orange-text);font-weight:600" : ""}">${f1(r.prod)}</td>
          <td class="r">${r.target}${r.hasTarget ? "" : "*"}</td><td class="r">${r.pkdw ? dwTxt(r) : `<span class="muted">0</span>`}</td>
          <td class="r">${r.admits == null ? "–" : fmt(r.admits)}</td><td class="r">${fmt(r.mh)}</td>
          <td>${r.flag ? tag("Flagged", "red") : r.pkdw > 0 ? tag(t("alert.onTarget"), "green") : `<span class="muted">${t("alert.noDw")}</span>`}</td>
          <td>${r.pkdw > 0 ? reasonBtn({site: r.code, cinema: r.cinema, date: r.date, context: "alert"}) : ""}</td></tr>`).join("") || `<tr><td colspan="${M ? 11 : 10}" class="muted">${(M ? t("alert.noneFlaggedRange") : t("alert.noneFlagged"))}</td></tr>`}</tbody>
      </table></div>
      <h2 class="section-head">${t("alert.preview")}</h2>
      <p class="foot" style="margin-top:-8px">${t("alert.previewNote")}</p>
      ${admin && regs.length > 1 ? `<div class="row">${segmented("amreg", mReg, [["", t("alert.mailAll")], ...regs.map(g => [g, g.replace(/^REGION/, "Region")])], t("alert.mailFor"))}</div>` : ""}
      <div class="row" style="margin-top:-4px"><span style="font-size:var(--t-subhead)"><span class="muted">Subject:</span> <b id="alSubj">${esc(mailSubject(am))}</b></span><span class="spacer"></span>${btn(t("alert.copySubject"), {id: "copySubj", icon: ICON.copy})}</div>
      <div class="mail-paper">${am.flagged.length ? mailHTML(am) : `<p style="font-family:Arial;color:#555">No cinemas need a reminder for ${M ? dateEN(a.from) + " to " + dateEN(a.date) : dateEN(a.date)}.</p>`}</div>
      <p class="foot">${t("alert.foot", {tol: a.tolerance})}</p>`;

    wireDate();
    on(c, "[data-amode]", "click", b => { state.alertMode = b.dataset.amode; app.rerender(); });
    on(c, "[data-amreg]", "click", b => { state.alertMailRegion = b.dataset.amreg; app.rerender(); });
    on(c, "#copyMail", "click", () => { if (!am.flagged.length) { hud(t("alert.nothing")); return; } copyRich(mailHTML(am), mailText(am), t("alert.mailCopied")); });
    on(c, "#copySubj", "click", () => copyText(mailSubject(am), t("alert.subjectCopied")));
    on(c, "#copyText", "click", () => copyText(mailText(am), t("toast.textCopied")));
  },
};

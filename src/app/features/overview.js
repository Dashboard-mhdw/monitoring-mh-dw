// Ringkasan / Overview — where we stand right now: month status, daily chart, map and top sites.
import { t } from "../i18n.js";
import { reasons } from "../reasons.js";
import { fmt, pct, f1, monthName, prevKey, dateLong, dateShort, YESTERDAY, rp } from "../format.js";
import { esc, ICON } from "../ui/dom.js";
import { header, btn, notice, notes, legend, tag } from "../ui/components.js";
import { columnChart } from "../ui/charts.js";
import { mapBox, mountMap } from "../ui/map.js";
import { getMonth, missingOn, alertsOn, budgetVsActual, store } from "../store.js";
import { state } from "../state.js";
import { futureNote } from "./shared.js";
import { cutFor } from "./budget.js";
import { openSite } from "./site-detail.js";

/** One status tile: big number, one plain sentence, link to the page that explains it. */
const tile = ({tone = "", icon, label, value, unit = "", line, go, sub}) =>
  `<button type="button" class="stile ${tone}" data-go="${go}"${sub ? ` data-sub="${sub}"` : ""}>
    <span class="st-k">${icon}${label}</span>
    <span class="st-v">${value}${unit ? `<small> ${unit}</small>` : ""}</span>
    <span class="st-s">${line}</span><span class="st-go">${t("ov.open")} ›</span></button>`;

export default {
  id: "overview",
  render(c, app) {
    const key = state.month, cur = getMonth(key), prev = getMonth(prevKey(key));
    const title = t("nav.overview");
    if (!cur) { c.innerHTML = header(title, monthName(key)) + notice(t("common.noTab", {month: monthName(key)})); return; }
    const {m, st} = cur, T = st.tot;
    const last = st.lastIdx >= 0 ? m.dates[st.lastIdx] : null;
    const TG = (store.targets && store.targets.sites) || {};

    // 1 · PKDW vs same days last month
    let pkdwLine = t("ov.lnSites", {n: T.dwSites, s: T.sites});
    if (prev && st.lastIdx >= 0) {
      const n = st.lastIdx + 1, same = prev.st.daily.slice(0, n).reduce((a, d) => a + d.pkdw, 0);
      if (same > 0) { const d = T.pkdw / same - 1; pkdwLine = (d > 0 ? t("ov.lnUp", {p: pct(Math.abs(d), 0), n}) : t("ov.lnDown", {p: pct(Math.abs(d), 0), n})) + " · " + pkdwLine; }
    }
    // 2 · Budget pace (only when unlocked budget exists for this month)
    const b = store.budget ? budgetVsActual(key, cutFor(key), reasons.transfers) : null;
    const bT = b && b.tot;
    const bTone = !bT ? "" : bT.amountActual > bT.amountMonth ? "bad" : bT.amountActual > bT.amountToDate * 1.0001 ? "warn" : "good";
    // 3 · Yesterday
    const al = alertsOn(YESTERDAY), miss = missingOn(YESTERDAY);
    const nFlag = al ? al.flagged.length : 0, nMiss = miss ? miss.bySite.size : 0;

    const avg = T.avgPerDay;
    const chart = columnChart(st.daily.map((d, i) => ({
      value: d.pkdw, cls: i > st.lastIdx ? "dim" : (d.pkdw > avg * 1.4 ? "hl" : ""),
      tick: (d.day === 1 || d.day % 5 === 0) ? String(d.day) : "",
      tip: `${dateLong(d.iso)}|${t("ov.tipPkdw", {v: fmt(d.pkdw), s: fmt(d.spkdw), tr: fmt(d.tpkdw)})}|${t("ov.tipSites", {n: d.dwSites, f: d.filled, r: T.rows})}`,
    })), {W: 540, H: 330, avg, avgLabel: t("chart.avg"), aria: t("ov.daily")});

    const sites = st.sites.map(s => ({...s, region: (TG[s.code] || {}).region || "", target: (TG[s.code] || {}).target || 14, prod: s.total ? s.admits / s.total : null}));
    const top = sites.slice().filter(s => s.pkdw > 0).sort((a, b2) => b2.pkdw - a.pkdw).slice(0, 10), topMax = Math.max(1, ...top.map(s => s.pkdw));
    const maxP = Math.max(1, ...sites.map(s => s.pkdw));
    const regionRows = (() => { const g = new Map(); sites.forEach(s => { const k = s.region || "–"; g.set(k, (g.get(k) || 0) + s.pkdw); });
      return [...g.entries()].sort((x, y) => x[0].localeCompare(y[0], undefined, {numeric: true})); })();
    const regMax = Math.max(1, ...regionRows.map(r => r[1]));
    const admin = !store.access || store.access.scope === "ALL";

    c.innerHTML = header(title, t("ov.sub", {month: monthName(key), last: last ? dateLong(last.iso) : "–"}),
        btn(t("ov.download"), {act: "xlsx", icon: ICON.down})) +
      notes(futureNote(st)) + `
      <h2 class="section-head">${t("ov.now")}</h2>
      <div class="stiles">
        ${tile({icon: ICON.person, label: t("ov.tPkdw", {m: monthName(key)}), value: fmt(T.pkdw), unit: "MH", line: pkdwLine, go: "sites"})}
        ${bT ? tile({tone: bTone, icon: ICON.budget, label: t("ov.tBudget"), value: rp(bT.amountActual), unit: "/ " + rp(bT.amountMonth),
            line: bTone === "good" ? t("ov.bOk", {left: rp(bT.amountRemaining)}) : bTone === "warn" ? t("ov.bAhead", {v: rp(bT.amountActual - bT.amountToDate)}) : t("ov.bOver"), go: "budget"})
          : tile({icon: ICON.budget, label: t("ov.tBudget"), value: "–", line: t("ov.bNone"), go: "budget"})}
        ${tile({tone: nFlag ? "bad" : "good", icon: ICON.alert, label: t("ov.tAlert"), value: nFlag, unit: t("unit.sites"),
            line: nFlag ? t("ov.alertLine", {d: dateShort(YESTERDAY), list: esc(al.flagged.slice(0, 2).map(r => r.cinema.replace(/^\d+-/, "")).join(", ")) + (nFlag > 2 ? "…" : "")}) : t("ov.alertNone", {d: dateShort(YESTERDAY)}), go: "check", sub: "alert"})}
        ${tile({tone: nMiss ? "warn" : "good", icon: ICON.checklist, label: t("ov.tMiss"), value: nMiss, unit: t("unit.sites"),
            line: nMiss ? t("ov.missLine", {d: dateShort(YESTERDAY), list: esc([...miss.bySite.values()].slice(0, 2).map(r => r[0].name).join(", ")) + (nMiss > 2 ? "…" : "")}) : t("ov.missNone", {d: dateShort(YESTERDAY)}), go: "check", sub: "h1"})}
      </div>
      <div class="grid-2 even">
        <div class="card chart">
          <div class="card-head"><h2>${t("ov.daily")}</h2>${legend([["var(--blue)", "PKDW"], ["var(--orange)", t("ov.legendHigh")]])}</div>
          ${chart}
          <p class="foot" style="margin:0">${t("ov.dailyFoot", {avg: fmt(avg), n: st.lastIdx + 1})}</p>
        </div>
        <div class="card mapcard"><div class="card-head"><h2>${t("ov.mapTitle")}</h2>${legend([["var(--red)", t("ov.lgHigh")], ["var(--orange)", t("ov.lgMid")], ["var(--blue)", t("ov.lgLow")], ["var(--map-pin-off)", t("ov.lgNone")]])}</div>${mapBox("ovMap", 340)}</div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>${t("ov.top10")}</h2><button class="btn plain" type="button" data-go="sites">${t("ov.allSites")} ›</button></div>
          <div class="toplist">${top.map((s, i) => `<button type="button" class="toprow" data-site="${s.code}">
            <span class="tr-n">${i + 1}</span>
            <span class="tr-t"><b>${esc(s.cinema)}</b><small>${esc((s.region || "").replace(/^REGION/, "Region"))} · ${t("ov.dwDays", {n: s.dwDays})} · prod ${f1(s.prod)}${s.prod != null && s.prod < s.target - 1 ? " " + tag(t("ov.belowTarget"), "orange") : ""}</small></span>
            <span class="tr-bar"><i style="width:${(s.pkdw / topMax * 100).toFixed(1)}%"></i></span>
            <span class="tr-v">${fmt(s.pkdw)} <small>MH</small></span></button>`).join("") || `<p class="muted">${t("ov.noDw")}</p>`}</div>
        </div>
        ${admin && regionRows.length > 1 ? `<div class="card">
          <div class="card-head"><h2>${t("ov.byRegion")}</h2></div>
          <div class="hbars">${regionRows.map(([r, v]) => `<div class="hbar"><span class="t">${esc(r.replace(/^REGION/, "Region"))}</span><span class="v">${fmt(v)}</span><span class="track"><i style="width:${(v / regMax * 100).toFixed(1)}%"></i></span></div>`).join("")}</div>
          <p class="foot" style="margin:0">${t("ov.regionFoot")}</p>
        </div>` : `<div class="card"><div class="card-head"><h2>${t("ov.fillTitle")}</h2><button class="btn plain" type="button" data-go="map">${t("ov.mapLink")} ›</button></div>
          <div class="statusrow"><div class="ring" style="--p:${Math.round(T.compliance * 100)};--c:${T.compliance >= .95 ? "var(--green)" : T.compliance >= .85 ? "var(--orange)" : "var(--red)"}" data-v="${Math.round(T.compliance * 100)}%"></div>
          <div class="txt"><b>${t("ov.compliance")}</b><span>${t("ov.complianceSub", {m: fmt(T.missed), s: fmt(T.slots)})}</span></div></div></div>`}
      </div>`;

    const pts = sites.map(s => {
      const g = TG[s.code] || {}, r = s.pkdw / maxP;
      return {code: s.code, name: s.cinema, lat: g.lat, lng: g.lng, size: s.pkdw ? 0.15 + r * 0.85 : 0,
        tone: !s.pkdw ? "gray" : r >= 0.5 ? "red" : r >= 0.2 ? "orange" : "blue",
        lines: [`${esc((s.region || "").replace(/^REGION/, "Region"))} · ${esc(g.city || "")}`, `PKDW ${fmt(s.pkdw)} MH · ${t("ov.dwDays", {n: s.dwDays})}`, `Prod ${f1(s.prod)} / target ${s.target}`],
        onClick: () => openSite(s.code, key)};
    });
    mountMap(c.querySelector("#ovMap"), pts);
  },
};

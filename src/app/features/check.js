// Cek Harian — Productivity Alert + Cek Pengisian H-1 in one page, with a status map of every site.
import { t } from "../i18n.js";
import { fmt, f1, dateLong, YESTERDAY } from "../format.js";
import { esc, ICON, on } from "../ui/dom.js";
import { header, kpi, kpis, segmented, legend } from "../ui/components.js";
import { mapBox, mountMap } from "../ui/map.js";
import { alertsRange, missingOn, store } from "../store.js";
import { state } from "../state.js";
import { openSite } from "./site-detail.js";
import alertView from "./alert.js";
import h1View from "./h1.js";

export default {
  id: "check",
  render(c, app) {
    const tab = state.checkTab === "h1" ? "h1" : "alert";
    const to = state.alertDate, from = state.alertFrom && state.alertFrom <= to ? state.alertFrom : to;
    const a = alertsRange(from, to), miss = missingOn(state.h1Date);
    const T = (store.targets && store.targets.sites) || {};
    const flagged = new Map(), users = new Map();
    (a ? a.rows : []).forEach(r => { if (r.flag) flagged.set(r.code, (flagged.get(r.code) || []).concat(r)); else if (r.pkdw > 0) users.set(r.code, r); });
    const missing = miss ? miss.bySite : new Map();
    const codes = Object.keys(T).filter(cd => !store.access || store.access.scope === "ALL" || T[cd].region === store.access.scope);

    const points = codes.map(cd => {
      const s = T[cd], fl = flagged.get(cd), ms = missing.get(cd), us = users.get(cd);
      const name = (fl && fl[0].cinema) || (ms && ms[0].cinema) || (us && us.cinema) || `${cd}-${s.name || ""}`;
      let tone = "gray", lines = [esc(s.region || "")];
      if (tab === "alert") {
        if (fl) { tone = "red"; lines.push(t("check.pinFlag", {n: fl.length, p: f1(fl[fl.length - 1].prod), tg: fl[0].target, dw: fmt(fl.reduce((x, r) => x + r.pkdw, 0))})); }
        else if (us) { tone = "green"; lines.push(t("check.pinOk", {p: f1(us.prod), tg: us.target})); }
        else lines.push(t("check.pinNoDw"));
      } else {
        if (ms) { tone = "orange"; lines.push(t("check.pinMissing", {n: Math.max(...ms.map(x => x.monthMiss))})); }
        else { tone = "green"; lines.push(t("check.pinFilled")); }
      }
      return {code: cd, name, lat: s.lat, lng: s.lng, tone, lines, size: tone === "red" ? .4 : tone === "orange" ? .25 : 0, onClick: () => openSite(cd, (tab === "h1" ? state.h1Date : to).slice(0, 7))};
    });

    const nFlag = flagged.size, nMiss = missing.size;
    c.innerHTML = header(t("nav.check"), t("check.sub")) +
      kpis(
        kpi({label: t("check.kFlag"), icon: ICON.warn, tint: "red", tone: nFlag ? "bad" : "good", value: nFlag, unit: t("unit.sites"), sub: from === to ? dateLong(to) : `${dateLong(from)} – ${dateLong(to)}`}),
        kpi({label: t("check.kMiss"), icon: ICON.checklist, tint: "orange", tone: nMiss ? "warn" : "good", value: nMiss, unit: t("unit.sites"), sub: dateLong(state.h1Date)}),
        kpi({label: t("check.kDw"), icon: ICON.person, value: fmt([...flagged.values()].flat().reduce((x, r) => x + r.pkdw, 0) + [...users.values()].reduce((x, r) => x + r.pkdw, 0)), unit: "MH", sub: t("check.kDwSub", {n: flagged.size + users.size})}),
      ) + `
      <div class="row">${segmented("ctab", tab, [["alert", `${t("check.tAlert")} (${nFlag})`], ["h1", `${t("check.tH1")} (${nMiss})`]], t("nav.check"))}</div>
      <div class="card mapcard"><div class="card-head"><h2>${tab === "alert" ? t("check.mapAlert") : t("check.mapH1")}</h2>${legend(tab === "alert"
        ? [["var(--red)", t("check.lgFlag")], ["var(--green)", t("check.lgOk")], ["var(--label-3)", t("check.lgNoDw")]]
        : [["var(--orange)", t("check.lgMiss")], ["var(--green)", t("check.lgFilled")]])}</div>${mapBox("checkMap", 360)}</div>
      <div class="subpage" id="checkSub"></div>`;
    const sub = c.querySelector("#checkSub");
    (tab === "alert" ? alertView : h1View).render(sub, app);
    on(c, "[data-ctab]", "click", b => { state.checkTab = b.dataset.ctab; app.rerender(); });
    mountMap(c.querySelector("#checkMap"), points);
  },
};

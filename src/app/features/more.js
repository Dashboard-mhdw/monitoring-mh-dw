// Lainnya / More — phone-only hub: remaining pages + settings (language, theme), iOS Settings style.
import { t, getLang } from "../i18n.js";
import { ICON, on, esc } from "../ui/dom.js";
import { store } from "../store.js";
import { header, segmented } from "../ui/components.js";
import { state } from "../state.js";
import { SHEET_URL } from "./shared.js";

const PAGES = [["daily", "blue", ICON.table], ["reasons", "blue", ICON.note], ["budget", "green", ICON.budget], ["trend", "indigo", ICON.trend], ["map", "orange", ICON.map]];

export default {
  id: "more",
  render(c, app) {
    c.innerHTML = header(t("nav.more")) + `
      <h2 class="section-head">${t("more.reports")}</h2>
      <ul class="list">${PAGES.map(([v, col, ic]) => `<li class="clickable" data-go="${v}"><span class="ic ${col}">${ic}</span><span class="main-t"><b>${t("nav." + v)}</b></span><span class="trail">${ICON.chev}</span></li>`).join("")}
        <li class="clickable" data-href="${SHEET_URL}"><span class="ic green">${ICON.sheet}</span><span class="main-t"><b>${t("nav.sheet")}</b></span><span class="trail">↗</span></li></ul>
      <h2 class="section-head">${t("more.settings")}</h2>
      <ul class="list">
        <li><span class="ic blue">${ICON.globe}</span><span class="main-t"><b>${t("more.language")}</b></span>${segmented("lang", getLang(), [["id", "Indonesia"], ["en", "English"]], t("more.language"))}</li>
        <li><span class="ic indigo">${ICON.moon}</span><span class="main-t"><b>${t("more.theme")}</b></span>${segmented("thm", state.theme, [["auto", t("theme.auto")], ["light", t("theme.light")], ["dark", t("theme.dark")]], t("more.theme"))}</li>
        ${store.access ? `<li class="clickable" data-act="logout"><span class="ic red">${ICON.lock}</span><span class="main-t"><b>${t("lock.signOut")}</b><span class="muted">${esc(store.access.label)}</span></span></li>` : ""}
      </ul>`;
    on(c, "[data-href]", "click", el => window.open(el.dataset.href, "_blank", "noopener"));
  },
};

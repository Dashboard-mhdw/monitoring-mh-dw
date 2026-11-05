// UI state — what the user is looking at. Persisted bits: view and theme.
import { YESTERDAY } from "./format.js";

export const VIEWS = ["overview", "check", "budget", "sites", "trend", "reasons", "map", "more"];
/** Views whose content depends on the month picker. */
export const MONTH_VIEWS = ["overview", "sites", "map", "budget", "reasons"];

/** Monday → Friday (covers Fri–Sun); other days → yesterday. */
export function defaultAlertFrom() {
  const d = new Date(YESTERDAY + "T00:00:00");
  if (new Date().getDay() === 1) d.setDate(d.getDate() - 2);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export const state = {
  view: "overview",
  checkTab: "alert",               // Cek Harian: "alert" | "h1"
  siteView: "month",               // Site: "month" | "daily"
  month: YESTERDAY.slice(0, 7),
  h1Date: YESTERDAY,
  alertDate: YESTERDAY,          // "sampai"
  alertFrom: defaultAlertFrom(),  // "dari" — on Monday: Friday, so the weekend is covered
  alertMode: "flagged",
  alertMailRegion: "",
  budgetRegion: "",               // admin: region card selected on the Budget page            // "" = one email to all regions; "REGION n" = only that region (admin)
  siteFilter: "all",
  q: "",
  perFormat: false,
  sort: {k: "pkdw", dir: -1},
  trendN: 6,
  budgetCut: null,
  budgetFilter: "active",
  reasonCtx: "all",
  reasonQ: "",
  theme: "auto",
};

try {
  const v = localStorage.getItem("mhdw.view"); if (VIEWS.includes(v)) state.view = v;
  const th = localStorage.getItem("mhdw.theme"); if (["auto", "light", "dark"].includes(th)) state.theme = th;
} catch (e) {}

export function persist() {
  try { localStorage.setItem("mhdw.view", state.view); localStorage.setItem("mhdw.theme", state.theme); } catch (e) {}
}
export function applyTheme() {
  const r = document.documentElement;
  if (state.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", state.theme);
}

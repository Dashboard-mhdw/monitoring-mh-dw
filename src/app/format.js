// Formatting & date helpers. Everything user-facing goes through the active locale.
import { locale, cal } from "./i18n.js";

export const pad = n => String(n).padStart(2, "0");
export const isoOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

const today = new Date(); today.setHours(0, 0, 0, 0);
const yest = new Date(today); yest.setDate(today.getDate() - 1);
export const TODAY = isoOf(today);
export const YESTERDAY = isoOf(yest);

export const fmt = (n, d = 0) => (n == null || isNaN(n)) ? "–"
  : Number(n).toLocaleString(locale(), {minimumFractionDigits: d, maximumFractionDigits: d});
export const pct = (n, d = 1) => fmt(n * 100, d) + "%";
export const signed = (n, d = 0) => (n > 0 ? "+" : "") + fmt(n, d);

export const monthName = k => { const [y, m] = k.split("-"); return cal().months[+m - 1] + " " + y; };
export const monthShort = k => { const [y, m] = k.split("-"); return cal().monthsShort[+m - 1] + " " + y.slice(2); };
export const monthOnly = k => cal().months[+k.slice(5, 7) - 1];
export const prevKey = k => { let [y, m] = k.split("-").map(Number); m--; if (!m) { m = 12; y--; } return y + "-" + pad(m); };
export const monthEnd = k => { const [y, m] = k.split("-").map(Number); return k + "-" + pad(new Date(Date.UTC(y, m, 0)).getUTCDate()); };

const asDate = iso => new Date(iso + "T00:00:00");
export const dateLong = iso => { const d = asDate(iso), c = cal(); return `${c.days[d.getDay()]}, ${d.getDate()} ${c.months[d.getMonth()]} ${d.getFullYear()}`; };
export const dateShort = iso => { const d = asDate(iso); return `${d.getDate()} ${cal().monthsShort[d.getMonth()]}`; };
export const stamp = ts => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getDate()} ${cal().monthsShort[d.getMonth()]} ${d.toLocaleTimeString(locale(), {hour: "2-digit", minute: "2-digit"})}`;
};

// Fixed English — the Productivity Alert email always goes out in English.
const EN_DAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const EN_MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const dateEN = iso => { const d = asDate(iso); return `${EN_DAY[d.getDay()]}, ${d.getDate()} ${EN_MON[d.getMonth()]} ${d.getFullYear()}`; };
export const dateShortEN = iso => { const d = asDate(iso); return `${d.getDate()} ${EN_MON[d.getMonth()].slice(0, 3)}`; };
export const f1 = v => v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1);
export const fInt = v => v == null ? "–" : String(Math.round(v));

/** Compact Rupiah: Rp 9,4 jt / Rp 950 rb. */
export const rp = v => {
  if (v == null || isNaN(v)) return "–";
  const a = Math.abs(v), sg = v < 0 ? "−" : "";
  return a >= 1e9 ? `${sg}Rp ${fmt(a / 1e9, 2)} M` : a >= 1e6 ? `${sg}Rp ${fmt(a / 1e6, 1)} jt` : a >= 1e3 ? `${sg}Rp ${fmt(a / 1e3)} rb` : `${sg}Rp ${fmt(a)}`;
};

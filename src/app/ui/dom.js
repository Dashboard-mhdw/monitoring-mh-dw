// DOM utilities: lookup, escaping, HUD toast, tooltip, clipboard, icons.
import { t } from "../i18n.js";

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
export const on = (root, sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => fn(el, e)));

export function hud(msg) {
  document.querySelectorAll(".hud").forEach(h => h.remove());
  const h = document.createElement("div");
  h.className = "hud"; h.setAttribute("role", "status"); h.textContent = msg;
  document.body.appendChild(h);
  setTimeout(() => h.remove(), 2200);
}

export async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); hud(okMsg || t("toast.copied")); return true; }
  catch (e) { hud(t("toast.clipboardDenied")); return false; }
}
export async function copyRich(html, text, okMsg) {
  try {
    if (window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], {type: "text/html"}),
        "text/plain": new Blob([text], {type: "text/plain"}),
      })]);
      hud(okMsg); return;
    }
  } catch (e) { /* fall through to plain text */ }
  await copyText(text, t("toast.textCopied"));
}

/** Tooltip: any element with data-tip="Title|line|line". */
export function initTooltip() {
  const tip = $("tip");
  document.addEventListener("pointerover", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) { tip.hidden = true; return; }
    const [a, ...b] = el.getAttribute("data-tip").split("|");
    tip.innerHTML = `<b>${esc(a)}</b>${b.map(esc).join("<br>")}`;
    tip.hidden = false;
  });
  document.addEventListener("pointermove", e => {
    if (tip.hidden) return;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - h - 12;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y < 8) y = e.clientY + 16;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  document.addEventListener("pointerleave", () => { tip.hidden = true; });
  addEventListener("scroll", () => { tip.hidden = true; }, {passive: true});
}

const svg = (body, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICON = {
  lock: svg('<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>', 1.9),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
  down: svg('<path d="M12 4v12M6.5 11l5.5 5.5 5.5-5.5M5 20h14"/>', 2.2),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 3),
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'),
  building: svg('<path d="M3 21V9l9-5 9 5v12M8 21v-6h8v6"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
  pie: svg('<path d="M12 3a9 9 0 109 9h-9z"/><path d="M15 3.5A9 9 0 0120.5 9H15z"/>'),
  warn: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>', 2.2),
  refresh: svg('<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>', 2.2),
  chev: '<svg class="chev" viewBox="0 0 8 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5"/></svg>',
  grid: svg('<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>', 1.9),
  checklist: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L6.5 5M3.5 12l1.2 1.2 1.8-2.2M4 18h1.5"/>', 1.9),
  alert: svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.6v.01"/>', 1.9),
  sites: svg('<path d="M3 21V9l9-5 9 5v12"/><path d="M8 21v-6h8v6M3 21h18"/>', 1.9),
  calc: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h1M12 11h1M15.5 11h0M8.5 14.5h1M12 14.5h1M8.5 18h1M12 18h1M15.5 14.5V18"/>', 1.9),
  budget: svg('<path d="M4 20V11M10 20V6M16 20v-6"/><path d="M3 4.5h6M13 9h6" stroke-dasharray="2 2"/><path d="M2 20h20"/>', 1.9),
  trend: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', 1.9),
  map: svg('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2"/>', 1.9),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.01"/>', 1.9),
  more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>', 1.4),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>', 1.8),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>', 1.9),
  note: svg('<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5M8.5 13h7M8.5 16.5h5"/>', 1.9),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>', 2.1),
  table: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M3 15h18M8.5 4v16"/>', 1.8),
  sheet: svg('<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M4 9h16M4 15h16M10 3v18"/>', 1.8),
};

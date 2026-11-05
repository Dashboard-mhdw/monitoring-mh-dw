// Site map — Indonesia with one pin per cinema (Leaflet, loaded on first use).
// Coordinates come from targets.json (lat/lng per site, city level — approximate).
import { esc } from "./dom.js";

const LEAFLET = "src/vendor/leaflet/";   // Leaflet 1.9.4 (BSD-2), bundled so the map does not depend on a CDN
let loading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = LEAFLET + "leaflet.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = LEAFLET + "leaflet.js"; s.onload = () => res(window.L); s.onerror = rej; document.head.appendChild(s);
  });
  return loading;
}

const dark = () => {
  const a = document.documentElement.getAttribute("data-theme");
  return a ? a === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || v;
const TONE = {red: "--red", orange: "--orange", green: "--green", blue: "--blue", gray: "--label-3"};

/** Map markup placeholder; call mountMap() after it is in the DOM. */
export const mapBox = (id, h = 380) => `<div class="sitemap" id="${id}" style="height:${h}px" role="region" aria-label="Peta site"></div>`;

/**
 * points: [{code, name, lat, lng, tone: "red|orange|green|blue|gray", size?: 0..1, lines?: [text], onClick?}]
 * Draws pins; bigger = larger value. Returns a promise of the Leaflet map (or null when Leaflet can't load).
 */
export async function mountMap(el, points, {fit = true} = {}) {
  if (!el) return null;
  let L;
  try { L = await loadLeaflet(); } catch (e) { el.innerHTML = `<p class="muted" style="padding:16px">Peta tidak bisa dimuat.</p>`; return null; }
  if (!el.isConnected) return null;
  const map = L.map(el, {zoomControl: true, attributionControl: true, scrollWheelZoom: false, worldCopyJump: false}).setView([-2.5, 117.5], 5);
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark() ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`, {
    maxZoom: 18, subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
  const pts = points.filter(p => p.lat != null && p.lng != null);
  // Spread pins that share (almost) the same spot, e.g. several malls in one city.
  const seen = new Map();
  pts.forEach(p => { const k = p.lat.toFixed(2) + "," + p.lng.toFixed(2); const n = seen.get(k) || 0; seen.set(k, n + 1);
    if (n) { const a = n * 2.4; p._lat = p.lat + 0.018 * Math.sin(a) * Math.ceil(n / 6); p._lng = p.lng + 0.018 * Math.cos(a) * Math.ceil(n / 6); } else { p._lat = p.lat; p._lng = p.lng; } });
  pts.sort((a, b) => (a.tone === "red") - (b.tone === "red"));   // red pins on top
  pts.forEach(p => {
    const col = css(TONE[p.tone] || "--blue");
    const m = L.circleMarker([p._lat, p._lng], {radius: 6 + Math.round((p.size || 0) * 10), color: "#fff", weight: 1.5, fillColor: col, fillOpacity: .9});
    m.bindTooltip(`<b>${esc(p.name)}</b>${(p.lines || []).map(l => "<br>" + l).join("")}`, {direction: "top", offset: [0, -4]});
    if (p.onClick) m.on("click", () => p.onClick(p));
    m.addTo(map);
  });
  if (fit && pts.length) map.fitBounds(L.latLngBounds(pts.map(p => [p._lat, p._lng])).pad(0.08));
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

// Site map — vector map of Indonesia (34 provinces, no tile server) with one glowing pin per cinema.
// Provinces holding a site that needs attention are tinted, so the eye goes there first.
// Leaflet 1.9.4 (BSD-2) and the province outlines (BAKOSURTANAL 1:250k, simplified) are bundled in src/vendor.
// Coordinates come from targets.json (lat/lng per site, city level — approximate).
import { esc } from "./dom.js";

const VENDOR = "src/vendor/";
let loading = null, geo = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = VENDOR + "leaflet/leaflet.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = VENDOR + "leaflet/leaflet.js"; s.onload = () => res(window.L); s.onerror = rej; document.head.appendChild(s);
  });
  return loading;
}
const loadGeo = () => geo || (geo = fetch(VENDOR + "indonesia-prov.json?v=1").then(r => r.json()).catch(() => null));

const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const TONE = {red: "--red", orange: "--orange", green: "--green", blue: "--blue", gray: "--map-pin-off"};
const RANK = {red: 4, orange: 3, blue: 2, green: 1, gray: 0};

// Ray casting on [lng, lat] rings.
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const inFeature = (f, x, y) => f.geometry.coordinates.some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h)));

/** Map markup placeholder; call mountMap() after it is in the DOM. */
export const mapBox = (id, h = 380) => `<div class="sitemap" id="${id}" style="height:${h}px" role="region" aria-label="Peta site"></div>`;

/**
 * points: [{code, name, lat, lng, tone: "red|orange|green|blue|gray", size?: 0..1, lines?: [text], onClick?}]
 * Red/orange pins glow (red ones pulse); their provinces are tinted. Returns a promise of the Leaflet map.
 */
export async function mountMap(el, points) {
  if (!el) return null;
  let L, G;
  try { [L, G] = await Promise.all([loadLeaflet(), loadGeo()]); } catch (e) { el.innerHTML = `<p class="muted" style="padding:16px">Peta tidak bisa dimuat.</p>`; return null; }
  if (!el.isConnected) return null;
  el.innerHTML = "";
  const map = L.map(el, {zoomControl: true, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.25, minZoom: 3.5, maxZoom: 11,
    maxBounds: [[-14, 90], [10, 145]], maxBoundsViscosity: 0.8}).setView([-2.5, 117.5], 4.5);

  const pts = points.filter(p => p.lat != null && p.lng != null);
  // Spread pins that share (almost) the same spot, e.g. several malls in one city.
  const seen = new Map();
  pts.forEach(p => { const k = p.lat.toFixed(2) + "," + p.lng.toFixed(2); const n = seen.get(k) || 0; seen.set(k, n + 1);
    if (n) { const a = n * 2.4, d = 0.03 * Math.ceil(n / 6); p._lat = p.lat + d * Math.sin(a); p._lng = p.lng + d * Math.cos(a); } else { p._lat = p.lat; p._lng = p.lng; } });

  if (G) {
    // Strongest tone per province → tint (red/orange) or a soft "has a site" fill.
    const best = new Map();
    pts.forEach(p => { const f = G.features.find(ft => inFeature(ft, p.lng, p.lat)); if (!f) return;
      const cur = best.get(f); if (cur == null || RANK[p.tone] > RANK[cur]) best.set(f, p.tone); });
    const land = cssVar("--map-land"), line = cssVar("--map-line"), has = cssVar("--map-land-site");
    L.geoJSON(G, {interactive: true, style: f => {
      const tone = best.get(f), hot = tone === "red" || tone === "orange";
      return {color: line, weight: 0.8, fillOpacity: 1, fillColor: hot ? cssVar(tone === "red" ? "--map-hot" : "--map-warm") : tone != null ? has : land};
    }, onEachFeature: (f, layer) => layer.bindTooltip(esc(f.properties.n), {sticky: true, className: "prov-tip", direction: "auto"})}).addTo(map);
  }

  pts.sort((a, b) => RANK[a.tone] - RANK[b.tone]);   // important pins on top
  pts.forEach(p => {
    const col = cssVar(TONE[p.tone] || "--blue"), r = 5 + Math.round((p.size || 0) * 9), hot = p.tone === "red" || p.tone === "orange";
    if (hot || p.tone === "blue") {   // soft glow
      L.circleMarker([p._lat, p._lng], {radius: r + 7, stroke: false, fillColor: col, fillOpacity: .22, interactive: false}).addTo(map);
    }
    if (p.tone === "red") {           // pulsing ring
      L.marker([p._lat, p._lng], {interactive: false, keyboard: false,
        icon: L.divIcon({className: "pin-pulse", html: `<i style="--c:${col};--s:${(r + 4) * 2}px"></i>`, iconSize: [0, 0]})}).addTo(map);
    }
    const m = L.circleMarker([p._lat, p._lng], {radius: r, color: cssVar("--map-pin-ring"), weight: hot ? 2 : 1.5, fillColor: col, fillOpacity: p.tone === "gray" ? .75 : 1});
    m.bindTooltip(`<b>${esc(p.name)}</b>${(p.lines || []).map(l => "<br>" + l).join("")}`, {direction: "top", offset: [0, -r]});
    if (p.onClick) m.on("click", () => p.onClick(p));
    m.addTo(map);
  });
  const focus = pts.length && pts.length < 59 ? pts : null;   // region view → zoom to its sites
  if (focus) map.fitBounds(L.latLngBounds(focus.map(p => [p._lat, p._lng])).pad(0.7), {maxZoom: 6.5});
  else map.fitBounds([[-10.5, 95.5], [5.8, 140.8]]);
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

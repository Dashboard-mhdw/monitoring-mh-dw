// Site map — vector map of Indonesia (34 provinces, no tile server) with one glowing pin per cinema.
// Provinces holding a site that needs attention are tinted, so the eye goes there first.
// A "3D" button switches to a tilted MapLibre view where every site is a column (height = value).
// Leaflet 1.9.4 (BSD-2), MapLibre GL 4.7.1 (BSD-3) and the province outlines (BAKOSURTANAL 1:250k, simplified) are bundled in src/vendor.
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
let loading3d = null;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loading3d) return loading3d;
  loading3d = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = VENDOR + "maplibre/maplibre-gl.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = VENDOR + "maplibre/maplibre-gl.js"; s.onload = () => res(window.maplibregl); s.onerror = rej; document.head.appendChild(s);
  });
  return loading3d;
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

const tip = p => `<b>${esc(p.name)}</b>${(p.lines || []).map(l => "<br>" + l).join("")}`;
let want3d = (() => { try { return localStorage.getItem("mhdw.map3d") === "1"; } catch (e) { return false; } })();
const remember = v => { want3d = v; try { localStorage.setItem("mhdw.map3d", v ? "1" : "0"); } catch (e) { /* private mode */ } };

/** Spread overlapping pins and work out each province's strongest tone. */
function prepare(points, G) {
  const pts = points.filter(p => p.lat != null && p.lng != null).map(p => ({...p}));
  const seen = new Map();
  pts.forEach(p => { const k = p.lat.toFixed(2) + "," + p.lng.toFixed(2); const n = seen.get(k) || 0; seen.set(k, n + 1);
    if (n) { const a = n * 2.4, d = 0.03 * Math.ceil(n / 6); p._lat = p.lat + d * Math.sin(a); p._lng = p.lng + d * Math.cos(a); } else { p._lat = p.lat; p._lng = p.lng; } });
  const best = new Map();
  if (G) pts.forEach(p => { const f = G.features.find(ft => inFeature(ft, p.lng, p.lat)); if (!f) return;
    const cur = best.get(f); if (cur == null || RANK[p.tone] > RANK[cur]) best.set(f, p.tone); });
  const fillOf = f => { const tone = best.get(f); return tone === "red" ? cssVar("--map-hot") : tone === "orange" ? cssVar("--map-warm") : tone != null ? cssVar("--map-land-site") : cssVar("--map-land"); };
  return {pts, best, fillOf, focus: pts.length && pts.length < 59 ? pts : null};
}

function modeButton(el, is3d, onToggle) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "map-mode"; b.setAttribute("aria-pressed", String(is3d));
  b.innerHTML = is3d ? "<b>2D</b>" : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg><b>3D</b>`;
  b.title = is3d ? "Kembali ke peta datar" : "Lihat peta 3D (tinggi kolom = nilai)";
  b.addEventListener("click", e => { e.stopPropagation(); onToggle(); });
  el.appendChild(b);
}

/**
 * points: [{code, name, lat, lng, tone: "red|orange|green|blue|gray", size?: 0..1, lines?: [text], onClick?}]
 * Red/orange pins glow (red ones pulse); their provinces are tinted. A 3D button turns pins into columns.
 */
export async function mountMap(el, points) {
  if (!el) return null;
  let G;
  try { G = await loadGeo(); } catch (e) { G = null; }
  if (!el.isConnected) return null;
  const prep = prepare(points, G);
  let current = null;
  const show = async is3d => {
    if (current) { try { current.remove(); } catch (e) { /* already gone */ } current = null; }
    el.innerHTML = ""; el.classList.toggle("is3d", is3d);
    try { current = is3d ? await draw3d(el, G, prep) : await draw2d(el, G, prep); }
    catch (e) { console.warn("map", e); if (is3d) { remember(false); return show(false); } el.innerHTML = `<p class="muted" style="padding:16px">Peta tidak bisa dimuat.</p>`; return; }
    if (el.isConnected) modeButton(el, is3d, () => { remember(!is3d); show(!is3d); });
  };
  await show(want3d);
  return current;
}

async function draw2d(el, G, {pts, best, fillOf, focus}) {
  const L = await loadLeaflet();
  const map = L.map(el, {zoomControl: true, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.25, minZoom: 2.5, maxZoom: 11,
    maxBounds: [[-14, 90], [10, 145]], maxBoundsViscosity: 0.8}).setView([-2.5, 117.5], 4.5);
  if (G) {
    const line = cssVar("--map-line"), hover = cssVar("--map-land-hover");
    map.createPane("land").style.zIndex = 350;
    L.geoJSON(G, {pane: "land", interactive: true, style: f => ({color: line, weight: 0.8, fillOpacity: 1, fillColor: fillOf(f)}),
      onEachFeature: (f, layer) => {
        layer.bindTooltip(esc(f.properties.n), {sticky: true, className: "prov-tip", direction: "auto"});
        layer.on("mouseover", () => layer.setStyle({fillColor: best.get(f) === "red" || best.get(f) === "orange" ? fillOf(f) : hover, weight: 1.4}));
        layer.on("mouseout", () => layer.setStyle({fillColor: fillOf(f), weight: 0.8}));
      }}).addTo(map);
  }
  pts.slice().sort((a, b) => RANK[a.tone] - RANK[b.tone]).forEach(p => {   // important pins on top
    const col = cssVar(TONE[p.tone] || "--blue"), r = 4 + Math.round((p.size || 0) * 7), hot = p.tone === "red" || p.tone === "orange";
    if (hot || p.tone === "blue") L.circleMarker([p._lat, p._lng], {radius: r + 6, stroke: false, fillColor: col, fillOpacity: .2, interactive: false}).addTo(map);
    if (p.tone === "red") L.marker([p._lat, p._lng], {interactive: false, keyboard: false,
      icon: L.divIcon({className: "pin-pulse", html: `<i style="--c:${col};--s:${(r + 4) * 2}px"></i>`, iconSize: [0, 0]})}).addTo(map);
    const m = L.circleMarker([p._lat, p._lng], {radius: r, color: cssVar("--map-pin-ring"), weight: hot ? 2 : 1.5, fillColor: col, fillOpacity: p.tone === "gray" ? .75 : 1});
    m.bindTooltip(tip(p), {direction: "top", offset: [0, -r]});
    if (p.onClick) m.on("click", () => p.onClick(p));
    m.addTo(map);
  });
  if (focus) map.fitBounds(L.latLngBounds(focus.map(p => [p._lat, p._lng])).pad(0.7), {maxZoom: 6.5, animate: false});
  else map.fitBounds([[-10.5, 95.5], [5.8, 140.8]], {animate: false});
  setTimeout(() => { if (el.isConnected && map._loaded) try { map.invalidateSize(); } catch (e) { /* map was switched */ } }, 50);
  return map;
}

/** Tilted view: provinces as thin plates, each site a column whose height follows its value. */
async function draw3d(el, G, {pts, best, fillOf, focus}) {
  const ml = await loadMapLibre();
  const box = document.createElement("div"); box.className = "map3d"; el.appendChild(box);
  const PLATE = 6000;
  const prov = {type: "FeatureCollection", features: (G ? G.features : []).map(f => ({type: "Feature", geometry: f.geometry,
    properties: {n: f.properties.n, c: fillOf(f), h: best.has(f) ? PLATE * 1.6 : PLATE}}))};
  const cols = {type: "FeatureCollection", features: pts.map((p, i) => {
    const s = p.size || 0, d = (0.07 + s * 0.05) * (focus ? 0.45 : 1.7), k = Math.cos(p._lat * Math.PI / 180);
    const ring = [[p._lng - d / k, p._lat - d], [p._lng + d / k, p._lat - d], [p._lng + d / k, p._lat + d], [p._lng - d / k, p._lat + d], [p._lng - d / k, p._lat - d]];
    return {type: "Feature", id: i, geometry: {type: "Polygon", coordinates: [ring]},
      properties: {i, c: cssVar(TONE[p.tone] || "--blue"), h: (p.tone === "gray" ? 14000 : 40000 + s * 520000) * (focus ? 0.6 : 1.4), b: PLATE * 1.6}};
  })};
  const b = focus ? focus.reduce((a, p) => [[Math.min(a[0][0], p._lng), Math.min(a[0][1], p._lat)], [Math.max(a[1][0], p._lng), Math.max(a[1][1], p._lat)]], [[180, 90], [-180, -90]]) : [[95.5, -10.5], [140.8, 5.8]];
  const map = new ml.Map({container: box, attributionControl: false, preserveDrawingBuffer: true, dragRotate: true, scrollZoom: false, maxPitch: 70,
    bounds: b, fitBoundsOptions: {padding: focus ? 60 : 10, maxZoom: 7},
    style: {version: 8, sources: {prov: {type: "geojson", data: prov}, cols: {type: "geojson", data: cols}},
      light: {anchor: "viewport", color: "#ffffff", intensity: 0.35, position: [1.4, 200, 35]},
      layers: [
        {id: "sea", type: "background", paint: {"background-color": cssVar("--map-sea")}},
        {id: "land", type: "fill-extrusion", source: "prov", paint: {"fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.96}},
        {id: "cols", type: "fill-extrusion", source: "cols", paint: {"fill-extrusion-color": ["get", "c"], "fill-extrusion-height": 0, "fill-extrusion-base": ["get", "b"], "fill-extrusion-opacity": 0.95}},
      ]}});
  map.on("error", e => console.warn("map3d", e && e.error && e.error.message));
  map.addControl(new ml.NavigationControl({visualizePitch: true, showCompass: true}), "top-left");
  const pop = new ml.Popup({closeButton: false, closeOnClick: false, offset: 12, className: "map3d-tip"});
  map.on("mousemove", "cols", e => { const p = pts[e.features[0].properties.i]; map.getCanvas().style.cursor = p.onClick ? "pointer" : ""; pop.setLngLat([p._lng, p._lat]).setHTML(tip(p)).addTo(map); });
  map.on("mouseleave", "cols", () => { map.getCanvas().style.cursor = ""; pop.remove(); });
  map.on("click", "cols", e => { const p = pts[e.features[0].properties.i]; if (p.onClick) p.onClick(p); });
  map.on("mousemove", "land", e => { if (!map.queryRenderedFeatures(e.point, {layers: ["cols"]}).length) pop.setLngLat(e.lngLat).setHTML(`<b>${esc(e.features[0].properties.n)}</b>`).addTo(map); });
  map.on("mouseleave", "land", () => pop.remove());
  await new Promise(res => map.once("load", res));
  map.resize();
  // Tilt in (a little closer, since tilting makes the far side smaller), then let the columns rise.
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  map.easeTo({pitch: 55, bearing: -14, zoom: map.getZoom() + (focus ? 0.2 : 0.75), center: focus ? map.getCenter() : [117.8, -3.2], duration: still ? 0 : 1100});
  const grow = ["+", ["get", "b"], ["get", "h"]];
  if (still) map.setPaintProperty("cols", "fill-extrusion-height", grow);
  else { const t0 = performance.now(); const step = now => { if (!map.getStyle()) return; const k = Math.min(1, (now - t0) / 1300), e = 1 - Math.pow(1 - k, 3);
    map.setPaintProperty("cols", "fill-extrusion-height", ["+", ["get", "b"], ["*", ["get", "h"], e]]); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  return map;
}

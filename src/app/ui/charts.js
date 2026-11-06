// SVG charts. Pure functions: data in, markup out.
// Look: soft gradient bars with rounded tops, dashed hairline grid, a hover band per slot,
// and the peak value labelled on the chart so the eye has an anchor.
import { esc } from "./dom.js";
import { fmt } from "../format.js";

let uid = 0;
const niceStep = x => { const p = Math.pow(10, Math.floor(Math.log10(x || 1))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const barPath = (x, y, w, h, r) => {
  if (h <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
function axis(W, H, L, R, T, B, max) {
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top);
  let s = "";
  for (let v = 0; v <= top + 1e-9; v += step)
    s += `<line class="${v ? "grid" : "base"}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 10}" y="${y(v) + 3.5}" text-anchor="end">${fmt(v)}</text>`;
  return {y, grid: s};
}
// Vertical gradients per tone; colours come from CSS (stop-color), so light/dark both work.
const defs = id => `<defs>${["b", "o", "g"].map(k => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="0" y2="1"><stop class="s1-${k}" offset="0"/><stop class="s2-${k}" offset="1"/></linearGradient>`).join("")}</defs>`;
const pill = (x, y, text, cls = "") => {
  const w = text.length * 6.3 + 14;
  return `<g class="vpill ${cls}"><rect x="${x - w / 2}" y="${y - 20}" width="${w}" height="18" rx="9"/><text x="${x}" y="${y - 7}" text-anchor="middle">${esc(text)}</text></g>`;
};

/** Single-series column chart. data: [{value, tip, cls, tick}] */
export function columnChart(data, {W = 760, H = 220, avg = null, avgLabel = "", aria = ""} = {}) {
  const id = "cc" + (++uid), L = 46, R = 10, T = 24, B = 26, n = Math.max(1, data.length);
  const max = Math.max(1, ...data.map(d => d.value || 0));
  const {y, grid} = axis(W, H, L, R, T, B, max);
  const slot = (W - L - R) / n, bw = Math.max(3, Math.min(22, slot * 0.62));
  const peak = data.reduce((b, d, i) => (d.value || 0) > (data[b].value || 0) ? i : b, 0);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">` + defs(id) + grid;
  data.forEach((d, i) => {
    const x = L + i * slot + (slot - bw) / 2, top = y(d.value || 0), fill = d.cls === "hl" ? "o" : "b";
    s += `<rect class="hit" x="${L + i * slot}" y="${T - 8}" width="${slot}" height="${H - T - B + 8}" rx="6" data-tip="${esc(d.tip)}"/>`;
    s += `<path class="mk ${d.cls || ""}" ${d.cls === "dim" ? "" : `style="fill:url(#${id}${fill})"`} d="${barPath(x, top, bw, (H - B) - top, Math.min(6, bw / 2))}" data-tip="${esc(d.tip)}"/>`;
    if (d.tick) s += `<text class="ax" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.tick)}</text>`;
  });
  if (avg != null && avg > 0)
    s += `<line class="avg" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/><text class="ax avg-t" x="${W - R}" y="${y(avg) - 6}" text-anchor="end">${esc(avgLabel)} ${fmt(avg)}</text>`;
  if (data[peak] && data[peak].value > 0) s += pill(L + peak * slot + slot / 2, y(data[peak].value) - 2, fmt(data[peak].value), data[peak].cls === "hl" ? "o" : "");
  return s + "</svg>";
}

/** Budget (grey) vs actual (blue) per period, with optional "fair DW" marker. periods: [{label, sub, budget, actual, hl, flex, tip}] */
export function groupedChart(periods, {aria = ""} = {}) {
  const id = "gc" + (++uid), W = 760, H = 230, L = 46, R = 10, T = 18, B = 30, n = Math.max(1, periods.length);
  const {y, grid} = axis(W, H, L, R, T, B, Math.max(1, ...periods.map(p => Math.max(p.budget, p.actual))));
  const slot = (W - L - R) / n, bw = Math.min(30, slot * 0.3);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">` + defs(id) + grid;
  periods.forEach((p, i) => {
    const cx = L + i * slot + slot / 2, tip = esc(p.tip);
    s += `<rect class="hit" x="${L + i * slot}" y="${T - 6}" width="${slot}" height="${H - T - B + 6}" rx="8" data-tip="${tip}"/>`;
    s += `<path class="mk-b" d="${barPath(cx - bw - 2, y(p.budget), bw, (H - B) - y(p.budget), 6)}" data-tip="${tip}"/>`;
    s += `<path class="mk ${p.hl ? "hl" : ""}" style="fill:url(#${id}${p.hl ? "o" : "b"})" d="${barPath(cx + 2, y(p.actual), bw, (H - B) - y(p.actual), 6)}" data-tip="${tip}"/>`;
    if (p.flex != null) s += `<line class="flex" x1="${cx - bw - 6}" x2="${cx + bw + 6}" y1="${y(p.flex)}" y2="${y(p.flex)}" data-tip="${tip}"/>`;
    s += `<text class="ax" x="${cx}" y="${H - 12}" text-anchor="middle">${esc(p.label)}</text><text class="ax" x="${cx}" y="${H - 1}" text-anchor="middle" style="opacity:.7">${esc(p.sub)}</text>`;
  });
  return s + "</svg>";
}

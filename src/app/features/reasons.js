// Catatan & Reason — reasons collected from CMs for flagged sites, with full history per site.
import { t, _dicts, locale } from "../i18n.js";
import { fmt, dateLong, dateShort, monthName, YESTERDAY, TODAY } from "../format.js";
import { esc, ICON, on, hud } from "../ui/dom.js";
import { header, kpi, kpis, notice, segmented, tag, btn } from "../ui/components.js";
import { openSheet } from "../ui/sheet.js";
import { alertsOn, budgetVsActual } from "../store.js";
import { reasons, addReason, deleteReason } from "../reasons.js";
import { state } from "../state.js";
import { cutFor } from "./budget.js";

/** Where the note came from (konteks) and why (kategori). Stored in the sheet as the Indonesian label. */
export const CONTEXTS = ["alert", "over", "nobudget", "h1", "other"];
export const CATEGORIES = ["nobar", "event", "backup", "admits", "kiosk", "training", "ops", "input", "other", "noreply"];
/** Older categories: no longer offered in the form, but notes saved with them still display and count. */
const LEGACY = ["sick"];
const ALL_CATS = [...CATEGORIES, ...LEGACY];
/** Labels the sheet may still hold from before the category rename. */
const OLD_LABEL = {"Admits di atas perkiraan": "admits", "Event / film besar": "event", "Admits tinggi": "admits", "Nobar": "nobar", "Event": "event", "Kiosk": "kiosk", "Other": "other", "Kebutuhan operasional lain": "ops"};
const ID = _dicts.id;
const idLabel = (kind, k) => ID[`reason.${kind}.${k}`];
/** Show a stored label in the active language (falls back to the stored text). */
const catKey = stored => ALL_CATS.find(x => idLabel("cat", x) === stored) || OLD_LABEL[stored];
const shown = (kind, stored) => { const k = kind === "ctx" ? CONTEXTS.find(x => idLabel(kind, x) === stored) : catKey(stored); return k ? t(`reason.${kind}.${k}`) : (stored || "–"); };
const ctxKey = stored => CONTEXTS.find(x => idLabel("ctx", x) === stored) || "other";
const CTX_TONE = {alert: "orange", over: "red", nobudget: "orange", h1: "blue", other: ""};

/** Small button placed in table rows. payload: {site, cinema, date, context, month?}. */
export function reasonBtn(p) {
  const list = p.month ? reasons.inMonth(p.site, p.month) : reasons.onDate(p.site, p.date);
  const last = list[0];
  const tip = last ? `${esc(p.cinema)}|${esc(shown("cat", last.category))}: ${esc(last.reason).slice(0, 120)}` : "";
  return `<button type="button" class="rbtn${list.length ? " has" : ""}" data-reason="${esc(JSON.stringify(p))}"${tip ? ` data-tip="${tip}"` : ""} aria-label="${esc(t("reason.btnAria", {site: p.cinema}))}">${list.length ? ICON.note + list.length : "+ " + t("reason.btn")}</button>`;
}

const storageLine = () => {
  const m = reasons.mode;
  if (m === "sheet") return `<span class="rstore ok">${ICON.check}${t("reason.storeSheet")}</span>`;
  if (m === "offline") return `<span class="rstore bad">${ICON.warn}${t("reason.storeOffline")}</span>`;
  if (m === "loading") return `<span class="rstore">${t("common.loading")}</span>`;
  return `<span class="rstore warn">${ICON.warn}${t("reason.storeLocal")}</span>`;
};

function historyHtml(list, {showSite = false, readonly = false} = {}) {
  if (!list.length) return `<p class="muted" style="font-size:var(--t-subhead)">${t("reason.none")}</p>`;
  return `<ul class="rlist">${list.map(n => `<li>
    <div class="rmeta"><b>${n.date ? dateShort(n.date) : "–"}</b>${showSite ? `<span>${esc(n.cinema)}</span>` : ""}${tag(esc(shown("ctx", n.context)), CTX_TONE[ctxKey(n.context)])}${tag(esc(shown("cat", n.category)))}${n.local ? tag(t("reason.unsynced"), "orange") : ""}
      ${readonly ? "" : `<button type="button" class="rdel" data-del="${esc(n.id)}" aria-label="${esc(t("reason.delete"))}">${ICON.x}</button>`}</div>
    <p>${esc(n.reason).replace(/\n/g, "<br>")}</p>
    <span class="rby">${[n.source && esc(n.source), n.by && t("reason.byV", {v: esc(n.by)}), n.ts && t("reason.atV", {v: esc(new Date(n.ts).toLocaleString(locale(), {dateStyle: "medium", timeStyle: "short"}))})].filter(Boolean).join(" · ")}</span></li>`).join("")}</ul>`;
}

/** Read-only card for detail sheets: latest notes for the site + a button that opens the form. */
export function reasonSection(p) {
  const all = reasons.forSite(p.site), shownList = all.slice(0, 3);
  return `<div class="card"><div class="card-head"><h3>${t("reason.sectionTitle")}</h3><span class="sub">${t("reason.history", {n: all.length})}</span>${reasonBtn(p)}</div>${historyHtml(shownList, {readonly: true})}${all.length > 3 ? `<p class="foot">${t("reason.more", {n: all.length - 3})}</p>` : ""}</div>`;
}

/** Form + history sheet for one site. */
export function openReason(p, app) {
  const ctx = CONTEXTS.includes(p.context) ? p.context : "other";
  const opt = (kind, keys, cur) => keys.map(k => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(t(`reason.${kind}.${k}`))}</option>`).join("");
  const body = `
    <form class="rform" id="rForm" novalidate>
      <div class="rgrid">
        <label>${t("reason.fDate")}<input type="date" class="datefield" id="rDate" value="${esc(p.date || YESTERDAY)}" max="${TODAY}" required></label>
        <label>${t("reason.fCtx")}<select class="popup" id="rCtx">${opt("ctx", CONTEXTS, ctx)}</select></label>
        <label>${t("reason.fCat")}<select class="popup" id="rCat">${opt("cat", CATEGORIES, "noreply")}</select></label>
      </div>
      <label>${t("reason.fReason")}<textarea id="rText" rows="3" placeholder="${esc(t("reason.fReasonPh"))}" required></textarea></label>
      <div class="rgrid two">
        <label>${t("reason.fSource")}<input type="text" class="datefield" id="rSrc" placeholder="${esc(t("reason.fSourcePh"))}"></label>
        <label>${t("reason.fBy")}<input type="text" class="datefield" id="rBy" value="${esc(reasons.lastBy)}" placeholder="${esc(t("reason.fByPh"))}"></label>
      </div>
      <div class="row">${storageLine()}<span class="spacer"></span><button type="submit" class="btn filled" id="rSave">${ICON.check}${t("reason.save")}</button></div>
    </form>
    <h3 class="rh">${t("reason.history", {n: reasons.forSite(p.site).length})}</h3>
    <div id="rHist">${historyHtml(reasons.forSite(p.site))}</div>`;
  const close = openSheet({title: p.cinema, sub: t("reason.sheetSub"), body});
  const sheet = [...document.querySelectorAll(".scrim .sheet")].pop();
  const refresh = () => {
    sheet.querySelector("#rHist").innerHTML = historyHtml(reasons.forSite(p.site));
    sheet.querySelector(".rh").textContent = t("reason.history", {n: reasons.forSite(p.site).length});
    wireDel();
  };
  const wireDel = () => on(sheet, "[data-del]", "click", async b => {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.classList.add("armed"); b.setAttribute("aria-label", t("reason.deleteConfirm")); hud(t("reason.deleteConfirm")); return; }
    b.disabled = true;
    if (await deleteReason(b.dataset.del)) { hud(t("reason.deleted")); refresh(); app && app.rerender(); }
    else { b.disabled = false; hud(t("reason.deleteFail")); }
  });
  wireDel();
  sheet.querySelector("#rForm").addEventListener("submit", async e => {
    e.preventDefault();
    const text = sheet.querySelector("#rText").value.trim();
    if (!text) { sheet.querySelector("#rText").focus(); hud(t("reason.needText")); return; }
    const save = sheet.querySelector("#rSave"); save.disabled = true;
    const where = await addReason({site: p.site, cinema: p.cinema, date: sheet.querySelector("#rDate").value,
      context: idLabel("ctx", sheet.querySelector("#rCtx").value), category: idLabel("cat", sheet.querySelector("#rCat").value),
      reason: text, source: sheet.querySelector("#rSrc").value, by: sheet.querySelector("#rBy").value});
    hud(t("reason.saved." + where));
    sheet.querySelector("#rText").value = ""; save.disabled = false;
    refresh(); app && app.rerender();
  });
  return close;
}

/** Sites that still need a reason: flagged yesterday, or over/without budget this month. */
function needed() {
  const out = [];
  const a = alertsOn(YESTERDAY);
  if (a) a.flagged.forEach(r => { if (!reasons.onDate(r.code, a.date).length) out.push({site: r.code, cinema: r.cinema, date: a.date, context: "alert", why: t("reason.whyAlert", {w: r.warn, p: (Math.round(r.prod * 10) / 10).toFixed(1), tg: r.target})}); });
  const key = state.month, cut = cutFor(key), b = budgetVsActual(key, cut, reasons.transfers);
  if (b) b.rows.filter(x => x.status === "over" || x.status === "nobudget").forEach(x => {
    if (reasons.inMonth(x.code, key).some(n => ["over", "nobudget"].includes(ctxKey(n.context)))) return;
    out.push({site: x.code, cinema: x.cinema, date: cut, month: key, context: x.status, why: x.status === "over" ? t("reason.whyOver", {a: fmt(x.actual), b: fmt(x.budgetToDate)}) : t("reason.whyNoBudget", {a: fmt(x.actual)})});
  });
  return out;
}

/** Nav badge: sites flagged yesterday that still have no reason (budget items stay on the page, not the badge). */
export const needCount = () => needed().filter(x => x.context === "alert").length;

export function exportReasons() {
  if (typeof XLSX === "undefined") { hud(t("toast.xlsxMissing")); return; }
  const rows = reasons.all;
  const head = [t("reason.fDate"), t("col.site"), t("reason.fCtx"), t("reason.fCat"), t("reason.fReason"), t("reason.fSource"), t("reason.fBy"), t("reason.colAt")];
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows.map(n => [n.date, n.cinema, shown("ctx", n.context), shown("cat", n.category), n.reason, n.source, n.by, n.ts ? new Date(n.ts).toLocaleString(locale(), {dateStyle: "medium", timeStyle: "short"}) : ""])]);
  ws["!cols"] = [12, 30, 18, 26, 70, 22, 16, 20].map(w => ({wch: w}));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Reason");
  const name = `MH_DW_Reason_${TODAY}.xlsx`;
  const url = URL.createObjectURL(new Blob([XLSX.write(wb, {bookType: "xlsx", type: "array"})], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  const el = Object.assign(document.createElement("a"), {href: url, download: name}); document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); hud(t("toast.downloading", {f: name}));
}

export default {
  id: "reasons",
  render(c, app) {
    const key = state.month, title = t("nav.reasons");
    const flt = state.reasonCtx || "all", q = (state.reasonQ || "").toLowerCase();
    const inMonth = reasons.all.filter(n => (n.date || "").startsWith(key));
    const list = inMonth.filter(n => (flt === "all" || ctxKey(n.context) === flt) && (!q || `${n.cinema} ${n.reason} ${n.source} ${n.by}`.toLowerCase().includes(q)));
    const need = needed();
    const byCat = ALL_CATS.map(k => [k, inMonth.filter(n => catKey(n.category) === k).length]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
    const maxCat = Math.max(1, ...byCat.map(([, v]) => v));
    const storeNote = reasons.mode === "local" ? notice(t("reason.setupTitle"), t("reason.setupSub"))
      : reasons.mode === "offline" ? notice(t("reason.offlineTitle"), t("reason.offlineSub", {e: esc(reasons.error || "")}), "err") : "";

    c.innerHTML = header(title, t("reason.sub", {month: monthName(key)}), btn(t("common.downloadExcel"), {act: "reasons-xlsx", icon: ICON.down})) + storeNote +
      kpis(
        kpi({label: t("reason.kNeed"), icon: ICON.warn, tint: "red", tone: need.length ? "bad" : "good", value: need.length, unit: t("unit.sites"), sub: t("reason.kNeedSub")}),
        kpi({label: t("reason.kCount"), icon: ICON.note, tint: "blue", value: inMonth.length, sub: t("reason.kCountSub", {n: new Set(inMonth.map(n => n.site)).size})}),
        kpi({label: t("reason.kTop"), icon: ICON.pie, tint: "indigo", value: byCat.length ? `<span style="font-size:20px;line-height:1.25;display:block;margin:4px 0 2px">${esc(t("reason.cat." + byCat[0][0]))}</span>` : "–", sub: byCat.length ? t("reason.kTopSub", {n: byCat[0][1]}) : t("reason.none")}),
      ) +
      `<h2 class="section-head">${t("reason.needTitle", {n: need.length})}</h2>` +
      (need.length ? `<ul class="list">${need.map(x => `<li><span class="ic ${x.context === "alert" ? "orange" : x.context === "over" ? "red" : "orange"}">${esc(x.site)}</span><span class="main-t"><b>${esc(x.cinema)}</b><span>${esc(t("reason.ctx." + x.context))} · ${x.why}</span></span><span class="trail">${reasonBtn(x)}</span></li>`).join("")}</ul>`
        : `<div class="card"><span class="muted">${t("reason.needNone")}</span></div>`) +
      (byCat.length ? `<div class="card"><div class="card-head"><h3>${t("reason.byCat")}</h3></div><div class="hbars">${byCat.map(([k, v]) => `<div class="hbar"><span class="t">${esc(t("reason.cat." + k))}</span><span class="v">${v}</span><span class="track"><i style="width:${(v / maxCat * 100).toFixed(1)}%"></i></span></div>`).join("")}</div></div>` : "") +
      `<h2 class="section-head">${t("reason.histTitle")}</h2>
      <div class="row">${segmented("rctx", flt, [["all", t("reason.fAll")], ...CONTEXTS.map(k => [k, t("reason.ctx." + k)])], t("reason.fCtx"))}<span class="spacer"></span><input type="search" class="search" id="rQ" placeholder="${esc(t("reason.search"))}" value="${esc(state.reasonQ || "")}" aria-label="${esc(t("reason.search"))}"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>${t("reason.fDate")}</th><th>${t("col.site")}</th><th>${t("reason.fCtx")}</th><th>${t("reason.fCat")}</th><th>${t("reason.fReason")}</th><th>${t("reason.fSource")}</th><th>${t("reason.fBy")}</th></tr></thead>
        <tbody>${list.map(n => `<tr class="click" data-reason="${esc(JSON.stringify({site: n.site, cinema: n.cinema, date: n.date, context: ctxKey(n.context)}))}">
          <td>${n.date ? dateShort(n.date) : "–"}</td><td class="site"><b>${esc(n.cinema)}</b>${n.local ? tag(t("reason.unsynced"), "orange") : ""}</td>
          <td>${tag(esc(shown("ctx", n.context)), CTX_TONE[ctxKey(n.context)])}</td><td>${esc(shown("cat", n.category))}</td>
          <td class="rtext">${esc(n.reason)}</td><td>${esc(n.source)}</td><td>${esc(n.by)}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">${t("reason.emptyMonth", {month: monthName(key)})}</td></tr>`}</tbody>
      </table></div>
      <p class="foot">${storageLine()} ${t("reason.foot")}</p>`;

    on(c, "[data-rctx]", "click", b => { state.reasonCtx = b.dataset.rctx; app.rerender(); });
    on(c, "#rQ", "input", el => { state.reasonQ = el.value; clearTimeout(el._t); el._t = setTimeout(() => { app.rerender(); const n = document.getElementById("rQ"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
  },
};

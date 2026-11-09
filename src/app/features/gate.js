// Sign-in screen: one password per region (+ admin). Deliberately plain.
// Nothing from the sheet is shown before the password matches.
import { t } from "../i18n.js";
import { esc, ICON } from "../ui/dom.js";
import { unlock } from "../store.js";

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = ms => new Promise(r => setTimeout(r, reduce() ? 0 : ms));

/** Render the ticket into `c`; calls onOpen() after a password matched. */
export function renderGate(c, onOpen) {
  // The ticket lives on <body>, not in the content area, so it can stay up while the dashboard renders behind it.
  document.getElementById("gate")?.remove();
  c.innerHTML = "";
  document.body.insertAdjacentHTML("beforeend", `
    <div class="gate" id="gate">
      <form class="login" id="lockForm" autocomplete="off">
        <div class="login-head"><div class="login-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 015.5 6h13A2.5 2.5 0 0121 8.5v1.2a2.3 2.3 0 000 4.6v1.2a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 15.5v-1.2a2.3 2.3 0 000-4.6z"/><path d="M15 6.5v11" stroke-dasharray="1.6 2.2"/></svg></div><span class="login-kicker">Daily Worker · Operations</span></div>
        <h1 class="login-title">Monitoring <span>MH DW</span></h1>
        <p class="login-sub">${t("lock.sub")}</p>
        <div class="login-field">
          <span class="login-ic" aria-hidden="true">${ICON.lock}</span>
          <input type="password" id="lockPw" placeholder="${t("lock.placeholder")}" aria-label="${t("lock.placeholder")}" autocomplete="current-password" spellcheck="false">
          <button type="button" class="login-eye" id="lockEye">${t("lock.show")}</button>
        </div>
        <p class="lock-msg" id="lockMsg" role="status"></p>
        <button type="submit" class="login-go" id="lockGo"><span>${t("lock.open")}</span><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </form>
      <p class="gate-note">${t("lock.note")}</p>
    </div>`);
  const $ = s => document.querySelector(s);
  const gate = $("#gate"), form = $("#lockForm"), inp = $("#lockPw"), msg = $("#lockMsg"), go = $("#lockGo"), eye = $("#lockEye");
  inp.focus();
  inp.addEventListener("input", () => { form.classList.toggle("typing", !!inp.value); if (msg.classList.contains("bad")) { msg.className = "lock-msg"; msg.textContent = ""; } });
  eye.addEventListener("click", () => { const show = inp.type === "password"; inp.type = show ? "text" : "password"; eye.textContent = show ? t("lock.hide") : t("lock.show"); inp.focus(); });
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!inp.value.trim()) { inp.focus(); return; }
    go.disabled = true; form.classList.add("checking"); msg.className = "lock-msg"; msg.textContent = t("lock.checking");
    try {
      const label = await unlock(inp.value.trim());
      if (label) {
        msg.className = "lock-msg ok"; msg.textContent = t("lock.welcome", {who: esc(label === "OK" ? "" : label)});
        form.classList.remove("checking");
        await wait(500);
        msg.textContent = t("lock.loading");
        await onOpen();
        gate.classList.add("lights");          // house lights down → the dashboard appears
        await wait(500);
        gate.remove(); return;
      }
      form.classList.remove("checking", "shake"); void form.offsetWidth; form.classList.add("shake");
      msg.className = "lock-msg bad"; msg.textContent = t("lock.wrong"); inp.select();
    } catch (e) { console.error(e); form.classList.remove("checking"); msg.className = "lock-msg bad"; msg.textContent = t("lock.error"); }
    go.disabled = false;
  });
}

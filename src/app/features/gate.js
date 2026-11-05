// Sign-in screen: one password per region (+ admin). Nothing from the sheet is shown before it.
import { t } from "../i18n.js";
import { ICON } from "../ui/dom.js";
import { unlock } from "../store.js";

/** Render the password card into `c`; calls onOpen() after a password matched. */
export function renderGate(c, onOpen) {
  c.innerHTML = `
    <form class="card lock-card" id="lockForm" autocomplete="off">
      <div class="lock-icon">${ICON.lock}</div>
      <h1 class="lock-title">Monitoring MH DW</h1>
      <p class="muted">${t("lock.sub")}</p>
      <input type="password" id="lockPw" class="datefield lock-input" placeholder="${t("lock.placeholder")}" aria-label="${t("lock.placeholder")}" autocomplete="current-password">
      <p class="lock-msg" id="lockMsg" role="status"></p>
      <button type="submit" class="btn filled" id="lockGo">${t("lock.open")}</button>
      <p class="foot">${t("lock.note")}</p>
    </form>`;
  const form = c.querySelector("#lockForm"), inp = c.querySelector("#lockPw"), msg = c.querySelector("#lockMsg"), go = c.querySelector("#lockGo");
  inp.focus();
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!inp.value.trim()) return;
    go.disabled = true; msg.className = "lock-msg"; msg.textContent = t("lock.checking");
    try {
      if (await unlock(inp.value)) { msg.textContent = t("lock.loading"); await onOpen(); return; }
      msg.className = "lock-msg bad"; msg.textContent = t("lock.wrong"); inp.select();
    } catch (e) { console.error(e); msg.className = "lock-msg bad"; msg.textContent = t("lock.error"); }
    go.disabled = false;
  });
}

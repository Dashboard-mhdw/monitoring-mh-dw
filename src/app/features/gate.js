// Sign-in screen: one password per region (+ admin), styled as a cinema ticket.
// Nothing from the sheet is shown before the password matches.
import { t } from "../i18n.js";
import { esc } from "../ui/dom.js";
import { unlock } from "../store.js";

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = ms => new Promise(r => setTimeout(r, reduce() ? 0 : ms));
// A barcode that looks different every visit — purely decorative.
const barcode = () => Array.from({length: 30}, () => `<i style="width:${1 + Math.floor(Math.random() * 3)}px"></i>`).join("");
const ticketNo = () => "MH-" + String(Math.floor(Math.random() * 90000) + 10000);

/** Render the ticket into `c`; calls onOpen() after a password matched. */
export function renderGate(c, onOpen) {
  // The ticket lives on <body>, not in the content area, so it can stay up while the dashboard renders behind it.
  document.getElementById("gate")?.remove();
  c.innerHTML = "";
  document.body.insertAdjacentHTML("beforeend", `
    <div class="gate" id="gate">
      <div class="gate-beam l" aria-hidden="true"></div><div class="gate-beam r" aria-hidden="true"></div>
      <form class="ticket" id="lockForm" autocomplete="off">
        <div class="tk-main">
          <div class="tk-marquee" aria-hidden="true"><span class="bulbs"></span><b>${t("lock.now")}</b><span class="bulbs"></span></div>
          <h1 class="tk-title">Monitoring <em>MH DW</em></h1>
          <p class="tk-sub">${t("lock.sub")}</p>
          <label class="tk-field"><span>${t("lock.placeholder")}</span>
            <input type="password" id="lockPw" placeholder="••••-••••-••••" aria-label="${t("lock.placeholder")}" autocomplete="current-password" spellcheck="false">
            <button type="button" class="tk-eye" id="lockEye" aria-label="${t("lock.show")}">${t("lock.show")}</button>
          </label>
          <p class="lock-msg" id="lockMsg" role="status"></p>
          <button type="submit" class="tk-go" id="lockGo"><span>${t("lock.open")}</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        </div>
        <div class="tk-stub" id="tkStub" aria-hidden="true">
          <span class="tk-admit">ADMIT ONE</span>
          <span class="tk-seat"><small>${t("lock.seat")}</small><b id="tkSeat">—</b></span>
          <span class="tk-code">${barcode()}</span>
          <span class="tk-no">${ticketNo()}</span>
        </div>
      </form>
      <p class="gate-note">${t("lock.note")}</p>
    </div>`);
  const $ = s => document.querySelector(s);
  const gate = $("#gate"), form = $("#lockForm"), inp = $("#lockPw"), msg = $("#lockMsg"), go = $("#lockGo"), seat = $("#tkSeat"), eye = $("#lockEye");
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
        seat.textContent = label === "OK" ? "✓" : label;
        msg.className = "lock-msg ok"; msg.textContent = t("lock.welcome", {who: esc(label === "OK" ? "" : label)});
        form.classList.remove("checking"); form.classList.add("torn");
        await wait(700);
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

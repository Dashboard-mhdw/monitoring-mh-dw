/* Monitoring MH DW — core parsing & aggregation.
 * Shared by the dashboard (browser) and scripts/build-data.js (Node), so both use exactly the same rules.
 *   PKDW  = Station PKDW + Training PKDW
 *   PKWT  = Station PKWT + Training PKWT + Back Up MOD
 *   filled = the Station PKWT cell is non-empty ("0" included) — the site has submitted its man hour for that date
 */
(function(root){
  const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,mei:4,jun:5,jul:6,aug:7,agu:7,sep:8,oct:9,okt:9,nov:10,dec:11,des:11};
  const pad = n => String(n).padStart(2,"0");
  const FIELDS = ["admits","spkwt","spkdw","tpkwt","tpkdw","bmod","kpkdw"];       // packed order (kpkdw = Kiosk PKDW, added Oct 2026; older data simply lacks it)
  const MH = ["spkwt","spkdw","tpkwt","tpkdw","bmod","kpkdw"];
  const LABEL = {"admits":"admits","station pkwt":"spkwt","station pkdw":"spkdw","training pkwt":"tpkwt","training pkdw":"tpkdw","back up mod":"bmod","backup mod":"bmod","kiosk pkdw":"kpkdw","kiosk":"kpkdw"};
  const FORMAT_RE = /^(regular|vip|junior|premium|kids|4dx|imax|macro|deluxe|platinum)/i;

  function num(s){
    s = (s==null?"":String(s)).trim();
    if(!s || s[0]==="#") return null;
    if(s.includes(",")) s = s.replace(/\./g,"").replace(",",".");
    else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,"");
    const v = parseFloat(s); return isNaN(v) ? null : v;
  }
  function tabKey(title){
    const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(String(title).trim()); if(!m) return null;
    const mi = MONTHS[m[1].slice(0,3).toLowerCase()]; if(mi==null) return null;
    return m[2]+"-"+pad(mi+1);
  }

  /* Raw sheet values (from column A) -> {dates, rows}. Header-driven, so tabs with different column layouts all work. */
  function parseMonth(values){
    values = values || [];
    const isDate = x => /^\d{2}\/\d{2}\/\d{4}$/.test(String(x||"").trim());
    const norm = x => String(x||"").trim().toLowerCase().replace(/\s+/g," ");
    let dr = -1;
    for(let i=0;i<Math.min(values.length,10);i++){ if((values[i]||[]).filter(isDate).length >= 5){ dr = i; break; } }
    if(dr < 0) return {dates:[], rows:[]};
    const hdr = values[dr], sub = values[dr+1] || [];
    const cinemaIdx = Math.max(0, sub.findIndex(x => norm(x)==="cinema"));
    const fmtIdx = sub.findIndex(x => norm(x)==="format");
    let dcols = []; hdr.forEach((h,i) => { if(isDate(h)) dcols.push(i); });
    // drop stray dates outside the tab's month (e.g. an empty date formula showing 31/12/1899)
    const ym = h => String(h).trim().slice(3);
    const cnt = {}; dcols.forEach(i => { const k = ym(hdr[i]); cnt[k] = (cnt[k]||0) + 1; });
    const main = Object.keys(cnt).sort((a,b) => cnt[b]-cnt[a])[0];
    dcols = dcols.filter(i => ym(hdr[i]) === main);
    const dates = dcols.map((c,j) => {
      const end = j+1 < dcols.length ? dcols[j+1] : c+9;
      const cols = {};
      for(let k=c;k<end;k++){ const f = LABEL[norm(sub[k])]; if(f && cols[f]==null) cols[f]=k; }
      const [dd,mm,yy] = String(hdr[c]).trim().split("/");
      return {label:String(hdr[c]).trim(), iso:`${yy}-${mm}-${dd}`, day:+dd, cols};
    });
    const rows = [];
    for(let r=dr+2;r<values.length;r++){
      const row = values[r] || [];
      const name = String(row[cinemaIdx]||"").trim();
      if(/^total$/i.test(name) && rows.length) break;           // stop at the table's Total row
      const m = /^(\d+)\s*-\s*(.+)$/.exec(name);
      if(!m) continue;
      let format = "Regular";
      if(fmtIdx >= 0){ format = String(row[fmtIdx]||"").trim() || "Regular"; }
      else { const c = String(row[cinemaIdx+1]||"").trim(); if(FORMAT_RE.test(c)) format = c; }
      const days = dates.map(d => {
        const o = {}; let filled = false;
        for(const f of FIELDS){
          const k = d.cols[f]; const raw = k==null ? "" : String(row[k]==null?"":row[k]).trim();
          o[f] = num(raw);
          if(f!=="admits" && raw!=="" && o[f]==null) o[f] = 0;   // non-numeric text keeps "non-empty" status
          if(f==="spkwt" && raw!=="") filled = true;
        }
        return finishDay(o, filled);
      });
      rows.push({cinema:name, code:m[1], name:m[2].trim(), format, days});
    }
    return {dates: dates.map(({label,iso,day}) => ({label,iso,day})), rows};
  }
  function finishDay(o, filled){
    o.filled = filled; o.pkdw = (o.spkdw||0)+(o.tpkdw||0)+(o.kpkdw||0); o.pkwt = (o.spkwt||0)+(o.tpkwt||0)+(o.bmod||0);
    return o;
  }

  /* Compact JSON form for data.json: day = 0 when empty, else [admits,spkwt,spkdw,tpkwt,tpkdw,bmod] with nulls. */
  function pack(m, title){
    return {title, dates: m.dates.map(d => d.label),
      rows: m.rows.map(r => [r.cinema, r.format, r.days.map(x => {
        if(FIELDS.every(f => x[f]==null)) return 0;
        const a = FIELDS.map(f => x[f]); while(a.length && a[a.length-1]==null) a.pop(); return a;
      })])};
  }
  function unpack(p){
    const dates = p.dates.map(l => { const [dd,mm,yy] = l.split("/"); return {label:l, iso:`${yy}-${mm}-${dd}`, day:+dd}; });
    const rows = p.rows.map(([cinema, format, ds]) => {
      const m = /^(\d+)\s*-\s*(.+)$/.exec(cinema) || [null, "", cinema];
      return {cinema, code:m[1], name:m[2].trim(), format, days: ds.map(a => {
        const o = {}; FIELDS.forEach((f,i) => o[f] = Array.isArray(a) && a[i]!=null ? a[i] : null);
        return finishDay(o, o.spkwt!=null);
      })};
    });
    return {dates, rows, title:p.title};
  }

  /* Aggregation. Days strictly before todayIso are "due"; dates after today are excluded from totals and reported in `future`. */
  function stats(m, todayIso){
    const due = m.dates.map(d => d.iso < todayIso);
    const inScope = m.dates.map(d => d.iso <= todayIso);
    const dueN = due.filter(Boolean).length;
    let lastIdx = -1; m.dates.forEach((d,i) => { if(due[i] && m.rows.some(r => r.days[i].filled)) lastIdx = i; });
    const future = [];
    const rowStats = m.rows.map(r => {
      const s = {spkdw:0,tpkdw:0,kpkdw:0,pkdw:0,pkwt:0,admits:0,missed:0,missedDates:[]};
      r.days.forEach((x,i) => {
        if(!inScope[i]){ if(x.filled) future.push({cinema:r.cinema, format:r.format, label:m.dates[i].label}); return; }
        s.spkdw+=x.spkdw||0; s.tpkdw+=x.tpkdw||0; s.kpkdw+=x.kpkdw||0; s.pkdw+=x.pkdw; s.pkwt+=x.pkwt; s.admits+=x.admits||0;
        if(due[i] && !x.filled){ s.missed++; s.missedDates.push(m.dates[i].label); }
      });
      s.total = s.pkdw + s.pkwt; s.share = s.total ? s.pkdw/s.total : 0;
      return Object.assign({cinema:r.cinema, code:r.code, name:r.name, format:r.format, days:r.days}, s);
    });
    const siteMap = new Map();
    rowStats.forEach(r => {
      let s = siteMap.get(r.code);
      if(!s){ s = {code:r.code, name:r.name, cinema:r.cinema, formats:[], rows:[], spkdw:0,tpkdw:0,kpkdw:0,pkdw:0,pkwt:0,admits:0,missed:0, daily:m.dates.map(()=>0), filledDaily:m.dates.map(()=>true)}; siteMap.set(r.code, s); }
      s.formats.push(r.format); s.rows.push(r);
      ["spkdw","tpkdw","kpkdw","pkdw","pkwt","admits","missed"].forEach(k => s[k]+=r[k]);
      r.days.forEach((x,i) => { if(inScope[i]) s.daily[i]+=x.pkdw; if(!x.filled) s.filledDaily[i]=false; });
    });
    const sites = [...siteMap.values()].map(s => {
      s.total = s.pkdw + s.pkwt; s.share = s.total ? s.pkdw/s.total : 0;
      s.dwDays = s.daily.filter(v => v>0).length;
      s.avgDwDay = s.dwDays ? s.pkdw/s.dwDays : 0;
      s.peak = Math.max(0,...s.daily);
      return s;
    });
    const daily = m.dates.map((d,i) => ({label:d.label, iso:d.iso, day:d.day, due:due[i],
      pkdw: inScope[i] ? m.rows.reduce((a,r) => a + r.days[i].pkdw, 0) : 0,
      spkdw: inScope[i] ? m.rows.reduce((a,r) => a + (r.days[i].spkdw||0), 0) : 0,
      tpkdw: inScope[i] ? m.rows.reduce((a,r) => a + (r.days[i].tpkdw||0), 0) : 0,
      filled: m.rows.filter(r => r.days[i].filled).length,
      dwSites: sites.filter(s => s.daily[i] > 0).length }));
    const tot = rowStats.reduce((a,r) => { ["spkdw","tpkdw","kpkdw","pkdw","pkwt","total","admits","missed"].forEach(k => a[k]+=r[k]); return a; }, {spkdw:0,tpkdw:0,kpkdw:0,pkdw:0,pkwt:0,total:0,admits:0,missed:0});
    tot.share = tot.total ? tot.pkdw/tot.total : 0;
    tot.rows = m.rows.length; tot.sites = sites.length;
    tot.dwSites = sites.filter(s => s.pkdw>0).length;
    tot.slots = m.rows.length * dueN;
    tot.compliance = tot.slots ? 1 - tot.missed/tot.slots : 1;
    const dataDays = lastIdx + 1;
    tot.avgPerDay = dataDays ? daily.slice(0,dataDays).reduce((a,d)=>a+d.pkdw,0)/dataDays : 0;
    return {rows:rowStats, sites, daily, tot, lastIdx, dueN, future};
  }

  /* ===== Daily-worker productivity alert =====
   * Per site per day (VIP/Junior rows summed into the site):
   *   Productivity = Admits / Total MH   (Total MH = PKWT + PKDW, incl. Back Up MOD)
   *   Warning day  = PKDW > 0  AND  Productivity < Target − tolerance   (empty Admits counts as 0)
   *   Flag (date D) = D is a warning day.   Warnings this week = warning days in the window ending on D.
   * Verified against DailyWorker_Productivity.xlsx (13 Oct 2026): 58/58 sites, flagged list identical.
   */
  function isoAdd(iso, n){ const [y,m,d] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m-1, d+n)); return t.getUTCFullYear()+"-"+pad(t.getUTCMonth()+1)+"-"+pad(t.getUTCDate()); }
  function siteDays(m, i){
    const out = new Map();
    m.rows.forEach(r => {
      const x = r.days[i]; let s = out.get(r.code);
      if(!s){ s = {code:r.code, cinema:r.cinema, admits:null, mh:0, pkdw:0, spkdw:0, tpkdw:0, kpkdw:0, filled:false}; out.set(r.code, s); }
      if(x.admits!=null) s.admits = (s.admits||0) + x.admits;
      s.mh += x.pkdw + x.pkwt; s.pkdw += x.pkdw; s.spkdw += x.spkdw||0; s.tpkdw += x.tpkdw||0; s.kpkdw += x.kpkdw||0; s.filled = s.filled || x.filled;
    });
    out.forEach(s => { s.prod = s.mh>0 ? (s.admits||0)/s.mh : null; s.admitsMissing = s.admits==null && s.mh>0; });   // empty Admits counts as 0, same as the reference report
    return out;
  }
  // getMonth(key "YYYY-MM") -> unpacked month or null.  cfg = targets.json
  function prodAlerts(getMonth, dateIso, cfg){
    cfg = cfg || {}; const tol = cfg.tolerance!=null ? cfg.tolerance : 1, win = cfg.windowDays || 7, siteCfg = cfg.sites || {};
    const dayCache = {};
    const dayFor = iso => {
      if(iso in dayCache) return dayCache[iso];
      const m = getMonth(iso.slice(0,7)); let r = null;
      if(m){ const i = m.dates.findIndex(d => d.iso === iso); if(i>=0) r = siteDays(m, i); }
      return dayCache[iso] = r;
    };
    const today = dayFor(dateIso);
    if(!today) return null;
    const targetOf = code => (siteCfg[code] && siteCfg[code].target) || cfg.defaultTarget || 14;
    // cfg.alertExclude: [{site:"8", from:"2026-10-27", to:"2026-10-27", note}] — site left out of the alert on those report dates (to omitted = from).
    const excluded = code => (cfg.alertExclude || []).some(e => String(e.site) === String(code) && dateIso >= e.from && dateIso <= (e.to || e.from));
    // cfg.alertInclude: same shape — site flagged on those dates whenever it used DW and prod < target, even inside the tolerance.
    const forced = (s, code) => !!s && s.pkdw > 0 && s.prod != null && s.prod < targetOf(code) && (cfg.alertInclude || []).some(e => String(e.site) === String(code) && dateIso >= e.from && dateIso <= (e.to || e.from));
    const warnOn = (s, code) => !!s && s.pkdw > 0 && s.prod != null && s.prod < targetOf(code) - tol;
    // cfg.weekStartDay (0=Sun … 3=Wed): count from the start of the running fiscal week up to dateIso; otherwise a rolling window.
    const [yy,mm,dd] = dateIso.split("-").map(Number), dow = new Date(Date.UTC(yy, mm-1, dd)).getUTCDay();
    const span = cfg.weekStartDay != null ? ((dow - cfg.weekStartDay + 7) % 7) + 1 : win;
    const windowIsos = Array.from({length:span}, (_,k) => isoAdd(dateIso, k-span+1));
    const rows = [...today.values()].map(s => {
      const c = siteCfg[s.code] || {};
      const warnDates = windowIsos.filter(iso => { const d = dayFor(iso); return d && (warnOn(d.get(s.code), s.code) || (iso === dateIso && forced(s, s.code))); });
      return {code:s.code, cinema:s.cinema, region:c.region || "Belum ada region", target:targetOf(s.code), hasTarget:!!c.target,
        warn:warnDates.length, warnDates, prod:s.prod, admits:s.admits, mh:s.mh, pkdw:s.pkdw, spkdw:s.spkdw, tpkdw:s.tpkdw, kpkdw:s.kpkdw,
        filled:s.filled, admitsMissing:s.admitsMissing, excluded:excluded(s.code), forced:forced(s, s.code), flag:(warnOn(s, s.code) || forced(s, s.code)) && !excluded(s.code)};
    });
    const regionNo = r => { const m = /(\d+)/.exec(r); return m ? +m[1] : 99; };
    rows.sort((a,b) => regionNo(a.region) - regionNo(b.region) || a.cinema.localeCompare(b.cinema));
    const flagged = rows.filter(r => r.flag).sort((a,b) => regionNo(a.region) - regionNo(b.region) || a.prod - b.prod);   // lowest productivity first, like the reference e-mail
    return {date:dateIso, window:windowIsos, tolerance:tol, rows, flagged,
      missingWindow: windowIsos.filter(iso => !dayFor(iso)), noTarget: rows.filter(r => !r.hasTarget)};
  }

  /* ===== Budget vs Actual (Daily Worker MH) =====
   * budget.json: periods [{start,end,week}] + sites {code: [MH per period]}.
   * For month M and cut-off date C (inclusive):
   *   Budget month      = Σ budget of periods inside M
   *   Budget to date    = Σ budget × (days of the period ≤ C) / (days in period)   (pro-rata for the running week)
   *   Actual to date    = Σ PKDW (Station + Training) from the 1st of M to C
   * With admits in budget.json (sites[code] = {mh, admits, prod, fth}):
   *   Budget admits to date = pro-rata like the MH budget;  Actual admits = Admits column of the MH sheet
   *   DW wajar (flex)       = Σ max(0, actual admits / (prod × 90%) − fth × elapsed/days)  — the budget formula re-run on actual admits
   */
  function daysBetween(a, b){ return Math.round((Date.parse(b+"T00:00:00Z") - Date.parse(a+"T00:00:00Z"))/864e5) + 1; }
  function budgetVsActual(m, budget, cutIso){
    if(!m || !budget || !m.dates.length) return null;
    const mStart = m.dates[0].iso, mEnd = m.dates[m.dates.length-1].iso;
    const cut = cutIso < mStart ? null : (cutIso > mEnd ? mEnd : cutIso);
    const periods = (budget.periods||[]).map((p,i) => ({...p, idx:i})).filter(p => p.start >= mStart && p.end <= mEnd);
    if(!periods.length) return null;
    periods.forEach(p => { p.days = daysBetween(p.start, p.end); p.elapsed = !cut || cut < p.start ? 0 : Math.min(p.days, daysBetween(p.start, cut)); p.label = `${+p.start.slice(8)}–${+p.end.slice(8)}`; });
    const sd = new Map(); // code -> per-day pkdw / admits by iso
    m.rows.forEach(r => { let s = sd.get(r.code); if(!s){ s = {code:r.code, cinema:r.cinema, formats:[], byIso:{}, admIso:{}, totIso:{}, admMissing:{}}; sd.set(r.code, s); }
      s.formats.push(r.format); r.days.forEach((x,i) => { const iso = m.dates[i].iso; s.byIso[iso] = (s.byIso[iso]||0) + x.pkdw; s.admIso[iso] = (s.admIso[iso]||0) + (x.admits||0); s.totIso[iso] = (s.totIso[iso]||0) + (x.pkdw||0) + (x.pkwt||0); if(x.admits==null && x.filled) s.admMissing[iso] = true; }); });
    const bOf = code => { const b = (budget.sites||{})[code]; return Array.isArray(b) ? {mh:b} : (b || {}); };
    Object.keys(budget.sites||{}).forEach(code => { if(!sd.has(code) && (bOf(code).mh||[]).some(v => v>0)) sd.set(code, {code, cinema:code+"-(tidak ada di sheet)", formats:[], byIso:{}, admIso:{}, totIso:{}, admMissing:{}}); });
    const hasAdmits = Object.keys(budget.sites||{}).some(c => Array.isArray(bOf(c).admits));
    const rows = [...sd.values()].map(s => {
      const b = bOf(s.code), mh = b.mh || [];
      const per = periods.map(p => {
        const bud = mh[p.idx] || 0;
        let act = 0, adm = 0, tmh = 0, miss = 0; for(let k=0;k<p.days;k++){ const iso = isoAdd(p.start, k); if(cut && iso <= cut){ act += s.byIso[iso] || 0; adm += s.admIso[iso] || 0; tmh += s.totIso[iso] || 0; if(s.admMissing[iso]) miss++; } }
        const o = {label:p.label, week:p.week, start:p.start, end:p.end, budget:bud, budgetToDate: bud * p.elapsed / p.days, actual:act, elapsed:p.elapsed, days:p.days, admitsActual:adm, mhTotal:tmh, admitsMissingDays:miss};
        if(b.admits){ const ba = b.admits[p.idx] || 0; o.admitsBudget = ba; o.admitsBudgetToDate = ba * p.elapsed / p.days;
          o.flex = p.elapsed && b.prod ? Math.max(0, adm / (b.prod * 0.9) - (b.fth ? b.fth[p.idx] : 0) * p.elapsed / p.days) : 0; }
        return o;
      });
      const sum = k => per.reduce((a,x) => a + (x[k]||0), 0);
      const r = {code:s.code, cinema:s.cinema, formats:s.formats, periods:per, budgetMonth:sum("budget"), budgetToDate:sum("budgetToDate"), actual:sum("actual"), prod:b.prod||null,
        admitsActual:sum("admitsActual"), mhTotal:sum("mhTotal")};
      r.prodActual = r.mhTotal > 0 ? r.admitsActual / r.mhTotal : null;   // productivity MTD = total admits ÷ total MH (PKWT + PKDW)
      r.admitsBudgetMonth = 0; r.admitsBudgetToDate = 0;
      if(b.admits){ r.admitsBudgetMonth = sum("admitsBudget"); r.admitsBudgetToDate = sum("admitsBudgetToDate"); r.admitsActual = sum("admitsActual"); r.flex = sum("flex");
        r.admitsVar = r.admitsBudgetToDate ? r.admitsActual / r.admitsBudgetToDate - 1 : null; r.overFlex = r.actual - r.flex; r.admitsMissingDays = sum("admitsMissingDays"); }
      r.variance = r.actual - r.budgetToDate; r.remaining = r.budgetMonth - r.actual;
      r.usage = r.budgetToDate > 0 ? r.actual / r.budgetToDate : null;
      r.status = r.actual === 0 && r.budgetMonth === 0 ? "none" : r.budgetToDate === 0 && r.actual > 0 ? (r.budgetMonth > 0 ? "early" : "nobudget") : r.actual > r.budgetToDate ? "over" : r.usage >= 0.9 ? "near" : "ok";
      return r;
    });
    const T = k => rows.reduce((a,r) => a + r[k], 0);
    const tot = {budgetMonth:T("budgetMonth"), budgetToDate:T("budgetToDate"), actual:T("actual"), admitsActual:T("admitsActual"), mhTotal:T("mhTotal")};
    tot.prodActual = tot.mhTotal > 0 ? tot.admitsActual / tot.mhTotal : null;
    if(hasAdmits){ ["admitsBudgetMonth","admitsBudgetToDate","admitsActual","flex"].forEach(k => tot[k] = T(k)); tot.admitsVar = tot.admitsBudgetToDate ? tot.admitsActual/tot.admitsBudgetToDate - 1 : null; tot.overFlex = tot.actual - tot.flex; }
    tot.variance = tot.actual - tot.budgetToDate; tot.remaining = tot.budgetMonth - tot.actual; tot.usage = tot.budgetToDate ? tot.actual/tot.budgetToDate : null;
    const byPeriod = periods.map((p,i) => ({label:p.label, week:p.week, start:p.start, end:p.end, days:p.days, elapsed:p.elapsed,
      budget: rows.reduce((a,r) => a + r.periods[i].budget, 0), budgetToDate: rows.reduce((a,r) => a + r.periods[i].budgetToDate, 0), actual: rows.reduce((a,r) => a + r.periods[i].actual, 0),
      admitsBudget: rows.reduce((a,r) => a + (r.periods[i].admitsBudget||0), 0), admitsActual: rows.reduce((a,r) => a + r.periods[i].admitsActual, 0), flex: rows.reduce((a,r) => a + (r.periods[i].flex||0), 0)}));
    const count = st => rows.filter(r => r.status === st).length;
    return {month:m.key, cut, hasAdmits, periods:byPeriod, rows, tot, overFlexSites: rows.filter(r => r.overFlex > 0.5).length, counts:{over:count("over"), nobudget:count("nobudget"), early:count("early"), near:count("near"), ok:count("ok"), none:count("none")}};
  }

  const api = {num, tabKey, parseMonth, pack, unpack, stats, pad, isoAdd, siteDays, prodAlerts, budgetVsActual};
  if(typeof module !== "undefined" && module.exports) module.exports = api; else root.MHCore = api;
})(typeof window !== "undefined" ? window : globalThis);

#!/usr/bin/env node
/* Ringkasan harian untuk notifikasi tugas terjadwal: H-1 belum isi + Productivity Alert H-1.
 * Usage: node scripts/report.js [YYYY-MM-DD] [--check-change]   (default: kemarin, zona Asia/Jakarta)
 * Reads the local data.json built by build-data.js (data.json is not in the repo; the repo holds only sealed data).
 * --check-change: also prints "REMINDER: CHANGED" or "REMINDER: UNCHANGED" by comparing a hash of the H-1 flagged list
 *   and the H-1 not-filled list with secure/report-state.json (hash only, so no site names are published), then updates it. */
const path = require("path");
const C = require(path.join(__dirname, "..", "core.js"));
const data = require(path.join(__dirname, "..", "data.json"));
let cfg = {}; try{ cfg = require(path.join(__dirname, "..", "targets.json")); }catch(e){}
let budget = null; try{ budget = require(process.env.MHDW_BUDGET || path.join(__dirname, "..", "budget.json")); }catch(e){}  // budget.json is not in the repo any more (sealed in secure/vault.json); pass MHDW_BUDGET=/path to a private copy
const nowJkt = new Date(Date.now() + 7*3600e3).toISOString().slice(0,10);
const args = process.argv.slice(2), CHECK = args.includes("--check-change");
const date = args.find(x => /^\d{4}-\d{2}-\d{2}$/.test(x)) || C.isoAdd(nowJkt, -1);
let missList = [], flagList = [];
const cache = {}; const getMonth = k => data.months[k] ? (cache[k] = cache[k] || C.unpack(data.months[k])) : null;
const m = getMonth(date.slice(0,7));
const out = [];
out.push(`Data per ${data.generatedAt}`);
if(m){
  const st = C.stats(m, C.isoAdd(nowJkt, 0));
  out.push(`PKDW ${date.slice(0,7)}: ${st.tot.pkdw} MH`);
  const i = m.dates.findIndex(d => d.iso === date);
  if(i >= 0){
    const miss = [...new Set(m.rows.filter(r => !r.days[i].filled).map(r => r.cinema))];
    missList = miss.slice().sort();
    out.push(`Belum isi MH ${date}: ${miss.length ? miss.join(", ") : "semua sudah isi"}`);
  }
}
const a = C.prodAlerts(getMonth, date, cfg);
if(a){
  flagList = a.flagged.map(r => r.cinema).sort();
  out.push(`Productivity Alert ${date}: ${a.flagged.length} site`);
  a.flagged.forEach(r => out.push(`- ${r.region} ${r.cinema}: ${r.warn}x minggu ini, prod ${(Math.round(r.prod*10)/10).toFixed(1)} vs target ${r.target}, DW ${r.pkdw} jam`));
}
if(m && budget){
  m.key = date.slice(0,7);
  const bv = C.budgetVsActual(m, budget, date);
  if(bv){
    const f = v => Math.round(v).toLocaleString("id-ID");
    out.push(`Budget vs Actual DW ${m.key} s.d. ${date}: actual ${f(bv.tot.actual)} MH vs budget s.d. tgl ${f(bv.tot.budgetToDate)} MH (${bv.tot.usage==null?"-":Math.round(bv.tot.usage*100)+"%"}), sisa budget bulan ${f(bv.tot.remaining)} MH`);
    const over = bv.rows.filter(r => r.status==="over").sort((a,b)=>b.variance-a.variance);
    out.push(`Over budget: ${over.length} site${over.length ? " — " + over.slice(0,5).map(r => `${r.cinema} (+${f(r.variance)})`).join(", ") : ""}; tanpa budget: ${bv.counts.nobudget + bv.counts.early} site`);
  }
}
if(CHECK){
  const fs = require("fs"), crypto = require("crypto");
  const file = path.join(__dirname, "..", "secure", "report-state.json");
  const sig = crypto.createHash("sha256").update(JSON.stringify({date, flagList, missList})).digest("hex");
  let prev = null; try{ prev = JSON.parse(fs.readFileSync(file, "utf8")).sig; }catch(e){}
  out.push(`REMINDER: ${prev === sig ? "UNCHANGED" : "CHANGED"}`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({sig, updatedAt: new Date().toISOString()}) + "\n");
}
console.log(out.join("\n"));

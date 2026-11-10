/**
 * Monitoring MH DW — penyimpanan online untuk dashboard:
 *   • Catatan / Reason dari CM & RM          → tab "Catatan Dashboard"
 *   • Pindah budget MH DW antar site (RM)    → langsung mengubah kolom "MH DW After" di sheet "Budget per cinema"
 *                                              + dicatat di tab "Transfer Dashboard"
 *
 * PASANG SEKALI (pakai akun Google yang bisa mengedit spreadsheet budget):
 *   1. Buka https://script.new (proyek Apps Script baru). Hapus isi Code.gs, tempel seluruh file ini, Save.
 *      (Boleh juga dari spreadsheet budget → Extensions → Apps Script; hasilnya sama.)
 *   2. Deploy → New deployment → ikon gerigi → Web app.
 *        Execute as: Me        Who has access: Anyone
 *      Deploy → Authorize access → pilih akun → Advanced → Go to … (unsafe) → Allow → salin "Web app URL" (…/exec)
 *      dan kirim ke admin dashboard (diisi ke config.json → "apiEndpoint").
 *   Kalau kode ini diganti: Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL tetap sama).
 *
 * KEAMANAN: setiap permintaan wajib membawa token dari password dashboard (disimpan terkunci di vault).
 * Di sini hanya ada HASH token-nya. Token region hanya bisa melihat & mengubah site di region itu; token admin semua.
 */
const TOKENS = {
  "052f34e3dab1d7d9b28eeeafe0cf4c491ed67676b834b7cd21d24c2fc6995337": "ALL",
  "3cbf7095c60301cab4adfd52c97602064c99fc600388ef0501248b9dd822a09a": "REGION 1",
  "fcdedb2f543e9f194efc33cfe721eab48938fad4f5832b3ae8152c7dc0fcb1fd": "REGION 2",
  "4a091a0677a0e7e74e68c7204066b634bd17810e8a20fef88b53f4e5434a6c62": "REGION 3",
  "254ffe58d4900b29971118290fc88905140bbb321c1b445360a061ef1427dab1": "REGION 4",
  "5165f0ea1c27c8e925864d110da596b71e9bf64d122ae45b6070bdfbfd18cb85": "REGION 5",
  "0f9dd65dd3477c659d46fed832b15bb9194d936ffdbd8e01616bcbf49b3b24df": "REGION 6",
};
const BUDGET_SHEET = 'Budget per cinema';
const SHEET_ID = '1Adrxk9YqDGanMTgkuxh3RS-8X5W83-9Gy9kzk62BNsw';   // spreadsheet budget (dipakai kalau script ini berdiri sendiri, tidak terpasang di spreadsheet)
function ss_() { let a = null; try { a = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {} return a || SpreadsheetApp.openById(SHEET_ID); }
const NOTES = 'Catatan Dashboard', NOTE_HEAD = ['id', 'timestamp', 'site_code', 'cinema', 'region', 'tanggal', 'konteks', 'kategori', 'reason', 'sumber', 'dicatat_oleh', 'status'];
const TRANSFERS = 'Transfer Dashboard', TR_HEAD = ['id', 'timestamp', 'bulan', 'region', 'dari_kode', 'dari_cinema', 'ke_kode', 'ke_cinema', 'mh_dari', 'rate_dari', 'mh_ke', 'rate_ke', 'amount',
  'dari_sebelum', 'dari_sesudah', 'ke_sebelum', 'ke_sesudah', 'alasan', 'oleh', 'akses', 'status'];
const MON = {jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12};

function scopeOf_(token) {
  if (!token) return null;
  const hex = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  return TOKENS[hex] || null;
}
const canSee_ = (scope, region) => scope === 'ALL' || String(region || '').trim() === scope;
function tab_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold'); }
  return sh;
}
function rows_(sh) {
  const v = sh.getDataRange().getValues(), head = v.shift();
  return v.map((r, i) => { const o = {_row: i + 2}; head.forEach((k, j) => { const x = r[j]; o[k] = x instanceof Date ? Utilities.formatDate(x, 'Asia/Jakarta', k === 'tanggal' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX") : x; }); return o; });
}
/** Budget sheet → {month, cols, sites: {code: {row, region, cinema, mh, rate, formula}}} */
function budget_() {
  const sh = ss_().getSheetByName(BUDGET_SHEET);
  if (!sh) throw new Error('Sheet "' + BUDGET_SHEET + '" tidak ada');
  const rng = sh.getDataRange(), v = rng.getValues(), f = rng.getFormulas();
  const H = v[0].map(h => String(h).trim().toLowerCase());
  const col = (...k) => H.findIndex(h => k.every(x => h.indexOf(x) >= 0));
  const C = {region: col('region'), cinema: col('cinema'), mh: col('mh dw after'), rate: col('rate'), adm: col('budget_admits')};
  if (C.cinema < 0 || C.mh < 0 || C.rate < 0) throw new Error('Kolom Cinema / MH DW After / Rate tidak ketemu');
  const mName = (H[C.adm] || '').match(/budget_admits\s+([a-z]+)/), month = mName ? MON[mName[1].slice(0, 3)] : null;
  const sites = {};
  for (let i = 1; i < v.length; i++) {
    const name = String(v[i][C.cinema] || ''), code = name.split('-')[0];
    if (!/^\d+$/.test(code)) continue;
    sites[code] = {row: i + 1, region: String(v[i][C.region] || '').trim(), cinema: name, mh: Number(v[i][C.mh]) || 0, rate: Number(v[i][C.rate]) || 0, formula: !!f[i][C.mh]};
  }
  return {sh, month, cols: C, sites};
}
const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

function doGet(e) {
  const scope = scopeOf_(e && e.parameter && e.parameter.token);
  if (!scope) return json_({ok: false, error: 'akses ditolak'});
  const notes = rows_(tab_(NOTES, NOTE_HEAD)).filter(n => n.id && n.status !== 'deleted' && canSee_(scope, n.region));
  const transfers = rows_(tab_(TRANSFERS, TR_HEAD)).filter(x => x.id && canSee_(scope, x.region));
  let budgetMonth = null; try { budgetMonth = budget_().month; } catch (err) {}
  return json_({ok: true, scope, notes, transfers, budgetMonth});
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ok: false, error: 'format salah'}); }
  const scope = scopeOf_(body.token);
  if (!scope) return json_({ok: false, error: 'akses ditolak'});
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    if (body.action === 'note.add') return json_(addNotes_(scope, body.notes || [body.note]));
    if (body.action === 'note.delete') return json_(deleteNote_(scope, body.id));
    if (body.action === 'transfer.add') return json_(addTransfer_(scope, body));
    if (body.action === 'transfer.cancel') return json_(cancelTransfer_(scope, body.id, body.by));
    return json_({ok: false, error: 'aksi tidak dikenal'});
  } catch (err) { return json_({ok: false, error: String(err && err.message || err)}); }
  finally { lock.releaseLock(); }
}

function addNotes_(scope, notes) {
  const sh = tab_(NOTES, NOTE_HEAD), have = new Set(rows_(sh).map(n => String(n.id)));
  let b = null; try { b = budget_(); } catch (err) {}
  let added = 0;
  (notes || []).filter(Boolean).forEach(n => {
    if (have.has(String(n.id))) return;
    const region = (b && b.sites[String(n.site)] && b.sites[String(n.site)].region) || n.region || '';
    if (!canSee_(scope, region)) return;
    sh.appendRow([n.id, new Date(), n.site, n.cinema, region, "'" + (n.date || ''), n.context, n.category, n.reason, n.source, n.by, 'ok']);
    added++;
  });
  return {ok: true, added};
}
function deleteNote_(scope, id) {
  const sh = tab_(NOTES, NOTE_HEAD), n = rows_(sh).find(x => String(x.id) === String(id));
  if (!n) return {ok: true};
  if (!canSee_(scope, n.region)) return {ok: false, error: 'akses ditolak'};
  sh.getRange(n._row, NOTE_HEAD.indexOf('status') + 1).setValue('deleted');
  return {ok: true};
}

function addTransfer_(scope, t) {
  const b = budget_(), from = b.sites[String(t.from)], to = b.sites[String(t.to)], mh = Math.round(Number(t.mh) * 10) / 10;
  if (!from || !to) return {ok: false, error: 'site tidak ada di sheet budget'};
  if (String(t.from) === String(t.to)) return {ok: false, error: 'site asal dan tujuan sama'};
  if (!(mh > 0)) return {ok: false, error: 'jumlah jam harus lebih dari 0'};
  if (t.month && b.month && Number(String(t.month).slice(5, 7)) !== b.month) return {ok: false, error: 'sheet budget sekarang bukan untuk bulan ' + t.month};
  if (!canSee_(scope, from.region) || !canSee_(scope, to.region)) return {ok: false, error: 'hanya bisa memindah antar site di region sendiri'};
  if (from.formula || to.formula) return {ok: false, error: 'kolom MH DW After site ini berisi rumus — ubah manual di sheet'};
  if (mh > from.mh + 1e-9) return {ok: false, error: 'melebihi budget site asal (' + from.mh + ' jam)'};
  if (!from.rate || !to.rate) return {ok: false, error: 'rate site belum ada'};
  const mhTo = Math.round(mh * from.rate / to.rate * 10) / 10, amount = Math.round(mh * from.rate);
  const fAfter = Math.round((from.mh - mh) * 10) / 10, tAfter = Math.round((to.mh + mhTo) * 10) / 10;
  b.sh.getRange(from.row, b.cols.mh + 1).setValue(fAfter);
  b.sh.getRange(to.row, b.cols.mh + 1).setValue(tAfter);
  const id = 'tr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  tab_(TRANSFERS, TR_HEAD).appendRow([id, new Date(), t.month || '', from.region, t.from, from.cinema, t.to, to.cinema, mh, from.rate, mhTo, to.rate, amount,
    from.mh, fAfter, to.mh, tAfter, t.reason || '', t.by || '', scope, 'ok']);
  return {ok: true, id, mhTo, amount, fromAfter: fAfter, toAfter: tAfter};
}
function cancelTransfer_(scope, id, by) {
  const sh = tab_(TRANSFERS, TR_HEAD), x = rows_(sh).find(r => String(r.id) === String(id));
  if (!x) return {ok: false, error: 'transfer tidak ditemukan'};
  if (x.status !== 'ok') return {ok: true};
  if (!canSee_(scope, x.region)) return {ok: false, error: 'akses ditolak'};
  const b = budget_(), from = b.sites[String(x.dari_kode)], to = b.sites[String(x.ke_kode)];
  if (!from || !to) return {ok: false, error: 'site tidak ada di sheet budget'};
  if (to.mh + 1e-9 < Number(x.mh_ke)) return {ok: false, error: 'budget site tujuan sudah berkurang, batalkan manual'};
  b.sh.getRange(from.row, b.cols.mh + 1).setValue(Math.round((from.mh + Number(x.mh_dari)) * 10) / 10);
  b.sh.getRange(to.row, b.cols.mh + 1).setValue(Math.round((to.mh - Number(x.mh_ke)) * 10) / 10);
  sh.getRange(x._row, TR_HEAD.indexOf('status') + 1).setValue('batal' + (by ? ' (' + by + ')' : ''));
  return {ok: true};
}

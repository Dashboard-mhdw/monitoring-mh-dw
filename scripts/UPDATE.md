# Update harian data dashboard (terkunci per region)

Instruksi ini dijalankan oleh tugas terjadwal (atau manual) di sesi Claude yang punya konektor **Google Sheets** dan akses push ke repo ini.

Data dashboard **tidak** disimpan terbuka di repo. Yang di-commit hanya file terkunci di `secure/`:
`secure/m/<YYYY-MM>/<all|r1..r6>.json` (data harian per bulan), `secure/b/<YYYY-MM>/<all|r1..r6>.json` (budget per bulan),
keduanya dikunci dengan kunci publik tiap region/admin di `secure/keys.json`, dan `secure/index.json` (daftar bulan + waktu update).
Proses ini tidak butuh password.

Spreadsheet ID: `1U_tpeKDUh983e6Ez13_j-JRCyXUtNjFPnDoIm7AhOWk`

1. Panggil Google Sheets `get_spreadsheet` dengan `fields: ["sheets.properties.title"]`. Tab bulanan adalah tab dengan judul berformat `Bulan Tahun` (contoh: `October 2026`, `Sep 2026`, `Aprl 2025`).
2. Tentukan tab yang perlu dibaca:
   - tab bulan berjalan dan bulan sebelumnya (zona waktu Asia/Jakarta);
   - tab bulanan lain yang **belum ada** di `secure/index.json` (array `months`, key `YYYY-MM`).
3. Untuk setiap tab, panggil `get_values` dengan range `'<Judul Tab>'!A1:LZ140`. Simpan respons JSON apa adanya (`{"range": ..., "values": ...}`) ke `raw/<judul>.json`. Kalau respons terlalu besar dan disimpan otomatis ke file, salin file itu ke `raw/`.
4. Jalankan: `node scripts/build-data.js raw/*.json` → membuat `data.json` lokal (di-.gitignore, jangan di-commit).
   - Script berhenti dengan kode ≠ 0 kalau tidak ada bulan yang berhasil diproses. Kalau itu terjadi, **jangan commit**, dan laporkan errornya.
5. Jalankan: `node scripts/seal-data.mjs` → mengunci bulan-bulan di `data.json` ke `secure/m/…` dan memperbarui `secure/index.json`.
6. **Budget** (spreadsheet budget `1Adrxk9YqDGanMTgkuxh3RS-8X5W83-9Gy9kzk62BNsw`): panggil Google Sheets `get_spreadsheet` dengan
   `includeGridData: true`, `ranges: ["'Budget per cinema'!A1:V75", "'Alokasi per Week'!A1:J70", "'Budget Region'!A1:K20"]`,
   `fields: ["sheets.properties.title", "sheets.data.rowData.values.formattedValue", "sheets.data.rowData.values.effectiveValue"]`.
   Respons biasanya disimpan otomatis ke file tool-results; salin ke `raw/budget-sheet.json`. Lalu:
   `node scripts/build-budget.mjs raw/budget-sheet.json raw && node scripts/seal-budget.mjs raw/budget-*.json`
   (bulan budget dibaca dari judul kolom "Budget_Admits <Bulan>"; bulan lain yang sudah terkunci tidak berubah).
   Kalau langkah budget gagal, lanjutkan saja tanpa budget dan sebutkan errornya di laporan.
7. Jalankan: `node scripts/report.js --check-change` → ringkasan H-1 (belum isi + Productivity Alert) dan baris terakhir `REMINDER: CHANGED|UNCHANGED`. Perintah ini juga memperbarui `secure/report-state.json` (hanya hash, tanpa nama site).
8. Commit **hanya** folder `secure/` ke branch `main` dengan pesan `data: update <tanggal WIB>`, lalu push. `raw/` dan `data.json` sudah di-.gitignore.

Budget tidak ikut di ringkasan ini (budget hanya bisa dibuka dengan password di dashboard). Untuk menyertakan budget saat menjalankan manual: `MHDW_BUDGET=/path/pribadi/budget.json node scripts/report.js`.

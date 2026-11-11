# Monitoring MH DW

Dashboard pemakaian **Man Hour Daily Worker (PKDW)** untuk 59 site, bersumber dari spreadsheet **Man Hour Usage**.

**Link:** https://dashboard-mhdw.github.io/monitoring-mh-dw/

## Cara kerja

```
Google Sheets "Man Hour Usage"
        │  (tiap hari, otomatis: tugas terjadwal Claude + konektor Google Sheets)
        ▼
scripts/build-data.js  →  data.json (lokal)  →  scripts/seal-data.mjs  →  secure/ (terkunci per region)  →  commit
        │
        ▼
GitHub Pages: masukkan password  →  data region itu dibuka di browser
```

- `index.html` hanya kerangka halaman. Isinya dirender oleh modul di `src/`.
- Dashboard tersedia dalam **dua bahasa (Indonesia / English)**. Ganti lewat tombol di sidebar, di pojok kanan atas (HP), atau di menu **Lainnya**. Pilihan bahasa dan tema (Auto/Terang/Gelap) diingat browser. Email Productivity Alert selalu berbahasa Inggris.

### Struktur kode
```
index.html                 kerangka (sidebar, navbar, tab bar)
core.js                    aturan domain, dipakai juga oleh script Node
src/styles/                tokens.css · base.css · layout.css · components.css
src/app/main.js            entry: router, navigasi, event global, boot
src/app/store.js           lapisan data (data terkunci per region, targets.json), tanpa DOM
src/app/vault.js           password → kunci privat (secure/vault.json) → buka data secure/m/… di browser
src/app/features/gate.js   halaman password
src/app/state.js           state UI (halaman, bulan, filter, tema)
src/app/i18n.js            t(key), ganti bahasa
src/app/locales/id.js|en.js  kamus teks
src/app/format.js          format angka & tanggal sesuai bahasa
src/app/ui/                komponen: dom, components, charts, sheet
src/app/features/          satu file per halaman + exports.js
src/app/reasons.js         lapisan data catatan/reason (Google Sheet via Apps Script, cadangan di browser)
```
Setelah mengubah teks, jalankan `node scripts/check-i18n.mjs` untuk memastikan kedua bahasa lengkap.
- `core.js` berisi rumus parsing dan perhitungan. Dashboard dan script pembuat data memakai file yang sama, jadi angkanya pasti identik.
- `data.json` adalah data ringkas semua tab bulan, hanya ada lokal saat update. Yang di-commit versi terkuncinya di `secure/`.
- `scripts/build-data.js` mengubah hasil baca Google Sheets menjadi `data.json`; `scripts/seal-data.mjs` menguncinya per region.
- `scripts/UPDATE.md` berisi instruksi langkah demi langkah yang dijalankan tugas terjadwal.

Di kanan atas dashboard tertulis **"Data per …"**, yaitu waktu terakhir data diambil. Titiknya berubah merah kalau data sudah lebih dari 26 jam tidak diperbarui.

## Pemakaian
- **Setiap pagi:** buka link, lalu masuk ke **Cek Pengisian H-1**. Salin teks reminder dan kirim ke grup.
- **Productivity Alert:** pilih rentang tanggal **Dari – s.d.** (atau tombol cepat *Kemarin*, *Jum–Min*, *7 hari*). Setiap **Senin** rentangnya otomatis **Jumat–Minggu**, jadi reminder akhir pekan langsung siap; tabel, email, dan Excel mendapat kolom *Date* (satu baris per site per hari). Buka menu Productivity Alert, klik **Salin email**, lalu tempel di Outlook/Gmail untuk RM & cinema. Formatnya sudah tabel lengkap. Klik **Unduh Excel** untuk lampiran `DailyWorker_Productivity_<tanggal>.xlsx` (format sama dengan file referensi: sheet *Flagged* dan *All cinemas*; kolom HitDay/HitYTD dikosongkan karena tidak ada di sheet Man Hour).
- **Budget vs Actual:** menu Budget vs Actual menampilkan pemakaian DW s.d. kemarin dibanding budget per site (pro-rata minggu berjalan), lengkap dengan site over budget dan site tanpa budget. Klik **Salin ringkasan** untuk WA atau **Unduh Excel**. Di bagian bawah halaman ada **Email FYI ke Kak Cinthia**: isi email (pemakaian MH DW MTD vs budget, admits, budget 1 bulan, sisa/over) beserta tabel per region, ter-update otomatis sesuai tanggal "s.d.". Klik **Salin email** lalu tempel di Outlook/Gmail.
- **Harian per Site:** matriks setiap site × tanggal. Nyalakan/matikan metrik yang mau dilihat (MH DW, Station/Training PKDW, MH PKWT, Total MH, Admits, Productivity, % DW). Bisa difilter (pakai DW, prod di bawah target, ada hari belum isi), per region, diurutkan, dan diunduh ke Excel sesuai tampilan. Pilihan metrik diingat browser.
- **Pencarian:** tekan **Ctrl + K** (Mac ⌘K) atau **/**, atau ikon 🔍 di HP, untuk mencari site, halaman, bulan, tanggal, catatan reason, dan unduhan.
- **Setiap tanggal 1:** buka **PKDW 59 Site**, pilih bulan sebelumnya, lalu klik **Unduh Excel**.
- Kalau sheet baru saja diisi dan ingin langsung terlihat, jalankan tugas terjadwal **"Update data Monitoring MH DW"** secara manual di halaman Scheduled tasks Claude (klik *Run now*), tunggu beberapa menit, lalu refresh.

## Catatan & Reason
Setiap site yang ter-flag (Productivity Alert), over budget, tanpa budget, atau belum isi H-1 punya tombol **+ Reason**. Klik tombolnya, isi jawaban CM (tanggal, konteks, kategori, reason, sumber, nama pencatat), lalu **Simpan reason**. Semua catatan per site bisa dilihat kembali di tombol yang sama, di detail site, dan di menu **Catatan & Reason**. Menu itu juga menampilkan site yang belum punya reason, ringkasan per kategori, riwayat lengkap yang bisa difilter dan dicari, serta **Unduh Excel**.

Catatan disimpan di Google Sheet **"MH DW Notes"** lewat Apps Script, sehingga permanen, bisa dibuka dari perangkat mana pun, dan bisa dibaca langsung di Sheet. Sebelum Sheet disambungkan, catatan disimpan sementara di browser dan otomatis dipindahkan ke Sheet begitu tersambung.

### Pasang sekali (±5 menit)
1. Buat Google Sheet baru di akun Google kamu, beri nama **MH DW Notes**.
2. Di Sheet itu buka **Extensions → Apps Script**. Hapus isi `Code.gs`, tempel seluruh isi `scripts/notes-apps-script.gs`, lalu klik **Save**.
3. Klik **Deploy → New deployment**, klik ikon gerigi, lalu pilih **Web app**. Atur **Execute as: Me** dan **Who has access: Anyone**, lalu klik **Deploy**. Saat diminta, klik **Authorize access**, pilih akunmu, lalu **Advanced → Go to … (unsafe) → Allow**.
4. Salin **Web app URL** (berakhiran `/exec`), lalu tempel ke `config.json` di kolom `notesEndpoint`. Bisa juga kirim URL-nya ke Claude untuk dipasangkan.

Catatan keamanan: URL web app bisa dipakai siapa saja yang tahu alamatnya. Script hanya menerima kiriman yang menyertakan kunci `notesKey` (sama dengan `KEY` di script). Catatan tidak pernah benar-benar dihapus: tombol hapus hanya menandai baris sebagai `deleted` di Sheet, jadi riwayatnya tetap ada.

## Rumus
| Istilah | Rumus |
|---|---|
| PKDW (MH DW) | Station PKDW + Training PKDW |
| MH PKWT | Station PKWT + Training PKWT + Back Up MOD |
| Total MH | PKDW + PKWT |
| Sudah isi | kolom **Station PKWT** pada tanggal itu terisi (angka 0 juga dihitung) |
| Site | satu kode cinema; baris VIP/Junior digabung ke site-nya |
| Productivity | Admits ÷ Total MH per site per hari (Admits kosong = 0) |
| Productivity Alert | site ter-flag kalau PKDW > 0 **dan** productivity < target − 1; warnings minggu ini = jumlah hari seperti itu dalam minggu fiskal berjalan (Rabu–Selasa) s.d. tanggal laporan |

## Akses dengan password

Dashboard terkunci: halaman pertama meminta password. Ada **6 password region** (masing-masing hanya membuka site di region itu, di semua halaman) dan **1 password admin** (semua site, plus email reminder per region dan email FYI budget). Password tidak pernah disimpan di repo atau dikirim ke mana pun; dashboard terkunci lagi saat tab ditutup atau saat klik **Keluar**.

Cara kerjanya:

| File | Isi |
|---|---|
| `secure/keys.json` | kunci publik tiap region + admin (aman dibagikan) |
| `secure/vault.json` | kunci privat tiap region/admin, masing-masing dikunci password-nya (PBKDF2-SHA256 → AES-GCM) |
| `secure/m/<YYYY-MM>/<all\|r1..r6>.json` | data harian per bulan, dikunci ke kunci publik scope itu (ECDH P-256 + AES-GCM) |
| `secure/b/<YYYY-MM>/<all\|r1..r6>.json` | budget per bulan (MH, Rp, rate, FT, forecast admits, alokasi per minggu) dari spreadsheet budget, dikunci sama seperti data |
| `secure/index.json` | daftar bulan dan waktu update (tanpa data site) |

Update otomatis (`scripts/UPDATE.md`) hanya butuh kunci publik, jadi tidak perlu tahu password. `data.json` dan `budget.json` hanya ada lokal (di-.gitignore).

**Budget** dibaca dari spreadsheet budget (sheet *Budget per cinema* + *Alokasi per Week*) oleh `scripts/build-budget.mjs`, lalu dikunci per region oleh `scripts/seal-budget.mjs`. Ini ikut berjalan di update otomatis.

**Ganti password** — dari salinan pribadi di luar repo, dengan `data.json` lengkap (semua bulan):

```
node scripts/seal-vault.mjs /path/pribadi/passwords.json        # kunci baru + vault baru
node scripts/seal-data.mjs /path/pribadi/data.json             # kunci ulang semua bulan data
node scripts/seal-budget.mjs /path/pribadi/budget-*.json       # kunci ulang semua bulan budget
```

`passwords.json` = `{"REGION 1": "...", ..., "REGION 6": "...", "ADMIN": "..."}`. Budget Sep, Okt, dan Des 2026 masih dari **payroll.xlsx sheet PROD 14**; mulai Nov 2026 dari spreadsheet budget.

Target productivity (12 atau 14) dan region setiap site ada di `targets.json`, disalin dari laporan DailyWorker_Productivity. Untuk menambah site baru (mis. 72-Paragon Square Mall), tambahkan entri dengan kode site-nya.

Isian di tanggal yang belum lewat (biasanya salah kolom) tidak ikut dijumlah, tetapi ditampilkan sebagai peringatan. Total per bulan sudah dicocokkan dengan kolom MTD "PKDW" di setiap tab, dari Januari 2025 sampai Oktober 2026.

## Catatan privasi
Situs GitHub Pages bersifat publik, tetapi data man hour, admits, dan budget hanya tersimpan dalam bentuk terkunci (lihat **Akses dengan password**). Yang terbuka hanya `targets.json` (daftar site, region, target productivity) dan `secure/index.json` (daftar bulan). Catatan/Reason disimpan lewat Apps Script; dashboard hanya menampilkan catatan site di region password yang dipakai.

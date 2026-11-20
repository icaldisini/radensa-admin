# DENGUARD Admin

Konsol surveilans **DENGUARD** (*Dengue Geospatial Early Warning and Risk Detection*) untuk laptop: memantau risiko DBD per kecamatan di DKI Jakarta, perkiraan 5 minggu (minggu berjalan + 4 minggu), dan kualitas model.

Aplikasi web statis (HTML, CSS, JavaScript), **tanpa build step**. Data dibaca langsung dari Supabase; perhitungan dan pipeline ada di repositori backend `radensa-agc`.

## Halaman

| Halaman | Isi |
|---|---|
| Beranda | Ringkasan risiko, peta, kecamatan prioritas, tren dan iklim |
| Peta Zonasi | Peta perkiraan dan historis sejak 2017, EWARS dan Kanal Endemis berdampingan |
| Forecast | Perkiraan 5 minggu, distribusi zona, detail per kecamatan |
| Kecamatan | Profil satu kecamatan: ambang, tren, iklim, pola tahunan |
| Eksplorasi Data | Distribusi, pola musiman, korelasi, autokorelasi spasial |
| Model & Evaluasi | Status pipeline, model aktif, perbandingan model, SHAP |
| Simulasi | Uji pengaruh jumlah kasus terhadap zona risiko |
| Peringatan & Aksi | Kecamatan yang naik zona, jangkauan warga, rekomendasi aksi |
| Metodologi | Alur data, metode zonasi, keterbatasan |

## Menjalankan di komputer

Tidak perlu instalasi. Buka `index.html` di peramban, atau jalankan server statis:

```bash
python -m http.server 8000
# lalu buka http://localhost:8000
```

Layar yang didukung: laptop, lebar minimal 1200 px.

## Konfigurasi

Semua ada di `assets/js/config.js`:

| Kunci | Fungsi |
|---|---|
| `supabaseUrl`, `anonKey` | Alamat proyek dan **kunci publik** (*publishable/anon*). Hak akses dibatasi oleh Row Level Security di Supabase. |
| `wargaUrl` | Alamat aplikasi DENGUARD Warga setelah di-deploy (untuk tombol "Buka DENGUARD Warga"). |

> **Jangan pernah** menaruh kunci `service_role` di repositori ini. Kunci itu hanya untuk pipeline backend.

## Deploy

Situs statis, misalnya Netlify atau GitHub Pages: *publish directory* = akar repositori, tanpa perintah build. Setelah deploy, isi `wargaUrl` dengan alamat aplikasi Warga.

## Sumber data

- **Supabase** (hanya `SELECT` dengan kunci publik): kasus DBD mingguan, iklim, perkiraan, ambang zonasi, riwayat model.
- `data/kecamatan_44.js`: batas wilayah 44 kecamatan (GeoJSON).
- `data/snapshot_sipeda.js`: snapshot statis hasil riset (perbandingan 5 model dengan 20 fitur, uji 2023–2025; SHAP, VIF, dan Spearman dari riset awal 21 fitur; Moran's I).

## Catatan penting

- Minggu memakai **minggu epidemiologi MMWR** (Minggu–Sabtu), sama dengan kalender Dinkes DKI, bukan minggu ISO. Satu tahun epi bisa 52 atau 53 minggu; tampilan "minggu dalam tahun" dibatasi sampai minggu ke-52 (W53 tetap dihitung di total tahunan).
- Minggu yang sudah berakhir tetapi belum dirilis Dinkes ditampilkan sebagai **estimasi** (diambil dari perkiraan sebelumnya) dan otomatis diganti saat data aktual terbit.
- Metrik model utama yang ditampilkan adalah evaluasi riset fold 3 (uji 2025).

## Struktur

```
index.html
assets/
  css/app.css
  js/            config, util, data, charts, map, app
  js/views/      satu berkas per halaman
  img/           logo
data/            batas kecamatan dan snapshot riset
```

DENGUARD adalah alat bantu kewaspadaan, bukan alat diagnosis.

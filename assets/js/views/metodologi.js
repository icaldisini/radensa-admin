(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt } = R;

  R.views.metodologi = { title: 'Metodologi', render };

  const SNAP = window.DG_SNAP || {};

  function render(root) {
    const S = R.S, am = S.active;
    const mo = SNAP.moran;
    const step = (n, color, title, desc, extra = '') => `
      <div class="method-step"><div class="method-num" style="--mc:${color}">${n}</div>
        <div><div class="method-title">${title}</div><div class="method-desc">${desc}</div>${extra}</div></div>`;
    const tags = (a) => `<div class="method-tags">${a.map((t) => `<span class="method-tag">${t}</span>`).join('')}</div>`;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Metodologi</h1>
          <p class="sub"><b>DENGUARD</b> — Dengue Geospatial Early Warning and Risk Detection. Sistem peringatan dini DBD per kecamatan DKI Jakarta berbasis data surveilans, iklim satelit, dan struktur spasial antar kecamatan.</p>
        </div>
      </div>

      <section class="panel mb24">
        <div class="panel-h"><h2><span class="hic">${u.icon('layers')}</span>Arsitektur dan Metodologi</h2><span class="meta">6 tahap, otomatis tiap minggu</span></div>
        <div style="border-top:1px solid var(--line)">
        ${step(1, '#c0111f', 'Pengumpulan dan Integrasi Data',
          'Kasus DBD mingguan 44 kecamatan di-scrape dari portal surveilans Dinas Kesehatan DKI Jakarta dan disejajarkan pada <b>minggu epidemiologi MMWR</b> (Minggu–Sabtu) yang dipakai Dinkes — bukan minggu ISO. Iklim mingguan (curah hujan, suhu, kelembapan) diambil dari satelit melalui Google Earth Engine: CHIRPS untuk hujan dengan cadangan ERA5, dan ERA5 untuk suhu dan kelembapan. 8 minggu terakhir di-scrape ulang setiap pekan karena laporan rumah sakit sering direvisi.',
          tags(['Surveilans Dinkes DKI', 'CHIRPS / ERA5 (GEE)', 'Batas kecamatan BPS', 'Supabase (PostgreSQL)']))}
        ${step(2, '#8a6bc4', 'Feature Engineering',
          'Pembentukan fitur lag temporal (1–2 minggu) untuk kasus dan iklim, rata-rata bergulir 4 dan 8 minggu, rata-rata kasus kecamatan tetangga (Queen contiguity), endemisitas kecamatan, penyandian musiman sin/cos minggu, serta interaksi hujan × suhu. Total <b>20 fitur</b> dalam 4 domain: epidemiologi, iklim, spasial, musiman.',
          `<div class="formula"><b>lag kasus 1</b> = kasus[t−1]<br><b>kasus tetangga</b> = mean(kasus[t−1, tetangga_i])<br><b>musiman</b> = sin(2π · minggu / 52), cos(2π · minggu / 52)<br><b>interaksi</b> = curah_hujan × suhu_rata</div>`)}
        ${step(3, '#0e8a93', "Analisis Spasial (Moran's I)",
          `Autokorelasi spasial kasus diuji dengan Moran's I memakai matriks bobot Queen contiguity (kecamatan yang berbatasan langsung). ${mo ? `Pada riset awal 2017–2025: <b>I = ${fmt.num(mo.I, 3)}</b>, z = ${fmt.num(mo.z_score, 2)}, p = ${fmt.num(mo.p_value, 3)} — klaster spasial signifikan.` : ''} Ini memvalidasi perlunya fitur spasial: penularan DBD tidak berhenti di batas administratif. Halaman Eksplorasi Data menghitung ulang nilai ini secara langsung.`,
          `<div class="formula"><b>I</b> = (N / S₀) · Σᵢ Σⱼ wᵢⱼ (xᵢ − x̄)(xⱼ − x̄) / Σᵢ (xᵢ − x̄)²<br>N = jumlah kecamatan, S₀ = Σ wᵢⱼ, wᵢⱼ = bobot Queen</div>`)}
        ${step(4, '#e08a1e', 'Pelatihan Model dengan Rolling-Window CV',
          `Lima model kandidat dibandingkan: Naive baseline, Poisson Ridge, XGBoost, <b>LightGBM</b>, dan CatBoost (semua Tweedie kecuali Poisson). Target ditransformasi log1p untuk menangani distribusi condong dan banyak nol. Model aktif saat ini: <b>${u.esc(am?.algoritma || 'LightGBM')}</b> versi <span class="mono">${u.esc(am?.versi || '–')}</span> (R² ${fmt.num(R.S.headline.r2, 2)}, MAE ${fmt.num(R.S.headline.mae, 2)}; ${R.S.headline.label}). Bobot di-fit ulang tiap minggu dengan data terbaru; pencarian hyperparameter (Optuna + CV per tahun) diulang sekitar tiap 5 minggu, dan model baru hanya dipromosikan bila R² tidak turun lebih dari 5%.`,
          tags(['Fold 1: latih s/d 2022 → uji 2023', 'Fold 2: latih s/d 2023 → uji 2024', 'Fold 3: latih s/d 2024 → uji 2025']))}
        ${step(5, '#d23a46', 'Sistem Zonasi Dua Ambang',
          'Dua pendekatan WHO dipakai paralel agar saling mengoreksi. <b>EWARS</b> memakai persentil seluruh histori tiap kecamatan sebagai ambang tetap. <b>Kanal Endemis</b> memakai rata-rata dan simpangan baku kasus pada minggu-epi yang sama sehingga memperhitungkan musim.',
          `<div class="formula"><b>EWARS</b> — Hijau: kasus ≤ P50 · Kuning: P50 &lt; kasus ≤ P75 · Merah: kasus &gt; P75<br><b>Kanal Endemis</b> — Hijau: kasus ≤ rata-rata(minggu) · Kuning: s/d rata-rata + 1 SD · Merah: &gt; rata-rata + 1 SD${SNAP.zonasi ? `<br><br>Konsistensi zona prediksi vs aktual (riset awal): EWARS ${fmt.num(SNAP.zonasi.ewars.accuracy, 1)}% · Kanal Endemis ${fmt.num(SNAP.zonasi.ec.accuracy, 1)}%` : ''}</div>`)}
        ${step(6, '#2f6fb5', `Forecast ${S.fw.length} Minggu — Prediksi Iteratif`,
          'Perkiraan minggu N dipakai sebagai fitur lag untuk minggu N+1 sehingga model mensimulasikan kondisi lapangan nyata. Fitur iklim minggu mendatang diisi dari rata-rata minggu yang sama pada tahun-tahun sebelumnya. Hasil dan zona ditulis ke Supabase oleh GitHub Actions, lalu dibaca bersamaan oleh Konsol Admin ini dan aplikasi DENGUARD Warga di HP.',
          `<div class="formula"><b>pred[W]</b> = model(X[W]) → dipakai sebagai <b>lag1</b> di W+1<br>iklim[W, tahun ini] ≈ mean(iklim[W, tahun-tahun sebelumnya])</div>`)}
        </div>
      </section>

      <div class="grid hs-2 mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('book')}</span>Referensi dan Standar</h2></div>
          <div class="ref-grid" style="grid-template-columns:1fr">
            <div><strong>WHO EWARS</strong>Early Warning and Response System: panduan surveilans penyakit menular berbasis ambang persentil historis.</div>
            <div><strong>Kanal Endemis (Endemic Channel)</strong>Metode klasifikasi tingkat endemisitas berbasis rata-rata dan simpangan baku historis pada minggu yang sama.</div>
            <div><strong>Moran's I</strong>Uji autokorelasi spasial global. Nilai positif dan signifikan menandakan pengelompokan geografis kasus.</div>
            <div><strong>Tweedie / LightGBM</strong>Fungsi loss untuk data hitungan berlebih nol dan berekor panjang; gradient boosting berbasis pohon yang cepat dan tahan multikolinearitas.</div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('alert')}</span>Batasan dan Catatan</h2></div>
          <div class="panel-b" style="font-size:12.5px;line-height:1.75;color:var(--ink-2)">
            <p><b style="color:var(--ink)">Alat bantu, bukan diagnosis.</b> Perkiraan menunjukkan kecenderungan risiko; keputusan lapangan tetap mengikuti penyelidikan epidemiologi Dinkes.</p>
            <p style="margin-top:10px"><b style="color:var(--ink)">Data sementara.</b> Kasus 8 minggu terakhir bisa bertambah karena laporan terlambat; grafik menandainya sebagai "sementara".</p>
            <p style="margin-top:10px"><b style="color:var(--ink)">Kecamatan berkasus sangat rendah</b> (mis. Kepulauan Seribu) memiliki ambang di bawah 1 kasus sehingga perkiraan kecil pun bisa masuk zona tinggi; tabel prioritas menandainya "ambang rendah".</p>
            <p style="margin-top:10px"><b style="color:var(--ink)">Iklim masa depan</b> diasumsikan mengikuti rata-rata historis, sehingga cuaca ekstrem dapat membuat perkiraan meleset.</p>
          </div>
        </section>
      </div>`;
  }
})();

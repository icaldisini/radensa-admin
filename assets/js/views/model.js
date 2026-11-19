(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt, charts, epi } = R;

  R.views.model = { title: 'Model & Evaluasi', render };

  const SNAP = window.DG_SNAP || {};
  const HP = {
    n_estimators: 'Jumlah pohon', learning_rate: 'Laju belajar', num_leaves: 'Daun maks. per pohon',
    max_depth: 'Kedalaman maks.', min_child_samples: 'Sampel min. per daun', subsample: 'Subsample baris',
    subsample_freq: 'Frekuensi subsample', colsample_bytree: 'Subsample fitur', reg_alpha: 'Regularisasi L1',
    reg_lambda: 'Regularisasi L2', tweedie_variance_power: 'Tweedie variance power',
  };
  const RETUNE_DAYS = 35;
  const MCOLOR = { naive_baseline: '#8f8083', poisson_ridge: '#e08a1e', xgboost: '#2f6fb5', lightgbm: '#c0111f', catboost: '#6a4fc4' };
  const MSHORT = { naive_baseline: 'Naive', poisson_ridge: 'Poisson Ridge', xgboost: 'XGBoost', lightgbm: 'LightGBM', catboost: 'CatBoost' };

  function status(iso, ok = 8, warn = 15) {
    if (!iso) return 'bad';
    const d = (Date.now() - new Date(iso).getTime()) / 86400000;
    return d <= ok ? 'ok' : d <= warn ? 'warn' : 'bad';
  }
  function nextWednesday20() {
    const now = new Date(Date.now() + 7 * 3600000); // jam WIB dalam UTC
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20));
    let add = (3 - d.getUTCDay() + 7) % 7;
    if (add === 0 && now.getUTCHours() >= 20) add = 7;
    return new Date(d.getTime() + add * 86400000);
  }

  function render(root) {
    const S = R.S;
    const am = S.active, lr = S.lastRetune;
    const nextRetune = lr ? new Date(new Date(lr.created_at).getTime() + RETUNE_DAYS * 86400000) : null;
    const nw = nextWednesday20();
    const arrow = `<span class="arrow">${u.icon('chevR')}</span>`;
    const models = SNAP.models || [];
    const folds = SNAP.cvFolds || {};
    const hpEntries = Object.entries(am?.hyperparams || {});

    const AGE_MAX = 15; // hari; batas untuk bilah kesegaran
    const pstep = (n, icon, name, where, iso, note, last = false) => {
      const st = status(iso), d = iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : null;
      const fresh = d == null ? 0.05 : Math.max(0.07, 1 - d / AGE_MAX);
      const label = { ok: 'Normal', warn: 'Agak lama', bad: 'Terlambat' }[st];
      return `
      <div class="pstep ${st}">
        <div class="pst-top"><span class="pst-ic">${u.icon(icon)}</span><span class="pst-no">Tahap ${n}</span><span class="pst-st"><i></i>${label}</span></div>
        <div class="pst-name">${name}</div>
        <div class="pst-where">${where}</div>
        <div class="pst-age">${fmt.ago(iso)}</div>
        <div class="pst-bar" title="Kesegaran data"><i style="width:${fresh * 100}%"></i></div>
        <div class="pst-time">${u.icon('clock')}${fmt.wib(iso)}</div>
        <div class="pst-note">${note}</div>
        ${last ? '' : `<span class="pst-link">${u.icon('chevR')}</span>`}
      </div>`;
    };
    const stages = [
      [status(S.fresh.dbd)], [status(S.fresh.ikl)], [status(am?.created_at)], [status(S.fresh.fc)],
    ];
    const nBad = stages.filter(([x]) => x !== 'ok').length;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Model &amp; Evaluasi</h1>
          <p class="sub">Siklus mingguan otomatis: scraping lokal → GitHub Actions → Supabase → dashboard &amp; aplikasi warga. Model dievaluasi dengan rolling-window cross-validation: dilatih pada tahun-tahun sebelumnya, diuji pada satu tahun berikutnya.</p>
        </div>
      </div>

      <section class="panel mb24">
        <div class="panel-h"><h2><span class="hic">${u.icon('activity')}</span>Status Pipeline</h2><span class="tag ${nBad ? 'warn' : 'ok'}">${nBad ? `${nBad} tahap perlu dicek` : 'Semua tahap normal'}</span></div>
        <div class="pipe2">
          ${pstep(1, 'download', 'Scraping kasus DBD', 'Komputer lokal · Task Scheduler', S.fresh.dbd, 'Re-scrape 8 minggu terakhir untuk menangkap revisi laporan RS')}
          ${pstep(2, 'cloud', 'Ingest iklim', 'GitHub Actions · Earth Engine', S.fresh.ikl, 'CHIRPS dengan cadangan ERA5, dibatasi minggu epidemiologi')}
          ${pstep(3, 'cpu', am?.isRefit ? 'Retrain ringan' : 'Retune penuh', `GitHub Actions · ${am?.isRefit ? 'hyperparameter tetap' : 'Optuna + CV'}`, am?.created_at, `Versi <b class="mono">${u.esc(am?.versi || '–')}</b>`)}
          ${pstep(4, 'trend', 'Forecast &amp; zonasi', `Supabase · ${S.fw.length} minggu × ${S.kec.length} kecamatan`, S.fresh.fc, `${S.runs.length} run tercatat · minggu ini + ${S.fw.length - 1} berikutnya`, true)}
        </div>
        <div class="sched2">
          <div class="sch"><span class="sch-ic">${u.icon('refresh')}</span><div><small>Jalur utama</small><b>Otomatis dipicu</b><em>setelah scraping lokal sukses</em></div></div>
          <div class="sch"><span class="sch-ic">${u.icon('calendar')}</span><div><small>Jadwal cadangan</small><b>Rabu 20.00 WIB</b><em>berikutnya ${fmt.date(nw)}</em></div></div>
          <div class="sch"><span class="sch-ic">${u.icon('cpu')}</span><div><small>Retune penuh</small><b>Tiap ~${RETUNE_DAYS} hari</b><em>berikutnya ≈ ${nextRetune ? fmt.date(nextRetune) : 'segera'}</em></div></div>
        </div>
      </section>

      <div class="grid md-2 mb24">
        <section class="panel accent">
          <div class="panel-h"><h2><span class="hic">${u.icon('cpu')}</span>Model Aktif</h2><span class="tag accent mono">${u.esc(am?.versi || '–')}</span></div>
          <div class="panel-b">
            <dl class="kv">
              <dt>Algoritma</dt><dd>${u.esc(am?.algoritma || '–')}</dd>
              <dt>Jenis</dt><dd>${am?.isRefit ? `Refit ringan dari <span class="mono">${u.esc(am.cv_detail.refit_dari)}</span>` : 'Retune penuh (Optuna + CV)'}</dd>
              <dt>Data training s/d</dt><dd>${am ? `${fmt.wk(am.data_sampai_tahun, am.data_sampai_minggu)} ${am.data_sampai_tahun} · ${fmt.range(am.data_sampai_tahun, am.data_sampai_minggu)}` : '–'}</dd>
              <dt>Dibuat</dt><dd>${fmt.wib(am?.created_at)}</dd>
              <dt>Artefak</dt><dd class="mono">${u.esc(am?.artifact_path || '–')}</dd>
            </dl>
          </div>
          <div class="metric-grid">
            <div class="metric"><div class="l">R²</div><div class="v">${fmt.num(S.headline.r2, 3)}</div><div class="d">variasi kasus yang terjelaskan</div></div>
            <div class="metric"><div class="l">MAE</div><div class="v">${fmt.num(S.headline.mae, 2)}</div><div class="d">rata-rata meleset (kasus)</div></div>
            <div class="metric"><div class="l">RMSE</div><div class="v">${fmt.num(S.headline.rmse, 2)}</div><div class="d">menghukum meleset besar</div></div>
            <div class="metric"><div class="l">MAPE</div><div class="v">${fmt.num(S.headline.mape, 1)}%</div><div class="d">tinggi saat kasus kecil</div></div>
          </div>
          <div class="panel-note">Metrik di atas: evaluasi riset <b>${u.esc(S.headline.label)}</b> (LightGBM, sama dengan SIPEDA).${am?.isRefit ? ' Refit mingguan mewarisi metrik retune terakhir dan model baru hanya dipromosikan bila R² tidak turun lebih dari 5%.' : ''}</div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('chart')}</span>Validasi Silang per Tahun</h2><span class="meta">${lr ? `retune <span class="mono">${u.esc(lr.versi)}</span> · rolling-origin` : ''}</span></div>
          <div class="panel-b">
            <div class="legend mb16"><span><i class="lg-sw" style="background:var(--brand)"></i>R² (kiri)</span><span><i class="lg-line" style="border-color:var(--c-amber)"></i>MAE kasus (kanan)</span></div>
            <div class="chart" id="cv"></div>
          </div>
          <div class="panel-note">Tiap fold dilatih pada semua tahun sebelumnya lalu diuji pada satu tahun berikutnya; fold terakhir mewakili kondisi paling mutakhir.</div>
        </section>
      </div>

      <div class="grid md-2 mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('layers')}</span>Kontribusi Fitur</h2><span class="meta">split importance LightGBM · ${am?.fi.length || 0} fitur</span></div>
          <div class="panel-b" id="fi"></div>
        </section>
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('sliders')}</span>Hyperparameter</h2><span class="meta">hasil Optuna</span></div>
          <div class="hp-grid">${hpEntries.map(([k, v]) => `<div class="hp"><span class="hp-l">${HP[k] || k}</span><b class="hp-v">${typeof v === 'number' ? fmt.num(v, Number.isInteger(v) ? 0 : 4) : u.esc(v)}</b><code>${k}</code></div>`).join('')}${hpEntries.length % 2 ? `<div class="hp hp-note">${u.icon('info')}<span>Dicari dengan Optuna lewat validasi silang per tahun.</span></div>` : ''}</div>
        </section>
      </div>

      <div class="sec-title">Perbandingan 5 Model Kandidat <small>riset awal SIPEDA · rolling CV 3 fold (uji 2023, 2024, 2025)</small></div>
      ${models.length ? `
      <div class="model-cards mb24">${models.map((m) => `
        <div class="mcard ${m.best ? 'best' : ''}">${m.best ? '<span class="best-tag">TERBAIK</span>' : ''}
          <div class="mn">${u.esc(m.name.replace('_', ' '))}</div>
          <div class="ml">R²</div><div class="mr" style="color:${MCOLOR[m.key] || 'var(--brand)'}">${fmt.num(m.R2, 3)}</div>
          <div class="mm"><span>MAE</span><b>${fmt.num(m.MAE, 2)}</b></div>
          <div class="mm"><span>RMSE</span><b>${fmt.num(m.RMSE, 2)}</b></div>
          <div class="mm"><span>MAPE</span><b>${fmt.num(m.MAPE, 1)}%</b></div>
        </div>`).join('')}</div>

      <div class="grid hs-2 mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('target')}</span>Radar Performa</h2><span class="meta">dinormalisasi: makin luas makin baik</span></div>
          <div class="panel-b"><div class="chart" id="radar"></div><div class="legend" id="radar-leg" style="justify-content:center;margin-top:8px"></div></div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('chart')}</span>R² per Fold CV</h2><span class="meta">nilai negatif dipotong di 0 pada grafik</span></div>
          <div class="panel-b"><div class="legend mb16" id="fold-leg"></div><div class="chart" id="fold"></div></div>
          <div class="panel-note">Fold terakhir (uji 2025) paling relevan untuk kondisi sekarang. Poisson Ridge tidak stabil pada fold 2024 (R² sangat negatif), alasan model berbasis pohon dipilih.</div>
        </section>
      </div>

      <div class="grid hs-37 mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('layers')}</span>Pentingnya Fitur · SHAP (riset awal)</h2><span class="meta">mean |SHAP|, top 15</span></div>
          <div class="panel-b" id="shap"></div>
        </section>
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('info')}</span>Cara Membaca</h2></div>
          <div class="cm-list">
            <div class="cm-item"><i class="d-epi"></i><div><b>Kasus spasial &amp; lag</b><p>Kasus di kecamatan sendiri dan tetangga pada 1–2 minggu terakhir adalah prediktor terkuat: wabah menyebar dan bertahan.</p></div></div>
            <div class="cm-item"><i class="d-spa"></i><div><b>Endemisitas</b><p>Tingkat dasar kasus kecamatan menggeser prediksi ke atas atau bawah.</p></div></div>
            <div class="cm-item"><i class="d-ikl"></i><div><b>Iklim</b><p>Suhu dan kelembapan (dengan jeda) memengaruhi siklus hidup nyamuk; curah hujan menambah tempat berkembang biak.</p></div></div>
            <div class="cm-item"><i class="d-mus"></i><div><b>Musiman</b><p>Siklus sin/cos minggu menangkap pola tahunan.</p></div></div>
          </div>
        </section>
      </div>

      <section class="panel mb24">
        <div class="panel-h"><h2><span class="hic">${u.icon('target')}</span>Prediksi vs Aktual · Fold Terakhir (2025)</h2>
          <div class="tools"><select class="sel" id="sc-model">${models.map((m) => `<option value="${m.key}" ${m.best ? 'selected' : ''}>${u.esc(m.name.replace('_', ' '))}</option>`).join('')}</select><span class="tag" id="sc-n"></span></div></div>
        <div class="panel-b"><div class="chart" id="scatter"></div></div>
        <div class="panel-note">Titik ideal berada di garis putus-putus (prediksi = aktual). Sampel acak dari titik uji; LightGBM menunjukkan sebaran paling rapat tanpa bias sistematik.</div>
      </section>

      <section class="panel mb24">
        <div class="panel-h"><h2><span class="hic">${u.icon('list')}</span>Metrik Lengkap per Model</h2><span class="meta">rata-rata 3 fold CV</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Model</th><th class="r">R²</th><th class="r">MAE</th><th class="r">RMSE</th><th class="r">MAPE</th><th>Status</th></tr></thead>
          <tbody>${models.map((m) => `<tr><td class="strong"><i class="lg-sw" style="background:${MCOLOR[m.key] || 'var(--brand)'};margin-right:8px"></i>${u.esc(m.name.replace('_', ' '))}</td><td class="r">${fmt.num(m.R2, 4)}</td><td class="r">${fmt.num(m.MAE, 3)}</td><td class="r">${fmt.num(m.RMSE, 3)}</td><td class="r">${fmt.num(m.MAPE, 1)}%</td><td>${m.best ? '<span class="tag accent">Dipakai</span>' : m.key === 'naive_baseline' ? '<span class="tag">Pembanding</span>' : '<span class="tag">Kandidat</span>'}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>` : '<div class="callout mb24"><div>Snapshot perbandingan model tidak tersedia.</div></div>'}`;

    drawCv(root, lr);
    drawFi(root, am);
    if (models.length) { drawRadar(root, models, folds); drawFold(root, models, folds); drawShap(root); drawScatter(root, models); }
  }

  function drawCv(root, lr) {
    const el = u.$('#cv', root);
    const folds = Array.isArray(lr?.cv_detail) ? lr.cv_detail : [];
    if (!folds.length) { el.innerHTML = '<div class="empty">Belum ada hasil retune penuh dengan detail CV.</div>'; return; }
    const xs = folds.map((_, i) => i + 1);
    charts.xy(el, {
      height: 240, margin: { r: 40 },
      x: { min: 1, max: folds.length, ticks: folds.map((f, i) => ({ v: i + 1, label: `Uji ${f.val_year}` })) },
      y: { min: 0, max: 1, format: (v) => fmt.num(v, 1) },
      y2: { min: 0, format: (v) => fmt.num(v, 1) },
      layers: [
        { type: 'bars', data: folds.map((f, i) => ({ x: i + 1, y: Math.max(0, f.R2), fill: i === folds.length - 1 ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 45%, transparent)' })), pad: 0.45 },
        { type: 'line', data: folds.map((f, i) => ({ x: i + 1, y: f.MAE })), axis: 'y2', stroke: 'var(--c-amber)', width: 2, curve: 'linear' },
        { type: 'dots', data: folds.map((f, i) => ({ x: i + 1, y: f.MAE })), axis: 'y2', r: 4, stroke: 'var(--c-amber)' },
      ],
      hover: {
        xs,
        html: (i) => {
          const f = folds[i - 1];
          return `<div class="t-h">Fold ${f.fold} · uji tahun ${f.val_year}</div>${charts.tr('R²', fmt.num(f.R2, 3), 'var(--brand)')}${charts.tr('MAE', fmt.num(f.MAE, 2), 'var(--c-amber)')}${charts.tr('RMSE', fmt.num(f.RMSE, 2))}${charts.tr('MAPE', fmt.num(f.MAPE, 1) + '%')}`;
        },
      },
    });
  }

  function drawFi(root, am) {
    const el = u.$('#fi', root);
    const fi = am?.fi || [];
    if (!fi.length) { el.innerHTML = '<div class="empty">Tidak ada data kontribusi fitur.</div>'; return; }
    const S = R.S;
    const dom = {};
    for (const f of fi) dom[f.dom] = (dom[f.dom] || 0) + f.pct;
    const order = ['epi', 'ikl', 'spa', 'mus'];
    const max = fi[0].pct;
    el.innerHTML = `
      <div class="dom-sum">${order.filter((d) => dom[d]).map((d) => `<div class="d-${d}" style="flex:${dom[d]}" title="${S.DOMAINS[d]} ${fmt.pct(dom[d], 1)}"></div>`).join('')}</div>
      <div class="legend" style="margin-bottom:14px">${order.filter((d) => dom[d]).map((d) => `<span><i class="lg-sw d-${d}"></i>${S.DOMAINS[d]} <b>${fmt.pct(dom[d], 0)}</b></span>`).join('')}</div>
      ${fi.map((f) => `<div class="fi-row" title="${f.key}"><span class="n">${u.esc(f.label)}</span><span class="b"><i class="d-${f.dom}" style="width:${(f.pct / max) * 100}%"></i></span><span class="p">${fmt.pct(f.pct, 1)}</span></div>`).join('')}`;
  }

  // ---- perbandingan model (snapshot)
  function drawRadar(root, models, folds) {
    const axes = ['R²', 'MAE', 'RMSE', 'MAPE', 'Stabilitas CV'];
    const mx = (k) => Math.max(...models.map((m) => m[k]));
    const mn = (k) => Math.min(...models.map((m) => m[k]));
    const stab = (m) => { const f = folds[m.key] || []; return f.length ? Math.max(0, Math.min(...f)) : 0; };
    const maxStab = Math.max(...models.map(stab)) || 1;
    const series = models.map((m) => ({
      name: MSHORT[m.key] || m.name, color: MCOLOR[m.key] || '#999',
      width: m.best ? 2.6 : 1.4, fillOpacity: m.best ? 0.16 : 0.03, dots: m.best,
      values: [m.R2 / mx('R2'), mn('MAE') / m.MAE, mn('RMSE') / m.RMSE, mn('MAPE') / m.MAPE, stab(m) / maxStab],
    }));
    charts.radar(u.$('#radar', root), { axes, series, size: 440 });
    u.$('#radar-leg', root).innerHTML = series.map((s) => `<span><i class="lg-sw" style="background:${s.color}"></i>${s.name}</span>`).join('');
  }
  function drawFold(root, models, folds, h = 300) {
    const yrs = [2023, 2024, 2025];
    u.$('#fold-leg', root).innerHTML = models.map((m) => `<span><i class="lg-line" style="border-color:${MCOLOR[m.key]}"></i>${MSHORT[m.key]}</span>`).join('');
    charts.xy(u.$('#fold', root), {
      height: h,
      x: { min: 1, max: 3, ticks: yrs.map((y, i) => ({ v: i + 1, label: `Uji ${y}` })), minLabelGap: 60 },
      y: { min: 0, max: 1, format: (v) => fmt.num(v, 1), label: 'R²' },
      layers: models.flatMap((m) => {
        const f = folds[m.key] || [];
        const data = f.map((v, i) => ({ x: i + 1, y: Math.max(0, v) }));
        return [
          { type: 'line', data, stroke: MCOLOR[m.key], width: m.best ? 3 : 1.8, curve: 'linear' },
          { type: 'dots', data, r: m.best ? 4.5 : 3.2, stroke: MCOLOR[m.key], fill: 'var(--panel)' },
        ];
      }),
      hover: {
        xs: [1, 2, 3], marks: () => [],
        html: (i) => `<div class="t-h">Uji ${yrs[i - 1]}</div>` + models.map((m) => charts.tr(MSHORT[m.key], fmt.num((folds[m.key] || [])[i - 1], 3), MCOLOR[m.key])).join(''),
      },
    });
    // kartu setinggi tetangganya (radar): tambahkan sisa ruang ke tinggi grafik
    const panel = u.$('#fold', root).closest('.panel');
    if (panel && panel.lastElementChild && h === 300) {
      const gap = Math.round(panel.getBoundingClientRect().bottom - panel.lastElementChild.getBoundingClientRect().bottom);
      if (gap > 6) drawFold(root, models, folds, Math.min(520, 300 + gap));
    }
  }
  function drawShap(root) {
    const rows = (SNAP.shap || []).map((d) => ({ label: d.name, v: d.val, text: fmt.num(d.val, 3) }));
    u.$('#shap', root).innerHTML = rows.length ? rows.map((r) => `<div class="fi-row" style="grid-template-columns:210px 1fr 56px"><span class="n">${u.esc(r.label)}</span><span class="b"><i style="width:${(r.v / rows[0].v) * 100}%;background:linear-gradient(90deg,var(--brand-2),var(--brand))"></i></span><span class="p">${r.text}</span></div>`).join('') : '<div class="empty">Snapshot tidak tersedia.</div>';
  }
  function drawScatter(root, models) {
    const sel = u.$('#sc-model', root);
    const draw = () => {
      const pts = (SNAP.scatter || {})[sel.value] || [];
      u.$('#sc-n', root).textContent = `${fmt.num(pts.length)} titik (sampel)`;
      charts.scatter(u.$('#scatter', root), { points: pts, height: 340, color: MCOLOR[sel.value] });
    };
    sel.onchange = draw;
    draw();
  }
})();

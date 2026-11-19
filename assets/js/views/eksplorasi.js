(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt, charts, epi, stats } = R;

  R.views.eksplorasi = { title: 'Eksplorasi Data', render };

  const SNAP = window.DG_SNAP || {};
  const BINS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 30, 50, Infinity];
  const binLabel = (i) => {
    const a = BINS[i], b = BINS[i + 1];
    if (b === Infinity) return `≥${a}`;
    return b - a === 1 ? String(a) : `${a}–${b - 1}`;
  };

  const hbars = (rows, o = {}) => {
    const max = Math.max(...rows.map((r) => Math.abs(r.v)), 1e-9);
    return rows.map((r) => `<div class="fi-row" title="${u.esc(r.title || r.label)}" style="grid-template-columns:${o.labelW || 190}px 1fr 56px">
      <span class="n">${u.esc(r.label)}</span>
      <span class="b"><i style="width:${(Math.abs(r.v) / max) * 100}%;background:${r.color || 'linear-gradient(90deg,var(--brand-2),var(--brand))'}"></i></span>
      <span class="p">${r.text ?? fmt.num(r.v, 2)}</span></div>`).join('');
  };

  function render(root) {
    const S = R.S, st = R.state;
    const [lastY, lastW] = epi.idxToEpi(S.dbdMax);
    // tampilan historis (grafik/heatmap) ikut sampai minggu terakhir yang sudah berakhir (W45 = estimasi dari prakiraan)
    const [hY, hW] = epi.idxToEpi(S.histMax);
    st.histYear = st.histYear || lastY;

    // ------ nilai dasar: seluruh kasus per kecamatan-minggu (final)
    const vals = [];
    const byKota = new Map(S.kota.map((k) => [k, { s: 0, n: 0 }]));
    const byQ = [0, 1, 2, 3].map(() => ({ s: 0, n: 0 }));
    for (const k of S.kec) {
      for (const [i, a] of S.dbd.get(k.kode_kec)) {
        if (!a.f) continue;
        vals.push(a.k);
        const o = byKota.get(k.kota); o.s += a.k; o.n++;
        const q = Math.floor(epi.idxToDate(i).getUTCMonth() / 3);
        byQ[q].s += a.k; byQ[q].n++;
      }
    }
    const sorted = vals.slice().sort((a, b) => a - b);
    const mom = stats.moments(vals);
    const mean = stats.mean(vals), sd = stats.std(vals);

    const yearTot = (kodeList, y) => {
      let s = 0;
      const maxW = y === lastY ? lastW : epi.weeksInYear(y);
      for (let w = 1; w <= maxW; w++) {
        const i = epi.weekIdx(y, w);
        for (const k of kodeList) s += S.actual(k, i)?.k || 0;
      }
      return s;
    };
    let peak = { k: 0 };
    for (const [i, v] of S.dki) if (v.k > peak.k) peak = { ...v, i };
    const total = [...S.dki.values()].reduce((a, v) => a + v.k, 0);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Eksplorasi Data</h1>
          <p class="sub">Distribusi, pola musiman, perbedaan antarwilayah, dan korelasi fitur terhadap kasus DBD ${S.years[0]}–${lastY} (s/d ${fmt.wk(lastY, lastW)}). Seluruh angka dihitung langsung dari data surveilans Dinkes DKI di Supabase.</p>
          <div class="facts">
            <span class="fact">${u.icon('db')}Total <b>${fmt.num(total)}</b> kasus</span>
            <span class="fact">${u.icon('trend')}Puncak <b>${fmt.num(peak.k)}</b> · ${fmt.wk(peak.y, peak.w)} ${peak.y}</span>
            <span class="fact">${u.icon('layers')}<b>${fmt.num(vals.length)}</b> pengamatan kecamatan-minggu</span>
          </div>
        </div>
      </div>

      <div class="sec-title" style="margin-top:0">Distribusi Variabel Target</div>
      <div class="grid hs-37 mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('chart')}</span>Histogram Kasus DBD</h2><span class="meta">kasus per kecamatan per minggu</span></div>
          <div class="panel-b"><div class="chart" id="hist"></div></div>
          <div class="panel-note">Distribusi sangat condong ke kanan (skewness ${fmt.num(mom.skew, 2)}): sebagian besar minggu hanya 0–5 kasus per kecamatan, tetapi ekornya panjang saat KLB. Karena itu model memakai fungsi loss <b>Tweedie</b> dan target log1p.</div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('list')}</span>Statistik Deskriptif</h2></div>
          <div class="panel-b">
            <table class="stat-table">
              <tr><td>Rata-rata</td><td>${fmt.num(mean, 2)}</td></tr>
              <tr><td>Median</td><td>${fmt.num(stats.quantile(sorted, 0.5), 1)}</td></tr>
              <tr><td>Simpangan baku</td><td>${fmt.num(sd, 2)}</td></tr>
              <tr><td>Skewness</td><td style="color:var(--c-amber)">${fmt.num(mom.skew, 2)}</td></tr>
              <tr><td>Kurtosis (excess)</td><td style="color:var(--c-amber)">${fmt.num(mom.kurt, 1)}</td></tr>
              <tr><td>Min / Maks</td><td>${fmt.num(sorted[0])} / ${fmt.num(sorted[sorted.length - 1])}</td></tr>
              <tr><td>Persentase = 0</td><td>${fmt.num((vals.filter((v) => v === 0).length / vals.length) * 100, 1)}%</td></tr>
              <tr><td>Persentase &gt; 30 kasus</td><td>${fmt.num((vals.filter((v) => v > 30).length / vals.length) * 100, 1)}%</td></tr>
              <tr><td>P50 / P75 / P90</td><td>${fmt.num(stats.quantile(sorted, 0.5), 0)} / ${fmt.num(stats.quantile(sorted, 0.75), 0)} / ${fmt.num(stats.quantile(sorted, 0.9), 0)}</td></tr>
            </table>
          </div>
        </section>
      </div>

      <div class="sec-title">Tren Kasus Mingguan</div>
      <section class="panel mb16">
        <div class="panel-h"><h2><span class="hic">${u.icon('activity')}</span>Kasus mingguan se-DKI ${S.years[0]}–${lastY}</h2>
          <div class="legend"><span><i class="lg-line" style="border-color:var(--brand)"></i>Final</span><span><i class="lg-line prov"></i>Sementara</span></div></div>
        <div class="panel-b"><div class="chart" id="long"></div></div>
        <div class="panel-note">Pola musiman konsisten: kasus memuncak pada awal tahun dan dapat melonjak saat KLB. Setiap tahun punya bentuk berbeda — itu sebabnya zonasi memakai ambang per minggu-epi (kanal endemis) di samping ambang EWARS.</div>
      </section>
      <div class="grid hs-2 mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('calendar')}</span>Pola musiman antar tahun</h2><span class="meta">klik tahun untuk menyorot</span></div>
          <div class="panel-b"><div class="yr-legend mb16" id="yrs"></div><div class="chart" id="overlay"></div></div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('layers')}</span>Total tahunan per wilayah</h2><span class="meta">${lastY}: s/d ${fmt.wk(lastY, lastW)}</span></div>
          <div class="tbl-wrap"><table class="tbl compact" id="annual"></table></div>
          <div class="panel-note">Warna sel menunjukkan besaran relatif antar wilayah dan tahun.</div>
        </section>
      </div>

      <div class="grid hs-2 mb24">
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('pin')}</span>Perbandingan per Wilayah Kota</h2><span class="meta">rata-rata kasus / kecamatan / minggu</span></div>
          <div class="panel-b fill" id="kota-bars"></div>
          <div class="panel-note">Kepulauan Seribu hampir tanpa kasus; Jakarta Utara dan Barat memiliki beban per kecamatan tertinggi.</div>
        </section>
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('calendar')}</span>Pola per Kuartal</h2><span class="meta">rata-rata kasus / kecamatan / minggu</span></div>
          <div class="panel-b fill" id="q-bars"></div>
          <div class="panel-note">Kuartal 1–2 (Jan–Jun, musim hujan hingga peralihan) konsisten lebih tinggi daripada kuartal 3–4.</div>
        </section>
      </div>

      <div class="sec-title">Korelasi dan Struktur Spasial</div>
      <div class="grid hs-37 mb24">
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('target')}</span>Korelasi Spearman: Fitur vs Kasus</h2><span class="meta" id="corr-meta"></span></div>
          <div class="panel-b fill" id="corr"><div class="loading">Menghitung korelasi dari riwayat iklim dan kasus…</div></div>
          <div class="panel-note">Spearman berbasis peringkat sehingga tahan terhadap distribusi condong. Lag kasus dan rata-rata bergulir mendominasi; hujan dan suhu berpengaruh dengan jeda 1–2 minggu (siklus hidup nyamuk).</div>
        </section>
        <div class="grid" style="align-content:start">
          <section class="panel accent">
            <div class="panel-h"><h2><span class="hic">${u.icon('layers')}</span>Autokorelasi Spasial (Moran's I)</h2></div>
            <div class="panel-b" id="moran"></div>
          </section>
          <section class="panel">
            <div class="panel-h"><h2><span class="hic">${u.icon('alert')}</span>Multikolinearitas (VIF)</h2><span class="meta">snapshot riset awal</span></div>
            <div class="panel-b" id="vif"></div>
            <div class="panel-note">VIF fitur iklim sangat tinggi karena suhu, kelembapan, dan lag-nya berkorelasi. Model berbasis pohon (LightGBM) tahan terhadap hal ini, sehingga fitur tidak dibuang.</div>
          </section>
        </div>
      </div>

      <div class="sec-title">Penjelajahan Rinci</div>
      <section class="panel mb16">
        <div class="panel-h">
          <h2><span class="hic">${u.icon('map')}</span>Peta panas kecamatan × minggu</h2>
          <div class="tools"><div id="hm-scale"></div><select class="sel" id="hm-year">${S.years.slice().reverse().map((y) => `<option ${y === st.histYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
        </div>
        <div class="panel-b heat-wrap"><div id="hm"></div></div>
      </section>
      <section class="panel">
        <div class="panel-h"><h2 id="top-title"></h2><span class="meta">klik baris untuk detail</span></div>
        <div class="tbl-wrap"><table class="tbl" id="top"></table></div>
      </section>`;

    // ------ histogram
    (() => {
      const counts = BINS.slice(0, -1).map(() => 0);
      for (const v of vals) { let b = 0; while (b < BINS.length - 2 && v >= BINS[b + 1]) b++; counts[b]++; }
      const xs = counts.map((_, i) => i + 1);
      const mx = Math.max(...counts);
      charts.xy(u.$('#hist', root), {
        height: 280, margin: { l: 52 },
        x: { min: 1, max: counts.length, ticks: counts.map((_, i) => ({ v: i + 1, label: binLabel(i) })), minLabelGap: 30 },
        y: { max: mx * 1.1, label: 'jumlah pengamatan', format: (v) => fmt.num(v) },
        layers: [{ type: 'bars', data: counts.map((c, i) => ({ x: i + 1, y: c, fill: i < 3 ? 'var(--brand)' : i < 9 ? 'color-mix(in srgb, var(--brand) 62%, transparent)' : 'color-mix(in srgb, var(--brand) 34%, transparent)' })), pad: 0.14 }],
        hover: { xs, marks: () => [], html: (i) => `<div class="t-h">${binLabel(i - 1)} kasus / minggu</div>${charts.tr('Pengamatan', fmt.num(counts[i - 1]))}${charts.tr('Porsi', fmt.pct(counts[i - 1] / vals.length, 1))}` },
      });
    })();

    // ------ deret panjang
    (() => {
      const xs = d3.range(S.dbdMin, S.histMax + 1);
      const fin = [], prov = [];
      let lastFin = null;
      for (const i of xs) {
        const a = S.actual(null, i);
        if (a && a.f) { fin.push({ x: i, y: a.k }); lastFin = { x: i, y: a.k }; }
        else { fin.push({ x: i, y: null }); if (a) { if (!prov.length && lastFin) prov.push(lastFin); prov.push({ x: i, y: a.k }); } }
      }
      charts.xy(u.$('#long', root), {
        height: 270,
        x: { min: S.dbdMin, max: S.histMax, ticks: [] },
        y: { label: 'kasus / minggu' },
        yearSeps: 'label',
        layers: [
          { type: 'area', data: fin, grad: ['#c0111f', 0.22, 0.02], curve: 'linear' },
          { type: 'line', data: fin, stroke: 'var(--brand)', width: 1.5, curve: 'linear' },
          { type: 'line', data: prov, stroke: 'var(--ink-3)', width: 1.5, dash: '2 2', curve: 'linear' },
        ],
        hover: {
          xs,
          marks: (i) => [{ y: S.actual(null, i)?.k, color: 'var(--brand)' }],
          html: (i) => {
            const [y, w] = epi.idxToEpi(i), a = S.actual(null, i), s = S.seasonOf(w);
            return `<div class="t-h">${fmt.wk(y, w)} ${y} · ${fmt.range(y, w)}</div>` +
              charts.tr(a?.f ? 'Kasus (final)' : 'Kasus (sementara)', fmt.num(a?.k)) +
              (s ? charts.tr('Rata-rata musiman', fmt.num(s.mean)) : '');
          },
        },
      });
    })();

    // ------ overlay musiman
    function drawOverlay() {
      u.$('#yrs', root).innerHTML = S.years.map((y) => `<button data-y="${y}" class="${y === st.histYear ? 'on' : ''}"><i style="background:${y === st.histYear ? 'var(--brand)' : 'var(--ink-3)'}"></i>${y}</button>`).join('') +
        `<button disabled style="cursor:default"><i style="background:var(--ink);height:0;border-top:2px dashed var(--ink)"></i>Rata-rata</button>`;
      u.$$('#yrs button[data-y]', root).forEach((b) => (b.onclick = () => { st.histYear = +b.dataset.y; u.$('#hm-year', root).value = st.histYear; drawOverlay(); drawHeat(); drawTop(); }));
      const series = (y) => {
        const maxW = y === hY ? hW : epi.maxWeek(y);
        return d3.range(1, maxW + 1).map((w) => ({ x: w, y: S.actual(null, epi.weekIdx(y, w))?.k ?? null }));
      };
      const layers = S.years.filter((y) => y !== st.histYear).map((y) => ({ type: 'line', data: series(y), stroke: 'var(--ink-3)', width: 1, opacity: 0.35, curve: 'linear' }));
      layers.push({ type: 'line', data: d3.range(1, 53).map((w) => ({ x: w, y: S.seasonOf(w)?.mean })), stroke: 'var(--ink)', width: 1.3, dash: '4 3' });
      layers.push({ type: 'line', data: series(st.histYear), stroke: 'var(--brand)', width: 2.6, curve: 'linear' });
      charts.xy(u.$('#overlay', root), {
        height: 300,
        x: { min: 1, max: 52, ticks: charts.MONTH_WEEKS, minLabelGap: 30 },
        y: { label: 'kasus / minggu' },
        layers,
        hover: {
          xs: d3.range(1, 53),
          marks: (w) => [{ y: S.actual(null, epi.weekIdx(st.histYear, Math.min(w, epi.maxWeek(st.histYear))))?.k, color: 'var(--brand)' }],
          html: (w) => {
            const vs = S.years.map((y) => ({ y, v: w <= (y === hY ? hW : epi.maxWeek(y)) ? S.actual(null, epi.weekIdx(y, w))?.k : null })).filter((d) => d.v != null);
            const mx = vs.reduce((a, b) => (b.v > (a?.v ?? -1) ? b : a), null);
            const sel = vs.find((d) => d.y === st.histYear);
            return `<div class="t-h">Minggu-epi ${w}</div>` +
              charts.tr(String(st.histYear), sel ? fmt.num(sel.v) : '–', 'var(--brand)') +
              charts.tr('Rata-rata', fmt.num(S.seasonOf(w)?.mean)) +
              (mx ? charts.tr(`Tertinggi (${mx.y})`, fmt.num(mx.v)) : '');
          },
        },
      });
    }

    // ------ tabel tahunan per kota
    (() => {
      const data = S.kota.map((kt) => ({ kt, vals: S.years.map((y) => yearTot(S.kec.filter((k) => k.kota === kt).map((k) => k.kode_kec), y)) }));
      const dki = S.years.map((_, j) => data.reduce((a, r) => a + r.vals[j], 0));
      const max = d3.max(data.flatMap((r) => r.vals));
      const color = charts.heatColor(max);
      const cell = (v) => {
        const c = d3.color(color(v));
        const dark = c && (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) < 140;
        return `<td class="heatcell" style="background:${color(v)};color:${dark ? '#fff' : 'var(--ink)'}">${fmt.num(v)}</td>`;
      };
      const short = (kt) => (kt.startsWith('Jakarta ') ? kt.replace('Jakarta ', '') : kt.replace('Kepulauan Seribu', 'Seribu'));
      u.$('#annual', root).innerHTML = `
        <thead><tr><th>Tahun</th>${data.map((r) => `<th class="r">${u.esc(short(r.kt))}</th>`).join('')}<th class="r">DKI</th></tr></thead>
        <tbody>${S.years.map((y, j) => `<tr><td class="strong">${y}${y === lastY ? '*' : ''}</td>${data.map((r) => cell(r.vals[j])).join('')}<td class="r strong">${fmt.num(dki[j])}</td></tr>`).join('')}</tbody>`;
    })();

    // ------ batang wilayah & kuartal
    (() => {
      const rows = [...byKota].map(([kt, o]) => ({ label: kt, v: o.n ? o.s / o.n : 0 })).sort((a, b) => b.v - a.v);
      u.$('#kota-bars', root).innerHTML = hbars(rows, { labelW: 150 });
      const q = ['Q1 · Jan–Mar', 'Q2 · Apr–Jun', 'Q3 · Jul–Sep', 'Q4 · Okt–Des'].map((l, i) => ({ label: l, v: byQ[i].n ? byQ[i].s / byQ[i].n : 0 }));
      u.$('#q-bars', root).innerHTML = hbars(q, { labelW: 150 });
    })();

    // ------ VIF snapshot
    (() => {
      const vif = (SNAP.vif || []).slice(0, 9).map((d) => ({ label: d.feature.replace(/_/g, ' '), v: Math.log10(Math.max(1, d.vif)), text: d.vif >= 1000 ? fmt.num(d.vif / 1000, 1) + 'k' : fmt.num(d.vif, 0), title: d.feature }));
      u.$('#vif', root).innerHTML = vif.length ? hbars(vif, { labelW: 150 }) : '<div class="empty">Snapshot tidak tersedia.</div>';
    })();

    // ------ heatmap & top
    function drawHeat() {
      const y = st.histYear;
      const maxW = y === hY ? hW : epi.maxWeek(y);
      const cols = d3.range(1, epi.maxWeek(y) + 1).map((w) => ({ v: w, label: charts.MONTH_WEEKS.find((m) => m.v === w)?.label || '' }));
      const val = (kode, w) => (w > maxW ? null : S.actual(kode, epi.weekIdx(y, w))?.k ?? null);
      let max = 1;
      for (const k of S.kec) for (const c of cols) { const v = val(k.kode_kec, c.v); if (v != null && v > max) max = v; }
      u.$('#hm-scale', root).innerHTML = charts.heatScale(max);
      charts.heatmap(u.$('#hm', root), {
        rows: S.kec.map((k) => ({ key: k.kode_kec, label: k.nm, group: k.kota })),
        groupBy: true, cols, max, cellH: 12, labelW: 150,
        value: val,
        tip: (kode, w, v) => `<div class="t-h">${u.esc(S.kecBy.get(kode).nm)}</div>${charts.tr(`${fmt.wk(y, w)} · ${fmt.range(y, w)}`, v == null ? '–' : fmt.num(v))}`,
        onRow: (kode) => R.go('#/kecamatan/' + kode),
      });
    }
    function drawTop() {
      const y = st.histYear;
      const maxW = y === lastY ? lastW : epi.weeksInYear(y);
      u.$('#top-title', root).innerHTML = `<span class="hic">${u.icon('list')}</span>10 kecamatan dengan kasus terbanyak · ${y}${y === lastY ? ` (s/d ${fmt.wk(y, lastW)})` : ''}`;
      const rows = S.kec.map((k) => {
        let tot = 0, pk = { v: -1, w: 0 }, prev = 0;
        for (let w = 1; w <= maxW; w++) {
          const v = S.actual(k.kode_kec, epi.weekIdx(y, w))?.k || 0;
          tot += v;
          if (v > pk.v) pk = { v, w };
          if (w <= epi.weeksInYear(y - 1)) prev += S.actual(k.kode_kec, epi.weekIdx(y - 1, w))?.k || 0;
        }
        return { k, tot, pk, prev, d: prev && y > S.years[0] ? tot / prev - 1 : null };
      }).sort((a, b) => b.tot - a.tot).slice(0, 10);
      const mx = rows[0]?.tot || 1;
      u.$('#top', root).innerHTML = `
        <thead><tr><th>#</th><th>Kecamatan</th><th>Wilayah</th><th class="r">Total kasus</th><th class="r">Minggu puncak</th><th class="r">Kasus puncak</th><th class="r">vs ${y - 1} (periode sama)</th></tr></thead>
        <tbody>${rows.map((r, n) => `<tr class="click" data-k="${r.k.kode_kec}">
          <td class="muted">${n + 1}</td><td class="strong">${u.esc(r.k.nm)}</td><td class="muted">${u.esc(r.k.kota)}</td>
          <td class="r"><div class="cellbar"><i style="width:${(r.tot / mx) * 90}px"></i>${fmt.num(r.tot)}</div></td>
          <td class="r">${fmt.wk(y, r.pk.w)} · ${fmt.range(y, r.pk.w)}</td><td class="r">${fmt.num(r.pk.v)}</td>
          <td class="r ${r.d > 0 ? 'up' : 'down'}">${fmt.pct(r.d, 0, true)}</td></tr>`).join('')}</tbody>`;
      u.$$('#top tr.click', root).forEach((tr) => (tr.onclick = () => R.go('#/kecamatan/' + tr.dataset.k)));
    }

    // ------ Moran's I (live) + snapshot
    (() => {
      const last = S.lastFinalIdx, I = [];
      const codes = S.kec.map((k) => k.kode_kec);
      let W = 0;
      for (const c of codes) W += (S.nb.get(c) || []).filter((n) => S.kecBy.has(n)).length;
      for (let i = last - 25; i <= last; i++) {
        const x = codes.map((c) => S.actual(c, i)?.k);
        if (x.some((v) => v == null)) continue;
        const m = stats.mean(x);
        let num = 0, den = 0;
        codes.forEach((c, a) => {
          den += (x[a] - m) * (x[a] - m);
          for (const nb of S.nb.get(c) || []) { const b = codes.indexOf(nb); if (b >= 0) num += (x[a] - m) * (x[b] - m); }
        });
        if (den > 0 && W > 0) I.push((codes.length / W) * (num / den));
      }
      const live = I.length ? stats.mean(I) : null;
      const sn = SNAP.moran;
      u.$('#moran', root).innerHTML = `
        <div class="sim-res" style="padding:0;grid-template-columns:1fr 1fr">
          <div class="sim-box"><div class="l">Live · 26 minggu final</div><div class="v">${live == null ? '–' : fmt.num(live, 3)}</div></div>
          <div class="sim-box"><div class="l">Riset awal 2017–2025</div><div class="v">${sn ? fmt.num(sn.I, 3) : '–'}</div></div>
        </div>
        <p style="margin-top:12px;font-size:12.5px;color:var(--ink-2);line-height:1.6">Nilai positif berarti kecamatan ber-kasus tinggi cenderung berdampingan dengan kecamatan ber-kasus tinggi (klaster geografis).${sn ? ` Pada riset awal: z = ${fmt.num(sn.z_score, 2)}, p = ${fmt.num(sn.p_value, 3)} — signifikan.` : ''} Inilah dasar fitur <b>kasus tetangga</b> dalam model. Bobot: Queen contiguity.</p>`;
    })();

    // ------ korelasi (live, dimuat malas)
    async function drawCorr() {
      const el = u.$('#corr', root), meta = u.$('#corr-meta', root);
      const snapshot = () => {
        const rows = (SNAP.spearman || []).filter((d) => d.name !== 'kasus DBD log1p').slice(0, 15).map((d) => ({ label: d.name, v: d.spearman_signed ?? d.spearman, text: fmt.num(d.spearman_signed ?? d.spearman, 2), color: (d.spearman_signed ?? d.spearman) < 0 ? 'linear-gradient(90deg,#6aa5e6,var(--c-blue))' : null }));
        meta.textContent = 'snapshot riset awal (2017–2025)';
        el.innerHTML = hbars(rows, { labelW: 190 });
      };
      let ikl;
      try { ikl = await R.data.loadIklimAll(); } catch (e) { if (root.isConnected) snapshot(); return; }
      if (!root.isConnected) return;
      const iklMap = new Map();
      for (const r of ikl) iklMap.set(r.kode_kec + '|' + epi.weekIdx(r.tahun, r.minggu), r);
      const feats = {
        'Kasus 1 minggu lalu': [], 'Kasus 2 minggu lalu': [], 'Rata-rata kasus 4 minggu': [], 'Rata-rata kasus 8 minggu': [], 'Kasus tetangga (lag 1)': [],
        'Curah hujan': [], 'Curah hujan (lag 1)': [], 'Curah hujan (lag 2)': [], 'Suhu rata-rata': [], 'Suhu (lag 1)': [], 'Suhu (lag 2)': [],
        'Kelembapan': [], 'Kelembapan (lag 1)': [], 'Kelembapan (lag 2)': [], 'Musiman (sin)': [], 'Musiman (cos)': [],
      };
      const y = [];
      const g = (c, i) => S.actual(c, i)?.k;
      for (const k of S.kec) {
        const c = k.kode_kec;
        for (let i = S.dbdMin + 8; i <= S.dbdMax; i++) {
          const a = S.actual(c, i);
          if (!a || !a.f) continue;
          const l = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => g(c, i - d));
          if (l.some((v) => v == null)) continue;
          const i0 = iklMap.get(c + '|' + i), i1 = iklMap.get(c + '|' + (i - 1)), i2 = iklMap.get(c + '|' + (i - 2));
          if (!i0 || !i1 || !i2) continue;
          const nbs = (S.nb.get(c) || []).map((n) => g(n, i - 1)).filter((v) => v != null);
          const w = epi.idxToEpi(i)[1];
          y.push(a.k);
          feats['Kasus 1 minggu lalu'].push(l[0]); feats['Kasus 2 minggu lalu'].push(l[1]);
          feats['Rata-rata kasus 4 minggu'].push(stats.mean(l.slice(0, 4))); feats['Rata-rata kasus 8 minggu'].push(stats.mean(l));
          feats['Kasus tetangga (lag 1)'].push(nbs.length ? stats.mean(nbs) : l[0]);
          feats['Curah hujan'].push(i0.curah_hujan_kumulatif); feats['Curah hujan (lag 1)'].push(i1.curah_hujan_kumulatif); feats['Curah hujan (lag 2)'].push(i2.curah_hujan_kumulatif);
          feats['Suhu rata-rata'].push(i0.suhu_rata); feats['Suhu (lag 1)'].push(i1.suhu_rata); feats['Suhu (lag 2)'].push(i2.suhu_rata);
          feats['Kelembapan'].push(i0.kelembapan_rata); feats['Kelembapan (lag 1)'].push(i1.kelembapan_rata); feats['Kelembapan (lag 2)'].push(i2.kelembapan_rata);
          feats['Musiman (sin)'].push(Math.sin((2 * Math.PI * w) / 52)); feats['Musiman (cos)'].push(Math.cos((2 * Math.PI * w) / 52));
        }
      }
      if (y.length < 200) { snapshot(); return; }
      const rows = Object.entries(feats).map(([label, xs]) => ({ label, rho: stats.spearman(xs, y) }))
        .filter((r) => Number.isFinite(r.rho)).sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
      meta.textContent = `live · ${fmt.num(y.length)} pengamatan`;
      el.innerHTML = hbars(rows.map((r) => ({ label: r.label, v: r.rho, text: fmt.num(r.rho, 2), color: r.rho < 0 ? 'linear-gradient(90deg,#6aa5e6,var(--c-blue))' : null })), { labelW: 190 });
    }

    u.$('#hm-year', root).onchange = (e) => { st.histYear = +e.target.value; drawOverlay(); drawHeat(); drawTop(); };
    drawOverlay();
    drawHeat();
    drawTop();
    drawCorr();
  }
})();

(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt, zone, charts, epi } = R;

  R.views.beranda = { title: 'Beranda', render, scope: true };

  const sysName = (s) => (s === 'ec' ? 'Kanal Endemis' : 'EWARS');
  const ZCOL = { Merah: 'var(--z-merah-map)', Kuning: 'var(--z-kuning-map)', Hijau: 'var(--z-hijau-map)' };
  const REC_ICONS = ['megaphone', 'droplet', 'hospital', 'shield'];

  // Total kasus terlapor se-cakupan pada indeks minggu i
  function scopeActual(i) {
    if (!R.state.kota) return R.S.actual(null, i);
    let s = 0, any = false, fin = true, est = false;
    for (const k of R.scope.kec()) {
      const a = R.S.actual(k.kode_kec, i);
      if (a) { s += a.k; any = true; fin = fin && a.f; est = est || !!a.est; }
    }
    return any ? { k: s, f: fin, est } : null;
  }
  // Rata-rata ± SD musiman untuk cakupan (tahun lengkap saja)
  const seasonCache = new Map();
  function scopeSeason() {
    const key = R.state.kota || '*';
    if (seasonCache.has(key + R.S.dbdMax)) return seasonCache.get(key + R.S.dbdMax);
    const S = R.S, per = new Map();
    for (let i = S.dbdMin; i <= S.dbdMax; i++) {
      const [y, w] = epi.idxToEpi(i);
      if (y >= S.cur[0]) continue;
      const a = scopeActual(i);
      if (!a) continue;
      if (!per.has(w)) per.set(w, []);
      per.get(w).push(a.k);
    }
    const out = new Map([...per].map(([w, arr]) => [w, { mean: d3.mean(arr), sd: d3.deviation(arr) || 0 }]));
    const res = (w) => out.get(w) || out.get(52);
    seasonCache.set(key + R.S.dbdMax, res);
    return res;
  }
  const scopeFcTotal = (i) => R.scope.kec().reduce((a, k) => a + (R.S.fc.get(k.kode_kec)[i]?.kasus_pred || 0), 0);

  function render(root) {
    const S = R.S, st = R.state;
    const am = S.active;
    const lastData = epi.idxToEpi(S.dbdMax);
    const inScope = R.scope.kec();
    const nScope = inScope.length;
    if (st.selKec && !R.scope.has(st.selKec)) st.selKec = null;
    st.chartMode = st.chartMode || 'kec';

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Risiko DBD di ${u.esc(R.scope.label())}</h1>
          <p class="sub">Risiko geografis dan perkiraan mingguan untuk membantu surveilans dan respons dini. Perkiraan ${S.fw.length} minggu untuk ${nScope} kecamatan, dihitung ${fmt.wib(S.fcMeta?.at)}.</p>
          <div class="facts">
            <span class="fact">${u.icon('pin')}<b>${nScope}</b> kecamatan</span>
            <span class="fact">${u.icon('db')}Data <b>${S.years[0]}–${lastData[0]}</b></span>
            <span class="fact">${u.icon('calendar')}Perkiraan <b>${S.fw.length}</b> minggu</span>
            <span class="fact" title="Evaluasi model fold 3 (uji 2025)">${u.icon('target')}R² <b>${fmt.num(S.headline.r2, 2)}</b></span>
          </div>
        </div>
        <div class="head-actions">
          <div class="seg" id="sys" role="tablist" aria-label="Sistem zonasi">
            <button data-s="ewars" title="Ambang persentil historis kecamatan (P50/P75)">EWARS</button>
            <button data-s="ec" title="Ambang kanal endemis per minggu (rata-rata, +1 SD)">Kanal Endemis</button>
          </div>
          <button class="btn" id="csv">${u.icon('download')}Unduh CSV</button>
        </div>
      </div>
      ${S.fcStale ? `<div class="callout mb16"><div><b>Forecast belum diperbarui.</b> Minggu perkiraan terakhir sudah lewat; periksa pipeline mingguan di halaman Model &amp; Evaluasi.</div></div>` : ''}

      <section class="kpis mb24" id="kpis"></section>

      <div class="grid ov-main ov-top mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('map')}</span>Peta Risiko</h2><span class="meta">klik kecamatan untuk menyorot</span></div>
          <div class="wtabs fit" id="wtabs" style="padding:0 20px 14px"></div>
          <div class="mapbox" id="ov-map"></div>
        </section>
        <div class="ov-right">
          <section class="panel hl" id="hl"></section>
          <section class="panel">
            <div class="panel-h">
              <h2><span class="hic">${u.icon('trend')}</span>Perkiraan Mingguan</h2>
              <div class="seg" id="cm"><button data-m="kec">Kecamatan</button><button data-m="tot">Total wilayah</button></div>
            </div>
            <div class="panel-b"><div class="chart" id="wchart"></div></div>
          </section>
        </div>
      </div>

      <div class="grid ov-bottom mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('layers')}</span>Ringkasan Wilayah · ${u.esc(R.scope.label())}</h2><span class="meta" id="as-meta"></span></div>
          <div class="area-stats" id="area"></div>
          <div class="kota-mini" id="kota-mini"></div>
          <div class="as-foot" id="as-foot"></div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('bell')}</span>Peringatan Dini &amp; Rekomendasi</h2><a class="tag accent" href="#/peringatan">Lihat semua</a></div>
          <div id="ewr"></div>
        </section>
      </div>

      <div class="grid ov-prio mb24">
        <section class="panel prio-panel">
          <div class="panel-h">
            <div><h2><span class="hic">${u.icon('list')}</span>Prioritas Penanganan</h2><div class="meta" id="prio-meta" style="margin-top:3px"></div></div>
            <div class="seg" id="prio-by"><button data-b="zona">Zona</button><button data-b="kasus">Kasus</button></div>
          </div>
          <div class="prio-wrap"><div class="prio" id="prio"></div></div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('chart')}</span>Zona per Minggu Perkiraan</h2><span class="meta" id="zd-meta"></span></div>
          <div class="panel-b"><div class="zdist" id="zdist"></div></div>
          <div class="panel-h" style="border-top:1px solid var(--line)"><h2>Per wilayah kota</h2><span class="meta" id="kota-meta"></span></div>
          <div class="tbl-wrap"><table class="tbl" id="kota-tbl"></table></div>
        </section>
      </div>

      <section class="panel mb24">
        <div class="panel-h">
          <h2><span class="hic">${u.icon('activity')}</span>Kasus Mingguan · ${u.esc(R.scope.label())}</h2>
          <div class="legend">
            <span><i class="lg-sw" style="background:var(--ink-3)"></i>Terlapor final</span>
            <span><i class="lg-sw" style="background:repeating-linear-gradient(45deg,var(--ink-3) 0 2px,transparent 2px 4px)"></i>Sementara</span>
            <span><i class="lg-sw" style="background:repeating-linear-gradient(45deg,var(--brand) 0 2px,transparent 2px 4px)"></i>Estimasi (belum dirilis)</span>
            <span><i class="lg-sw" style="background:var(--brand)"></i>Perkiraan</span>
            <span><i class="lg-sw" style="background:var(--season);border:1px solid var(--line-2)"></i>Rentang musiman ±1 SD</span>
          </div>
        </div>
        <div class="panel-b"><div class="chart" id="trend"></div></div>
        <div class="panel-h" style="border-top:1px solid var(--line)">
          <h2><span class="hic">${u.icon('cloud')}</span>Iklim Rata-rata</h2>
          <div class="legend">
            <span><i class="lg-sw" style="background:var(--rain);opacity:.6"></i>Curah hujan (mm/minggu)</span>
            <span><i class="lg-line" style="border-color:var(--z-merah)"></i>Suhu (°C)</span>
          </div>
        </div>
        <div class="panel-b"><div class="chart" id="climate"></div></div>
        <div class="panel-note">Minggu "sementara" masih bisa bertambah karena laporan rumah sakit yang terlambat; pipeline meng-scrape ulang 8 minggu terakhir setiap minggu. Rentang musiman dihitung dari ${S.years[0]}–${S.cur[0] - 1}.</div>
      </section>

      <div class="sec-title">Sistem Zonasi Surveilans DBD <small>WHO EWARS dan Kanal Endemis</small></div>
      <div class="zone-cards mb24">
        <div class="zone-card m"><div class="zc-h"><div class="zc-ic"><i></i></div><div><div class="zc-n">Zona Merah · Risiko Tinggi</div><div class="zc-th">EWARS &gt; P75 · KE &gt; rata-rata + 1 SD</div></div></div>
          <p>Perkiraan kasus melampaui batas wajar kecamatan. Memerlukan respons segera dan koordinasi lintas sektor.</p><div class="zc-act">Penyelidikan epidemiologi · PSN serentak · fogging fokus bila perlu</div></div>
        <div class="zone-card k"><div class="zc-h"><div class="zc-ic"><i></i></div><div><div class="zc-n">Zona Kuning · Waspada</div><div class="zc-th">EWARS P50–P75 · KE rata-rata s/d +1 SD</div></div></div>
          <p>Kecamatan dalam kondisi waspada. Perkiraan kasus berada di rentang menengah dan perlu pemantauan aktif.</p><div class="zc-act">PJB intensif · PSN terjadwal · komunikasi risiko</div></div>
        <div class="zone-card h"><div class="zc-h"><div class="zc-ic"><i></i></div><div><div class="zc-n">Zona Hijau · Risiko Rendah</div><div class="zc-th">EWARS ≤ P50 · KE ≤ rata-rata</div></div></div>
          <p>Perkiraan kasus di bawah median historis. Kondisi terkendali, cukup menjalankan surveilans rutin.</p><div class="zc-act">Surveilans rutin · edukasi PSN 3M Plus berkala</div></div>
      </div>

      <div class="sec-title">Alur Sistem DENGUARD <small>dari data mentah hingga peta zona</small></div>
      <section class="panel mb16">
        <div class="flow" id="flow"></div>
      </section>`;

    // ----------------------------------------------------------------
    // peta
    // ----------------------------------------------------------------
    const mapApi = R.map.makeMap(u.$('#ov-map', root), {
      fill: (k) => R.map.zoneColor(S.zoneAt(k, st.fcIdx, st.sys)),
      dim: (k) => !R.scope.has(k),
      tooltip: (k) => kecTip(k),
      onClick: (k) => { st.selKec = k; drawHL(); drawChart(); mapApi.select(k); highlightPrio(); },
      legend: '', cityLabels: true,
    });
    const setLegend = () => mapApi.setLegend(R.map.legendZones('Tingkat risiko', st.sys === 'ec'
      ? [['Merah', 'Tinggi · > rata-rata + 1 SD'], ['Kuning', 'Waspada · rata-rata s/d +1 SD'], ['Hijau', 'Rendah · ≤ rata-rata']]
      : [['Merah', 'Tinggi · > P75 historis'], ['Kuning', 'Waspada · P50 – P75'], ['Hijau', 'Rendah · ≤ P50']]));

    function kecTip(k) {
      const kc = S.kecBy.get(k), r = S.fc.get(k)[st.fcIdx], thr = S.thr.get(k);
      const w = S.fw[st.fcIdx];
      const ec = r ? S.ecOf(k, r.minggu) : null;
      return `<div class="kt-name">${u.esc(kc.nm)}</div><div class="kt-sub">${u.esc(kc.kota)} · ${fmt.wk(w.y, w.w)} (${w.range})</div>
        <div class="kt-row"><span>Perkiraan kasus</span><b>${fmt.num(r?.kasus_pred, 1)}</b></div>
        <div class="kt-row"><span>Zona EWARS</span><b>${r?.zona_ewars || '–'}</b></div>
        <div class="kt-row"><span>Zona kanal endemis</span><b>${r?.zona_ec || '–'}</b></div>
        <div class="kt-row"><span>P50 / P75 historis</span><b>${fmt.num(thr?.p50)} / ${fmt.num(thr?.p75)}</b></div>
        <div class="kt-row"><span>Rata-rata minggu ini</span><b>${fmt.num(ec?.ec_mean, 1)}</b></div>`;
    }

    // ----------------------------------------------------------------
    // KPI
    // ----------------------------------------------------------------
    function drawKpis() {
      const i = st.fcIdx, w = S.fw[i];
      const tot = scopeFcTotal(i);
      const base = inScope.reduce((a, k) => a + (S.ecOf(k.kode_kec, w.w)?.ec_mean || 0), 0);
      const dlt = base ? tot / base - 1 : null;
      const cnt = { Hijau: 0, Kuning: 0, Merah: 0 };
      for (const k of inScope) { const z = S.zoneAt(k.kode_kec, i, st.sys); if (z) cnt[z]++; }
      const totals = S.fw.map((_, j) => scopeFcTotal(j));
      const pk = totals.indexOf(Math.max(...totals));
      const pw = S.fw[pk];
      const pkMerah = inScope.filter((k) => S.zoneAt(k.kode_kec, pk, st.sys) === 'Merah').length;
      const n = nScope;
      u.$('#kpis', root).innerHTML = `
        <div class="kpi" style="--kc:var(--brand)">
          <div class="kpi-ic">${u.icon('trend')}</div>
          <div class="kpi-l">Perkiraan kasus · ${fmt.wk(w.y, w.w)}</div>
          <div class="kpi-v">${fmt.num(tot)}<small>kasus</small></div>
          <div class="kpi-s">${dlt == null ? '' : `<b class="${dlt > 0 ? 'up' : 'down'}">${fmt.pct(dlt, 0, true)}</b> vs rata-rata historis minggu ini (${fmt.num(base)})`}</div>
        </div>
        <div class="kpi" style="--kc:var(--z-merah-map)">
          <div class="kpi-ic">${u.icon('alert')}</div>
          <div class="kpi-l">Zona merah · ${sysName(st.sys)}</div>
          <div class="kpi-v">${cnt.Merah}<small>dari ${n}</small></div>
          <div class="kpi-s">Kuning <b>${cnt.Kuning}</b> · Hijau <b>${cnt.Hijau}</b></div>
          <div class="zbar"><i style="width:${(cnt.Merah / n) * 100}%;background:var(--z-merah-map)"></i><i style="width:${(cnt.Kuning / n) * 100}%;background:var(--z-kuning-map)"></i><i style="width:${(cnt.Hijau / n) * 100}%;background:var(--z-hijau-map)"></i></div>
        </div>
        <div class="kpi" style="--kc:var(--c-amber)">
          <div class="kpi-ic">${u.icon('calendar')}</div>
          <div class="kpi-l">Puncak dalam ${S.fw.length} minggu</div>
          <div class="kpi-v">${fmt.wk(pw.y, pw.w)}<small>${pw.range}</small></div>
          <div class="kpi-s">≈ <b>${fmt.num(totals[pk])}</b> kasus · <b>${pkMerah}</b> kecamatan merah</div>
        </div>
        <div class="kpi" style="--kc:var(--c-teal)">
          <div class="kpi-ic">${u.icon('target')}</div>
          <div class="kpi-l">Akurasi model</div>
          <div class="kpi-v">R² ${fmt.num(S.headline.r2, 2)}</div>
          <div class="kpi-s">${u.esc(S.headline.label)} · meleset rata-rata <b>${fmt.num(S.headline.mae, 2)}</b> kasus/kecamatan/minggu (MAE)</div>
        </div>`;
    }

    function drawTabs() {
      u.$('#wtabs', root).innerHTML = S.fw.map((w, i) => `
        <button class="wtab ${i === st.fcIdx ? 'on' : ''}" data-i="${i}">
          <span class="now" style="${w.d === 0 ? '' : 'opacity:.7;color:inherit'}">${w.d === 0 ? 'Berjalan' : w.d < 0 ? 'Lalu' : '+' + w.d}</span>
          <b>${fmt.wk(w.y, w.w)}</b><span>${w.range}</span>
        </button>`).join('');
      u.$$('#wtabs .wtab', root).forEach((b) => (b.onclick = () => { st.fcIdx = +b.dataset.i; update(); }));
    }

    // ----------------------------------------------------------------
    // kartu kecamatan terpilih
    // ----------------------------------------------------------------
    function selected() {
      if (st.selKec && S.kecBy.has(st.selKec) && R.scope.has(st.selKec)) return st.selKec;
      const list = S.priority(st.fcIdx, st.sys, 'zona').filter((d) => R.scope.has(d.k.kode_kec));
      const top = list.find((d) => !d.lowThr) || list[0];
      return top ? top.k.kode_kec : inScope[0]?.kode_kec;
    }
    function drawHL() {
      const kode = selected();
      const k = S.kecBy.get(kode), r = S.fc.get(kode)[st.fcIdx], w = S.fw[st.fcIdx];
      const z = S.zoneAt(kode, st.fcIdx, st.sys);
      const thr = S.thr.get(kode);
      const ec = r ? S.ecOf(kode, r.minggu) : null;
      const base = st.sys === 'ec' ? ec?.ec_upper_yellow : thr?.p75;
      const dv = ec?.ec_mean ? r?.kasus_pred / ec.ec_mean - 1 : null;
      const zc = z ? { Merah: '#c8141f', Kuning: '#e09a00', Hijau: '#2e9f5b' }[z] : 'var(--ink-3)';
      const el = u.$('#hl', root);
      el.style.setProperty('--hz', zc);
      // Otomatis = kecamatan prioritas teratas minggu & sistem ini; manual = dipilih lewat peta/daftar
      const manual = !!(st.selKec && S.kecBy.has(st.selKec) && R.scope.has(st.selKec));
      const rank = S.priority(st.fcIdx, st.sys, 'zona').filter((d) => R.scope.has(d.k.kode_kec) && !d.lowThr).findIndex((d) => d.k.kode_kec === kode) + 1;
      const pickNote = manual
        ? `<span class="hl-pick manual">Dipilih manual${rank ? ` · prioritas #${rank}` : ''}<button type="button" id="hl-auto" title="Kembali ke kecamatan prioritas tertinggi">Kembali ke prioritas</button></span>`
        : `<span class="hl-pick" title="Urutan: zona tertinggi dulu, lalu rasio perkiraan terhadap batas ${st.sys === 'ec' ? 'kuning' : 'P75'}. Kecamatan berambang di bawah 1 kasus (mis. Kep. Seribu) dilewati karena angkanya menyesatkan. Klik peta atau daftar untuk memilih kecamatan lain.">${u.icon('target', 'width="13" height="13"')}Prioritas tertinggi ${fmt.wk(w.y, w.w)} · otomatis</span>`;
      el.innerHTML = `
        <div class="hl-top">
          <div class="hl-name" id="hl-go" title="Buka halaman kecamatan">${u.icon('pin')}<span>${u.esc(k.nm)}, <small>${u.esc(k.kota)}</small></span>${u.icon('chevR', 'width="16" height="16" style="color:var(--ink-3)"')}</div>
          <span class="tag">${fmt.wk(w.y, w.w)} · ${w.range}</span>
        </div>
        ${pickNote}
        <div class="hl-lbl">Tingkat risiko ${w.d === 0 ? 'saat ini' : 'pada ' + w.rel.toLowerCase()} · ${sysName(st.sys)}</div>
        <div class="hl-row">
          <span class="riskpill ${z ? 'z-' + z : ''}">${z ? zone.LABEL[z].toUpperCase() : 'TANPA DATA'}</span>
          <div class="hl-mos">${u.mosq()}</div>
        </div>
        <p class="hl-desc">${z ? zone.DESC[z] : 'Belum ada perkiraan untuk kecamatan ini.'}</p>
        ${base != null && base < 1 ? `<p class="hl-desc" style="margin-top:8px;font-size:11.5px;color:var(--z-kuning-ink)">Ambang kecamatan ini di bawah 1 kasus, jadi perkiraan kecil pun terhitung tinggi. Baca bersama jumlah kasus.</p>` : ''}
        <div class="hl-stats">
          <div class="hl-stat"><div class="l">Perkiraan</div><div class="v">${fmt.num(r?.kasus_pred, 1)} <small>kasus</small></div></div>
          <div class="hl-stat"><div class="l">Batas ${st.sys === 'ec' ? 'kuning' : 'P75'}</div><div class="v">${fmt.num(base, 1)}</div></div>
          <div class="hl-stat"><div class="l">vs rata-rata</div><div class="v ${dv > 0 ? 'up' : 'down'}">${fmt.pct(dv, 0, true)}</div></div>
        </div>`;
      u.$('#hl-go', root).onclick = () => R.go('#/kecamatan/' + kode);
      const au = u.$('#hl-auto', root);
      if (au) au.onclick = () => { st.selKec = null; drawHL(); drawChart(); mapApi.select(selected()); highlightPrio(); };
    }

    // ----------------------------------------------------------------
    // grafik perkiraan mingguan
    // ----------------------------------------------------------------
    function drawChart() {
      u.$$('#cm button', root).forEach((b) => b.classList.toggle('on', b.dataset.m === st.chartMode));
      const kode = selected();
      const isKec = st.chartMode === 'kec';
      const data = S.fw.map((w, j) => ({
        x: w.idx,
        y: isKec ? S.fc.get(kode)[j]?.kasus_pred ?? null : scopeFcTotal(j),
        z: isKec ? S.zoneAt(kode, j, st.sys) : null,
      }));
      const ticks = S.fw.map((w) => ({ v: w.idx, label: fmt.wk(w.y, w.w) }));
      charts.xy(u.$('#wchart', root), {
        height: 230, margin: { l: 38, r: 22, t: 30 },
        x: { min: S.fw[0].idx, max: S.fw[S.fw.length - 1].idx, ticks, minLabelGap: 40 },
        y: { label: (isKec ? S.kecBy.get(kode).nm : R.scope.label()) + ' · kasus' },
        layers: [
          { type: 'area', data, grad: ['#c0111f', 0.28, 0.02], curve: 'smooth' },
          { type: 'line', data, stroke: 'var(--brand)', width: 2.6, curve: 'smooth' },
          { type: 'dots', data: data.map((d) => ({ ...d, fill: d.z ? `var(--z-${d.z.toLowerCase()}-map)` : 'var(--panel)', stroke: 'var(--panel)' })), r: 6.5, sw: 2.5, label: (d) => fmt.num(d.y, isKec ? 1 : 0) },
        ],
        hover: {
          xs: S.fw.map((w) => w.idx),
          marks: () => [],
          html: (i) => {
            const j = S.fw.findIndex((w) => w.idx === i), w = S.fw[j];
            const v = data[j].y;
            return `<div class="t-h">${fmt.wk(w.y, w.w)} · ${w.range}</div>` +
              charts.tr(isKec ? 'Perkiraan kasus' : 'Total perkiraan', fmt.num(v, isKec ? 1 : 0), 'var(--brand)') +
              (isKec ? charts.tr('Zona ' + sysName(st.sys), data[j].z || '–') : '') +
              `<div class="t-note">${w.rel}</div>`;
          },
        },
      });
    }

    // ----------------------------------------------------------------
    // ringkasan wilayah
    // ----------------------------------------------------------------
    function drawArea() {
      const i = st.fcIdx, w = S.fw[i];
      const c = { Hijau: 0, Kuning: 0, Merah: 0 };
      for (const k of inScope) { const z = S.zoneAt(k.kode_kec, i, st.sys); if (z) c[z]++; }
      u.$('#as-meta', root).textContent = `${fmt.wk(w.y, w.w)} · ${sysName(st.sys)}`;
      u.$('#area', root).innerHTML = `
        <div class="area-stat m"><div class="v">${c.Merah}</div><div class="l">Kecamatan<br>Risiko Tinggi</div></div>
        <div class="area-stat k"><div class="v">${c.Kuning}</div><div class="l">Kecamatan<br>Waspada</div></div>
        <div class="area-stat h"><div class="v">${c.Hijau}</div><div class="l">Kecamatan<br>Risiko Rendah</div></div>`;
      let rows;
      if (!st.kota) {
        rows = S.kota.map((kt) => {
          const ks = S.kec.filter((k) => k.kota === kt);
          const cc = { Hijau: 0, Kuning: 0, Merah: 0 };
          let sum = 0;
          for (const k of ks) { const z = S.zoneAt(k.kode_kec, i, st.sys); if (z) cc[z]++; sum += S.fc.get(k.kode_kec)[i]?.kasus_pred || 0; }
          return { name: kt, n: ks.length, cc, sum };
        });
      } else {
        rows = S.priority(i, st.sys, 'kasus').filter((d) => R.scope.has(d.k.kode_kec)).slice(0, 6)
          .map((d) => ({ name: d.k.nm, n: 1, cc: { Merah: d.z === 'Merah' ? 1 : 0, Kuning: d.z === 'Kuning' ? 1 : 0, Hijau: d.z === 'Hijau' ? 1 : 0 }, sum: d.pred || 0 }));
      }
      const totKasus = rows.reduce((a, r) => a + r.sum, 0), totN = rows.reduce((a, r) => a + r.n, 0);
      u.$('#as-foot', root).innerHTML = `<span>Total perkiraan ${fmt.wk(w.y, w.w)}</span><b>${fmt.num(totKasus, 0)} kasus</b><span class="sep">·</span><span>rata-rata <b>${fmt.num(totN ? totKasus / totN : 0, 1)}</b> per kecamatan</span>`;
      u.$('#kota-mini', root).innerHTML = rows.map((r) => `
        <div class="kota-row"><span class="n">${u.esc(r.name)}</span>
          <div class="zbar" style="margin:0"><i style="width:${(r.cc.Merah / r.n) * 100}%;background:var(--z-merah-map)"></i><i style="width:${(r.cc.Kuning / r.n) * 100}%;background:var(--z-kuning-map)"></i><i style="width:${(r.cc.Hijau / r.n) * 100}%;background:var(--z-hijau-map)"></i></div>
          <span class="t">${fmt.num(r.sum, 0)} kasus</span></div>`).join('');
    }

    // ----------------------------------------------------------------
    // peringatan dini & rekomendasi
    // ----------------------------------------------------------------
    function drawEwr() {
      const i = st.fcIdx;
      const now = inScope.map((k) => ({ k, z: S.zoneAt(k.kode_kec, i, st.sys) }));
      const merah = now.filter((d) => d.z === 'Merah');
      const rising = inScope.filter((k) => {
        const z0 = zone.ZRANK[S.zoneAt(k.kode_kec, S.fcCur, st.sys)] || 0;
        return S.fw.some((_, j) => j > S.fcCur && (zone.ZRANK[S.zoneAt(k.kode_kec, j, st.sys)] || 0) > z0);
      });
      const top = S.priority(i, st.sys, 'zona').filter((d) => R.scope.has(d.k.kode_kec) && d.z === 'Merah').slice(0, 3).map((d) => d.k.nm);
      const dom = merah.length ? 'Merah' : now.some((d) => d.z === 'Kuning') ? 'Kuning' : 'Hijau';
      const recs = S.rekom.filter((r) => r.audiens === 'dinkes' && r.zona === dom).sort((a, b) => a.urutan - b.urutan).slice(0, 3);
      const w = S.fw[i];
      u.$('#ewr', root).innerHTML = `
        <div class="alert-box ${merah.length ? '' : 'ok'}">
          <div class="ai">${u.icon(merah.length ? 'alert' : 'shield')}</div>
          <div>${merah.length
            ? `<b>${merah.length} kecamatan di zona merah pada ${fmt.wk(w.y, w.w)}</b> (${w.range}). ${top.length ? `Prioritas: ${u.esc(top.join(', '))}.` : ''} ${rising.length ? `${rising.length} kecamatan diperkirakan naik zona dalam ${S.fw.length - 1 - S.fcCur} minggu ke depan.` : ''}`
            : `<b>Tidak ada kecamatan zona merah pada ${fmt.wk(w.y, w.w)}.</b> ${rising.length ? `${rising.length} kecamatan diperkirakan naik zona dalam beberapa minggu ke depan; tetap pantau.` : 'Pertahankan surveilans rutin.'}`}</div>
        </div>
        <div class="rec-list">${recs.map((r, n) => `<div class="rec"><div class="ri">${u.icon(REC_ICONS[n % REC_ICONS.length])}</div><div><b>${u.esc(r.judul)}</b><p>${u.esc(r.deskripsi)}</p></div></div>`).join('')}</div>`;
    }

    // ----------------------------------------------------------------
    // prioritas
    // ----------------------------------------------------------------
    function drawPrio() {
      const i = st.fcIdx, w = S.fw[i];
      st.prioBy = st.prioBy || 'zona';
      u.$$('#prio-by button', root).forEach((b) => b.classList.toggle('on', b.dataset.b === st.prioBy));
      const list = S.priority(i, st.sys, st.prioBy).filter((d) => R.scope.has(d.k.kode_kec));
      const refLbl = st.sys === 'ec' ? 'Batas kuning' : 'P75';
      u.$('#prio-meta', root).textContent = st.prioBy === 'zona'
        ? `${fmt.wk(w.y, w.w)} · urut zona, lalu rasio terhadap ${refLbl}`
        : `${fmt.wk(w.y, w.w)} · urut jumlah perkiraan kasus`;
      const from = S.histMax - 9;
      u.$('#prio', root).innerHTML = `
        <div class="prio-row prio-head"><span>#</span><span>Kecamatan</span><span>Zona</span><span class="val">Kasus</span><span style="text-align:right">10 mg + perkiraan</span></div>` +
        list.map((d, n) => {
          const vals = [];
          for (let j = from; j <= S.histMax; j++) vals.push(S.actual(d.k.kode_kec, j)?.k ?? null);
          for (const r of S.fc.get(d.k.kode_kec)) vals.push(r?.kasus_pred ?? null);
          const col = d.z ? `var(--z-${d.z.toLowerCase()})` : 'var(--brand)';
          return `<div class="prio-row" data-k="${d.k.kode_kec}">
            <span class="rk">${n + 1}</span>
            <span style="min-width:0"><div class="nm">${u.esc(d.k.nm)}</div><div class="kt">${u.esc(d.k.kota)}${d.lowThr ? ' · <span title="Ambang di bawah 1 kasus: perkiraan kecil pun masuk zona tinggi. Interpretasikan bersama jumlah kasus.">ambang rendah</span>' : ''}</div></span>
            <span>${zone.chip(d.z)}</span>
            <span class="val">${fmt.num(d.pred, 1)}<small>${refLbl} ${fmt.num(d.ref, 1)}</small></span>
            <span style="justify-self:end">${charts.spark(vals, 10, { color: col })}</span>
          </div>`;
        }).join('');
      u.$$('#prio .prio-row[data-k]', root).forEach((el) => {
        el.onclick = () => { st.selKec = el.dataset.k; drawHL(); drawChart(); mapApi.select(el.dataset.k); highlightPrio(); };
        el.ondblclick = () => R.go('#/kecamatan/' + el.dataset.k);
      });
      highlightPrio();
    }
    function highlightPrio() {
      const k = selected();
      u.$$('#prio .prio-row[data-k]', root).forEach((el) => el.classList.toggle('sel', el.dataset.k === k));
    }

    // ----------------------------------------------------------------
    // tren & iklim
    // ----------------------------------------------------------------
    function drawTrend() {
      const i0 = S.histMax - 51, i1 = S.fw[S.fw.length - 1].idx;
      const xs = d3.range(i0, i1 + 1);
      const sea = scopeSeason();
      const band = [], mean = [], bars = [];
      for (const i of xs) {
        const [, w] = epi.idxToEpi(i);
        const s = sea(w);
        if (s) { band.push({ x: i, y0: Math.max(0, s.mean - s.sd), y1: s.mean + s.sd }); mean.push({ x: i, y: s.mean }); }
        const a = scopeActual(i);
        if (a) bars.push({ x: i, y: a.k, fill: a.est ? 'var(--brand)' : 'var(--ink-3)', hatch: !a.f });
      }
      const fcBars = S.fw.map((w, j) => ({ x: w.idx, y: scopeFcTotal(j), fill: 'var(--brand)' }));
      const dow = (S.today - epi.weekStart(...S.cur)) / epi.DAY;
      charts.xy(u.$('#trend', root), {
        height: 270,
        x: { min: i0, max: i1, ticks: charts.weekTicks(i0, i1) },
        y: { label: 'kasus / minggu' },
        forecastFrom: S.fw[0].idx,
        today: S.curIdx - 0.5 + (dow + 0.5) / 7,
        layers: [
          { type: 'band', data: band, fill: 'var(--season)' },
          { type: 'bars', data: bars, pad: 0.22 },
          { type: 'bars', data: fcBars, pad: 0.22 },
          { type: 'line', data: mean, stroke: 'var(--ink-3)', width: 1, dash: '3 3' },
        ],
        hover: {
          xs, marks: () => [],
          html: (i) => {
            const [y, w] = epi.idxToEpi(i);
            const a = scopeActual(i);
            const fj = S.fw.findIndex((f) => f.idx === i);
            const s = sea(w);
            return `<div class="t-h">${fmt.wk(y, w)} ${y} · ${fmt.range(y, w)}</div>` +
              (a ? charts.tr(a.est ? 'Estimasi (belum dirilis Dinkes)' : a.f ? 'Terlapor (final)' : 'Terlapor (sementara)', fmt.num(a.k), a.est ? 'var(--brand)' : 'var(--ink-3)') : '') +
              (fj >= 0 ? charts.tr('Perkiraan', fmt.num(scopeFcTotal(fj), 1), 'var(--brand)') : '') +
              (s ? charts.tr('Rata-rata musiman', `${fmt.num(s.mean)} ± ${fmt.num(s.sd)}`) : '');
          },
        },
      });
    }

    function drawClimate() {
      const i0 = S.histMax - 51, i1 = S.fw[S.fw.length - 1].idx;
      const xs = [], rain = [], temp = [];
      const codes = new Set(inScope.map((k) => k.kode_kec));
      for (let i = i0; i <= i1; i++) {
        let ch = [], su = [];
        for (const c of codes) { const r = S.ikl.get(c)?.get(i); if (r) { ch.push(r.curah_hujan_kumulatif); su.push(r.suhu_rata); } }
        if (!ch.length) continue;
        xs.push(i);
        rain.push({ x: i, y: d3.mean(ch), fill: 'color-mix(in srgb, var(--rain) 60%, transparent)' });
        temp.push({ x: i, y: d3.mean(su) });
      }
      const el = u.$('#climate', root);
      if (!xs.length) { el.innerHTML = '<div class="empty">Belum ada data iklim untuk periode ini.</div>'; return; }
      charts.xy(el, {
        height: 150, margin: { r: 44, t: 22 },
        x: { min: i0, max: i1, ticks: charts.weekTicks(i0, i1) },
        y: { label: 'mm', ticks: 3 },
        y2: { label: '°C', format: (v) => fmt.num(v, 0) },
        forecastFrom: S.fw[0].idx, forecastLabel: false,
        layers: [
          { type: 'bars', data: rain, pad: 0.22 },
          { type: 'line', data: temp, axis: 'y2', stroke: 'var(--z-merah)', width: 1.7 },
        ],
        hover: {
          xs,
          marks: (i) => [{ y: temp.find((t) => t.x === i)?.y, axis: 'y2', color: 'var(--z-merah)' }],
          html: (i) => {
            const [y, w] = epi.idxToEpi(i);
            return `<div class="t-h">${fmt.wk(y, w)} ${y} · ${fmt.range(y, w)}</div>` +
              charts.tr('Curah hujan', fmt.num(rain.find((t) => t.x === i)?.y, 1) + ' mm', 'var(--rain)') +
              charts.tr('Suhu rata-rata', fmt.num(temp.find((t) => t.x === i)?.y, 1) + ' °C', 'var(--z-merah)') +
              `<div class="t-note">Rata-rata ${nScope} kecamatan</div>`;
          },
        },
      });
    }

    function drawZdist() {
      u.$('#zd-meta', root).textContent = sysName(st.sys);
      const n = nScope;
      u.$('#zdist', root).innerHTML = S.fw.map((w, i) => {
        const c = { Hijau: 0, Kuning: 0, Merah: 0 };
        for (const k of inScope) { const z = S.zoneAt(k.kode_kec, i, st.sys); if (z) c[z]++; }
        const seg = (cls, v) => v ? `<i class="${cls}" style="width:${(v / n) * 100}%">${v / n >= 0.09 ? v : ''}</i>` : '';
        return `<div class="zd-row ${i === st.fcIdx ? 'on' : ''}" data-i="${i}" style="cursor:pointer" title="Merah ${c.Merah} · Kuning ${c.Kuning} · Hijau ${c.Hijau}">
          <div class="w"><b>${fmt.wk(w.y, w.w)} · ${w.d === 0 ? 'berjalan' : w.d < 0 ? 'lalu' : '+' + w.d}</b><span>${w.range}</span></div>
          <div class="zd-bar">${seg('m', c.Merah)}${seg('k', c.Kuning)}${seg('h', c.Hijau)}</div>
          <div class="tot">${fmt.num(scopeFcTotal(i))} kasus</div>
        </div>`;
      }).join('');
      u.$$('#zdist .zd-row', root).forEach((el) => (el.onclick = () => { st.fcIdx = +el.dataset.i; update(); }));
    }

    function drawKota() {
      const i = st.fcIdx, w = S.fw[i];
      u.$('#kota-meta', root).textContent = `${fmt.wk(w.y, w.w)} · ${sysName(st.sys)}`;
      const kotas = st.kota ? [st.kota] : S.kota;
      const rows = kotas.map((kt) => {
        const ks = S.kec.filter((k) => k.kota === kt);
        const c = { Hijau: 0, Kuning: 0, Merah: 0 };
        let sum = 0, top = null;
        for (const k of ks) {
          const r = S.fc.get(k.kode_kec)[i];
          const z = S.zoneAt(k.kode_kec, i, st.sys);
          if (z) c[z]++;
          sum += r?.kasus_pred || 0;
          if (r && (!top || r.kasus_pred > top.r.kasus_pred)) top = { k, r };
        }
        return { kt, n: ks.length, c, sum, top };
      });
      const tot = rows.reduce((a, r) => a + r.sum, 0);
      const zh = (z) => `<th class="r" title="Jumlah kecamatan zona ${z}"><span class="zdot z-${z}"></span></th>`;
      u.$('#kota-tbl', root).innerHTML = `
        <thead><tr><th>Wilayah · tertinggi</th><th class="r">Perkiraan</th>${zh('Merah')}${zh('Kuning')}${zh('Hijau')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td><div class="strong" style="font-weight:700">${u.esc(r.kt)}</div><div class="muted" style="font-size:11.5px">${r.top ? `${u.esc(r.top.k.nm)} · ${fmt.num(r.top.r.kasus_pred, 1)}` : '–'}</div></td>
          <td class="r">${fmt.num(r.sum, 1)}</td>
          <td class="r" style="color:var(--z-merah-ink);font-weight:${r.c.Merah ? 800 : 400}">${r.c.Merah}</td>
          <td class="r">${r.c.Kuning}</td><td class="r">${r.c.Hijau}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td>${u.esc(R.scope.label())}</td><td class="r">${fmt.num(tot, 1)}</td><td class="r">${rows.reduce((a, r) => a + r.c.Merah, 0)}</td><td class="r">${rows.reduce((a, r) => a + r.c.Kuning, 0)}</td><td class="r">${rows.reduce((a, r) => a + r.c.Hijau, 0)}</td></tr></tfoot>`;
    }

    function drawFlow() {
      const steps = [
        ['download', 'Ingest Data', 'Kasus DBD Dinkes & iklim satelit', '#c0111f'],
        ['layers', 'Feature Engineering', 'Lag, rolling, spasial, musiman', '#8a6bc4'],
        ['search', 'EDA & Spasial', "Korelasi, Moran's I", '#0e8a93'],
        ['cpu', 'Training', 'LightGBM Tweedie · Optuna + CV', '#e08a1e'],
        ['trend', 'Forecast', `${S.fw.length} minggu iteratif`, '#d23a46'],
        ['map', 'Peta Zona', 'EWARS & Kanal Endemis', '#2f6fb5'],
      ];
      u.$('#flow', root).innerHTML = steps.map(([ic, t, s, c], n) => `
        <div class="flow-step" style="--fc:${c}"><div class="flow-ic">${u.icon(ic)}<span class="no">${n + 1}</span></div><b>${t}</b><small>${s}</small></div>${n < steps.length - 1 ? '<div class="flow-arrow">›</div>' : ''}`).join('');
    }

    function update() {
      u.$$('#sys button', root).forEach((b) => b.classList.toggle('on', b.dataset.s === st.sys));
      drawKpis(); drawTabs(); drawHL(); drawChart(); drawArea(); drawEwr(); drawPrio(); drawZdist(); drawKota(); setLegend();
      mapApi.refresh();
      mapApi.select(selected());
    }

    u.$$('#sys button', root).forEach((b) => (b.onclick = () => { st.sys = b.dataset.s; update(); }));
    u.$$('#prio-by button', root).forEach((b) => (b.onclick = () => { st.prioBy = b.dataset.b; drawPrio(); }));
    u.$$('#cm button', root).forEach((b) => (b.onclick = () => { st.chartMode = b.dataset.m; drawChart(); }));
    u.$('#csv', root).onclick = () => {
      const rows = [];
      for (const k of inScope) {
        S.fc.get(k.kode_kec).forEach((r, i) => {
          if (!r) return;
          const w = S.fw[i], thr = S.thr.get(k.kode_kec), ec = S.ecOf(k.kode_kec, r.minggu);
          rows.push({
            kode_kec: k.kode_kec, kecamatan: k.nm, wilayah: k.kota, tahun: r.tahun, minggu_epi: r.minggu,
            mulai: epi.weekStart(r.tahun, r.minggu).toISOString().slice(0, 10),
            selesai: epi.weekEnd(r.tahun, r.minggu).toISOString().slice(0, 10),
            horizon: r.horizon, posisi: w.rel, kasus_perkiraan: r.kasus_pred,
            zona_ewars: r.zona_ewars, zona_kanal_endemis: r.zona_ec,
            p50: thr?.p50, p75: thr?.p75, ec_mean: ec ? +ec.ec_mean.toFixed(2) : '', ec_batas_kuning: ec ? +ec.ec_upper_yellow.toFixed(2) : '',
            model: r.model_versi,
          });
        });
      }
      const w = S.fw[0];
      u.downloadCsv(`denguard-forecast-${w.y}-W${String(w.w).padStart(2, '0')}.csv`, rows);
    };

    drawFlow();
    update();
    drawTrend();
    drawClimate();
    mapApi.invalidate();
    requestAnimationFrame(() => mapApi.invalidate());
  }
})();

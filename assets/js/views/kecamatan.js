(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt, zone, charts, epi } = R;

  R.views.kecamatan = { title: 'Kecamatan', render };

  function render(root, params) {
    const S = R.S, st = R.state;
    let kode = params[0] && S.kecBy.has(params[0]) ? params[0] : (st.kecSel && S.kecBy.has(st.kecSel) ? st.kecSel : S.priority(S.fcCur)[0].k.kode_kec);
    st.kecSel = kode;
    st.kcMode = st.kcMode || 'ec';

    root.innerHTML = `
      <div class="kc-layout">
        <aside class="panel kc-list">
          <div class="search"><input class="inp" id="q" placeholder="Cari kecamatan…" autocomplete="off"></div>
          <div class="kc-items" id="items"></div>
        </aside>
        <div id="detail" class="kc-detail"></div>
      </div>`;

    function drawList(q = '') {
      const ql = q.trim().toLowerCase();
      let html = '', last = null;
      for (const k of S.kec) {
        if (ql && !k.nm.toLowerCase().includes(ql) && !k.kota.toLowerCase().includes(ql)) continue;
        if (k.kota !== last) { html += `<div class="kc-grp">${u.esc(k.kota)}</div>`; last = k.kota; }
        const z = S.zoneAt(k.kode_kec, S.fcCur, st.sys);
        const r = S.fc.get(k.kode_kec)[S.fcCur];
        html += `<div class="kc-item ${k.kode_kec === kode ? 'on' : ''}" data-k="${k.kode_kec}">${zone.zdot(z)}<span>${u.esc(k.nm)}</span><span class="v">${fmt.num(r?.kasus_pred, 1)}</span></div>`;
      }
      u.$('#items', root).innerHTML = html || '<div class="empty">Tidak ditemukan.</div>';
      u.$$('#items .kc-item', root).forEach((el) => (el.onclick = () => {
        history.replaceState(null, '', '#/kecamatan/' + el.dataset.k);
        kode = el.dataset.k; st.kecSel = kode;
        u.$$('#items .kc-item', root).forEach((x) => x.classList.toggle('on', x.dataset.k === kode));
        drawDetail();
      }));
    }

    function drawDetail() {
      const k = S.kecBy.get(kode);
      const fcs = S.fc.get(kode);
      const thr = S.thr.get(kode);
      const ci = S.fcCur, rc = fcs[ci], wc = S.fw[ci];
      const pk = fcs.reduce((b, r, i) => (r && (b < 0 || r.kasus_pred > fcs[b].kasus_pred) ? i : b), -1);
      const nbs = (S.nb.get(kode) || []).map((c) => S.kecBy.get(c)).filter(Boolean);

      // YTD vs periode sama tahun lalu
      const [ly, lw] = epi.idxToEpi(S.dbdMax);
      let ytd = 0, ytdPrev = 0;
      for (let w = 1; w <= lw; w++) {
        ytd += S.actual(kode, epi.weekIdx(ly, w))?.k || 0;
        if (w <= epi.weeksInYear(ly - 1)) ytdPrev += S.actual(kode, epi.weekIdx(ly - 1, w))?.k || 0;
      }
      const ytdD = ytdPrev ? ytd / ytdPrev - 1 : null;

      const d = u.$('#detail', root);
      d.innerHTML = `
        <section class="panel accent mb16">
          <div class="kc-head">
            <div>
              <h1>${u.esc(k.nm)}</h1>
              <div class="sub">${u.esc(k.kota)} · kode <span class="mono">${k.kode_kec}</span> · ${nbs.length} kecamatan bertetangga</div>
              <div class="zones">
                <span class="tag">${fmt.wk(wc.y, wc.w)} ${wc.d === 0 ? 'berjalan' : ''}</span>
                <span>EWARS ${zone.chip(rc?.zona_ewars)}</span>
                <span>Kanal endemis ${zone.chip(rc?.zona_ec)}</span>
              </div>
            </div>
            <div class="head-actions">
              <button class="btn" id="kc-csv">${u.icon('download')}CSV kecamatan</button>
            </div>
          </div>
          <div class="kc-stats">
            <div class="kc-stat"><div class="l">Perkiraan ${fmt.wk(wc.y, wc.w)} · ${wc.range}</div><div class="v">${fmt.num(rc?.kasus_pred, 1)} <small>kasus</small></div></div>
            <div class="kc-stat"><div class="l">Puncak ${S.fw.length} minggu</div><div class="v">${pk >= 0 ? fmt.num(fcs[pk].kasus_pred, 1) : '–'} <small>${pk >= 0 ? fmt.wk(S.fw[pk].y, S.fw[pk].w) + ' · ' + S.fw[pk].range : ''}</small></div></div>
            <div class="kc-stat"><div class="l">Ambang EWARS (${thr?.basis_tahun_awal ?? ''}–${thr?.basis_tahun_akhir ?? ''})</div><div class="v">${fmt.num(thr?.p50)} <small>P50</small> · ${fmt.num(thr?.p75)} <small>P75</small> · ${fmt.num(thr?.p90)} <small>P90</small></div></div>
            <div class="kc-stat"><div class="l">Kasus ${ly} s/d ${fmt.wk(ly, lw)}</div><div class="v">${fmt.num(ytd)} <small>${ytdD == null ? '' : `<span class="${ytdD > 0 ? 'up' : 'down'}">${fmt.pct(ytdD, 0, true)}</span> vs ${ly - 1}`}</small></div></div>
          </div>
        </section>

        <section class="panel mb16">
          <div class="panel-h">
            <h2>Kasus mingguan terhadap ambang zonasi</h2>
            <div class="seg" id="kc-mode"><button data-m="ec">Kanal endemis</button><button data-m="ewars">EWARS</button></div>
          </div>
          <div class="panel-b"><div class="legend" id="ch-legend" style="margin-bottom:6px"></div><div class="chart" id="ch-main"></div></div>
          <div class="panel-note" id="ch-note"></div>
        </section>

        <div class="grid kc-2 mb16">
          <section class="panel">
            <div class="panel-h"><h2><span class="hic">${u.icon('trend')}</span>Perkiraan ${S.fw.length} minggu</h2><span class="meta">model ${u.esc(S.fcMeta?.model || '')}</span></div>
            <div class="tbl-wrap"><table class="tbl compact">
              <thead><tr><th>Minggu</th><th class="r">Kasus</th><th>EWARS</th><th>Kanal</th><th class="r" title="Dibanding rata-rata minggu-epi yang sama">vs rata²</th></tr></thead>
              <tbody>${fcs.map((r, i) => {
                const w = S.fw[i], ec = r ? S.ecOf(kode, r.minggu) : null;
                const dv = ec?.ec_mean ? r.kasus_pred / ec.ec_mean - 1 : null;
                return `<tr${i === ci ? ' style="background:var(--accent-soft)"' : ''}>
                  <td><div class="strong" style="font-weight:650">${fmt.wk(w.y, w.w)} <span class="muted" style="font-weight:400">· ${w.d === 0 ? 'berjalan' : w.d < 0 ? 'lalu' : '+' + w.d}</span></div><div class="muted" style="font-size:11.5px">${w.range}</div></td>
                  <td class="r strong">${fmt.num(r?.kasus_pred, 1)}</td>
                  <td>${zone.chip(r?.zona_ewars)}</td><td>${zone.chip(r?.zona_ec)}</td>
                  <td class="r ${dv > 0 ? 'up' : 'down'}">${fmt.pct(dv, 0, true)}</td></tr>`;
              }).join('')}</tbody>
            </table></div>
          </section>
          <section class="panel">
            <div class="panel-h"><h2><span class="hic">${u.icon('layers')}</span>Kecamatan tetangga</h2><span class="meta">${fmt.wk(wc.y, wc.w)} · ${st.sys === 'ec' ? 'Kanal endemis' : 'EWARS'}</span></div>
            <div class="panel-b nbb">${nbs.length ? `<div class="nb-list">${nbs.map((n) => {
              const z = S.zoneAt(n.kode_kec, ci, st.sys);
              const vals = [];
              for (let j = S.dbdMax - 5; j <= S.dbdMax; j++) vals.push(S.actual(n.kode_kec, j)?.k ?? null);
              for (const r of S.fc.get(n.kode_kec)) vals.push(r?.kasus_pred ?? null);
              return `
              <div class="nb" data-k="${n.kode_kec}">${zone.zdot(z)}<span class="n"><b>${u.esc(n.nm)}</b><small class="nk">${u.esc(n.kota)}</small></span><span class="sp">${charts.spark(vals, 6, { w: 84, h: 26, color: z ? `var(--z-${z.toLowerCase()})` : 'var(--brand)' })}</span><span class="v">${fmt.num(S.fc.get(n.kode_kec)[ci]?.kasus_pred, 1)}</span></div>`;
            }).join('')}</div>
              <p class="muted" style="font-size:11.5px;margin-top:10px">Kasus tetangga (lag 1–2 minggu) adalah salah satu fitur terkuat model: penularan DBD tidak berhenti di batas administratif.</p>`
              : '<div class="empty"><b>Tidak bertetangga darat</b>Wilayah kepulauan; model memakai 2 kecamatan terdekat sebagai pengganti.</div>'}</div>
          </section>
        </div>

        <section class="panel mb16">
          <div class="panel-h"><h2><span class="hic">${u.icon('cloud')}</span>Iklim kecamatan · 52 minggu terakhir</h2><span class="meta">Google Earth Engine (CHIRPS / ERA5), agregasi minggu-epi</span></div>
          <div class="grid kc-3" style="padding:0 16px 14px;gap:20px">
            <div><div class="label-sm" style="margin-bottom:4px">Curah hujan · mm/minggu</div><div class="chart" id="cl-rain"></div></div>
            <div><div class="label-sm" style="margin-bottom:4px">Suhu rata-rata · °C</div><div class="chart" id="cl-temp"></div></div>
            <div><div class="label-sm" style="margin-bottom:4px">Kelembapan · %</div><div class="chart" id="cl-rh"></div></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('calendar')}</span>Pola kasus per tahun</h2><div id="hm-scale"></div></div>
          <div class="panel-b heat-wrap"><div id="hm"></div></div>
        </section>`;

      u.$$('#detail .nb', root).forEach((el) => (el.onclick = () => R.go('#/kecamatan/' + el.dataset.k)));
      u.$$('#kc-mode button', root).forEach((b) => (b.onclick = () => { st.kcMode = b.dataset.m; drawMain(); }));
      u.$('#kc-csv', root).onclick = () => exportCsv(k);
      drawMain();
      drawClimate();
      drawHeat();
    }

    function drawMain() {
      const k = S.kecBy.get(kode), thr = S.thr.get(kode), fcs = S.fc.get(kode);
      u.$$('#kc-mode button', root).forEach((b) => b.classList.toggle('on', b.dataset.m === st.kcMode));
      const i0 = S.histMax - 51, i1 = S.fw[S.fw.length - 1].idx;
      const xs = d3.range(i0, i1 + 1);
      const fin = [], prov = [], fc = [];
      let top = 1;
      let lastA = null;
      for (let i = i0; i <= S.histMax; i++) {
        const a = S.actual(kode, i);
        if (!a) { fin.push({ x: i, y: null }); continue; }
        top = Math.max(top, a.k);
        if (a.f) fin.push({ x: i, y: a.k });
        else {
          if (!prov.length && lastA) prov.push({ x: lastA.x, y: lastA.y });
          prov.push({ x: i, y: a.k });
          fin.push({ x: i, y: null });
        }
        lastA = { x: i, y: a.k };
      }
      if (lastA) fc.push(lastA);
      const fcDots = [];
      fcs.forEach((r, j) => {
        if (!r) return;
        const p = { x: S.fw[j].idx, y: r.kasus_pred };
        fc.push(p);
        const z = st.kcMode === 'ec' ? r.zona_ec : r.zona_ewars;
        fcDots.push({ ...p, fill: z ? `var(--z-${z.toLowerCase()})` : 'var(--panel)', stroke: 'var(--accent)' });
        top = Math.max(top, r.kasus_pred);
      });

      const layers = [];
      if (st.kcMode === 'ec') {
        const bh = [], bk = [], bm = [];
        for (const i of xs) {
          const [, w] = epi.idxToEpi(i);
          const e = S.ecOf(kode, w);
          if (!e) continue;
          bh.push({ x: i, y0: 0, y1: e.ec_mean });
          bk.push({ x: i, y0: e.ec_mean, y1: e.ec_upper_yellow });
          bm.push({ x: i, y0: e.ec_upper_yellow, y1: e.ec_upper_red });
          top = Math.max(top, e.ec_upper_yellow);
        }
        // Pita merah dibiarkan terpotong supaya garis kasus tetap terbaca.
        top *= 1.25;
        layers.push({ type: 'band', data: bh, fill: 'var(--band-h)', curve: 'step' },
          { type: 'band', data: bk, fill: 'var(--band-k)', curve: 'step' },
          { type: 'band', data: bm, fill: 'var(--band-m)', curve: 'step' });
        u.$('#ch-legend', root).innerHTML = `<span><i class="lg-sw" style="background:var(--band-h);border:1px solid var(--z-hijau)"></i>≤ rata-rata</span>
          <span><i class="lg-sw" style="background:var(--band-k);border:1px solid var(--z-kuning)"></i>s/d +1 SD</span>
          <span><i class="lg-sw" style="background:var(--band-m);border:1px solid var(--z-merah)"></i>+1 s/d +2 SD</span>`;
        u.$('#ch-note', root).textContent = `Kanal endemis WHO: rata-rata dan simpangan baku kasus pada minggu-epi yang sama di ${thr?.basis_tahun_awal ?? ''}–${thr?.basis_tahun_akhir ?? ''}. Di atas batas +1 SD = zona merah. Garis putus-putus = perkiraan model; titik diwarnai sesuai zona.`;
      } else {
        const yTop = Math.max(top, (thr?.p90 || 0)) * 1.15 + 0.5;
        top = yTop;
        layers.push(
          { type: 'band', data: xs.map((i) => ({ x: i, y0: 0, y1: thr?.p50 ?? 0 })), fill: 'var(--band-h)', curve: 'step' },
          { type: 'band', data: xs.map((i) => ({ x: i, y0: thr?.p50 ?? 0, y1: thr?.p75 ?? 0 })), fill: 'var(--band-k)', curve: 'step' },
          { type: 'band', data: xs.map((i) => ({ x: i, y0: thr?.p75 ?? 0, y1: yTop })), fill: 'var(--band-m)', curve: 'step' },
          { type: 'hline', y: thr?.p75 ?? 0, stroke: 'var(--z-merah)', label: `P75 = ${fmt.num(thr?.p75)}` },
          { type: 'hline', y: thr?.p50 ?? 0, stroke: 'var(--z-kuning-ink)', label: `P50 = ${fmt.num(thr?.p50)}` });
        u.$('#ch-legend', root).innerHTML = `<span><i class="lg-sw" style="background:var(--band-h);border:1px solid var(--z-hijau)"></i>≤ P50</span>
          <span><i class="lg-sw" style="background:var(--band-k);border:1px solid var(--z-kuning)"></i>P50–P75</span>
          <span><i class="lg-sw" style="background:var(--band-m);border:1px solid var(--z-merah)"></i>&gt; P75</span>`;
        u.$('#ch-note', root).textContent = `EWARS: ambang tetap dari persentil kasus mingguan kecamatan ${k.nm} sepanjang ${thr?.basis_tahun_awal ?? ''}–${thr?.basis_tahun_akhir ?? ''}. Tidak memperhitungkan musim; bandingkan dengan tampilan kanal endemis.`;
      }
      layers.push(
        { type: 'line', data: fin, stroke: 'var(--ink)', width: 1.7, curve: 'linear' },
        { type: 'line', data: prov, stroke: 'var(--ink-3)', width: 1.7, dash: '2 3', curve: 'linear' },
        { type: 'line', data: fc, stroke: 'var(--accent)', width: 2, dash: '5 4', curve: 'linear' },
        { type: 'dots', data: fcDots, r: 4, sw: 1.6 });
      u.$('#ch-legend', root).innerHTML += `<span><i class="lg-line"></i>Final</span><span><i class="lg-line prov"></i>Sementara</span><span><i class="lg-line fc"></i>Perkiraan</span>`;

      const dow = (S.today - epi.weekStart(...S.cur)) / epi.DAY;
      charts.xy(u.$('#ch-main', root), {
        height: 300,
        x: { min: i0, max: i1, ticks: charts.weekTicks(i0, i1) },
        y: { max: top * 1.08, label: 'kasus / minggu' },
        forecastFrom: S.fw[0].idx,
        today: S.curIdx - 0.5 + (dow + 0.5) / 7,
        layers,
        hover: {
          xs,
          marks: (i) => {
            const a = S.actual(kode, i), j = S.fw.findIndex((f) => f.idx === i);
            if (j >= 0 && fcs[j]) return [{ y: fcs[j].kasus_pred, color: 'var(--accent)' }];
            return a ? [{ y: a.k, color: 'var(--ink)' }] : [];
          },
          html: (i) => {
            const [y, w] = epi.idxToEpi(i), a = S.actual(kode, i), j = S.fw.findIndex((f) => f.idx === i), e = S.ecOf(kode, w);
            const v = j >= 0 ? fcs[j]?.kasus_pred : a?.k;
            return `<div class="t-h">${fmt.wk(y, w)} ${y} · ${fmt.range(y, w)}</div>` +
              (a ? charts.tr(a.f ? 'Terlapor (final)' : 'Terlapor (sementara)', fmt.num(a.k)) : '') +
              (j >= 0 && fcs[j] ? charts.tr('Perkiraan', fmt.num(fcs[j].kasus_pred, 1), 'var(--accent)') : '') +
              (st.kcMode === 'ec'
                ? charts.tr('Rata-rata / +1 SD', `${fmt.num(e?.ec_mean, 1)} / ${fmt.num(e?.ec_upper_yellow, 1)}`) + (v != null ? charts.tr('Zona', zone.ec(v, e) || '–') : '')
                : charts.tr('P50 / P75', `${fmt.num(thr?.p50)} / ${fmt.num(thr?.p75)}`) + (v != null ? charts.tr('Zona', zone.ewars(v, thr) || '–') : ''));
          },
        },
      });
    }

    function drawClimate() {
      const m = S.ikl.get(kode);
      const i0 = S.dbdMax - 51, i1 = S.dbdMax + 1;
      const xs = [], rain = [], temp = [], rh = [];
      for (let i = i0; i <= i1; i++) {
        const c = m?.get(i);
        if (!c) continue;
        xs.push(i);
        rain.push({ x: i, y: c.curah_hujan_kumulatif, fill: 'color-mix(in srgb, var(--rain) 62%, transparent)' });
        temp.push({ x: i, y: c.suhu_rata });
        rh.push({ x: i, y: c.kelembapan_rata });
      }
      const mk = (id, layers, y, unit, key, dec) => {
        const el = u.$(id, root);
        if (!xs.length) { el.innerHTML = '<div class="empty">Belum ada data.</div>'; return; }
        charts.xy(el, {
          height: 150, margin: { l: 34, t: 10 },
          x: { min: i0, max: i1, ticks: charts.weekTicks(i0, i1), minLabelGap: 44 },
          y: { ticks: 3, ...y }, layers,
          hover: {
            xs,
            html: (i) => {
              const [yy, w] = epi.idxToEpi(i), c = m.get(i);
              return `<div class="t-h">${fmt.wk(yy, w)} ${yy} · ${fmt.range(yy, w)}</div>${charts.tr(unit, fmt.num(c[key], dec))}<div class="t-note">Sumber hujan: ${u.esc(c.sumber_hujan)} · ${u.esc(c.jenis)}</div>`;
            },
          },
        });
      };
      mk('#cl-rain', [{ type: 'bars', data: rain, pad: 0.2 }], {}, 'Curah hujan (mm)', 'curah_hujan_kumulatif', 1);
      mk('#cl-temp', [{ type: 'line', data: temp, stroke: 'var(--z-merah)', width: 1.6 }], { min: d3.min(temp, (d) => d.y) - 0.5, max: d3.max(temp, (d) => d.y) + 0.5, format: (v) => fmt.num(v, 0) }, 'Suhu (°C)', 'suhu_rata', 1);
      mk('#cl-rh', [{ type: 'line', data: rh, stroke: 'var(--c-blue)', width: 1.6 }], { min: d3.min(rh, (d) => d.y) - 2, max: Math.min(100, d3.max(rh, (d) => d.y) + 2), format: (v) => fmt.num(v, 0) }, 'Kelembapan (%)', 'kelembapan_rata', 0);
    }

    function drawHeat() {
      const cols = d3.range(1, 53).map((w) => ({ v: w, label: charts.MONTH_WEEKS.find((m) => m.v === w)?.label || '' }));
      let max = 1;
      const val = (y, w) => {
        if (w > epi.maxWeek(+y)) return null;
        const a = S.actual(kode, epi.weekIdx(+y, w));
        return a ? a.k : null;
      };
      for (const y of S.years) for (let w = 1; w <= 52; w++) { const v = val(y, w); if (v != null) max = Math.max(max, v); }
      u.$('#hm-scale', root).innerHTML = charts.heatScale(max);
      charts.heatmap(u.$('#hm', root), {
        rows: S.years.slice().reverse().map((y) => ({ key: String(y), label: String(y) })),
        cols, value: (y, w) => val(y, w), max, cellH: 16, labelW: 44,
        tip: (y, w, v) => `<div class="t-h">${fmt.wk(+y, w)} ${y} · ${w <= epi.weeksInYear(+y) ? fmt.range(+y, w) : ''}</div>${charts.tr('Kasus', v == null ? 'tidak ada data' : fmt.num(v))}`,
      });
    }

    function exportCsv(k) {
      const rows = [];
      for (let i = S.dbdMin; i <= S.dbdMax; i++) {
        const a = S.actual(k.kode_kec, i);
        if (!a) continue;
        const [y, w] = epi.idxToEpi(i);
        rows.push({ kecamatan: k.nm, tahun: y, minggu_epi: w, mulai: epi.weekStart(y, w).toISOString().slice(0, 10), jenis: a.f ? 'final' : 'sementara', kasus: a.k, zona_ewars: zone.ewars(a.k, S.thr.get(k.kode_kec)) || '', zona_kanal_endemis: zone.ec(a.k, S.ecOf(k.kode_kec, w)) || '' });
      }
      S.fc.get(k.kode_kec).forEach((r) => {
        if (!r) return;
        rows.push({ kecamatan: k.nm, tahun: r.tahun, minggu_epi: r.minggu, mulai: epi.weekStart(r.tahun, r.minggu).toISOString().slice(0, 10), jenis: 'perkiraan', kasus: r.kasus_pred, zona_ewars: r.zona_ewars, zona_kanal_endemis: r.zona_ec });
      });
      u.downloadCsv(`denguard-${k.slug || k.kode_kec}.csv`, rows);
    }

    u.$('#q', root).oninput = (e) => drawList(e.target.value);
    drawList();
    drawDetail();
    const on = u.$('#items .kc-item.on', root), box = u.$('#items', root);
    if (on) box.scrollTop = on.offsetTop - box.clientHeight / 2;
  }
})();

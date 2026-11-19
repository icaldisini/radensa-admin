(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt, zone, charts, epi } = R;

  R.views.forecast = { title: 'Forecast', render, scope: true };

  const sysName = (s) => (s === 'ec' ? 'Kanal Endemis' : 'EWARS');

  function render(root) {
    const S = R.S, st = R.state, am = S.active;
    const inScope = R.scope.kec();
    const n = inScope.length;
    let sortKey = 'z', sortDir = -1;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Forecast ${S.fw.length} Minggu</h1>
          <p class="sub">Model ${u.esc(S.fcMeta?.model || am?.versi || '')} dilatih pada seluruh data terbaru dan memprediksi secara iteratif: perkiraan minggu N menjadi fitur lag minggu N+1. Cakupan: <b>${u.esc(R.scope.label())}</b>, ${n} kecamatan.</p>
        </div>
        <div class="head-actions">
          <div class="seg" id="sys"><button data-s="ewars">EWARS</button><button data-s="ec">Kanal Endemis</button></div>
        </div>
      </div>

      <div class="sec-title" style="margin-top:0">Lini Masa Mingguan <small>klik minggu untuk melihat detail</small></div>
      <div class="fc-weeks mb24" id="weeks"></div>

      <div class="grid hs-37 mb24">
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('chart')}</span>Total Perkiraan Kasus per Minggu</h2><span class="meta">${u.esc(R.scope.label())}</span></div>
          <div class="panel-b"><div class="chart" id="tot"></div></div>
          <div class="panel-note" id="tot-note"></div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('target')}</span>Distribusi Zona</h2><span class="meta" id="dn-meta"></span></div>
          <div class="panel-b"><div class="chart" id="donut"></div><div class="legend" style="justify-content:center;margin-top:12px" id="dn-leg"></div><div class="label-sm" style="margin:18px 0 8px">Perkiraan tertinggi minggu ini</div><div id="dn-top"></div></div>
        </section>
      </div>

      <section class="panel mb24">
        <div class="panel-h">
          <div><h2><span class="hic">${u.icon('list')}</span>Detail per Kecamatan</h2><div class="meta" id="det-meta" style="margin-top:3px"></div></div>
          <div class="tools"><input class="inp" id="q" placeholder="Cari kecamatan…" autocomplete="off" style="width:200px"><button class="btn" id="csv">${u.icon('download')}CSV minggu ini</button></div>
        </div>
        <div class="tbl-wrap" style="max-height:560px"><table class="tbl" id="det"></table></div>
      </section>

      <div class="sec-title">10 Kecamatan dengan Beban Perkiraan Tertinggi <small>total seluruh minggu perkiraan</small></div>
      <section class="panel mb16"><div class="tbl-wrap"><table class="tbl" id="top"></table></div></section>`;

    // ---- lini masa
    function drawWeeks() {
      u.$('#weeks', root).innerHTML = S.fw.map((w, i) => {
        const c = { Hijau: 0, Kuning: 0, Merah: 0 };
        for (const k of inScope) { const z = S.zoneAt(k.kode_kec, i, st.sys); if (z) c[z]++; }
        const worst = c.Merah ? 'var(--z-merah-map)' : c.Kuning ? 'var(--z-kuning-map)' : 'var(--z-hijau-map)';
        return `<button class="fcw ${i === st.fcIdx ? 'on' : ''}" data-i="${i}" style="--zc:${worst}">
          <div class="t">${w.d === 0 ? 'Minggu berjalan' : w.d < 0 ? 'Sudah lewat' : w.d === 1 ? 'Minggu depan' : '+' + w.d + ' minggu'}</div>
          <div class="w">${fmt.wk(w.y, w.w)}</div><div class="r">${w.range}</div>
          <div class="n"><b>${fmt.num(scopeTotal(i))}</b> kasus</div>
          <div class="zb"><i style="width:${(c.Merah / n) * 100}%;background:var(--z-merah-map)"></i><i style="width:${(c.Kuning / n) * 100}%;background:var(--z-kuning-map)"></i><i style="width:${(c.Hijau / n) * 100}%;background:var(--z-hijau-map)"></i></div>
        </button>`;
      }).join('');
      u.$$('#weeks .fcw', root).forEach((b) => (b.onclick = () => { st.fcIdx = +b.dataset.i; update(); }));
    }
    const scopeTotal = (i) => inScope.reduce((a, k) => a + (S.fc.get(k.kode_kec)[i]?.kasus_pred || 0), 0);

    // ---- total per minggu
    let totH = 290;
    function drawTot() {
      const bars = S.fw.map((w, j) => ({ x: w.idx, y: scopeTotal(j), fill: j === st.fcIdx ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 38%, transparent)' }));
      const base = S.fw.map((w) => ({ x: w.idx, y: inScope.reduce((a, k) => a + (S.ecOf(k.kode_kec, w.w)?.ec_mean || 0), 0) }));
      charts.xy(u.$('#tot', root), {
        height: totH, margin: { l: 44, r: 16 },
        x: { min: S.fw[0].idx, max: S.fw[S.fw.length - 1].idx, ticks: S.fw.map((w) => ({ v: w.idx, label: fmt.wk(w.y, w.w) })), minLabelGap: 40 },
        y: { label: 'kasus / minggu' },
        layers: [
          { type: 'bars', data: bars, pad: 0.34 },
          { type: 'line', data: base, stroke: 'var(--ink-2)', width: 1.6, dash: '4 3', curve: 'linear' },
          { type: 'dots', data: base, r: 3, stroke: 'var(--ink-2)', fill: 'var(--panel)' },
        ],
        hover: {
          xs: S.fw.map((w) => w.idx), marks: () => [],
          onClick: (i) => { st.fcIdx = S.fw.findIndex((w) => w.idx === i); update(); },
          html: (i) => {
            const j = S.fw.findIndex((w) => w.idx === i), w = S.fw[j];
            return `<div class="t-h">${fmt.wk(w.y, w.w)} · ${w.range}</div>` +
              charts.tr('Perkiraan', fmt.num(bars[j].y, 1), 'var(--brand)') +
              charts.tr('Rata-rata historis', fmt.num(base[j].y, 1), 'var(--ink-2)') +
              `<div class="t-note">Klik untuk memilih minggu</div>`;
          },
        },
      });
      const totals = S.fw.map((_, j) => scopeTotal(j));
      const pk = totals.indexOf(Math.max(...totals));
      u.$('#tot-note', root).innerHTML = `Garis putus-putus = rata-rata historis minggu-epi yang sama (jumlah rata-rata kanal endemis). Puncak perkiraan: <b>${fmt.wk(S.fw[pk].y, S.fw[pk].w)}</b> (${S.fw[pk].range}) sekitar <b>${fmt.num(totals[pk])}</b> kasus.`;
    }

    // Grafik total menyesuaikan tinggi kartu distribusi zona di sebelahnya, supaya tidak ada ruang kosong
    function fitTot() {
      const a = u.$('#tot', root)?.closest('.panel');
      if (!a || !a.lastElementChild) return;
      // kartu di grid selalu setinggi tetangganya, jadi ukur sisa ruang di bawah isi kartu ini
      const gap = Math.round(a.getBoundingClientRect().bottom - a.lastElementChild.getBoundingClientRect().bottom);
      if (Math.abs(gap) < 4) return;
      const next = Math.max(240, Math.min(620, totH + gap));
      if (next === totH) return;
      totH = next;
      drawTot();
    }

    // ---- donat
    function drawDonut() {
      const i = st.fcIdx, w = S.fw[i];
      const c = { Hijau: 0, Kuning: 0, Merah: 0 };
      for (const k of inScope) { const z = S.zoneAt(k.kode_kec, i, st.sys); if (z) c[z]++; }
      u.$('#dn-meta', root).textContent = `${fmt.wk(w.y, w.w)} · ${sysName(st.sys)}`;
      charts.donut(u.$('#donut', root), {
        size: 200, thick: 28,
        parts: [{ label: 'Merah · Risiko Tinggi', value: c.Merah, color: 'var(--z-merah-map)' }, { label: 'Kuning · Waspada', value: c.Kuning, color: 'var(--z-kuning-map)' }, { label: 'Hijau · Risiko Rendah', value: c.Hijau, color: 'var(--z-hijau-map)' }],
        center: { big: String(c.Merah), small: 'kecamatan merah' },
      });
      const topRows = inScope.map((k) => ({ k, v: S.fc.get(k.kode_kec)[i]?.kasus_pred ?? 0, z: S.zoneAt(k.kode_kec, i, st.sys) })).sort((a, b) => b.v - a.v).slice(0, 5);
      u.$('#dn-top', root).innerHTML = topRows.map((r) => `<div class="nb" style="margin-bottom:6px" data-k="${r.k.kode_kec}">${zone.zdot(r.z)}<span class="n">${u.esc(r.k.nm)}</span><span class="v">${fmt.num(r.v, 1)} kasus</span></div>`).join('');
      u.$$('#dn-top .nb', root).forEach((el) => (el.onclick = () => R.go('#/kecamatan/' + el.dataset.k)));
      u.$('#dn-leg', root).innerHTML = `<span><i class="lg-sw" style="background:var(--z-merah-map)"></i>Merah ${c.Merah}</span><span><i class="lg-sw" style="background:var(--z-kuning-map)"></i>Kuning ${c.Kuning}</span><span><i class="lg-sw" style="background:var(--z-hijau-map)"></i>Hijau ${c.Hijau}</span>`;
    }

    // ---- detail
    function drawDetail() {
      const i = st.fcIdx, w = S.fw[i];
      u.$('#det-meta', root).textContent = `${fmt.wk(w.y, w.w)} · ${w.range} · ${sysName(st.sys)}`;
      const ql = (u.$('#q', root).value || '').trim().toLowerCase();
      let rows = inScope.map((k) => {
        const r = S.fc.get(k.kode_kec)[i], thr = S.thr.get(k.kode_kec), ec = r ? S.ecOf(k.kode_kec, r.minggu) : null;
        const z = S.zoneAt(k.kode_kec, i, st.sys);
        return { k, r, z, thr, ec, v: r?.kasus_pred ?? null, dv: ec?.ec_mean ? r.kasus_pred / ec.ec_mean - 1 : null };
      }).filter((d) => !ql || d.k.nm.toLowerCase().includes(ql) || d.k.kota.toLowerCase().includes(ql));
      const key = {
        nm: (d) => d.k.nm, kota: (d) => d.k.kota, v: (d) => d.v ?? -1, dv: (d) => d.dv ?? -9,
        z: (d) => (zone.ZRANK[d.z] || 0) * 1000 + (d.v ?? 0),
      }[sortKey];
      rows.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
      const th = (k, label, cls = '') => `<th class="sortable ${cls} ${sortKey === k ? 'sorted' : ''}" data-k="${k}">${label}${sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
      u.$('#det', root).innerHTML = `
        <thead><tr><th>#</th>${th('nm', 'Kecamatan')}${th('kota', 'Wilayah')}${th('v', 'Perkiraan', 'r')}${th('z', 'Zona ' + sysName(st.sys))}<th class="r">Zona lain</th><th class="r">P50 / P75</th>${th('dv', 'vs rata-rata', 'r')}</tr></thead>
        <tbody>${rows.map((d, j) => `<tr class="click" data-k="${d.k.kode_kec}">
          <td class="muted">${j + 1}</td><td class="strong">${u.esc(d.k.nm)}</td><td class="muted">${u.esc(d.k.kota)}</td>
          <td class="r strong">${fmt.num(d.v, 1)}</td><td>${zone.chip(d.z)}</td>
          <td class="r">${zone.chip(st.sys === 'ec' ? d.r?.zona_ewars : d.r?.zona_ec)}</td>
          <td class="r muted">${fmt.num(d.thr?.p50)} / ${fmt.num(d.thr?.p75)}</td>
          <td class="r ${d.dv > 0 ? 'up' : 'down'}">${fmt.pct(d.dv, 0, true)}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">Tidak ditemukan.</div></td></tr>'}</tbody>`;
      u.$$('#det th.sortable', root).forEach((h) => (h.onclick = () => {
        if (sortKey === h.dataset.k) sortDir *= -1; else { sortKey = h.dataset.k; sortDir = ['nm', 'kota'].includes(sortKey) ? 1 : -1; }
        drawDetail();
      }));
      u.$$('#det tr.click', root).forEach((tr) => (tr.onclick = () => R.go('#/kecamatan/' + tr.dataset.k)));
    }

    // ---- top 10 total
    function drawTop() {
      const rows = inScope.map((k) => {
        const fcs = S.fc.get(k.kode_kec);
        let tot = 0, pk = -1;
        fcs.forEach((r, j) => { if (!r) return; tot += r.kasus_pred; if (pk < 0 || r.kasus_pred > fcs[pk].kasus_pred) pk = j; });
        let zmax = null;
        fcs.forEach((_, j) => { const z = S.zoneAt(k.kode_kec, j, st.sys); if ((zone.ZRANK[z] || 0) > (zone.ZRANK[zmax] || 0)) zmax = z; });
        return { k, tot, avg: tot / Math.max(1, fcs.filter(Boolean).length), pk, zmax };
      }).sort((a, b) => b.tot - a.tot).slice(0, 10);
      const mx = rows[0]?.tot || 1;
      u.$('#top', root).innerHTML = `
        <thead><tr><th>#</th><th>Kecamatan</th><th>Wilayah</th><th class="r">Total ${S.fw.length} minggu</th><th class="r">Rata-rata / minggu</th><th>Zona tertinggi</th><th class="r">Minggu puncak</th></tr></thead>
        <tbody>${rows.map((r, j) => `<tr class="click" data-k="${r.k.kode_kec}">
          <td class="muted">${j + 1}</td><td class="strong">${u.esc(r.k.nm)}</td><td class="muted">${u.esc(r.k.kota)}</td>
          <td class="r"><div class="cellbar"><i style="width:${(r.tot / mx) * 100}px"></i>${fmt.num(r.tot, 1)}</div></td>
          <td class="r">${fmt.num(r.avg, 1)}</td><td>${zone.chip(r.zmax)}</td>
          <td class="r">${r.pk >= 0 ? `${fmt.wk(S.fw[r.pk].y, S.fw[r.pk].w)} · ${S.fw[r.pk].range}` : '–'}</td></tr>`).join('')}</tbody>`;
      u.$$('#top tr.click', root).forEach((tr) => (tr.onclick = () => R.go('#/kecamatan/' + tr.dataset.k)));
    }

    function update() {
      u.$$('#sys button', root).forEach((b) => b.classList.toggle('on', b.dataset.s === st.sys));
      drawWeeks(); drawTot(); drawDonut(); drawDetail(); drawTop();
      fitTot();
    }
    u.$$('#sys button', root).forEach((b) => (b.onclick = () => { st.sys = b.dataset.s; update(); }));
    u.$('#q', root).oninput = () => drawDetail();
    u.$('#csv', root).onclick = () => {
      const i = st.fcIdx, w = S.fw[i];
      const rows = inScope.map((k) => {
        const r = S.fc.get(k.kode_kec)[i], thr = S.thr.get(k.kode_kec), ec = r ? S.ecOf(k.kode_kec, r.minggu) : null;
        return { kode_kec: k.kode_kec, kecamatan: k.nm, wilayah: k.kota, tahun: w.y, minggu_epi: w.w, kasus_perkiraan: r?.kasus_pred ?? '', zona_ewars: r?.zona_ewars || '', zona_kanal_endemis: r?.zona_ec || '', p50: thr?.p50, p75: thr?.p75, ec_mean: ec ? +ec.ec_mean.toFixed(2) : '' };
      });
      u.downloadCsv(`denguard-detail-${w.y}-W${String(w.w).padStart(2, '0')}.csv`, rows);
    };
    update();
  }
})();

(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt, zone, epi } = R;

  R.views.peta = { title: 'Peta Zonasi', render };

  function render(root) {
    const S = R.S, st = R.state;
    st.petaMode = st.petaMode || 'fc';
    if (st.histIdx == null) st.histIdx = S.lastFinalIdx;
    let timer = null, speed = 450;
    let sortKey = 'ewars', sortDir = -1, onlyDiff = false;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Peta Zonasi Interaktif</h1>
          <p class="sub">EWARS (ambang persentil historis tiap kecamatan) dan Kanal Endemis WHO (ambang per minggu-epi) berdampingan dan tersinkron.</p>
        </div>
        <div class="head-actions">
          <div class="seg" id="mode"><button data-m="fc">Perkiraan</button><button data-m="hist">Historis</button></div>
        </div>
      </div>
      <section class="panel mb16">
        <div class="ctrlbar" id="ctrl"></div>
        <div class="dual">
          <div>
            <div class="dual-h"><div><b style="color:var(--brand)">Sistem 1 · WHO EWARS</b><p>Hijau ≤ P50 · Kuning P50–P75 · Merah &gt; P75 (persentil seluruh histori kecamatan)</p></div><span id="cnt-ewars"></span></div>
            <div class="mapbox" id="map-ewars"></div>
          </div>
          <div>
            <div class="dual-h"><div><b>Sistem 2 · Kanal Endemis WHO</b><p>Hijau ≤ rata-rata · Kuning s/d +1 SD · Merah &gt; +1 SD (per minggu-epi yang sama)</p></div><span id="cnt-ec"></span></div>
            <div class="mapbox" id="map-ec"></div>
          </div>
        </div>
        <div class="agree" id="agree"></div>
      </section>
      <section class="panel">
        <div class="panel-h">
          <h2 id="tbl-title">Perbandingan per kecamatan</h2>
          <label class="tools" style="font-size:12px;color:var(--ink-2);cursor:pointer"><input type="checkbox" id="only-diff"> Hanya yang berbeda</label>
        </div>
        <div class="tbl-wrap"><table class="tbl" id="cmp"></table></div>
      </section>`;

    const legend = (sys) => R.map.legendZones(sys === 'ec' ? 'Kanal Endemis' : 'EWARS', [['Merah', 'Tinggi'], ['Kuning', 'Waspada'], ['Hijau', 'Normal']]);
    const mk = (id, sys) => R.map.makeMap(u.$(id, root), {
      fill: (k) => R.map.zoneColor(zoneOf(k, sys)),
      tooltip: (k) => tipOf(k),
      onClick: (k) => R.go('#/kecamatan/' + k),
      legend: legend(sys),
      scrollZoom: true, cityLabels: true,
      inset: sys === 'ewars',
    });
    const mE = mk('#map-ewars', 'ewars');
    const mC = mk('#map-ec', 'ec');
    mE.sync(mC);

    // --- nilai & zona sesuai mode
    function cur() {
      if (st.petaMode === 'fc') {
        const w = S.fw[st.fcIdx];
        return { y: w.y, w: w.w, idx: w.idx, label: `${fmt.wk(w.y, w.w)} ${w.y} · ${w.range} · ${w.rel}`, kind: 'Perkiraan' };
      }
      const [y, w] = epi.idxToEpi(st.histIdx);
      const a = S.actual(null, st.histIdx);
      return { y, w, idx: st.histIdx, label: `${fmt.wk(y, w)} ${y} · ${fmt.range(y, w)}${a && a.est ? ' · estimasi' : a && !a.f ? ' · sementara' : ''}`, kind: a && a.est ? 'Estimasi dari prakiraan (belum dirilis Dinkes)' : 'Kasus terlapor' };
    }
    function valOf(k) {
      if (st.petaMode === 'fc') return S.fc.get(k)[st.fcIdx]?.kasus_pred ?? null;
      return S.actual(k, st.histIdx)?.k ?? null;
    }
    function zoneOf(k, sys) {
      if (st.petaMode === 'fc') return S.zoneAt(k, st.fcIdx, sys);
      const v = valOf(k);
      const c = cur();
      return sys === 'ec' ? zone.ec(v, S.ecOf(k, c.w)) : zone.ewars(v, S.thr.get(k));
    }
    function tipOf(k) {
      const kc = S.kecBy.get(k), c = cur(), thr = S.thr.get(k), ec = S.ecOf(k, c.w);
      return `<div class="kt-name">${u.esc(kc.nm)}</div><div class="kt-sub">${u.esc(kc.kota)} · ${fmt.wk(c.y, c.w)} ${c.y}</div>
        <div class="kt-row"><span>${c.kind}</span><b>${fmt.num(valOf(k), st.petaMode === 'fc' ? 1 : 0)}</b></div>
        <div class="kt-row"><span>EWARS</span><b>${zoneOf(k, 'ewars') || '–'}</b></div>
        <div class="kt-row"><span>Kanal endemis</span><b>${zoneOf(k, 'ec') || '–'}</b></div>
        <div class="kt-row"><span>P50 / P75</span><b>${fmt.num(thr?.p50)} / ${fmt.num(thr?.p75)}</b></div>
        <div class="kt-row"><span>Rata-rata / batas kuning</span><b>${fmt.num(ec?.ec_mean, 1)} / ${fmt.num(ec?.ec_upper_yellow, 1)}</b></div>`;
    }

    // --- kontrol
    function drawCtrl() {
      u.$$('#mode button', root).forEach((b) => b.classList.toggle('on', b.dataset.m === st.petaMode));
      const play = `<button class="play" id="play" title="Putar animasi">${u.icon(timer ? 'pause' : 'play')}</button>`;
      if (st.petaMode === 'fc') {
        u.$('#ctrl', root).innerHTML = `<span class="label-sm">Minggu perkiraan</span><div class="wtabs" id="wtabs">${S.fw.map((w, i) => `
          <button class="wtab ${i === st.fcIdx ? 'on' : ''}" data-i="${i}">
            <span class="now" style="${w.d === 0 ? '' : 'opacity:.7;color:inherit'}">${w.d === 0 ? 'Berjalan' : w.d < 0 ? 'Lalu' : '+' + w.d}</span>
            <b>${fmt.wk(w.y, w.w)}</b><span>${w.range}</span></button>`).join('')}</div>
          <div class="sep"></div>${play}`;
        u.$$('#wtabs .wtab', root).forEach((b) => (b.onclick = () => { stop(); st.fcIdx = +b.dataset.i; update(); }));
      } else {
        const [y, w] = epi.idxToEpi(st.histIdx);
        const [hY, hW] = epi.idxToEpi(S.histMax);
        const maxW = y === hY ? hW : epi.maxWeek(y);
        u.$('#ctrl', root).innerHTML = `
          <span class="label-sm">Tahun</span>
          <select class="sel" id="yr">${S.years.map((yy) => `<option ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}</select>
          <div class="sep"></div>
          <div class="grow slider-wrap"><span class="label-sm">Minggu</span><input type="range" id="wk" min="1" max="${maxW}" value="${w}"><span class="wk-pill" id="wk-pill"></span></div>
          <div class="sep"></div>${play}
          <select class="sel" id="spd" title="Kecepatan">${[[900, 'Lambat'], [450, 'Normal'], [200, 'Cepat']].map(([v, l]) => `<option value="${v}" ${v === speed ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        u.$('#spd', root).onchange = (e) => { speed = +e.target.value; if (timer) { stop(); start(); } };
        u.$('#yr', root).onchange = (e) => {
          stop();
          const yy = +e.target.value;
          const [hY2, hW2] = epi.idxToEpi(S.histMax);
          const ww = Math.min(w, yy === hY2 ? hW2 : epi.maxWeek(yy));
          st.histIdx = epi.weekIdx(yy, ww);
          drawCtrl(); update();
        };
        u.$('#wk', root).oninput = (e) => { st.histIdx = epi.weekIdx(y, +e.target.value); update(false); };
      }
      u.$('#play', root).onclick = () => (timer ? stop() : start());
    }

    function start() {
      const spd = st.petaMode === 'hist' ? speed : 1100;
      timer = setInterval(() => {
        if (!root.isConnected) return stop();
        if (st.petaMode === 'fc') st.fcIdx = (st.fcIdx + 1) % S.fw.length;
        else {
          if (st.histIdx >= S.histMax) return stop();
          st.histIdx++;
          const [ny, nw] = epi.idxToEpi(st.histIdx);
          if (nw > epi.maxWeek(ny) && st.histIdx < S.histMax) st.histIdx++; // lompati W53
        }
        const yrChanged = st.petaMode === 'hist' && epi.idxToEpi(st.histIdx)[1] === 1;
        if (yrChanged || st.petaMode === 'fc') drawCtrl();
        update(false);
      }, spd);
      drawCtrl();
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (root.isConnected) { const b = u.$('#play', root); if (b) b.innerHTML = u.icon('play'); }
    }

    // --- ringkasan & tabel
    function counts(sys) {
      const c = { Hijau: 0, Kuning: 0, Merah: 0 };
      for (const k of S.kec) { const z = zoneOf(k.kode_kec, sys); if (z) c[z]++; }
      return c;
    }
    function drawCounts() {
      for (const sys of ['ewars', 'ec']) {
        const c = counts(sys);
        u.$('#cnt-' + sys, root).innerHTML = `<span class="chip z-Merah">${c.Merah}</span> <span class="chip z-Kuning">${c.Kuning}</span> <span class="chip z-Hijau">${c.Hijau}</span>`;
      }
      const diff = S.kec.filter((k) => zoneOf(k.kode_kec, 'ewars') !== zoneOf(k.kode_kec, 'ec'));
      const c = cur();
      u.$('#agree', root).innerHTML = `<span><b>${c.label}</b></span>
        <span>Kedua sistem sepakat di <b>${S.kec.length - diff.length}</b> dari ${S.kec.length} kecamatan.</span>
        ${diff.length ? `<span class="muted">Berbeda: ${diff.slice(0, 6).map((k) => u.esc(k.nm)).join(', ')}${diff.length > 6 ? ` +${diff.length - 6} lainnya` : ''}</span>` : ''}`;
      const pill = u.$('#wk-pill', root);
      if (pill) pill.textContent = c.label;
      const slider = u.$('#wk', root);
      if (slider && +slider.value !== c.w) slider.value = c.w;
    }

    function drawTable() {
      const c = cur();
      const isFc = st.petaMode === 'fc';
      u.$('#tbl-title', root).textContent = `Perbandingan per kecamatan · ${fmt.wk(c.y, c.w)} ${c.y}`;
      let rows = S.kec.map((k) => {
        const thr = S.thr.get(k.kode_kec), ec = S.ecOf(k.kode_kec, c.w);
        const ze = zoneOf(k.kode_kec, 'ewars'), zc = zoneOf(k.kode_kec, 'ec');
        return { k, v: valOf(k.kode_kec), ze, zc, thr, ec, same: ze === zc };
      });
      if (onlyDiff) rows = rows.filter((r) => !r.same);
      const key = {
        nm: (r) => r.k.nm, kota: (r) => r.k.kota, v: (r) => r.v ?? -1,
        ewars: (r) => (zone.ZRANK[r.ze] || 0) * 1000 + (r.v ?? 0), ec: (r) => (zone.ZRANK[r.zc] || 0) * 1000 + (r.v ?? 0),
      }[sortKey];
      rows.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
      const th = (k, label, cls = '') => `<th class="sortable ${cls} ${sortKey === k ? 'sorted' : ''}" data-k="${k}">${label}${sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
      u.$('#cmp', root).innerHTML = `
        <thead><tr>${th('nm', 'Kecamatan')}${th('kota', 'Wilayah')}${th('v', isFc ? 'Perkiraan' : 'Kasus', 'r')}
          ${th('ewars', 'Zona EWARS')}<th class="r">P50 / P75</th>${th('ec', 'Zona kanal endemis')}<th class="r">Rata-rata / +1 SD</th><th>Sepakat</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="click" data-k="${r.k.kode_kec}">
          <td class="strong">${u.esc(r.k.nm)}</td><td class="muted">${u.esc(r.k.kota)}</td>
          <td class="r">${fmt.num(r.v, isFc ? 1 : 0)}</td>
          <td>${zone.chip(r.ze)}</td><td class="r muted">${fmt.num(r.thr?.p50)} / ${fmt.num(r.thr?.p75)}</td>
          <td>${zone.chip(r.zc)}</td><td class="r muted">${fmt.num(r.ec?.ec_mean, 1)} / ${fmt.num(r.ec?.ec_upper_yellow, 1)}</td>
          <td>${r.same ? '<span class="muted">Ya</span>' : '<span class="tag warn">Berbeda</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="8"><div class="empty">Semua kecamatan sepakat pada minggu ini.</div></td></tr>'}</tbody>`;
      u.$$('#cmp th.sortable', root).forEach((h) => (h.onclick = () => {
        if (sortKey === h.dataset.k) sortDir *= -1; else { sortKey = h.dataset.k; sortDir = ['nm', 'kota'].includes(sortKey) ? 1 : -1; }
        drawTable();
      }));
      u.$$('#cmp tr.click', root).forEach((tr) => (tr.onclick = () => R.go('#/kecamatan/' + tr.dataset.k)));
    }

    function update(redrawCtrl = true) {
      if (redrawCtrl) drawCtrl();
      mE.refresh(); mC.refresh();
      drawCounts(); drawTable();
    }

    u.$$('#mode button', root).forEach((b) => (b.onclick = () => { stop(); st.petaMode = b.dataset.m; update(); }));
    u.$('#only-diff', root).onchange = (e) => { onlyDiff = e.target.checked; drawTable(); };
    update();
  }
})();

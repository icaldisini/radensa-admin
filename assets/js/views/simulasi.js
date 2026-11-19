(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt, zone, charts, epi } = R;

  R.views.simulasi = { title: 'Simulasi', render };

  const ZC = { Merah: 'var(--z-merah-map)', Kuning: 'var(--z-kuning-map)', Hijau: 'var(--z-hijau-map)' };

  function render(root) {
    const S = R.S, st = R.state;
    st.simTab = st.simTab || 0;
    const kecOptions = (sel) => S.kota.map((kt) => `<optgroup label="${u.esc(kt)}">${S.kec.filter((k) => k.kota === kt).map((k) => `<option value="${k.kode_kec}" ${k.kode_kec === sel ? 'selected' : ''}>${u.esc(k.nm)}</option>`).join('')}</optgroup>`).join('');
    const defKec = st.simKec || (S.priority(S.fcCur).find((d) => !d.lowThr) || S.priority(S.fcCur)[0]).k.kode_kec;
    st.simKec = defKec;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Simulator Skenario</h1>
          <p class="sub">Eksplorasi bagaimana pilihan kecamatan, minggu, dan jumlah kasus memengaruhi zona risiko. Zona dihitung dari ambang nyata (EWARS dan kanal endemis) yang tersimpan di Supabase.</p>
        </div>
      </div>
      <div class="sim-tabs"><div class="seg" id="tabs">
        <button data-t="0">Zona &amp; Ambang</button><button data-t="1">Perbandingan Tahun</button>
      </div></div>
      <div id="pane"></div>`;

    const pane = u.$('#pane', root);
    const panes = [paneZone, paneYears];
    st.simTab = Math.min(st.simTab || 0, panes.length - 1);
    function show() {
      u.$$('#tabs button', root).forEach((b) => b.classList.toggle('on', +b.dataset.t === st.simTab));
      pane.innerHTML = '';
      panes[st.simTab](pane);
    }
    u.$$('#tabs button', root).forEach((b) => (b.onclick = () => { st.simTab = +b.dataset.t; show(); }));

    // =============================================================
    // 0 · Zona & ambang untuk kecamatan + minggu tertentu
    // =============================================================
    function paneZone(el) {
      const cw = S.fw[S.fcCur];
      st.simY = st.simY || cw.y;
      st.simW = st.simW || cw.w;
      let scen = null;

      el.innerHTML = `
        <div class="grid sim-grid mb16">
          <section class="panel accent fill-col">
            <div class="panel-h"><h2><span class="hic">${u.icon('sliders')}</span>Pilih Kecamatan &amp; Minggu</h2></div>
            <div class="sim-ctl">
              <div class="field"><span class="label-sm">Kecamatan</span><select class="sel" id="k" style="width:100%">${kecOptions(st.simKec)}</select></div>
              <div class="field"><span class="label-sm">Tahun</span><select class="sel" id="y" style="width:100%">${S.years.slice().reverse().map((y) => `<option ${y === st.simY ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
              <div class="field"><div class="row"><span class="label-sm">Minggu epidemiologi</span><span class="big" id="w-d"></span></div><input type="range" id="w" min="1" max="52" step="1"></div>
              <div class="field"><div class="row"><span class="label-sm">Kasus skenario</span><span class="big" id="s-d"></span></div><input type="range" id="s" min="0" max="60" step="1"><span class="muted" style="font-size:11.5px" id="s-h"></span></div>
              <button class="btn" id="reset">Setel ke nilai acuan</button>
            </div>
          </section>
          <section class="panel fill-col">
            <div class="panel-h"><h2><span class="hic">${u.icon('target')}</span>Hasil</h2><span class="meta" id="r-meta"></span></div>
            <div class="sim-body" id="res"></div>
          </section>
        </div>
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('activity')}</span>Profil Tahunan · <span id="pt"></span></h2>
            <div class="legend"><span><i class="lg-line"></i>Terlapor</span><span><i class="lg-line fc"></i>Perkiraan</span><span><i class="lg-line" style="border-color:var(--c-amber)"></i>Skenario</span></div></div>
          <div class="panel-b"><div class="chart" id="prof"></div></div>
        </section>`;

      const ksel = u.$('#k', el), ysel = u.$('#y', el), wr = u.$('#w', el), sr = u.$('#s', el);

      const valueAt = (kode, y, w) => {
        const idx = epi.weekIdx(y, w);
        const a = S.actual(kode, idx);
        if (a) return { v: a.k, kind: a.est ? 'Estimasi dari prakiraan' : a.f ? 'Terlapor (final)' : 'Terlapor (sementara)', dec: !!a.est };
        const j = S.fw.findIndex((f) => f.idx === idx);
        const r = j >= 0 ? S.fc.get(kode)[j] : null;
        return r ? { v: r.kasus_pred, kind: 'Perkiraan model', dec: true } : null;
      };

      function update(resetScen) {
        const kode = st.simKec, y = st.simY;
        const maxW = Math.min(52, epi.weeksInYear(y));
        wr.max = maxW; st.simW = Math.min(st.simW, maxW); wr.value = st.simW;
        const w = st.simW, ref = valueAt(kode, y, w);
        const thr = S.thr.get(kode), ec = S.ecOf(kode, w);
        const mx = Math.max(30, Math.ceil((ec?.ec_upper_yellow || 0) * 2), Math.ceil((thr?.p75 || 0) * 2.2), Math.ceil((ref?.v || 0) * 1.6));
        sr.max = mx;
        if (resetScen || scen == null) scen = ref ? Math.round(ref.v) : Math.round(thr?.p75 || 5);
        scen = Math.min(scen, mx); sr.value = scen;
        u.$('#w-d', el).textContent = `${fmt.wk(y, w)} · ${fmt.range(y, w)}`;
        u.$('#s-d', el).textContent = `${scen} kasus`;
        u.$('#s-h', el).textContent = ref ? `Nilai acuan: ${fmt.num(ref.v, ref.dec ? 1 : 0)} kasus (${ref.kind.toLowerCase()})` : 'Belum ada data untuk minggu ini; geser skenario secara bebas.';
        const ze = zone.ewars(scen, thr), zc = zone.ec(scen, ec);
        const zr_e = ref ? zone.ewars(ref.v, thr) : null, zr_c = ref ? zone.ec(ref.v, ec) : null;
        u.$('#r-meta', el).textContent = `${S.kecBy.get(kode).nm} · ${S.kecBy.get(kode).kota}`;
        const d = ref ? scen - ref.v : null;
        const refTxt = ref ? fmt.num(ref.v, ref.dec ? 1 : 0) : '–';
        const meter = (name, sub, z, zRef, t1, t2, why) => {
          if (!t1 || !t2) return `<div class="meter-block"><div class="mb-head"><div><b>${name}</b><small>${sub}</small></div></div><div class="muted" style="font-size:12px">Ambang belum tersedia.</div></div>`;
          const max = Math.max(t2.v * 1.5, scen * 1.15, (ref?.v || 0) * 1.15, 1);
          const pc = (v) => Math.max(0, Math.min(100, (v / max) * 100));
          const a1 = pc(t1.v), a2 = pc(t2.v);
          const tight = a2 - a1 < 17;
          return `<div class="meter-block">
            <div class="mb-head"><div><b>${name}</b><small>${sub}</small></div>
              <div class="mb-zone">${zRef && zRef !== z ? `<span class="mb-was">acuan: ${zone.LABEL[zRef]}</span>` : ''}<span class="riskpill sm ${z ? 'z-' + z : 'z-none'}">${z ? zone.LABEL[z] : 'Tanpa data'}</span></div></div>
            <div class="meter">
              <div class="mt-seg"><i class="h" style="width:${a1}%"></i><i class="k" style="width:${a2 - a1}%"></i><i class="m" style="width:${100 - a2}%"></i></div>
              ${ref ? `<span class="mk ref" style="left:${pc(ref.v)}%" title="Nilai acuan ${refTxt}"><u></u></span>` : ''}
              <span class="mk scn" style="left:${pc(scen)}%"><em>${scen}</em><u></u></span>
              <span class="mt-tick" style="left:${a1}%"><b style="${tight ? 'transform:translateX(-100%)' : ''}">${t1.lbl} ${fmt.num(t1.v, 1)}</b></span>
              <span class="mt-tick" style="left:${a2}%"><b style="${tight ? 'transform:translateX(0)' : ''}">${t2.lbl} ${fmt.num(t2.v, 1)}</b></span>
            </div>
            <p class="mb-why">${why}</p>
          </div>`;
        };
        const whyE = !thr ? '' : scen <= thr.p50 ? `Di bawah atau sama dengan median kecamatan (${fmt.num(thr.p50, 1)}).` : scen <= thr.p75 ? `Di atas median (${fmt.num(thr.p50, 1)}), belum melewati P75 (${fmt.num(thr.p75, 1)}).` : `Melewati P75 (${fmt.num(thr.p75, 1)}), batas zona merah.`;
        const whyC = !ec ? '' : scen <= ec.ec_mean ? `Di bawah rata-rata ${fmt.wk(y, w)} (${fmt.num(ec.ec_mean, 1)}).` : scen <= ec.ec_upper_yellow ? `Di atas rata-rata (${fmt.num(ec.ec_mean, 1)}), belum melewati +1 SD (${fmt.num(ec.ec_upper_yellow, 1)}).` : `Melewati rata-rata + 1 SD (${fmt.num(ec.ec_upper_yellow, 1)}), batas zona merah.`;
        u.$('#res', el).innerHTML = `
          <div class="sim-top">
            <div class="sim-stat"><span class="l">${ref ? ref.kind : 'Nilai acuan'}</span><b>${refTxt}<small>kasus</small></b></div>
            <span class="sim-arrow">${u.icon('chevR')}</span>
            <div class="sim-stat scen"><span class="l">Skenario</span><b>${scen}<small>kasus</small></b>
              ${d == null ? '' : `<span class="sim-d ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}">${d > 0.05 ? '+' : d < -0.05 ? '−' : '±'}${fmt.num(Math.abs(d), 1)} dari acuan</span>`}</div>
          </div>
          ${meter('EWARS', 'Persentil riwayat kecamatan', ze, zr_e, thr && { lbl: 'P50', v: thr.p50 }, thr && { lbl: 'P75', v: thr.p75 }, whyE)}
          ${meter('Kanal Endemis', `Pola minggu ${fmt.wk(y, w)} tiap tahun`, zc, zr_c, ec && { lbl: 'Rata²', v: ec.ec_mean }, ec && { lbl: '+1 SD', v: ec.ec_upper_yellow }, whyC)}
          <div class="mt-legend"><span><i class="h"></i>Rendah</span><span><i class="k"></i>Waspada</span><span><i class="m"></i>Tinggi</span><span><i class="mk-s"></i>Skenario</span>${ref ? '<span><i class="mk-r"></i>Acuan</span>' : ''}</div>`;
        drawProfile(kode, y, w, scen);
      }

      function drawProfile(kode, y, w, sv) {
        u.$('#pt', el).textContent = `${S.kecBy.get(kode).nm} ${y}`;
        const nW = Math.min(52, epi.weeksInYear(y));
        const act = [], fc = [], bh = [], bk = [], bm = [];
        let top = Math.max(sv, 5);
        for (let ww = 1; ww <= nW; ww++) {
          const idx = epi.weekIdx(y, ww);
          const a = S.actual(kode, idx);
          if (a) { act.push({ x: ww, y: a.k }); top = Math.max(top, a.k); }
          const j = S.fw.findIndex((f) => f.idx === idx);
          if (j >= 0 && S.fc.get(kode)[j]) { fc.push({ x: ww, y: S.fc.get(kode)[j].kasus_pred }); top = Math.max(top, S.fc.get(kode)[j].kasus_pred); }
          const e = S.ecOf(kode, ww);
          if (e) { bh.push({ x: ww, y0: 0, y1: e.ec_mean }); bk.push({ x: ww, y0: e.ec_mean, y1: e.ec_upper_yellow }); bm.push({ x: ww, y0: e.ec_upper_yellow, y1: Math.max(e.ec_upper_red, top * 1.3) }); }
        }
        const sc = { type: 'hline', y: sv, stroke: 'var(--c-amber)', label: `skenario ${sv}`, dash: '5 4' };
        charts.xy(u.$('#prof', el), {
          height: 310, margin: { l: 44 },
          x: { min: 1, max: nW, ticks: charts.MONTH_WEEKS, minLabelGap: 30 },
          y: { max: top * 1.18, label: 'kasus / minggu' },
          layers: [
            { type: 'band', data: bh, fill: 'var(--band-h)', curve: 'step' },
            { type: 'band', data: bk, fill: 'var(--band-k)', curve: 'step' },
            { type: 'band', data: bm, fill: 'var(--band-m)', curve: 'step' },
            { type: 'line', data: act, stroke: 'var(--ink)', width: 1.8, curve: 'linear' },
            { type: 'line', data: fc, stroke: 'var(--brand)', width: 2.2, dash: '5 4', curve: 'linear' },
            { type: 'dots', data: fc, r: 4, stroke: 'var(--brand)' },
            { type: 'vline', x: w, stroke: 'var(--brand)', width: 1.4, dash: '3 3' },
            sc,
          ],
          hover: {
            xs: d3.range(1, nW + 1), marks: () => [],
            onClick: (ww) => { st.simW = ww; update(false); },
            html: (ww) => {
              const idx = epi.weekIdx(y, ww), a = S.actual(kode, idx), e = S.ecOf(kode, ww);
              const j = S.fw.findIndex((f) => f.idx === idx);
              return `<div class="t-h">${fmt.wk(y, ww)} · ${fmt.range(y, ww)}</div>` +
                (a ? charts.tr('Terlapor', fmt.num(a.k)) : '') + (j >= 0 ? charts.tr('Perkiraan', fmt.num(S.fc.get(kode)[j]?.kasus_pred, 1), 'var(--brand)') : '') +
                charts.tr('Rata-rata / +1 SD', `${fmt.num(e?.ec_mean, 1)} / ${fmt.num(e?.ec_upper_yellow, 1)}`) + `<div class="t-note">Klik untuk memilih minggu</div>`;
            },
          },
        });
      }

      ksel.onchange = () => { st.simKec = ksel.value; update(true); };
      ysel.onchange = () => { st.simY = +ysel.value; update(true); };
      wr.oninput = () => { st.simW = +wr.value; update(true); };
      sr.oninput = () => { scen = +sr.value; update(false); };
      u.$('#reset', el).onclick = () => update(true);
      update(true);
    }

    // =============================================================
    // 1 · Perbandingan antar tahun
    // =============================================================
    function paneYears(el) {
      const [lastY] = epi.idxToEpi(S.dbdMax);
      st.simYk = st.simYk ?? st.simKec;
      el.innerHTML = `
        <section class="panel">
          <div class="panel-h"><h2><span class="hic">${u.icon('calendar')}</span>Perbandingan Pola Mingguan Antar Tahun</h2>
            <div class="tools"><select class="sel" id="yk"><option value="*" ${st.simYk === '*' ? 'selected' : ''}>Seluruh DKI Jakarta</option>${kecOptions(st.simYk)}</select></div></div>
          <div class="panel-b"><div class="yr-legend mb16" id="yl"></div><div class="chart" id="yc"></div></div>
          <div class="panel-note">Garis merah solid = ${lastY} (terlapor), putus-putus = perkiraan model. Tahun lain berwarna abu-abu; klik tahun untuk menyorotnya.</div>
        </section>`;
      st.simHi = st.simHi || lastY;
      const draw = () => {
        const kode = st.simYk === '*' ? null : st.simYk;
        u.$('#yl', el).innerHTML = S.years.map((y) => `<button data-y="${y}" class="${y === st.simHi ? 'on' : ''}"><i style="background:${y === st.simHi ? 'var(--brand)' : 'var(--ink-3)'}"></i>${y}</button>`).join('');
        u.$$('#yl button', el).forEach((b) => (b.onclick = () => { st.simHi = +b.dataset.y; draw(); }));
        const series = (y) => {
          const maxW = Math.min(52, epi.weeksInYear(y));
          return d3.range(1, maxW + 1).map((w) => ({ x: w, y: S.actual(kode, epi.weekIdx(y, w))?.k ?? null }));
        };
        const layers = S.years.filter((y) => y !== st.simHi).map((y) => ({ type: 'line', data: series(y), stroke: 'var(--ink-3)', width: 1, opacity: 0.4, curve: 'linear' }));
        layers.push({ type: 'line', data: series(st.simHi), stroke: 'var(--brand)', width: 2.8, curve: 'linear' });
        const fc = S.fw.filter((w) => w.y === st.simHi).map((w) => ({
          x: w.w, y: kode ? S.fc.get(kode)[S.fw.indexOf(w)]?.kasus_pred : R.S.fcWeekTotal(S.fw.indexOf(w)),
        }));
        if (fc.length) layers.push({ type: 'line', data: fc, stroke: 'var(--brand)', width: 2.4, dash: '5 4', curve: 'linear' }, { type: 'dots', data: fc, r: 3.5, stroke: 'var(--brand)' });
        charts.xy(u.$('#yc', el), {
          height: 360, margin: { l: 44 },
          x: { min: 1, max: 52, ticks: charts.MONTH_WEEKS, minLabelGap: 30 },
          y: { label: 'kasus / minggu' }, layers,
          hover: {
            xs: d3.range(1, 53), marks: () => [],
            html: (w) => {
              const vs = S.years.map((y) => ({ y, v: w <= Math.min(52, epi.weeksInYear(y)) ? S.actual(kode, epi.weekIdx(y, w))?.k : null })).filter((d) => d.v != null);
              const f = fc.find((d) => d.x === w);
              return `<div class="t-h">Minggu-epi ${w}</div>` + vs.sort((a, b) => b.y - a.y).slice(0, 6).map((d) => charts.tr(String(d.y), fmt.num(d.v), d.y === st.simHi ? 'var(--brand)' : 'var(--ink-3)')).join('') +
                (f ? charts.tr('Perkiraan ' + st.simHi, fmt.num(f.y, 1), 'var(--brand)') : '');
            },
          },
        });
      };
      u.$('#yk', el).onchange = (e) => { st.simYk = e.target.value; draw(); };
      draw();
    }

    show();
  }
})();

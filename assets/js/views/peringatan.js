(function () {
  const R = window.R;
  R.views = R.views || {};
  const { u, fmt, zone } = R;

  R.views.peringatan = { title: 'Peringatan & Aksi', render };

  const ZORDER = ['Merah', 'Kuning', 'Hijau'];
  const REC_ICONS = ['megaphone', 'droplet', 'hospital', 'shield', 'search'];
  const RULE = {
    ewars: { Merah: 'EWARS > P75', Kuning: 'EWARS P50 – P75', Hijau: 'EWARS ≤ P50' },
    ec: { Merah: 'KE > rata-rata + 1 SD', Kuning: 'KE rata-rata s/d +1 SD', Hijau: 'KE ≤ rata-rata' },
  };

  // Matriks langkah untuk warga -- sama dengan tabel "Langkah tiap tingkat risiko" di aplikasi DENGUARD Warga
  const WARGA_MATRIX = [
    ['Pesan utama', ['Aman, tetap rutin kuras dan tutup tempat air.', 'Tingkatkan pencegahan di rumah dan sekitar.', 'Lakukan pencegahan sekarang dan waspadai demam.']],
    ['Kuras &amp; PSN 3M Plus', ['1× seminggu', '2× seminggu', '2× seminggu + serentak RT/RW']],
    ['Cek jentik', ['1× seminggu', '2× seminggu', 'Tiap 3 hari']],
    ['Antinyamuk', ['Tidak wajib', 'Losion pagi &amp; sore', '+ lengan panjang, kelambu, kasa']],
    ['Bila demam', ['Pantau di rumah', 'Lebih dari 2 hari: periksa', 'Segera ke Puskesmas']],
    ['Cek DENGUARD', ['Mingguan', '2× seminggu', 'Setiap hari']],
    ['Jumlah langkah di aplikasi', ['3 langkah', '6 langkah', '7 langkah']],
  ];

  function render(root) {
    const S = R.S, st = R.state;
    const W = S.warga;
    const total = W ? [...W.values()].reduce((a, b) => a + b, 0) : 0;
    const covered = W ? [...W.values()].filter((v) => v > 0).length : 0;
    const from = S.fcCur;
    const sysName = st.sys === 'ec' ? 'Kanal Endemis' : 'EWARS';
    st.rkAud = st.rkAud || 'warga';

    // ---- peringatan dini dari urutan zona minggu perkiraan
    const rank = (z) => zone.ZRANK[z] || 0;
    const alerts = [];
    for (const k of S.kec) {
      const seq = S.fw.map((w, j) => ({ w, j, z: S.zoneAt(k.kode_kec, j, st.sys), v: S.fc.get(k.kode_kec)[j]?.kasus_pred }));
      const cur = seq[from];
      if (!cur?.z) continue;
      const fut = seq.slice(from + 1).filter((s) => s.z);
      const worse = fut.find((s) => rank(s.z) > rank(cur.z));
      const better = fut.find((s) => rank(s.z) < rank(cur.z));
      const peak = [...seq.slice(from)].sort((a, b) => (b.v ?? 0) - (a.v ?? 0))[0];
      let type = null, when = null, to = null;
      if (worse) { type = 'up'; when = worse; to = fut.slice().sort((a, b) => rank(b.z) - rank(a.z))[0]; if (rank(to.z) <= rank(cur.z)) to = worse; }
      else if (cur.z === 'Merah') { type = 'same'; when = seq[seq.length - 1]; to = cur; }
      else if (better) { type = 'dn'; when = better; to = better; }
      if (type) alerts.push({ k, seq: seq.slice(from), cur, type, when, to, peak, sev: (type === 'up' ? 100 : type === 'same' ? 60 : 10) + rank((to || cur).z) * 10 + (peak?.v || 0) / 50 });
    }
    alerts.sort((a, b) => b.sev - a.sev);
    const cnt = { up: alerts.filter((a) => a.type === 'up').length, same: alerts.filter((a) => a.type === 'same').length, dn: alerts.filter((a) => a.type === 'dn').length };
    const ahead = S.fw.slice(from);
    const perWeek = ahead.map((w, i) => {
      const c = { Merah: 0, Kuning: 0, Hijau: 0 };
      for (const k of S.kec) { const z = S.zoneAt(k.kode_kec, from + i, st.sys); if (z) c[z]++; }
      return { w, c };
    });
    const redUncovered = W ? S.kec.filter((k) => S.zoneAt(k.kode_kec, S.fcCur, st.sys) === 'Merah' && !(W.get(k.kode_kec) > 0)).length : 0;

    const lineText = (a) => {
      const { cur, type, when, to } = a;
      const w = when.w;
      if (type === 'same') return `<span class="arrowz">${zone.chip('Merah')}</span> tetap sampai ${fmt.wk(w.y, w.w)}`;
      return `<span class="arrowz">${zone.chip(cur.z)}${u.icon('chevR')}${zone.chip(to.z)}</span> mulai ${fmt.wk(w.y, w.w)} <span class="muted">(${w.range})</span>`;
    };
    const icon = { up: 'up', same: 'alert', dn: 'down' };
    const strip = (a) => `<span class="zstrip" title="Zona per minggu">${a.seq.map((s) => `<i class="${s.z ? 'z-' + s.z : ''}" title="${fmt.wk(s.w.y, s.w.w)} · ${s.z ? zone.LABEL[s.z] : 'tanpa data'}">${s.w.w}</i>`).join('')}</span>`;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Peringatan Dini &amp; Aksi</h1>
          <p class="sub">Kecamatan yang diperkirakan naik zona, tetap di zona merah, atau membaik selama ${ahead.length} minggu ke depan, beserta pesan tindakan untuk warga dan Dinkes. Sistem zonasi: <b>${sysName}</b>.</p>
        </div>
        <div class="head-actions">
          <div class="seg" id="sys"><button data-s="ewars">EWARS</button><button data-s="ec">Kanal Endemis</button></div>
          <a class="btn primary" href="${u.esc(R.config.wargaUrl || '../Radensa_Warga/index.html')}" target="_blank" rel="noopener">${u.icon('external')}Buka DENGUARD Warga</a>
        </div>
      </div>

      <section class="kpis mb24" style="grid-template-columns:repeat(4,1fr)">
        <div class="kpi" style="--kc:var(--z-merah-map)"><div class="kpi-ic">${u.icon('up')}</div><div class="kpi-l">Diperkirakan naik zona</div><div class="kpi-v">${cnt.up}<small>kecamatan</small></div><div class="kpi-s">dalam ${ahead.length - 1} minggu ke depan</div></div>
        <div class="kpi" style="--kc:var(--brand-deep)"><div class="kpi-ic">${u.icon('alert')}</div><div class="kpi-l">Tetap zona merah</div><div class="kpi-v">${cnt.same}<small>kecamatan</small></div><div class="kpi-s">merah sepanjang perkiraan</div></div>
        <div class="kpi" style="--kc:var(--z-hijau-map)"><div class="kpi-ic">${u.icon('down')}</div><div class="kpi-l">Diperkirakan membaik</div><div class="kpi-v">${cnt.dn}<small>kecamatan</small></div><div class="kpi-s">turun zona dalam perkiraan</div></div>
        <div class="kpi" style="--kc:var(--c-teal)"><div class="kpi-ic">${u.icon('users')}</div><div class="kpi-l">Warga terdaftar</div><div class="kpi-v">${W ? fmt.num(total) : '–'}<small>${W ? 'akun' : ''}</small></div><div class="kpi-s">${W ? `${covered} dari ${S.kec.length} kecamatan terjangkau` : 'statistik belum aktif'}</div></div>
      </section>

      <div class="grid pg-a mb24">
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('bell')}</span>Daftar Peringatan</h2><span class="meta">${alerts.length} kecamatan · urut tingkat urgensi</span></div>
          <div class="warn-list" id="warn"></div>
          <div class="panel-note">Kotak berwarna = zona tiap minggu (angka = minggu epidemiologi), dari minggu ini sampai ${fmt.wk(ahead[ahead.length - 1].y, ahead[ahead.length - 1].w)}.</div>
        </section>
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('chart')}</span>Zona Tinggi &amp; Waspada per Minggu</h2><span class="meta">${sysName}</span></div>
          <div class="stk" id="stk"></div>
          <div class="legend stk-leg"><span><i class="lg-sw" style="background:var(--z-merah-map)"></i>Risiko Tinggi</span><span><i class="lg-sw" style="background:var(--z-kuning-map)"></i>Waspada</span></div>
        </section>
      </div>

      ${W ? `
      <div class="grid pg-b mb24">
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('map')}</span>Sebaran Warga Terdaftar</h2><span class="meta">akun per kecamatan</span></div>
          ${total ? '<div class="mapbox round fillmap" id="wmap"></div>' : `<div class="empty fillmap-empty"><div class="em-ic">${u.icon('users')}</div><b>Belum ada warga terdaftar</b>Peta sebaran muncul setelah warga mendaftar lewat aplikasi DENGUARD Warga.</div>`}
        </section>
        <section class="panel fill-col">
          <div class="panel-h"><h2><span class="hic">${u.icon('users')}</span>Jangkauan per Kecamatan</h2><span class="meta">urut jumlah warga</span></div>
          <div class="reach-stats">
            <div><b>${fmt.num(total)}</b><span>akun terdaftar</span></div>
            <div><b>${covered}<small>/${S.kec.length}</small></b><span>kecamatan terjangkau</span></div>
            <div class="${redUncovered ? 'warn' : ''}"><b>${redUncovered}</b><span>zona merah belum terjangkau</span></div>
          </div>
          <div class="fill-wrap"><div class="tbl-wrap"><table class="tbl" id="wtbl"></table></div></div>
        </section>
      </div>` : `
      <div class="callout mb24"><div>
        <b>Statistik warga belum aktif.</b> Jalankan <code>Radensa_AGC/sql/002_warga_admin.sql</code> di Supabase Studio → SQL Editor.
        Skrip itu menambahkan trigger pembuat profil saat warga mendaftar, fungsi agregat <code>statistik_warga()</code> (hanya jumlah per kecamatan, tanpa data pribadi), dan mengisi tabel <code>rekomendasi_aksi</code>.
      </div></div>`}

      <section class="panel">
        <div class="panel-h">
          <h2><span class="hic">${u.icon('shield')}</span>Rekomendasi Aksi per Zona</h2>
          <div class="seg" id="aud"><button data-a="warga">Untuk warga</button><button data-a="dinkes">Untuk Dinkes / Puskesmas</button></div>
        </div>
        <div id="rk"></div>
      </section>`;

    // ---- kontrol sistem zonasi
    u.$$('#sys button', root).forEach((b) => {
      b.classList.toggle('on', b.dataset.s === st.sys);
      b.onclick = () => { st.sys = b.dataset.s; R.map.pruneMaps(); render(root); };
    });

    // ---- daftar peringatan
    u.$('#warn', root).innerHTML = alerts.length ? alerts.slice(0, 40).map((a) => `
      <div class="warn-item" data-k="${a.k.kode_kec}">
        <div class="wi ${a.type}">${u.icon(icon[a.type])}</div>
        <div class="wt"><b>${u.esc(a.k.nm)}</b><span class="s">${u.esc(a.k.kota)}</span><span class="wl">${lineText(a)}</span></div>
        ${strip(a)}
        <div class="wp"><b>${fmt.num(a.peak?.v, 1)}</b><span>puncak ${fmt.wk(a.peak.w.y, a.peak.w.w)}</span></div>
      </div>`).join('') + (alerts.length > 40 ? `<div class="panel-note">+ ${alerts.length - 40} kecamatan lain.</div>` : '')
      : '<div class="empty"><b>Tidak ada perubahan zona</b>Semua kecamatan diperkirakan stabil pada horizon perkiraan.</div>';
    u.$$('#warn .warn-item', root).forEach((el) => (el.onclick = () => R.go('#/kecamatan/' + el.dataset.k)));

    // ---- grafik tumpukan per minggu
    const mx = Math.max(1, ...perWeek.map((p) => p.c.Merah + p.c.Kuning));
    u.$('#stk', root).innerHTML = `<div class="stk-bars">${perWeek.map((p, i) => {
      const t = p.c.Merah + p.c.Kuning;
      return `<div class="stk-col ${i === 0 ? 'on' : ''}" title="${fmt.wk(p.w.y, p.w.w)}: ${p.c.Merah} tinggi, ${p.c.Kuning} waspada">
        <b class="tot">${t}</b>
        <div class="stack" style="height:${Math.max(t ? 6 : 2, (t / mx) * 100)}%">
          ${p.c.Merah ? `<i class="m" style="flex:${p.c.Merah}">${p.c.Merah}</i>` : ''}${p.c.Kuning ? `<i class="k" style="flex:${p.c.Kuning}">${p.c.Kuning}</i>` : ''}
        </div>
        <div class="lbl"><b>${fmt.wk(p.w.y, p.w.w)}</b><span>${p.w.range}</span></div>
      </div>`;
    }).join('')}</div>`;

    // ---- rekomendasi
    function drawRk() {
      u.$$('#aud button', root).forEach((b) => b.classList.toggle('on', b.dataset.a === st.rkAud));
      const box = u.$('#rk', root);
      if (st.rkAud === 'warga') {
        box.innerHTML = `
          <div class="rk-wrap"><table class="rk-tbl">
            <thead><tr><th></th>${['Hijau', 'Kuning', 'Merah'].map((z) => `<th class="z-${z}"><span class="rk-chip z-${z}">${zone.LABEL[z]}</span><small>${RULE[st.sys][z]}</small></th>`).join('')}</tr></thead>
            <tbody>${WARGA_MATRIX.map(([row, cells], i) => `<tr class="${i === 0 ? 'lead' : ''}"><th>${row}</th>${cells.map((c, j) => `<td class="z-${['Hijau', 'Kuning', 'Merah'][j]}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>
          <div class="panel-note">Sama dengan yang tampil di aplikasi DENGUARD Warga: langkah mingguan otomatis menyesuaikan zona kecamatan warga, dan makin tinggi risikonya makin banyak serta ketat langkahnya. Dasar: pedoman PSN 3M Plus Kemenkes RI dan panduan dengue WHO; frekuensi yang dinaikkan di zona Waspada dan Tinggi adalah kebijakan kehati-hatian DENGUARD.</div>`;
        return;
      }
      const cols = ZORDER.map((z) => ({ z, items: S.rekom.filter((r) => r.audiens === 'dinkes' && r.zona === z).sort((a, b) => a.urutan - b.urutan) }));
      box.innerHTML = `
        <div class="rk3">${cols.map(({ z, items }) => `
          <div class="rk-col z-${z}">
            <div class="rk-ch"><span class="rk-chip z-${z}">${zone.LABEL[z]}</span><span class="muted">${items.length} aksi · ${RULE[st.sys][z]}</span></div>
            <div class="rk-items">${items.map((r, n) => `
              <div class="rk-card"><span class="rk-ic">${u.icon(REC_ICONS[n % REC_ICONS.length])}</span><div><b>${u.esc(r.judul)}</b><p>${u.esc(r.deskripsi)}</p></div></div>`).join('') || '<div class="empty">Belum ada aksi.</div>'}</div>
          </div>`).join('')}</div>
        <div class="panel-note">${S.rekomDefault ? 'Teks bawaan aplikasi; tabel rekomendasi_aksi di Supabase masih kosong.' : 'Diambil dari tabel rekomendasi_aksi di Supabase (audiens: dinkes).'}</div>`;
    }
    u.$$('#aud button', root).forEach((b) => (b.onclick = () => { st.rkAud = b.dataset.a; drawRk(); }));
    drawRk();

    if (!W) return;
    const max = Math.max(1, ...W.values());
    if (total) mapWarga();
    fillTable();

    function mapWarga() {
      const scale = d3.scaleSequentialSqrt(d3.interpolateRgb(u.css('--brand-soft'), u.css('--brand'))).domain([0, max]);
      R.map.makeMap(u.$('#wmap', root), {
        fill: (k) => (W.get(k) ? scale(W.get(k)) : u.css('--sunk')),
        tooltip: (k) => `<div class="kt-name">${u.esc(S.kecBy.get(k).nm)}</div><div class="kt-row"><span>Warga terdaftar</span><b>${fmt.num(W.get(k) || 0)}</b></div><div class="kt-row"><span>Zona minggu ini</span><b>${S.zoneAt(k, S.fcCur, st.sys) || '–'}</b></div>`,
        onClick: (k) => R.go('#/kecamatan/' + k), compass: false, inset: false,
        legend: `<div class="ttl">Warga terdaftar</div><div><span class="zdot" style="background:${scale(max)}"></span>${fmt.num(max)}</div><div><span class="zdot" style="background:${scale(max / 4)}"></span>${fmt.num(max / 4)}</div><div><span class="zdot" style="background:var(--sunk);border:1px solid var(--line)"></span>0</div>`,
      });
    }

    function fillTable() {
      const rows = S.kec.map((k) => ({ k, n: W.get(k.kode_kec) || 0, z: S.zoneAt(k.kode_kec, S.fcCur, st.sys) })).sort((a, b) => b.n - a.n || rank(b.z) - rank(a.z));
      u.$('#wtbl', root).innerHTML = `<thead><tr><th>Kecamatan</th><th>Zona</th><th class="r">Warga</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="click" data-k="${r.k.kode_kec}"><td><div class="strong">${u.esc(r.k.nm)}</div><div class="muted" style="font-size:11px">${u.esc(r.k.kota)}</div></td><td>${zone.chip(r.z)}</td>
          <td class="r"><div class="cellbar"><i style="width:${(r.n / max) * 60}px"></i>${fmt.num(r.n)}</div></td></tr>`).join('')}</tbody>`;
      u.$$('#wtbl tr.click', root).forEach((tr) => (tr.onclick = () => R.go('#/kecamatan/' + tr.dataset.k)));
    }
  }
})();

(function () {
  const R = window.R;
  const { u, fmt } = R;

  const NAV = [
    { sec: 'Utama' },
    { id: 'beranda', label: 'Beranda', icon: 'home' },
    { id: 'peta', label: 'Peta Zonasi', icon: 'map', live: true },
    { id: 'forecast', label: 'Forecast', icon: 'trend' },
    { id: 'kecamatan', label: 'Kecamatan', icon: 'pin' },
    { sec: 'Analisis' },
    { id: 'eksplorasi', label: 'Eksplorasi Data', icon: 'chart' },
    { id: 'model', label: 'Model & Evaluasi', icon: 'cpu' },
    { id: 'simulasi', label: 'Simulasi', icon: 'flask' },
    { sec: 'Layanan' },
    { id: 'peringatan', label: 'Peringatan & Aksi', icon: 'bell', alerts: true },
    { id: 'metodologi', label: 'Metodologi', icon: 'book' },
  ];
  const LEGACY = { ringkasan: 'beranda', historis: 'eksplorasi', warga: 'peringatan' };

  R.state = { sys: 'ewars', fcIdx: null, kota: null };

  // Cakupan wilayah (pemilih di topbar) — dipakai halaman bertanda scope:true
  R.scope = {
    kec: () => (R.state.kota ? R.S.kec.filter((k) => k.kota === R.state.kota) : R.S.kec),
    has: (kode) => !R.state.kota || R.S.kecBy.get(kode)?.kota === R.state.kota,
    label: () => R.state.kota || 'DKI Jakarta',
  };

  function ageStatus(iso, okDays, warnDays) {
    if (!iso) return 'bad';
    const d = (Date.now() - new Date(iso).getTime()) / 86400000;
    return d <= okDays ? 'ok' : d <= warnDays ? 'warn' : 'bad';
  }

  function renderChrome() {
    const S = R.S;
    const nMerah = S.kec.filter((k) => S.zoneAt(k.kode_kec, S.fcCur, R.state.sys) === 'Merah').length;
    u.$('#nav').innerHTML = NAV.map((n) => n.sec
      ? `<div class="nav-sec">${n.sec}</div>`
      : `<a href="#/${n.id}" data-id="${n.id}">${u.icon(n.icon)}<span>${n.label}</span>${n.live ? '<span class="live">LIVE</span>' : ''}${n.alerts && nMerah ? `<span class="badge" title="Kecamatan zona merah minggu berjalan">${nMerah}</span>` : ''}</a>`
    ).join('');

    const [cy, cw] = S.cur;
    u.$('#epi-now').innerHTML = `${u.icon('calendar', 'width="15" height="15"')}Minggu epidemiologi <b>${cw}</b> · ${fmt.range(cy, cw, true)}`;

    const st = ageStatus(S.fresh.fc, 8, 15);
    const am = S.active;
    u.$('#fresh').innerHTML = `<span class="dot ${st}"></span><span>Pembaruan terakhir: <b>${fmt.wib(S.fresh.fc)}</b></span>
      <button class="icon-btn" id="btn-reload" title="Muat ulang data" aria-label="Muat ulang data">${u.icon('refresh')}</button>
      <div class="pop">
        <div class="pop-row"><span>Scraping kasus DBD (lokal)</span><b>${fmt.wib(S.fresh.dbd)}</b></div>
        <div class="pop-row"><span>Ingest iklim GEE (Actions)</span><b>${fmt.wib(S.fresh.ikl)}</b></div>
        <div class="pop-row"><span>Model aktif</span><b class="mono">${u.esc(am?.versi || '–')}</b></div>
        <div class="pop-row"><span>Forecast terakhir</span><b>${fmt.wib(S.fresh.fc)}</b></div>
        <div class="pop-row"><span>Basis data</span><b>s/d ${S.runs[0] ? fmt.wk(0, S.runs[0].basis_minggu) + ' ' + S.runs[0].basis_tahun : '–'}</b></div>
      </div>`;
    u.$('#btn-reload').onclick = reload;

    u.$('#rail-foot').innerHTML = `
      <div class="rc-t">Model aktif</div>
      <div class="rc-row rc-ver"><b class="mono">${u.esc(am?.versi || '–')}</b></div>
      <div class="rc-row"><span>R² · ${u.esc(S.headline.label)}</span><b>${fmt.num(S.headline.r2, 2)}</b></div>
      <div class="rc-row"><span>MAE</span><b>${fmt.num(S.headline.mae, 2)} kasus</b></div>
      <div class="rc-row rc-src" style="opacity:.75;margin-top:4px"><span>Sumber</span><span>Dinkes DKI · GEE</span></div>`;

    const bell = u.$('#btn-bell');
    bell.innerHTML = u.icon('bell') + (nMerah ? `<span class="n">${nMerah}</span>` : '');
    updateThemeIcon();
  }

  function renderScope() {
    const wrap = u.$('#scope');
    const S = R.S;
    const items = [{ v: null, label: 'Seluruh DKI Jakarta', n: S.kec.length }]
      .concat(S.kota.map((k) => ({ v: k, label: k, n: S.kec.filter((x) => x.kota === k).length })));
    wrap.innerHTML = `<button class="scope-btn" aria-haspopup="true" aria-expanded="false">${u.icon('pin')}<span>${u.esc(R.scope.label())}</span>${u.icon('chevD', 'class="chev"')}</button>
      <div class="scope-menu" hidden>${items.map((it) => `<button data-k="${it.v == null ? '' : u.esc(it.v)}" class="${(R.state.kota || '') === (it.v || '') ? 'on' : ''}">${u.icon('pin', 'width="14" height="14"')}${u.esc(it.label)}<small>${it.n} kec.</small></button>`).join('')}</div>`;
    const btn = u.$('.scope-btn', wrap), menu = u.$('.scope-menu', wrap);
    btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); };
    u.$$('button', menu).forEach((b) => (b.onclick = () => {
      R.state.kota = b.dataset.k || null;
      menu.hidden = true;
      route();
    }));
  }
  document.addEventListener('click', () => { const m = u.$('#scope .scope-menu'); if (m) m.hidden = true; });

  function updateThemeIcon() {
    const dark = document.documentElement.dataset.theme === 'dark';
    u.$('#btn-theme').innerHTML = u.icon(dark ? 'sun' : 'moon');
  }

  function route() {
    let parts = (location.hash.replace(/^#\/?/, '') || 'beranda').split('/');
    if (LEGACY[parts[0]]) { parts[0] = LEGACY[parts[0]]; history.replaceState(null, '', '#/' + parts.join('/')); }
    const id = R.views[parts[0]] ? parts[0] : 'beranda';
    const view = R.views[id];
    u.tip.hide();
    const root = u.$('#view');
    root.innerHTML = '';
    R.map.pruneMaps();
    const box = document.createElement('div');
    box.className = 'fade-in';
    root.appendChild(box);

    const scoped = !!view.scope;
    u.$('#scope').hidden = !scoped;
    u.$('#crumb').hidden = scoped;
    if (scoped) renderScope();
    else u.$('#crumb').innerHTML = `DENGUARD / <b>${view.title}</b>`;

    view.render(box, parts.slice(1));
    u.$$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.id === id));
    document.title = `${view.title} · DENGUARD Admin`;
    window.scrollTo(0, 0);
  }

  async function boot() {
    const fill = u.$('#boot-fill'), step = u.$('#boot-step');
    try {
      R.S = await R.data.load((p, label) => {
        fill.style.width = Math.max(4, Math.round(p * 100)) + '%';
        step.textContent = label + '…';
      });
    } catch (e) {
      console.error(e);
      step.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'boot-error';
      box.innerHTML = `<b>Gagal memuat data.</b><br>${u.esc(e.message)}<br><button class="btn">Coba lagi</button>`;
      box.querySelector('button').onclick = () => location.reload();
      step.after(box);
      return;
    }
    if (R.state.fcIdx == null) R.state.fcIdx = R.S.fcCur;
    u.$('#boot').hidden = true;
    u.$('#app').hidden = false;
    renderChrome();
    route();
  }

  async function reload() {
    const btn = u.$('#btn-reload');
    btn.classList.add('spin');
    try {
      R.S = await R.data.load();
      R.state.fcIdx = Math.min(R.state.fcIdx ?? R.S.fcCur, R.S.fw.length - 1);
      renderChrome();
      route();
    } catch (e) {
      alert('Gagal memuat ulang: ' + e.message);
      btn.classList.remove('spin');
    }
  }

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark';
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('denguard-admin-theme', root.dataset.theme); } catch (e) {}
    updateThemeIcon();
    R.charts.redrawAll();
    R.map.rethemeAll();
  }

  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', () => {
    u.$('#btn-theme').onclick = toggleTheme;
    boot();
  });
  window.addEventListener('scroll', () => u.tip.hide(), { passive: true });

  R.go = (hash) => { location.hash = hash; };
})();

(function () {
  const R = window.R;
  const { u, fmt } = R;
  const maps = new Set();

  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const tileUrl = () => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${isDark() ? 'Dark' : 'Light'}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
  const tileOpacity = () => (isDark() ? 0.55 : 0.5);

  function zoneColor(z) {
    if (!z) return u.css('--z-none');
    return u.css(`--z-${z.toLowerCase()}-map`);
  }

  const GEO = window.RADENSA_GEO;
  const mainland = { type: 'FeatureCollection', features: GEO.features.filter((f) => f.properties.kab_kode !== 6) };
  const islands = GEO.features.filter((f) => f.properties.kab_kode === 6);

  // Titik label tiap wilayah kota (rata-rata pusat kecamatan)
  const cityCenters = (() => {
    const acc = new Map();
    for (const f of mainland.features) {
      const b = L.geoJSON(f).getBounds().getCenter();
      const k = f.properties.kab_kode;
      const a = acc.get(k) || { lat: 0, lng: 0, n: 0, name: f.properties.kabupaten };
      a.lat += b.lat; a.lng += b.lng; a.n++;
      acc.set(k, a);
    }
    return [...acc.values()].map((a) => ({ lat: a.lat / a.n, lng: a.lng / a.n, name: fmt.kota(a.name) }));
  })();

  const NORTH = '<svg viewBox="0 0 18 24" fill="currentColor"><path d="M9 1 16.5 21 9 16.5 1.5 21 9 1Z"/></svg>';

  /**
   * opts.fill(kode) -> warna CSS
   * opts.tooltip(kode) -> html
   * opts.onClick(kode)
   * opts.legend -> html
   * opts.dim(kode) -> true bila di luar cakupan (diredupkan)
   * opts.cityLabels (default false)
   * opts.scrollZoom (default false)
   */
  function makeMap(el, opts) {
    el.innerHTML = '';
    const map = L.map(el, {
      zoomControl: true, attributionControl: true, scrollWheelZoom: !!opts.scrollZoom,
      zoomSnap: 0.25, minZoom: 10, maxZoom: 15,
    });
    map.zoomControl.setPosition('topright');
    const tiles = L.tileLayer(tileUrl(), {
      maxNativeZoom: 16, maxZoom: 19, opacity: tileOpacity(),
      attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap',
    }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    let selected = null;
    const byKode = new Map();
    const styleOf = (kode) => {
      const dim = opts.dim && opts.dim(kode);
      return {
        fillColor: opts.fill(kode), fillOpacity: dim ? 0.2 : 0.92,
        color: kode === selected ? u.css('--brand') : u.css('--panel'),
        weight: kode === selected ? 3 : 1.3, opacity: dim ? 0.5 : 1,
      };
    };

    const layer = L.geoJSON(mainland, {
      style: (f) => styleOf(f.properties.kode_kec),
      onEachFeature: (f, lyr) => {
        const kode = f.properties.kode_kec;
        byKode.set(kode, lyr);
        lyr.bindTooltip(() => opts.tooltip(kode), { sticky: true, direction: 'top', offset: [0, -8], className: 'kt', opacity: 1 });
        lyr.on('mouseover', () => { lyr.setStyle({ weight: 2.6, color: u.css('--ink') }); lyr.bringToFront(); });
        lyr.on('mouseout', () => { lyr.setStyle(styleOf(kode)); if (selected && byKode.get(selected)) byKode.get(selected).bringToFront(); });
        lyr.on('click', () => opts.onClick && opts.onClick(kode));
      },
    }).addTo(map);
    map.fitBounds(layer.getBounds(), { padding: [18, 18] });

    if (opts.cityLabels) {
      for (const c of cityCenters) {
        L.tooltip({ permanent: true, direction: 'center', className: 'map-city', interactive: false })
          .setContent(c.name).setLatLng([c.lat, c.lng]).addTo(map);
      }
    }

    const mk = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; el.appendChild(d); return d; };
    if (opts.compass !== false) mk('map-n', `${NORTH}<span>N</span>`);
    const locate = document.createElement('button');
    locate.className = 'icon-btn map-locate';
    locate.title = 'Pusatkan peta';
    locate.setAttribute('aria-label', 'Pusatkan peta');
    locate.innerHTML = u.icon('locate');
    locate.onclick = () => map.fitBounds(layer.getBounds(), { padding: [18, 18] });
    L.DomEvent.disableClickPropagation(locate);
    el.appendChild(locate);

    // Inset Kepulauan Seribu (jauh di utara, tidak muat di peta utama)
    let insetEl = null;
    if (opts.inset !== false) {
      insetEl = mk('map-inset', '');
      L.DomEvent.disableClickPropagation(insetEl);
    }
    let legendEl = null;
    if (opts.legend) legendEl = mk('map-legend', opts.legend);

    function drawInset() {
      if (!insetEl) return;
      insetEl.innerHTML = '<div class="lbl">Kep. Seribu</div>' + islands.map((f) => {
        const k = f.properties.kode_kec;
        return `<button data-k="${k}"><span class="zdot" style="background:${opts.fill(k)}"></span>${u.esc(f.properties.nama.replace('Kep. Seribu ', ''))}</button>`;
      }).join('');
      insetEl.querySelectorAll('button').forEach((b) => {
        b.onclick = () => opts.onClick && opts.onClick(b.dataset.k);
        b.onmouseenter = (ev) => u.tip.show(opts.tooltip(b.dataset.k), ev);
        b.onmousemove = (ev) => u.tip.move(ev);
        b.onmouseleave = () => u.tip.hide();
      });
    }
    drawInset();

    const api = {
      map, el,
      refresh() {
        layer.eachLayer((l) => l.setStyle(styleOf(l.feature.properties.kode_kec)));
        if (selected && byKode.get(selected)) byKode.get(selected).bringToFront();
        drawInset();
      },
      retheme() { tiles.setUrl(tileUrl()); tiles.setOpacity(tileOpacity()); api.refresh(); },
      select(kode) { selected = kode; api.refresh(); },
      setLegend(html) { if (legendEl) legendEl.innerHTML = html; },
      invalidate() { map.invalidateSize(); },
      sync(other) {
        let lock = false;
        const link = (a, b) => a.map.on('move', () => {
          if (lock) return;
          lock = true;
          b.map.setView(a.map.getCenter(), a.map.getZoom(), { animate: false });
          lock = false;
        });
        link(api, other);
        link(other, api);
      },
    };
    maps.add(api);
    setTimeout(() => map.invalidateSize(), 0);
    return api;
  }

  function rethemeAll() {
    for (const m of [...maps]) {
      if (!m.el.isConnected) { m.map.remove(); maps.delete(m); continue; }
      m.retheme();
    }
  }
  function pruneMaps() {
    for (const m of [...maps]) if (!m.el.isConnected) { m.map.remove(); maps.delete(m); }
  }

  const LAB = { Merah: 'Tinggi', Kuning: 'Waspada', Hijau: 'Rendah' };
  const legendZones = (title, rows) => `<div class="ttl">${title}</div>` +
    rows.map(([z, t]) => `<div><span class="zdot z-${z}"></span>${t || LAB[z]}</div>`).join('') +
    '<div><span class="zdot"></span>Tanpa data</div>';

  R.map = { makeMap, zoneColor, rethemeAll, pruneMaps, legendZones };
})();

(function () {
  const R = window.R;
  const DAY = 86400000;
  const WEEK = 7 * DAY;

  // ---------------------------------------------------------------
  // Kalender epidemiologi MMWR (Minggu–Sabtu), port 1:1 dari
  // Radensa_AGC/radensa/epiweek.py. Semua tanggal = tengah malam UTC.
  // ---------------------------------------------------------------
  const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
  const addDays = (d, n) => new Date(d.getTime() + n * DAY);
  const yStartCache = new Map();

  function epiYearStart(y) {
    if (yStartCache.has(y)) return yStartCache.get(y);
    const jan1 = utc(y, 0, 1);
    const sunday = addDays(jan1, -jan1.getUTCDay());
    let res = null;
    for (const c of [sunday, addDays(sunday, 7)]) {
      let n = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(c, i);
        if (d.getUTCFullYear() === y && d.getUTCMonth() === 0) n++;
      }
      if (n >= 4) { res = c; break; }
    }
    yStartCache.set(y, res);
    return res;
  }
  const weeksInYear = (y) => Math.round((epiYearStart(y + 1) - epiYearStart(y)) / WEEK);
  const weekStart = (y, w) => addDays(epiYearStart(y), 7 * (w - 1));
  const weekEnd = (y, w) => addDays(weekStart(y, w), 6);
  function dateToEpi(d) {
    const Y = d.getUTCFullYear();
    for (const y of [Y + 1, Y, Y - 1]) {
      const s = epiYearStart(y);
      if (d >= s && d < epiYearStart(y + 1)) return [y, Math.floor((d - s) / WEEK) + 1];
    }
    return null;
  }
  const addWeeks = (y, w, n) => dateToEpi(addDays(weekStart(y, w), 7 * n));
  const EPOCH = utc(1970, 0, 4); // hari Minggu
  const weekIdx = (y, w) => Math.round((weekStart(y, w) - EPOCH) / WEEK);
  const idxToDate = (i) => new Date(EPOCH.getTime() + i * WEEK);
  const idxToEpi = (i) => dateToEpi(idxToDate(i));
  function todayJakarta() {
    const n = new Date(Date.now() + 7 * 3600000);
    return utc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  }

  // Minggu yang ditampilkan pada tampilan minggu-ke-tahun (slider, heatmap, overlay antar tahun): maks 52.
  // W53 (2020 dan 2025 menurut kalender MMWR) tetap ada di data dan ikut dihitung di total tahunan.
  const maxWeek = (y) => Math.min(52, weeksInYear(y));
  R.epi = { epiYearStart, weeksInYear, maxWeek, weekStart, weekEnd, dateToEpi, addWeeks, weekIdx, idxToDate, idxToEpi, todayJakarta, addDays, DAY, WEEK };

  // ---------------------------------------------------------------
  // Format Indonesia
  // ---------------------------------------------------------------
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const BLN_P = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  const fmt = {
    BLN, BLN_P, HARI,
    date(d, long) { return `${d.getUTCDate()} ${(long ? BLN_P : BLN)[d.getUTCMonth()]} ${d.getUTCFullYear()}`; },
    dm(d) { return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]}`; },
    range(y, w, withYear) {
      const s = weekStart(y, w), e = weekEnd(y, w);
      const yr = withYear ? ` ${e.getUTCFullYear()}` : '';
      if (s.getUTCMonth() === e.getUTCMonth()) return `${s.getUTCDate()}–${e.getUTCDate()} ${BLN[e.getUTCMonth()]}${yr}`;
      const sy = withYear && s.getUTCFullYear() !== e.getUTCFullYear() ? ` ${s.getUTCFullYear()}` : '';
      return `${s.getUTCDate()} ${BLN[s.getUTCMonth()]}${sy} – ${e.getUTCDate()} ${BLN[e.getUTCMonth()]}${yr}`;
    },
    rangeLong(y, w) {
      const s = weekStart(y, w), e = weekEnd(y, w);
      if (s.getUTCMonth() === e.getUTCMonth()) return `${s.getUTCDate()}–${e.getUTCDate()} ${BLN_P[e.getUTCMonth()]} ${e.getUTCFullYear()}`;
      return `${s.getUTCDate()} ${BLN_P[s.getUTCMonth()]} – ${e.getUTCDate()} ${BLN_P[e.getUTCMonth()]} ${e.getUTCFullYear()}`;
    },
    wk(y, w) { return `W${String(w).padStart(2, '0')}`; },
    num(x, dec = 0) {
      if (x == null || Number.isNaN(x)) return '–';
      return Number(x).toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    },
    pct(x, dec = 0, sign = false) {
      if (x == null || !isFinite(x)) return '–';
      const s = sign && x > 0 ? '+' : '';
      return s + fmt.num(x * 100, dec) + '%';
    },
    wib(iso) {
      if (!iso) return '–';
      const d = new Date(new Date(iso).getTime() + 7 * 3600000);
      const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}.${mm} WIB`;
    },
    ago(iso) {
      if (!iso) return '–';
      const s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 90) return 'baru saja';
      if (s < 3600) return `${Math.round(s / 60)} menit lalu`;
      if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
      const d = Math.round(s / 86400);
      return d === 1 ? 'kemarin' : `${d} hari lalu`;
    },
    kota(k) {
      if (!k) return '';
      if (k.toUpperCase() === 'KEPULAUAN SERIBU') return 'Kep. Seribu';
      return k.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    },
  };
  R.fmt = fmt;

  // ---------------------------------------------------------------
  // Zona
  // ---------------------------------------------------------------
  const ZONES = ['Hijau', 'Kuning', 'Merah'];
  const ZRANK = { Hijau: 1, Kuning: 2, Merah: 3 };
  function zoneEwars(v, thr) {
    if (v == null || !thr) return null;
    if (v <= thr.p50) return 'Hijau';
    if (v <= thr.p75) return 'Kuning';
    return 'Merah';
  }
  function zoneEc(v, ec) {
    if (v == null || !ec) return null;
    if (v <= ec.ec_mean) return 'Hijau';
    if (v <= ec.ec_upper_yellow) return 'Kuning';
    return 'Merah';
  }
  const chip = (z, txt) => z ? `<span class="chip z-${z}">${txt || z}</span>` : `<span class="chip">Tanpa data</span>`;
  const zdot = (z) => `<span class="zdot ${z ? 'z-' + z : ''}"></span>`;
  const LABEL = { Merah: 'Risiko Tinggi', Kuning: 'Waspada', Hijau: 'Risiko Rendah' };
  const DESC = {
    Merah: 'Perkiraan kasus melampaui batas wajar kecamatan ini. Perlu respons segera: penyelidikan epidemiologi, PSN serentak, dan siaga fasilitas kesehatan.',
    Kuning: 'Perkiraan kasus di atas normal. Tingkatkan pemantauan jentik, PSN terjadwal, dan komunikasi risiko ke warga.',
    Hijau: 'Perkiraan kasus dalam batas normal. Cukup surveilans rutin dan edukasi PSN 3M Plus berkala.',
  };
  R.zone = { ZONES, ZRANK, ewars: zoneEwars, ec: zoneEc, chip, zdot, LABEL, DESC };

  // ---------------------------------------------------------------
  // Statistik ringan (dipakai halaman Eksplorasi & Simulasi)
  // ---------------------------------------------------------------
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }
  function std(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
  }
  function moments(a) {
    const n = a.length, m = mean(a);
    let m2 = 0, m3 = 0, m4 = 0;
    for (const v of a) { const d = v - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
    m2 /= n; m3 /= n; m4 /= n;
    return { skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2) - 3 };
  }
  function rank(a) {
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  }
  function pearson(x, y) {
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  const spearman = (x, y) => pearson(rank(x), rank(y));
  R.stats = { mean, std, quantile, moments, rank, pearson, spearman };

  // ---------------------------------------------------------------
  // DOM & misc
  // ---------------------------------------------------------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function downloadCsv(filename, rows) {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const q = (v) => {
      const s = v == null ? '' : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  const tipEl = () => document.getElementById('tip');
  const tip = {
    show(html, ev) {
      const el = tipEl();
      el.innerHTML = html;
      el.hidden = false;
      tip.move(ev);
    },
    move(ev) {
      const el = tipEl();
      if (el.hidden || !ev) return;
      const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    },
    hide() { tipEl().hidden = true; },
  };

  // Ikon garis 24px (gaya Lucide, digambar ulang ringkas)
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    map: '<path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4Z"/><path d="M9 4v13.5"/><path d="M15 6.5V20"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
    play: '<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor"/>',
    pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.5"/>',
    db: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5"/><path d="M12 17.5v.01"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    droplet: '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v6L4.8 18.2A1.5 1.5 0 0 0 6.1 20.5h11.8a1.5 1.5 0 0 0 1.3-2.3L14 9V3"/><path d="M7.5 15h9"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    chart: '<rect x="3.5" y="12" width="4" height="8.5" rx="1"/><rect x="10" y="7" width="4" height="13.5" rx="1"/><rect x="16.5" y="3.5" width="4" height="17" rx="1"/>',
    thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.5 8.5H7Z"/><path d="M9 21.5v-1.5M13 21.5v-1.5M17 21.5v-1.5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    hospital: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M12 8v6M9 11h6"/>',
    megaphone: '<path d="M3 10v4l3 .5V9.5L3 10Z"/><path d="M6 9.5 18 5v14L6 14.5"/><path d="M8 15l1 5h3l-1-4.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    up: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    down: '<path d="M7 7l10 10"/><path d="M17 8v9H8"/>',
    minus: '<path d="M5 12h14"/>',
    locate: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    mosquito: '<path d="M14.2 13.4 8.8 8.8"/><path d="M8.8 8.8 4.5 4.5" stroke-width="1.4"/><ellipse cx="15.6" cy="15" rx="3.6" ry="2.2" transform="rotate(42 15.6 15)" fill="currentColor" stroke="none"/><circle cx="12.6" cy="11.8" r="1.7" fill="currentColor" stroke="none"/><path d="M14 10.2c1.4-2.7 4.3-4 7-3.4-.3 2.8-2.2 4.8-4.8 5" opacity=".9"/><path d="M12.2 13.6c-2.4 1.1-3.4 3.8-2.6 6.4 2.2-.3 4-1.7 4.7-3.8"/><path d="M17 17.8l2.8 3M15.4 18.2l1.4 3.2M18.2 15.4l3.1 1.8" stroke-width="1.4"/>',
  };
  const icon = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${P[name] || ''}</svg>`;

  // Ilustrasi nyamuk Aedes (siluet), warna mengikuti currentColor
  const mosq = (cls = '') => `<svg class="${cls}" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
    <g opacity=".3"><ellipse cx="60" cy="31" rx="23" ry="7.5" transform="rotate(-30 60 31)"/><ellipse cx="68" cy="39" rx="21" ry="6" transform="rotate(-9 68 39)"/></g>
    <path d="M27 37 8 24" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" fill="none"/>
    <circle cx="31" cy="39" r="6.6"/>
    <ellipse cx="46" cy="45" rx="11.5" ry="8.2" transform="rotate(-18 46 45)"/>
    <ellipse cx="69" cy="57" rx="20" ry="6.6" transform="rotate(27 69 57)"/>
    <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M40 51 30 65 19 85"/><path d="M46 53 42 71 35 91"/><path d="M53 52 57 69 67 87"/><path d="M29 33 23 23"/>
    </g></svg>`;

  R.u = { esc, $, $$, css, downloadCsv, tip, icon, mosq };
})();

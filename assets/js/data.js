(function () {
  const R = window.R;
  const { epi, fmt } = R;

  // ---------------------------------------------------------------
  // PostgREST (Supabase) — fetch langsung, tanpa SDK.
  // ---------------------------------------------------------------
  const headers = () => ({ apikey: R.config.anonKey, Authorization: 'Bearer ' + R.config.anonKey });

  async function rest(path, { from, to, count } = {}) {
    const h = headers();
    if (from != null) { h['Range-Unit'] = 'items'; h.Range = `${from}-${to}`; }
    if (count) h.Prefer = 'count=exact';
    let r;
    try {
      r = await fetch(`${R.config.supabaseUrl}/rest/v1/${path}`, { headers: h });
    } catch (e) {
      throw new Error('Tidak dapat terhubung ke Supabase. Periksa koneksi internet.');
    }
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`${path.split('?')[0]} (HTTP ${r.status}) ${t.slice(0, 160)}`);
    }
    const data = await r.json();
    let total = null;
    const cr = r.headers.get('content-range');
    if (count && cr && cr.includes('/')) {
      const n = parseInt(cr.split('/')[1], 10);
      if (!Number.isNaN(n)) total = n;
    }
    return { data, total };
  }

  async function restAll(path, size = 1000) {
    const first = await rest(path, { from: 0, to: size - 1, count: true });
    if (first.total == null) {
      // Header Content-Range tidak terbaca: ambil berurutan sampai halaman pendek.
      let out = first.data, from = size;
      while (out.length && out.length % size === 0) {
        const p = await rest(path, { from, to: from + size - 1 });
        if (!p.data.length) break;
        out = out.concat(p.data);
        from += size;
      }
      return out;
    }
    const jobs = [];
    for (let s = size; s < first.total; s += size) jobs.push(rest(path, { from: s, to: s + size - 1 }));
    const pages = await Promise.all(jobs);
    return first.data.concat(...pages.map((p) => p.data));
  }

  async function rpc(name) {
    const r = await fetch(`${R.config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!r.ok) throw new Error(`rpc ${name}: HTTP ${r.status}`);
    return r.json();
  }

  // ---------------------------------------------------------------
  // Rekomendasi bawaan (dipakai bila tabel rekomendasi_aksi kosong).
  // Isinya sama dengan seed di Radensa_AGC/sql/002_warga_admin.sql.
  // ---------------------------------------------------------------
  const DEFAULT_REKOM = [
    ['Hijau', 'warga', 'PSN 3M Plus seminggu sekali', 'Kuras bak mandi, tutup tempat air, dan daur ulang barang bekas yang bisa menampung air.'],
    ['Hijau', 'warga', 'Cek jentik di rumah', 'Lihat bak mandi, vas bunga, tatakan dispenser, dan talang air.'],
    ['Hijau', 'warga', 'Pantau info tiap minggu', 'Risiko bisa berubah cepat saat musim hujan. Buka DENGUARD seminggu sekali.'],
    ['Kuning', 'warga', 'PSN 3M Plus dua kali seminggu', 'Nyamuk berkembang dari telur jadi dewasa dalam 7-10 hari. Menguras lebih sering memutus siklusnya.'],
    ['Kuning', 'warga', 'Pakai losion antinyamuk', 'Nyamuk DBD paling aktif pagi (08.00-10.00) dan sore (15.00-17.00).'],
    ['Kuning', 'warga', 'Ajak tetangga kerja bakti', 'Nyamuk bisa terbang dari rumah tetangga. Bersihkan lingkungan RT bersama-sama.'],
    ['Kuning', 'warga', 'Demam lebih dari 2 hari? Periksa', 'Datang ke Puskesmas untuk tes darah. Jangan menunggu sampai lemas.'],
    ['Merah', 'warga', 'PSN serentak bersama RT/RW', 'Lakukan pembersihan sarang nyamuk serentak minggu ini.'],
    ['Merah', 'warga', 'Lindungi anak dan lansia', 'Gunakan kelambu saat tidur siang, baju lengan panjang, dan losion antinyamuk.'],
    ['Merah', 'warga', 'Demam tinggi mendadak? Segera ke Puskesmas', 'Jangan tunggu. Penanganan cepat mencegah DBD menjadi berat.'],
    ['Merah', 'warga', 'Laporkan jentik dan kasus', 'Hubungi kader Jumantik atau Puskesmas bila menemukan jentik atau ada tetangga sakit DBD.'],
    ['Hijau', 'dinkes', 'Surveilans rutin', 'Pemeriksaan Jentik Berkala (PJB) dan pemantauan laporan RS/Puskesmas mingguan.'],
    ['Hijau', 'dinkes', 'Edukasi PSN 3M Plus', 'Pertahankan gerakan 1 Rumah 1 Jumantik dan sosialisasi melalui sekolah.'],
    ['Kuning', 'dinkes', 'Intensifkan PJB', 'Targetkan Angka Bebas Jentik (ABJ) >= 95%. Prioritaskan kelurahan dengan kasus terbanyak.'],
    ['Kuning', 'dinkes', 'Siapkan logistik', 'Pastikan stok larvasida, RDT NS1, dan cairan infus di Puskesmas kecamatan.'],
    ['Kuning', 'dinkes', 'Komunikasi risiko', 'Koordinasi lurah, camat, dan sekolah; sebarkan informasi waspada ke warga.'],
    ['Merah', 'dinkes', 'Penyelidikan Epidemiologi (PE)', 'Lakukan PE untuk setiap kasus dalam 1x24 jam; tentukan perlu tidaknya fogging fokus.'],
    ['Merah', 'dinkes', 'PSN serentak & fogging fokus', 'Gerakkan PSN serentak se-kecamatan; fogging hanya berdasarkan hasil PE.'],
    ['Merah', 'dinkes', 'Siaga fasilitas rujukan', 'Koordinasi RS rujukan untuk kesiapan tempat tidur dan trombosit.'],
  ].map(([zona, audiens, judul, deskripsi], i) => ({ id: i, zona, audiens, judul, deskripsi, urutan: i }));

  // Nama fitur model -> label manusia + domain
  const FEATURES = {
    kasus_DBD_lag1: ['Kasus 1 minggu lalu', 'epi'],
    kasus_DBD_lag2: ['Kasus 2 minggu lalu', 'epi'],
    kasus_DBD_rolling4: ['Rata-rata kasus 4 minggu', 'epi'],
    kasus_DBD_rolling8: ['Rata-rata kasus 8 minggu', 'epi'],
    kecamatan_endemisitas: ['Endemisitas kecamatan', 'epi'],
    spatial_kasus_tetangga_lag1: ['Kasus tetangga (lag 1)', 'spa'],
    spatial_kasus_tetangga_lag2: ['Kasus tetangga (lag 2)', 'spa'],
    spatial_kasus: ['Kasus tetangga (minggu sama)', 'spa'],
    curah_hujan_kumulatif: ['Curah hujan', 'ikl'],
    curah_hujan_lag1: ['Curah hujan (lag 1)', 'ikl'],
    curah_hujan_lag2: ['Curah hujan (lag 2)', 'ikl'],
    suhu_rata: ['Suhu rata-rata', 'ikl'],
    suhu_rata_lag1: ['Suhu (lag 1)', 'ikl'],
    suhu_rata_lag2: ['Suhu (lag 2)', 'ikl'],
    kelembapan_rata: ['Kelembapan', 'ikl'],
    kelembapan_rata_lag1: ['Kelembapan (lag 1)', 'ikl'],
    kelembapan_rata_lag2: ['Kelembapan (lag 2)', 'ikl'],
    ch_suhu_interaksi: ['Interaksi hujan × suhu', 'ikl'],
    suhu_sq: ['Suhu kuadrat', 'ikl'],
    minggu_sin: ['Musiman (sin)', 'mus'],
    minggu_cos: ['Musiman (cos)', 'mus'],
  };
  const DOMAINS = { epi: 'Epidemiologi', ikl: 'Iklim', spa: 'Spasial', mus: 'Musiman' };

  function normFI(fi) {
    if (!fi) return [];
    const arr = Object.entries(fi).map(([k, v]) => ({ key: k, val: Number(v) || 0 }));
    const tot = arr.reduce((a, b) => a + b.val, 0) || 1;
    return arr
      .map((d) => ({ ...d, pct: d.val / tot, label: (FEATURES[d.key] || [d.key])[0], dom: (FEATURES[d.key] || [0, 'epi'])[1] }))
      .sort((a, b) => b.val - a.val);
  }

  // ---------------------------------------------------------------
  // Muat semua data + bangun indeks turunan
  // ---------------------------------------------------------------
  async function load(onProgress = () => {}) {
    const today = epi.todayJakarta();
    const cur = epi.dateToEpi(today);

    const jobs = {
      kec: ['Master kecamatan', rest('kecamatan?select=kode_kec,slug,nama,nama_dinkes,kabupaten,kab_kode,lon,lat&order=kode_kec').then((r) => r.data)],
      fc: ['Forecast terkini', rest('forecast_terkini?select=*').then((r) => r.data)],
      thr: ['Ambang EWARS', rest('threshold_kecamatan?select=*').then((r) => r.data)],
      ec: ['Kanal endemis', restAll('endemicity_channel?select=kode_kec,minggu,ec_mean,ec_std,ec_upper_yellow,ec_upper_red&order=kode_kec,minggu')],
      models: ['Riwayat model', rest('model_runs?select=*&order=created_at.desc').then((r) => r.data)],
      runs: ['Riwayat forecast', rest('forecast_runs?select=*&order=created_at.desc&limit=60').then((r) => r.data)],
      dbd: ['Kasus DBD 2017–sekarang', restAll('dbd_weekly?select=kode_kec,tahun,minggu,kasus,is_final&order=tahun,minggu,kode_kec')],
      ikl: ['Data iklim GEE', restAll(`iklim_weekly?select=kode_kec,tahun,minggu,curah_hujan_kumulatif,curah_hujan_max_harian,suhu_rata,kelembapan_rata,sumber_hujan,jenis&tahun=gte.${cur[0] - 1}&order=tahun,minggu,kode_kec`)],
      nb: ['Ketetanggaan', rest('kecamatan_tetangga?select=kode_kec,tetangga_kode&tipe=eq.queen').then((r) => r.data)],
      fDbd: ['Status scraping', rest('dbd_weekly?select=scraped_at&order=scraped_at.desc&limit=1').then((r) => r.data)],
      fIkl: ['Status iklim', rest('iklim_weekly?select=ingested_at&order=ingested_at.desc&limit=1').then((r) => r.data)],
      rekom: ['Rekomendasi aksi', rest('rekomendasi_aksi?select=*&order=urutan').then((r) => r.data).catch(() => [])],
      warga: ['Statistik warga', rpc('statistik_warga').catch(() => null)],
    };
    const keys = Object.keys(jobs);
    let done = 0;
    const results = await Promise.all(keys.map((k) => jobs[k][1].then((v) => {
      done++;
      onProgress(done / (keys.length + 1), jobs[k][0]);
      return v;
    })));
    const raw = Object.fromEntries(keys.map((k, i) => [k, results[i]]));

    // Forecast run sebelumnya, untuk evaluasi akurasi live
    const prev = dedupeRuns(raw.runs).slice(1, 13);
    raw.fcHist = prev.length
      ? await restAll(`forecast?select=run_id,kode_kec,tahun,minggu,horizon,kasus_pred&run_id=in.(${prev.map((r) => r.id).join(',')})`)
      : [];
    // Minggu yang sudah berakhir tapi belum dirilis Dinkes (mis. W45 saat data baru sampai W44):
    // pakai prakiraan run terbaru yang pernah memuat minggu itu. Otomatis tergantikan begitu data aktual terbit.
    raw.fcEst = [];
    {
      const last = raw.dbd[raw.dbd.length - 1];
      const curIdx = epi.weekIdx(cur[0], cur[1]);
      const lastIdx = last ? epi.weekIdx(last.tahun, last.minggu) : curIdx;
      const gaps = [];
      for (let i = lastIdx + 1; i < curIdx && gaps.length < 6; i++) gaps.push(epi.idxToEpi(i));
      if (gaps.length) {
        const or = gaps.map(([y, w]) => `and(tahun.eq.${y},minggu.eq.${w})`).join(',');
        raw.fcEst = await restAll(`forecast?select=run_id,kode_kec,tahun,minggu,kasus_pred&or=(${or})&order=run_id.desc`).catch(() => []);
      }
    }
    onProgress(1, 'Menyusun indeks');

    return build(raw, today, cur, prev);
  }

  function dedupeRuns(runs) {
    const seen = new Set(), out = [];
    for (const r of runs) {
      const k = r.basis_tahun * 100 + r.basis_minggu;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    return out;
  }

  function build(raw, today, cur, prevRuns) {
    const S = { today, cur, curIdx: epi.weekIdx(cur[0], cur[1]) };

    // Kecamatan
    S.kec = raw.kec.map((k) => ({ ...k, nm: k.nama_dinkes, kota: fmt.kota(k.kabupaten) }))
      .sort((a, b) => a.kab_kode - b.kab_kode || a.nm.localeCompare(b.nm, 'id'));
    S.kecBy = new Map(S.kec.map((k) => [k.kode_kec, k]));
    S.kota = [...new Set(S.kec.map((k) => k.kota))];

    S.thr = new Map(raw.thr.map((t) => [t.kode_kec, t]));
    S.ecMap = new Map(raw.ec.map((r) => [r.kode_kec + '|' + r.minggu, r]));
    S.ecOf = (kode, minggu) => S.ecMap.get(kode + '|' + minggu) || (minggu === 53 ? S.ecMap.get(kode + '|52') : null);

    // Forecast
    const byH = new Map();
    for (const r of raw.fc) if (!byH.has(r.horizon)) byH.set(r.horizon, r);
    S.fw = [...byH.values()].sort((a, b) => a.horizon - b.horizon).map((r) => {
      const idx = epi.weekIdx(r.tahun, r.minggu);
      const d = idx - S.curIdx;
      return {
        h: r.horizon, y: r.tahun, w: r.minggu, idx, d,
        rel: d < 0 ? (d === -1 ? 'Minggu lalu' : `${-d} minggu lalu`) : d === 0 ? 'Minggu berjalan' : d === 1 ? 'Minggu depan' : `+${d} minggu`,
        range: fmt.range(r.tahun, r.minggu),
      };
    });
    S.fc = new Map();
    for (const k of S.kec) S.fc.set(k.kode_kec, new Array(S.fw.length).fill(null));
    for (const r of raw.fc) {
      const i = S.fw.findIndex((w) => w.h === r.horizon);
      if (S.fc.has(r.kode_kec) && i >= 0) S.fc.get(r.kode_kec)[i] = r;
    }
    let ci = S.fw.findIndex((w) => w.d === 0);
    S.fcStale = false;
    if (ci < 0) {
      if (S.fw.length && S.fw[S.fw.length - 1].d < 0) { ci = S.fw.length - 1; S.fcStale = true; }
      else ci = 0;
    }
    S.fcCur = ci;
    S.fcMeta = raw.fc[0] ? { at: raw.fc[0].dihitung_pada, model: raw.fc[0].model_versi } : null;
    S.fcWeekTotal = (i) => S.kec.reduce((a, k) => a + (S.fc.get(k.kode_kec)[i]?.kasus_pred || 0), 0);
    S.zoneAt = (kode, i, sys = 'ewars') => {
      const r = S.fc.get(kode)?.[i];
      return r ? (sys === 'ec' ? r.zona_ec : r.zona_ewars) : null;
    };

    // Kasus DBD
    S.dbd = new Map(S.kec.map((k) => [k.kode_kec, new Map()]));
    S.dki = new Map();
    let minI = Infinity, maxI = -Infinity;
    for (const r of raw.dbd) {
      const i = epi.weekIdx(r.tahun, r.minggu);
      const m = S.dbd.get(r.kode_kec);
      if (!m) continue;
      m.set(i, { k: r.kasus, f: r.is_final });
      const t = S.dki.get(i) || { k: 0, f: true, n: 0, y: r.tahun, w: r.minggu };
      t.k += r.kasus; t.f = t.f && r.is_final; t.n++;
      S.dki.set(i, t);
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
    }
    S.dbdMin = minI; S.dbdMax = maxI;
    S.lastFinalIdx = Math.max(...[...S.dki.entries()].filter(([, v]) => v.f).map(([i]) => i), minI);
    const [y0] = epi.idxToEpi(minI), [y1] = epi.idxToEpi(maxI);
    S.years = d3.range(y0, y1 + 1);
    // Estimasi untuk minggu yang belum dirilis Dinkes: prakiraan run terbaru yang memuat minggu itu
    S.est = new Map();
    for (const r of raw.fcEst || []) {
      const i = epi.weekIdx(r.tahun, r.minggu);
      if (i <= maxI) continue;
      if (!S.est.has(i)) S.est.set(i, new Map());
      if (!S.est.get(i).has(r.kode_kec)) S.est.get(i).set(r.kode_kec, r.kasus_pred); // urut run_id desc: yang pertama = terbaru
    }
    const estDki = new Map();
    for (const [i, m] of S.est) {
      if (m.size < S.kec.length) { S.est.delete(i); continue; } // hanya minggu yang lengkap 44 kecamatan
      const [y, w] = epi.idxToEpi(i);
      estDki.set(i, { k: [...m.values()].reduce((a, b) => a + b, 0), f: false, est: true, n: m.size, y, w });
    }
    S.histMax = Math.max(maxI, ...S.est.keys());
    S.actual = (kode, i) => {
      const real = kode ? S.dbd.get(kode)?.get(i) : S.dki.get(i);
      if (real) return real;
      if (!S.est.has(i)) return null;
      if (!kode) return estDki.get(i) || null;
      const v = S.est.get(i).get(kode);
      return v == null ? null : { k: v, f: false, est: true };
    };

    // Baseline musiman DKI: rata-rata ± SD per minggu-epi, tahun lengkap saja
    const perW = new Map();
    for (const [, v] of S.dki) {
      if (v.y >= cur[0]) continue;
      if (!perW.has(v.w)) perW.set(v.w, []);
      perW.get(v.w).push(v.k);
    }
    S.season = new Map([...perW].map(([w, a]) => [w, { mean: d3.mean(a), sd: d3.deviation(a) || 0, n: a.length }]));
    S.seasonOf = (w) => S.season.get(w) || S.season.get(52);
    S.ecDkiMean = (w) => S.kec.reduce((a, k) => a + (S.ecOf(k.kode_kec, w)?.ec_mean || 0), 0);

    // Iklim
    S.ikl = new Map(S.kec.map((k) => [k.kode_kec, new Map()]));
    const iklD = new Map();
    for (const r of raw.ikl) {
      const i = epi.weekIdx(r.tahun, r.minggu);
      S.ikl.get(r.kode_kec)?.set(i, r);
      const t = iklD.get(i) || { ch: [], suhu: [], rh: [], jenis: r.jenis };
      t.ch.push(r.curah_hujan_kumulatif); t.suhu.push(r.suhu_rata); t.rh.push(r.kelembapan_rata);
      iklD.set(i, t);
    }
    S.iklDki = new Map([...iklD].map(([i, t]) => [i, { ch: d3.mean(t.ch), suhu: d3.mean(t.suhu), rh: d3.mean(t.rh), jenis: t.jenis }]));

    // Model
    S.models = raw.models.map((m) => ({
      ...m,
      isRefit: !!(m.cv_detail && !Array.isArray(m.cv_detail) && m.cv_detail.refit_dari),
      fi: normFI(m.feature_importance),
    }));
    S.active = S.models.find((m) => m.is_active) || S.models[0] || null;
    S.lastRetune = S.models.find((m) => !m.isRefit) || null;
    // Metrik utama yang ditampilkan di seluruh aplikasi: evaluasi riset fold 3 (uji 2025)
    // untuk LightGBM, model 20 fitur (sama dengan model produksi). Metrik per-run di database (fold terakhir/refit)
    // tetap tampil di halaman Model & Evaluasi sebagai riwayat versi.
    {
      const best = (window.DG_SNAP?.models || []).find((m) => m.key === 'lightgbm');
      S.headline = best
        ? { r2: best.R2, mae: best.MAE, rmse: best.RMSE, mape: best.MAPE, label: 'Fold 3 · uji 2025', snap: true }
        : { r2: S.active?.r2, mae: S.active?.mae, rmse: S.active?.rmse, mape: S.active?.mape, label: 'Model aktif', snap: false };
    }
    S.FEATURES = FEATURES; S.DOMAINS = DOMAINS;

    S.runs = raw.runs;
    S.prevRuns = prevRuns;
    S.fcHist = raw.fcHist;

    S.nb = new Map();
    for (const r of raw.nb) {
      if (!S.nb.has(r.kode_kec)) S.nb.set(r.kode_kec, []);
      S.nb.get(r.kode_kec).push(r.tetangga_kode);
    }

    S.fresh = {
      dbd: raw.fDbd[0]?.scraped_at || null,
      ikl: raw.fIkl[0]?.ingested_at || null,
      fc: raw.runs[0]?.created_at || null,
      model: S.active?.created_at || null,
    };

    S.rekomDefault = !raw.rekom.length;
    S.rekom = (raw.rekom.length ? raw.rekom : DEFAULT_REKOM).map((r) => ({ ...r, judul: String(r.judul).replace(/Radensa/g, 'DENGUARD'), deskripsi: String(r.deskripsi).replace(/Radensa/g, 'DENGUARD') }));
    S.warga = raw.warga ? new Map(raw.warga.map((r) => [r.kode_kec, Number(r.jumlah)])) : null;

    // Urutan prioritas pada minggu forecast ke-i
    // Ambang < 1 kasus (mis. Kep. Seribu, P75 = 0) membuat perkiraan sangat
    // kecil pun jatuh ke zona merah; ditandai supaya tidak salah dibaca.
    S.priority = (i, sys = 'ewars', by = 'zona') => S.kec.map((k) => {
      const r = S.fc.get(k.kode_kec)[i];
      const z = r ? (sys === 'ec' ? r.zona_ec : r.zona_ewars) : null;
      const thr = S.thr.get(k.kode_kec);
      const ec = r ? S.ecOf(k.kode_kec, r.minggu) : null;
      const ref = sys === 'ec' ? (ec?.ec_upper_yellow ?? null) : (thr?.p75 ?? null);
      const pred = r?.kasus_pred ?? null;
      return { k, r, z, pred, ref, lowThr: ref != null && ref < 1, ratio: r ? pred / Math.max(ref ?? 1, 0.5) : 0 };
    }).sort((a, b) => by === 'kasus'
      ? (b.pred ?? -1) - (a.pred ?? -1)
      : (R.zone.ZRANK[b.z] || 0) - (R.zone.ZRANK[a.z] || 0) || (a.lowThr - b.lowThr) || b.ratio - a.ratio);

    return S;
  }

  // Seluruh riwayat iklim (2017–sekarang) dimuat malas, hanya saat halaman
  // Eksplorasi Data meminta korelasi iklim.
  let iklAllP = null;
  function loadIklimAll() {
    if (!iklAllP) {
      iklAllP = restAll('iklim_weekly?select=kode_kec,tahun,minggu,curah_hujan_kumulatif,suhu_rata,kelembapan_rata&order=tahun,minggu,kode_kec')
        .catch((e) => { iklAllP = null; throw e; });
    }
    return iklAllP;
  }

  R.data = { load, rest, restAll, loadIklimAll };
})();

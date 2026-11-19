(function () {
  const R = window.R;
  const { epi, fmt, u } = R;

  // ---------------------------------------------------------------
  // Registry: grafik digambar ulang saat lebar berubah / ganti tema.
  // ---------------------------------------------------------------
  const registry = new Set();
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const c = e.target.__chart;
      if (!c) continue;
      const w = Math.round(e.contentRect.width);
      if (w && w !== c.w) { c.w = w; c.draw(); }
    }
  });
  function mount(el, draw) {
    if (el.__chart) { el.__chart.draw = () => draw(el); }
    else {
      el.__chart = { w: el.clientWidth, draw: () => draw(el) };
      registry.add(el);
      ro.observe(el);
    }
    el.__chart.draw();
  }
  function redrawAll() {
    for (const el of [...registry]) {
      if (!el.isConnected) { ro.unobserve(el); registry.delete(el); continue; }
      el.__chart.draw();
    }
  }

  // ---------------------------------------------------------------
  // Sumbu-x mingguan (indeks minggu epi)
  // ---------------------------------------------------------------
  function weekTicks(i0, i1) {
    const span = i1 - i0, out = [];
    for (let i = Math.ceil(i0); i <= i1; i++) {
      const d = epi.idxToDate(i);
      if (d.getUTCDate() > 7) continue;
      const mo = d.getUTCMonth(), yr = d.getUTCFullYear();
      if (span > 150) { if (mo === 0) out.push({ v: i, label: String(yr) }); }
      else if (span > 70) { if (mo % 3 === 0) out.push({ v: i, label: mo === 0 ? `Jan ${yr}` : fmt.BLN[mo] }); }
      else out.push({ v: i, label: mo === 0 ? `Jan ${yr}` : fmt.BLN[mo] });
    }
    return out;
  }
  // Minggu-epi 1..53 -> perkiraan awal bulan (untuk grafik tumpang-tindih tahunan)
  const MONTH_WEEKS = [1, 5, 9, 14, 18, 22, 27, 31, 36, 40, 44, 49].map((v, i) => ({ v, label: fmt.BLN[i] }));

  const CURVES = { step: d3.curveStep, smooth: d3.curveMonotoneX, linear: d3.curveLinear };

  // ---------------------------------------------------------------
  // Core XY: semua grafik deret waktu memakai ini.
  // ---------------------------------------------------------------
  function xy(el, o) {
    mount(el, () => drawXY(el, o));
  }

  function drawXY(el, o) {
    const W = el.clientWidth || 600, H = o.height || 260;
    const m = Object.assign({ t: o.y?.label ? 26 : 18, r: 14, b: 26, l: 42 }, o.margin);
    const iw = Math.max(50, W - m.l - m.r), ih = H - m.t - m.b;
    const x = d3.scaleLinear().domain([o.x.min - 0.5, o.x.max + 0.5]).range([0, iw]);

    let ymax = o.y?.max;
    if (ymax == null) {
      ymax = 0;
      for (const L of o.layers) {
        if (L.axis === 'y2') continue;
        if (L.type === 'hline') ymax = Math.max(ymax, L.y);
        for (const d of L.data || []) ymax = Math.max(ymax, d.y ?? 0, d.y1 ?? 0);
      }
      ymax = ymax * 1.08 || 1;
    }
    const y = d3.scaleLinear().domain([o.y?.min ?? 0, ymax]).nice(o.y?.ticks || 5).range([ih, 0]);
    const yFmt = o.y?.format || ((v) => fmt.num(v, v < 10 && v % 1 ? 1 : 0));
    let y2 = null;
    if (o.y2) {
      const vals = o.layers.filter((L) => L.axis === 'y2').flatMap((L) => (L.data || []).map((d) => d.y)).filter((v) => v != null);
      const lo = o.y2.min ?? d3.min(vals), hi = o.y2.max ?? d3.max(vals);
      y2 = d3.scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).nice(4).range([ih, 0]);
    }
    const Y = (L) => (L.axis === 'y2' && y2 ? y2 : y);

    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const defs = svg.append('defs');
    const hid = 'h' + Math.random().toString(36).slice(2, 8);
    defs.append('pattern').attr('id', hid).attr('width', 5).attr('height', 5).attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(45)')
      .append('rect').attr('width', 2).attr('height', 5).style('fill', 'var(--ink-3)').style('opacity', 0.55);
    const clipId = 'c' + hid;
    defs.append('clipPath').attr('id', clipId).append('rect').attr('width', iw).attr('height', ih + 1);

    const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);

    // grid + y axis
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(o.y?.ticks || 5).tickSize(-iw).tickFormat(''));
    const ya = g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(o.y?.ticks || 5).tickSize(0).tickPadding(8).tickFormat(yFmt));
    ya.select('.domain').remove();
    if (o.y?.label) g.append('text').attr('class', 'ylab').attr('x', -m.l + 2).attr('y', -14).text(o.y.label);
    if (y2) {
      const a2 = g.append('g').attr('class', 'axis').attr('transform', `translate(${iw},0)`)
        .call(d3.axisRight(y2).ticks(4).tickSize(0).tickPadding(8).tickFormat(o.y2.format || ((v) => fmt.num(v, 1))));
      a2.select('.domain').remove();
      if (o.y2.label) g.append('text').attr('class', 'ylab').attr('x', iw + m.r - 2).attr('y', -14).attr('text-anchor', 'end').text(o.y2.label);
    }

    // x axis (dengan penipisan label)
    let ticks = o.x.ticks || [];
    const maxLabels = Math.max(2, Math.floor(iw / (o.x.minLabelGap || 52)));
    if (ticks.length > maxLabels) {
      const k = Math.ceil(ticks.length / maxLabels);
      ticks = ticks.filter((_, i) => i % k === 0);
    }
    const xa = g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickValues(ticks.map((t) => t.v)).tickFormat((v, i) => ticks[i].label).tickSize(4).tickPadding(6));
    xa.select('.domain').style('stroke', 'var(--line-2)');

    const plot = g.append('g').attr('clip-path', `url(#${clipId})`);

    // wilayah forecast
    if (o.forecastFrom != null) {
      const fx = x(o.forecastFrom - 0.5);
      plot.append('rect').attr('class', 'fc-region').attr('x', fx).attr('y', 0).attr('width', Math.max(0, iw - fx)).attr('height', ih);
      if (o.forecastLabel !== false && iw - fx >= 90) g.append('text').attr('class', 'fc-lbl').attr('x', iw - 4).attr('y', 11).attr('text-anchor', 'end').text('PERKIRAAN');
    }

    // pemisah tahun
    if (o.yearSeps) {
      for (let i = Math.ceil(o.x.min); i <= o.x.max; i++) {
        const [, w] = epi.idxToEpi(i);
        if (w !== 1 || i === Math.ceil(o.x.min)) continue;
        const [yr] = epi.idxToEpi(i);
        plot.append('line').attr('class', 'yr-sep').attr('x1', x(i - 0.5)).attr('x2', x(i - 0.5)).attr('y1', 0).attr('y2', ih);
        if (o.yearSeps === 'label') g.append('text').attr('class', 'yr-lbl').attr('x', x(i - 0.5) + 4).attr('y', 11).text(yr);
      }
    }

    const bw = Math.max(1, x(1) - x(0));
    for (const L of o.layers) {
      const curve = CURVES[L.curve || 'smooth'];
      const y = Y(L);
      if (L.type === 'band') {
        const data = L.data.filter((d) => d.y0 != null && d.y1 != null);
        if (L.curve === 'step') {
          const pts = [];
          for (const d of data) { pts.push({ x: d.x - 0.5, y0: d.y0, y1: d.y1 }); pts.push({ x: d.x + 0.5, y0: d.y0, y1: d.y1 }); }
          plot.append('path').attr('d', d3.area().x((d) => x(d.x)).y0((d) => y(d.y0)).y1((d) => y(d.y1)).curve(d3.curveLinear)(pts))
            .style('fill', L.fill).style('stroke', 'none');
        } else {
          plot.append('path').attr('d', d3.area().x((d) => x(d.x)).y0((d) => y(d.y0)).y1((d) => y(d.y1)).curve(curve)(data))
            .style('fill', L.fill).style('stroke', 'none');
        }
      } else if (L.type === 'area') {
        let fill = L.fill;
        if (L.grad) {
          const gid = 'g' + Math.random().toString(36).slice(2, 8);
          const lg = defs.append('linearGradient').attr('id', gid).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
          lg.append('stop').attr('offset', '0%').attr('stop-color', L.grad[0]).attr('stop-opacity', L.grad[1]);
          lg.append('stop').attr('offset', '100%').attr('stop-color', L.grad[0]).attr('stop-opacity', L.grad[2]);
          fill = `url(#${gid})`;
        }
        plot.append('path').attr('d', d3.area().defined((d) => d.y != null).x((d) => x(d.x)).y0(y(0)).y1((d) => y(d.y)).curve(curve)(L.data))
          .style('fill', fill).style('stroke', 'none');
      } else if (L.type === 'line') {
        plot.append('path').attr('d', d3.line().defined((d) => d.y != null).x((d) => x(d.x)).y((d) => y(d.y)).curve(curve)(L.data))
          .style('fill', 'none').style('stroke', L.stroke).style('stroke-width', L.width || 1.6)
          .style('stroke-dasharray', L.dash || null).style('opacity', L.opacity ?? 1).style('stroke-linejoin', 'round').style('stroke-linecap', 'round');
      } else if (L.type === 'bars') {
        const pad = L.pad ?? 0.18;
        const sel = plot.append('g').selectAll('rect').data(L.data.filter((d) => d.y != null)).join('rect')
          .attr('x', (d) => x(d.x - 0.5) + (bw * pad) / 2).attr('width', Math.max(1, bw * (1 - pad)))
          .attr('y', (d) => y(Math.max(0, d.y))).attr('height', (d) => Math.max(0, y(0) - y(Math.max(0, d.y))))
          .attr('rx', bw > 8 ? 1.5 : 0)
          .style('fill', (d) => (d.hatch ? `url(#${hid})` : d.fill || L.fill));
        if (L.stroke) sel.style('stroke', (d) => d.stroke || L.stroke).style('stroke-width', 1);
      } else if (L.type === 'dots') {
        const pts = L.data.filter((d) => d.y != null);
        plot.append('g').selectAll('circle').data(pts).join('circle')
          .attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', L.r || 3)
          .style('fill', (d) => d.fill || L.fill || 'var(--panel)').style('stroke', (d) => d.stroke || L.stroke || 'var(--accent)').style('stroke-width', L.sw || 1.6);
        if (L.label) {
          g.append('g').selectAll('text').data(pts).join('text')
            .attr('x', (d) => x(d.x)).attr('y', (d) => y(d.y) - (L.r || 3) - 7).attr('text-anchor', 'middle')
            .attr('class', 'big-lbl').style('font-size', '11.5px').text((d) => L.label(d));
        }
      } else if (L.type === 'vline') {
        plot.append('line').attr('x1', x(L.x)).attr('x2', x(L.x)).attr('y1', 0).attr('y2', ih)
          .style('stroke', L.stroke || 'var(--brand)').style('stroke-width', L.width || 1.6).style('stroke-dasharray', L.dash || null);
      } else if (L.type === 'hline') {
        plot.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(L.y)).attr('y2', y(L.y))
          .style('stroke', L.stroke).style('stroke-width', 1).style('stroke-dasharray', L.dash || '4 3');
        if (L.label) g.append('text').attr('x', iw - 4).attr('y', y(L.y) - 4).attr('text-anchor', 'end')
          .style('fill', L.stroke).style('font-size', '10.5px').style('font-weight', 700).text(L.label);
      }
    }

    // garis "hari ini"
    if (o.today != null) {
      const tx = x(o.today);
      g.append('line').attr('class', 'today-line').attr('x1', tx).attr('x2', tx).attr('y1', 0).attr('y2', ih);
      g.append('text').attr('class', 'today-lbl').attr('x', tx).attr('y', -5).attr('text-anchor', 'middle').text('Hari ini');
    }

    // hover
    if (o.hover) {
      const xs = o.hover.xs.slice().sort((a, b) => a - b);
      const hl = g.append('line').attr('class', 'hover-line').attr('y1', 0).attr('y2', ih).style('display', 'none');
      const marks = g.append('g');
      const bis = d3.bisector((d) => d).center;
      g.append('rect').attr('width', iw).attr('height', ih).style('fill', 'transparent')
        .on('mousemove', (ev) => {
          const [mx] = d3.pointer(ev);
          const v = xs[bis(xs, x.invert(mx))];
          if (v == null) return;
          hl.style('display', null).attr('x1', x(v)).attr('x2', x(v));
          marks.selectAll('*').remove();
          for (const mk of (o.hover.marks ? o.hover.marks(v) : [])) {
            if (mk.y == null) continue;
            marks.append('circle').attr('cx', x(v)).attr('cy', (mk.axis === 'y2' && y2 ? y2 : y)(mk.y)).attr('r', 3.5)
              .style('fill', 'var(--panel)').style('stroke', mk.color).style('stroke-width', 2);
          }
          u.tip.show(o.hover.html(v), ev);
        })
        .on('mouseleave', () => { hl.style('display', 'none'); marks.selectAll('*').remove(); u.tip.hide(); })
        .on('click', (ev) => {
          if (!o.hover.onClick) return;
          const [mx] = d3.pointer(ev);
          const v = xs[bis(xs, x.invert(mx))];
          if (v != null) o.hover.onClick(v);
        });
    }
  }

  // ---------------------------------------------------------------
  // Heatmap baris × kolom
  // ---------------------------------------------------------------
  function heatColor(max) {
    const stops = ['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4'].map(u.css);
    return d3.scaleSequentialSqrt(d3.interpolateRgbBasis(stops)).domain([0, Math.max(1, max)]);
  }

  function heatmap(el, o) {
    mount(el, () => drawHeat(el, o));
  }
  function drawHeat(el, o) {
    const W = el.clientWidth || 800;
    const labelW = o.labelW ?? 130, top = o.top ?? 18, ch = o.cellH || 12, gap = o.gap ?? 1;
    const cw = Math.max(4, Math.floor((W - labelW - 8) / o.cols.length));
    const rows = [];
    let yy = top, lastGroup = null;
    for (const r of o.rows) {
      if (o.groupBy && r.group !== lastGroup) {
        if (lastGroup !== null) yy += 6;
        rows.push({ grp: r.group, y: yy + 10 });
        yy += 16;
        lastGroup = r.group;
      }
      rows.push({ ...r, y: yy });
      yy += ch + gap;
    }
    const H = yy + 4;
    const color = heatColor(o.max);
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('class', 'heat').attr('width', labelW + cw * o.cols.length + 4).attr('height', H);
    // label kolom
    for (let j = 0; j < o.cols.length; j++) {
      const c = o.cols[j];
      if (c.label) svg.append('text').attr('x', labelW + j * cw).attr('y', 11).text(c.label);
    }
    const cells = svg.append('g');
    for (const r of rows) {
      if (r.grp) { svg.append('text').attr('class', 'grp').attr('x', 0).attr('y', r.y).text(r.grp.toUpperCase()); continue; }
      const lbl = svg.append('text').attr('class', 'rowlbl').attr('x', labelW - 8).attr('y', r.y + ch - 2).attr('text-anchor', 'end').text(r.label);
      if (o.onRow) lbl.style('cursor', 'pointer').on('click', () => o.onRow(r.key));
      for (let j = 0; j < o.cols.length; j++) {
        const v = o.value(r.key, o.cols[j].v);
        cells.append('rect').attr('class', 'c').attr('x', labelW + j * cw).attr('y', r.y)
          .attr('width', Math.max(1, cw - gap)).attr('height', ch).attr('rx', cw > 8 ? 1.5 : 0)
          .attr('data-r', r.key).attr('data-c', j)
          .style('fill', v == null ? 'transparent' : color(v))
          .style('stroke', v == null ? 'var(--line)' : null).style('stroke-dasharray', v == null ? '2 2' : null);
      }
    }
    if (o.tip) {
      cells.on('mousemove', (ev) => {
        const t = ev.target;
        if (!t.dataset || t.dataset.r == null) return;
        const c = o.cols[+t.dataset.c];
        u.tip.show(o.tip(t.dataset.r, c.v, o.value(t.dataset.r, c.v)), ev);
      }).on('mouseleave', () => u.tip.hide());
      if (o.onRow) cells.style('cursor', 'pointer').on('click', (ev) => ev.target.dataset?.r && o.onRow(ev.target.dataset.r));
    }
  }
  function heatScale(max) {
    const c = heatColor(max);
    const stops = d3.range(0, 1.01, 0.1).map((t) => c(t * t * max)).join(',');
    return `<div class="heat-scale"><span>0</span><i style="background:linear-gradient(90deg,${stops})"></i><span>${fmt.num(max)}</span></div>`;
  }

  // ---------------------------------------------------------------
  // Sparkline (string SVG) — aktual solid, perkiraan putus-putus
  // ---------------------------------------------------------------
  function spark(vals, split, { w = 92, h = 26, color = 'var(--accent)' } = {}) {
    const max = Math.max(1, ...vals.filter((v) => v != null));
    const n = vals.length;
    const X = (i) => 2 + (i * (w - 4)) / Math.max(1, n - 1);
    const Y = (v) => h - 3 - (v / max) * (h - 6);
    const path = (from, to) => {
      let d = '', pen = false;
      for (let i = from; i <= to; i++) {
        if (vals[i] == null) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(vals[i]).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    const a = path(0, Math.max(0, split - 1));
    const f = path(Math.max(0, split - 1), n - 1);
    const li = n - 1;
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <path d="${a}" fill="none" style="stroke:var(--ink-3)" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="${f}" fill="none" style="stroke:${color}" stroke-width="1.6" stroke-dasharray="3 2" stroke-linejoin="round"/>
      ${vals[li] != null ? `<circle cx="${X(li)}" cy="${Y(vals[li])}" r="2.2" style="fill:${color}"/>` : ''}
    </svg>`;
  }

  // Baris tooltip
  const tr = (label, val, color) => `<div class="t-r"><span>${color ? `<i class="lg-sw" style="background:${color}"></i>` : ''}${label}</span><b>${val}</b></div>`;

  // ---------------------------------------------------------------
  // Donat: distribusi (mis. zona)
  // o: { parts:[{label,value,color}], size, thick, center:{big,small} }
  // ---------------------------------------------------------------
  function donut(el, o) { mount(el, () => drawDonut(el, o)); }
  function drawDonut(el, o) {
    const size = o.size || 190, r = size / 2, th = o.thick || 24;
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('width', size).attr('height', size).style('margin', '0 auto');
    const g = svg.append('g').attr('transform', `translate(${r},${r})`);
    const total = d3.sum(o.parts, (p) => p.value) || 1;
    const arc = d3.arc().innerRadius(r - th).outerRadius(r - 2).cornerRadius(5);
    g.selectAll('path').data(d3.pie().sort(null).value((p) => p.value).padAngle(0.035)(o.parts)).join('path')
      .attr('d', arc).style('fill', (d) => d.data.color)
      .on('mousemove', (ev, d) => u.tip.show(`<div class="t-h">${d.data.label}</div>${tr('Kecamatan', fmt.num(d.data.value))}${tr('Porsi', fmt.pct(d.data.value / total, 0))}`, ev))
      .on('mouseleave', () => u.tip.hide());
    if (o.center) {
      g.append('text').attr('class', 'big-lbl').attr('text-anchor', 'middle').attr('y', o.center.small ? 4 : 9).style('font-size', '32px').style('font-weight', 800).text(o.center.big);
      if (o.center.small) g.append('text').attr('text-anchor', 'middle').attr('y', 24).style('font-size', '11.5px').style('fill', 'var(--ink-3)').text(o.center.small);
    }
  }

  // ---------------------------------------------------------------
  // Radar: perbandingan beberapa seri pada beberapa sumbu (nilai 0..1)
  // o: { axes:[label], series:[{name,color,values,width,fillOpacity}], size }
  // ---------------------------------------------------------------
  function radar(el, o) { mount(el, () => drawRadar(el, o)); }
  function drawRadar(el, o) {
    const W = Math.min(el.clientWidth || 420, o.size || 460), H = W, r = W / 2 - 62, n = o.axes.length;
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).style('margin', '0 auto');
    const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);
    const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
    const pt = (i, v) => [Math.cos(ang(i)) * r * v, Math.sin(ang(i)) * r * v];
    for (const lv of [0.25, 0.5, 0.75, 1]) {
      g.append('polygon').attr('points', o.axes.map((_, i) => pt(i, lv).join(',')).join(' '))
        .style('fill', 'none').style('stroke', 'var(--line-2)').style('stroke-dasharray', lv === 1 ? null : '3 4');
    }
    o.axes.forEach((a, i) => {
      const [x, y] = pt(i, 1);
      g.append('line').attr('x1', 0).attr('y1', 0).attr('x2', x).attr('y2', y).style('stroke', 'var(--line)');
      const [lx, ly] = pt(i, 1.2);
      g.append('text').attr('x', lx).attr('y', ly + 4).attr('text-anchor', Math.abs(lx) < 8 ? 'middle' : lx > 0 ? 'start' : 'end')
        .style('font-size', '11.5px').style('font-weight', 700).style('fill', 'var(--ink-2)').text(a);
    });
    for (const s of o.series) {
      g.append('polygon').attr('points', s.values.map((v, i) => pt(i, Math.max(0.02, v)).join(',')).join(' '))
        .style('fill', s.color).style('fill-opacity', s.fillOpacity ?? 0.12).style('stroke', s.color).style('stroke-width', s.width || 1.6).style('stroke-linejoin', 'round');
      if (s.dots) s.values.forEach((v, i) => { const [x, y] = pt(i, Math.max(0.02, v)); g.append('circle').attr('cx', x).attr('cy', y).attr('r', 3.2).style('fill', s.color); });
    }
  }

  // ---------------------------------------------------------------
  // Scatter prediksi vs aktual, garis diagonal ideal
  // o: { points:[[aktual,prediksi]], height, color }
  // ---------------------------------------------------------------
  function scatter(el, o) { mount(el, () => drawScatter(el, o)); }
  function drawScatter(el, o) {
    const W = el.clientWidth || 600, H = o.height || 330, m = { t: 12, r: 14, b: 38, l: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = Math.ceil(d3.max(o.points, (p) => Math.max(p[0], p[1])) * 1.05) || 10;
    const x = d3.scaleLinear().domain([0, max]).nice().range([0, iw]);
    const y = d3.scaleLinear().domain([0, max]).nice().range([ih, 0]);
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(''));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8)).select('.domain').remove();
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6).tickSize(4).tickPadding(6));
    g.append('text').attr('class', 'ylab').attr('x', iw / 2).attr('y', ih + 32).attr('text-anchor', 'middle').text('Kasus aktual');
    g.append('text').attr('class', 'ylab').attr('transform', `translate(-34,${ih / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('Kasus prediksi');
    g.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(x.domain()[1])).attr('y2', y(y.domain()[1]))
      .style('stroke', 'var(--ink-3)').style('stroke-dasharray', '5 4').style('stroke-width', 1.3);
    g.append('g').selectAll('circle').data(o.points).join('circle')
      .attr('cx', (p) => x(p[0])).attr('cy', (p) => y(p[1])).attr('r', 3.2)
      .style('fill', o.color || 'var(--brand)').style('fill-opacity', 0.42).style('stroke', o.color || 'var(--brand)').style('stroke-opacity', 0.7).style('stroke-width', 0.6);
  }

  R.charts = { mount, redrawAll, xy, heatmap, heatScale, heatColor, spark, weekTicks, MONTH_WEEKS, tr, donut, radar, scatter };
})();

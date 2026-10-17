/* Grafici SVG minimali (nessuna libreria esterna). */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const nice = max => { const p = Math.pow(10, Math.floor(Math.log10(max || 1))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

  function frame(w, h, m, title, ylab, ymax, xlab) {
    let s = `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="${esc(title)}" xmlns="${NS}">`;
    s += `<text x="${m.l}" y="16" class="ct">${esc(title)}</text>`;
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    for (let i = 0; i <= 4; i++) {
      const y = m.t + ih - ih * i / 4, v = ymax * i / 4;
      s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y}" y2="${y}" class="grid"/><text x="${m.l - 6}" y="${y + 4}" class="ax" text-anchor="end">${+v.toFixed(2)}</text>`;
    }
    s += `<text x="${12}" y="${m.t + ih / 2}" class="ax" transform="rotate(-90 12 ${m.t + ih / 2})" text-anchor="middle">${esc(ylab)}</text>`;
    if (xlab) s += `<text x="${m.l + iw / 2}" y="${h - 4}" class="ax" text-anchor="middle">${esc(xlab)}</text>`;
    return { s, iw, ih };
  }

  /* barre per ordine armonico: bars[h] valori, limit[h] opzionale, bars2[h] confronto */
  function spectrum(opt) {
    const w = 720, h = 260, m = { l: 48, r: 12, t: 28, b: 34 };
    const H = opt.hmax || 50;
    let max = 0;
    for (let k = 2; k <= H; k++) { max = Math.max(max, opt.vals[k] || 0, opt.limit ? (opt.limit[k] || 0) : 0, opt.vals2 ? (opt.vals2[k] || 0) : 0); }
    const ymax = nice(max * 1.1 || 1);
    const f = frame(w, h, m, opt.title, opt.unit, ymax, 'ordine armonico h');
    let s = f.s; const bw = f.iw / (H - 1);
    const X = k => m.l + (k - 2) * bw, Y = v => m.t + f.ih - f.ih * Math.min(v / ymax, 1);
    for (let k = 2; k <= H; k++) {
      const v = opt.vals[k] || 0, over = opt.limit && v > (opt.limit[k] || Infinity);
      if (opt.vals2) { const v2 = opt.vals2[k] || 0; s += `<rect x="${X(k) + bw * 0.05}" y="${Y(v2)}" width="${bw * 0.4}" height="${m.t + f.ih - Y(v2)}" class="bar2"/>`;
        s += `<rect x="${X(k) + bw * 0.5}" y="${Y(v)}" width="${bw * 0.4}" height="${m.t + f.ih - Y(v)}" class="${over ? 'bko' : 'bar'}"><title>h${k}: ${v.toFixed(2)}</title></rect>`; }
      else s += `<rect x="${X(k) + bw * 0.12}" y="${Y(v)}" width="${bw * 0.76}" height="${m.t + f.ih - Y(v)}" class="${over ? 'bko' : 'bar'}"><title>h${k}: ${v.toFixed(2)}</title></rect>`;
      if (k % 2 === 1 && (k <= 13 || k % 6 === 5 || k % 6 === 1) && k % 3 !== 0 || k === 2) s += `<text x="${X(k) + bw / 2}" y="${h - 18}" class="ax" text-anchor="middle">${k}</text>`;
    }
    if (opt.limit) {
      let d = '';
      for (let k = 2; k <= H; k++) { const l = opt.limit[k]; if (l == null) continue; d += (d ? 'L' : 'M') + (X(k)) + ' ' + Y(l) + 'L' + (X(k) + bw) + ' ' + Y(l); }
      s += `<path d="${d}" class="lim"/>`;
    }
    if (opt.legend) s += `<text x="${w - m.r}" y="16" class="ax" text-anchor="end">${esc(opt.legend)}</text>`;
    return s + '</svg>';
  }

  function lines(opt) { // series: [{name,x[],y[],cls}]
    const w = 720, h = 260, m = { l: 52, r: 12, t: 28, b: 34 };
    let xmin = Infinity, xmax = -Infinity, ymax = 0;
    opt.series.forEach(se => se.x.forEach((x, i) => { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymax = Math.max(ymax, se.y[i]); }));
    ymax = nice((opt.ymax || ymax) * 1.05);
    const f = frame(w, h, m, opt.title, opt.unit, ymax, opt.xlab);
    let s = f.s;
    const X = x => m.l + (x - xmin) / (xmax - xmin) * f.iw, Y = y => m.t + f.ih - f.ih * Math.min(Math.max(y / ymax, opt.neg ? -1 : 0), 1);
    if (opt.marks) opt.marks.forEach(k => { s += `<line x1="${X(k)}" x2="${X(k)}" y1="${m.t}" y2="${m.t + f.ih}" class="mark"/><text x="${X(k)}" y="${h - 18}" class="ax" text-anchor="middle">${k}</text>`; });
    opt.series.forEach(se => {
      let d = ''; se.x.forEach((x, i) => { d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(se.y[i]).toFixed(1); });
      s += `<path d="${d}" class="${se.cls || 'ln1'}"/>`;
    });
    const lx = m.l + 8; opt.series.forEach((se, i) => { s += `<text x="${w - m.r - 4}" y="${m.t + 12 + i * 14}" text-anchor="end" class="ax lg-${se.cls || 'ln1'}">● ${esc(se.name)}</text>`; });
    return s + '</svg>';
  }

  function wave(opt) { // i[], v[] normalizzati ai propri massimi
    const w = 720, h = 240, m = { l: 48, r: 12, t: 28, b: 30 };
    const imax = Math.max(...opt.i.map(Math.abs)) || 1, vmax = Math.max(...opt.v.map(Math.abs)) || 1;
    const iw = w - m.l - m.r, ih = h - m.t - m.b, cy = m.t + ih / 2;
    let s = `<svg viewBox="0 0 ${w} ${h}" class="chart" xmlns="${NS}"><text x="${m.l}" y="16" class="ct">${esc(opt.title)}</text>`;
    s += `<line x1="${m.l}" x2="${w - m.r}" y1="${cy}" y2="${cy}" class="grid"/>`;
    const path = (arr, mx, ref) => arr.map((y, n) => (n ? 'L' : 'M') + (m.l + n / (arr.length - 1) * iw).toFixed(1) + ' ' + (cy - y / mx * ih / 2 * 0.95).toFixed(1)).join('');
    const sin = opt.v.map((_, n) => Math.sin(2 * Math.PI * n / (opt.v.length - 1)) * opt.vref);
    s += `<path d="${path(sin, vmax)}" class="ref"/>`;
    s += `<path d="${path(opt.v, vmax)}" class="ln1"/><path d="${path(opt.i, imax)}" class="ln2"/>`;
    s += `<text x="${w - m.r - 4}" y="${m.t + 12}" text-anchor="end" class="ax lg-ln1">● tensione sbarra (picco ${vmax.toFixed(0)} V)</text>`;
    s += `<text x="${w - m.r - 4}" y="${m.t + 26}" text-anchor="end" class="ax lg-ln2">● corrente inverter (picco ${imax.toFixed(0)} A)</text>`;
    s += `<text x="${m.l}" y="${h - 6}" class="ax">0°</text><text x="${w - m.r}" y="${h - 6}" class="ax" text-anchor="end">360°</text>`;
    return s + '</svg>';
  }

  function hbars(opt) { // [{label,value,limit,status}]
    const rowH = 24, w = 720, h = 34 + opt.rows.length * rowH, m = { l: 230, r: 60 };
    let s = `<svg viewBox="0 0 ${w} ${h}" class="chart" xmlns="${NS}"><text x="8" y="16" class="ct">${esc(opt.title)}</text>`;
    const iw = w - m.l - m.r, scale = iw / 1.5;
    s += `<line x1="${m.l + scale}" x2="${m.l + scale}" y1="24" y2="${h - 4}" class="lim"/>`;
    s += `<text x="${m.l + scale}" y="${h - 0}" class="ax" text-anchor="middle">100% limite</text>`;
    opt.rows.forEach((r, i) => {
      const y = 30 + i * rowH, len = Math.min(r.util, 1.5) * scale;
      s += `<text x="${m.l - 8}" y="${y + 13}" class="ax" text-anchor="end">${esc(r.label.length > 38 ? r.label.slice(0, 37) + '…' : r.label)}</text>`;
      s += `<rect x="${m.l}" y="${y}" width="${Math.max(len, 1)}" height="16" class="st-${r.status}" rx="3"/>`;
      s += `<text x="${m.l + len + 6}" y="${y + 13}" class="ax">${(r.util * 100).toFixed(0)}%</text>`;
    });
    return s + '</svg>';
  }

  root.Charts = { spectrum, lines, wave, hbars };
})(typeof self !== 'undefined' ? self : this);

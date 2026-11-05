/* ===================================================================
   Oberfläche Teil 2: Diagramme (SVG, ohne Bibliothek)
   =================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';
function niceStep(span, n) { const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
function niceTicks(min, max, n = 5) {
  if (!(max > min)) { max = min + 1; }
  const st = niceStep(max - min, n), a = Math.ceil(min / st - 1e-9) * st, out = [];
  for (let v = a; v <= max + st * 1e-6; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
  return out;
}
function niceRange(vals, padTop = 0.06, incl0 = false) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) if (fin(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!fin(lo)) return [0, 1];
  if (incl0) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi === lo) { hi += 1; lo -= incl0 && lo === 0 ? 0 : 1; }
  const st = niceStep(hi - lo, 5);
  return [Math.floor(lo / st) * st, Math.ceil((hi + (hi - lo) * padTop) / st) * st];
}
const cw = el => Math.max(260, Math.floor(el.clientWidth || el.parentElement.clientWidth || 640));
const sCls = c => (typeof c === 'number' ? 'c' + c : c === 'solar' ? 'c2' : c === 'cons' ? 'c1' : c === 'batt' ? 'c3' : 'c1');
function legendHTML(series) {
  return `<span class="legend">${series.filter(s => s.name).map(s => `<span><i class="b${sCls(s.c)}${s.dash ? ' dash' : ''}" style="${s.dash ? 'color:var(--' + sCls(s.c) + ')' : ''}"></i>${esc(s.name)}</span>`).join('')}</span>`;
}

/* ---------- Liniendiagramm mit Fadenkreuz ---------- */
function lineChart(el, cfg) {
  el._cfg = cfg; el._fn = lineChart;
  const W = cw(el), H = cfg.h || 220, m = { l: cfg.ml || 50, r: 16, t: 12, b: cfg.x.title ? 40 : 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xs = v => m.l + (v - cfg.x.min) / (cfg.x.max - cfg.x.min) * iw, ys = v => m.t + ih - (v - cfg.y.min) / (cfg.y.max - cfg.y.min) * ih;
  const xt = cfg.x.ticks || niceTicks(cfg.x.min, cfg.x.max, Math.max(3, Math.floor(iw / 80))), yt = cfg.y.ticks || niceTicks(cfg.y.min, cfg.y.max, Math.max(3, Math.floor(ih / 40)));
  const fx = cfg.x.fmt || (v => nf(v, 0)), fy = cfg.y.fmt || (v => nf(v, 0));
  let s = `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.aria || cfg.title || '')}">`;
  for (const b of cfg.bands || []) { const x0 = xs(Math.max(cfg.x.min, b.x0)), x1 = xs(Math.min(cfg.x.max, b.x1)); if (x1 > x0) s += `<rect class="band" x="${x0}" y="${m.t}" width="${x1 - x0}" height="${ih}"/>${b.label ? `<text class="band-label" x="${(x0 + x1) / 2}" y="${m.t + 12}" text-anchor="middle">${esc(b.label)}</text>` : ''}`; }
  for (const v of yt) s += `<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${ys(v)}" y2="${ys(v)}"/><text class="tick" x="${m.l - 6}" y="${ys(v) + 4}" text-anchor="end">${esc(fy(v))}</text>`;
  for (const v of xt) s += `<text class="tick" x="${xs(v)}" y="${m.t + ih + 16}" text-anchor="middle">${esc(fx(v))}</text>`;
  s += `<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${m.t + ih}" y2="${m.t + ih}"/>`;
  if (cfg.y.min < 0 && cfg.y.max > 0) s += `<line class="zero" x1="${m.l}" x2="${m.l + iw}" y1="${ys(0)}" y2="${ys(0)}"/>`;
  if (cfg.x.title) s += `<text class="axis-label" x="${m.l + iw / 2}" y="${H - 4}" text-anchor="middle">${esc(cfg.x.title)}</text>`;
  if (cfg.y.title) s += `<text class="axis-label" x="${m.l - 6}" y="${m.t - 2}" text-anchor="start" transform="translate(${-m.l + 12},0)">${esc(cfg.y.title)}</text>`;
  for (const h of cfg.hlines || []) if (h.y >= cfg.y.min && h.y <= cfg.y.max) s += `<line class="hline" x1="${m.l}" x2="${m.l + iw}" y1="${ys(h.y)}" y2="${ys(h.y)}"/>${h.label ? `<text class="hline-label" x="${m.l + iw - 4}" y="${ys(h.y) - 5}" text-anchor="end">${esc(h.label)}</text>` : ''}`;
  for (const v of cfg.vlines || []) if (v.x >= cfg.x.min && v.x <= cfg.x.max) s += `<line class="hline" x1="${xs(v.x)}" x2="${xs(v.x)}" y1="${m.t}" y2="${m.t + ih}"/>${v.label ? `<text class="hline-label" x="${xs(v.x) + 4}" y="${m.t + 11}">${esc(v.label)}</text>` : ''}`;
  const clip = `clip${Math.random().toString(36).slice(2, 8)}`;
  s += `<defs><clipPath id="${clip}"><rect x="${m.l}" y="${m.t - 2}" width="${iw}" height="${ih + 4}"/></clipPath></defs><g clip-path="url(#${clip})">`;
  for (const se of cfg.series) {
    let d = '', pen = false, area = '';
    for (const [x, y] of se.pts) {
      if (!fin(x) || !fin(y)) { pen = false; continue; }
      const X = xs(x).toFixed(1), Y = ys(clamp(y, cfg.y.min - (cfg.y.max - cfg.y.min), cfg.y.max + (cfg.y.max - cfg.y.min))).toFixed(1);
      d += (pen ? 'L' : 'M') + X + ' ' + Y; pen = true;
    }
    if (se.area && se.pts.length) {
      const pp = se.pts.filter(p => fin(p[0]) && fin(p[1]));
      if (pp.length) area = `M${xs(pp[0][0])} ${ys(Math.max(cfg.y.min, 0))}` + pp.map(p => `L${xs(p[0]).toFixed(1)} ${ys(p[1]).toFixed(1)}`).join('') + `L${xs(pp[pp.length - 1][0])} ${ys(Math.max(cfg.y.min, 0))}Z`;
    }
    if (area) s += `<path class="area f${sCls(se.c)}" d="${area}"/>`;
    s += `<path class="line s${sCls(se.c)}${se.dash ? ' dash' : ''}" d="${d}"/>`;
    if (se.dots) for (const [x, y] of se.pts) if (fin(x) && fin(y)) s += `<circle class="mark f${sCls(se.c)}" cx="${xs(x)}" cy="${ys(y)}" r="4"/>`;
  }
  s += '</g>';
  for (const mk of cfg.marks || []) {
    if (!fin(mk.x) || !fin(mk.y)) continue;
    const X = xs(mk.x), Y = ys(mk.y), anc = mk.anchor || (X > m.l + iw * 0.75 ? 'end' : 'start'), dx = anc === 'end' ? -8 : 8;
    s += `<circle class="mark f${sCls(mk.c || 1)}" cx="${X}" cy="${Y}" r="5"/>`;
    if (mk.label) s += `<text class="mark-label" x="${X + dx}" y="${Y + (mk.dy ?? -8)}" text-anchor="${anc}">${esc(mk.label)}</text>`;
  }
  s += `<line class="cursor-line" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>`;
  for (let i = 0; i < cfg.series.length; i++) s += `<circle class="cursor-dot f${sCls(cfg.series[i].c)}" r="4" visibility="hidden" data-i="${i}"/>`;
  s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/></svg>`;
  const head = cfg.title || cfg.legend !== false ? `<div class="chart-title">${cfg.title ? `<span>${esc(cfg.title)}</span>` : ''}${cfg.legend !== false ? legendHTML(cfg.series) : ''}</div>` : '';
  el.innerHTML = head + s + '<div class="tip" hidden></div>';
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cl = svg.querySelector('.cursor-line'), dots = $$('.cursor-dot', svg), hit = svg.querySelector('.hit');
  const near = (pts, x) => { let lo = 0, hi = pts.length - 1; if (hi < 0) return null; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (pts[md][0] < x) lo = md; else hi = md; } return Math.abs(pts[lo][0] - x) <= Math.abs(pts[hi][0] - x) ? pts[lo] : pts[hi]; };
  const move = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const x = cfg.x.min + (clamp(px, m.l, m.l + iw) - m.l) / iw * (cfg.x.max - cfg.x.min);
    let rows = '', X = null;
    cfg.series.forEach((se, i) => {
      const p = near(se.pts, x), dot = dots[i];
      if (!p || !fin(p[1]) || se.noTip) { dot.setAttribute('visibility', 'hidden'); return; }
      X = xs(p[0]); dot.setAttribute('cx', X); dot.setAttribute('cy', ys(clamp(p[1], cfg.y.min, cfg.y.max))); dot.setAttribute('visibility', 'visible');
      rows += `<div class="row"><span><i class="b${sCls(se.c)}"></i>${esc(se.name || '')}</span><b>${esc((se.fmt || fy)(p[1]))}</b></div>`;
    });
    if (X === null) X = xs(x);
    cl.setAttribute('x1', X); cl.setAttribute('x2', X); cl.setAttribute('visibility', 'visible');
    const extra = cfg.tipExtra ? cfg.tipExtra(x) : '';
    tip.innerHTML = `<div class="th">${esc((cfg.x.tipFmt || fx)(x))}</div>${rows}${extra}`; tip.hidden = false;
    const tw = tip.offsetWidth; tip.style.left = (X + 14 + tw > W ? Math.max(0, X - 14 - tw) : X + 14) + 'px';
  };
  const leave = () => { tip.hidden = true; cl.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); };
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move); hit.addEventListener('pointerleave', leave);
}

/* ---------- Gruppierte Säulen (z. B. Monate) ---------- */
function groupBars(el, cfg) {
  el._cfg = cfg; el._fn = groupBars;
  const W = cw(el), H = cfg.h || 210, m = { l: cfg.ml || 46, r: 12, t: 12, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const n = cfg.cats.length, k = cfg.series.length, gw = iw / n, bw = Math.max(3, Math.min(26, (gw - 6) / k - 2));
  const ys = v => m.t + ih - (v - cfg.y.min) / (cfg.y.max - cfg.y.min) * ih, fy = cfg.y.fmt || (v => nf(v, 0));
  let s = `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || '')}">`;
  for (const v of niceTicks(cfg.y.min, cfg.y.max, 4)) s += `<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${ys(v)}" y2="${ys(v)}"/><text class="tick" x="${m.l - 6}" y="${ys(v) + 4}" text-anchor="end">${esc(fy(v))}</text>`;
  for (const h of cfg.hlines || []) s += `<line class="hline" x1="${m.l}" x2="${m.l + iw}" y1="${ys(h.y)}" y2="${ys(h.y)}"/>`;
  cfg.cats.forEach((c, i) => {
    const x0 = m.l + i * gw + (gw - k * (bw + 2)) / 2;
    cfg.series.forEach((se, j) => {
      const v = se.vals[i]; if (!fin(v)) return;
      const y0 = ys(Math.max(cfg.y.min, 0)), y1 = ys(v);
      s += `<rect class="vbar f${sCls(se.c)}" x="${(x0 + j * (bw + 2)).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y0 - y1)).toFixed(1)}" rx="1.5"/>`;
    });
    s += `<text class="tick" x="${m.l + i * gw + gw / 2}" y="${m.t + ih + 16}" text-anchor="middle">${esc(c)}</text>`;
  });
  s += `<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${ys(Math.max(cfg.y.min, 0))}" y2="${ys(Math.max(cfg.y.min, 0))}"/>`;
  s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/></svg>`;
  el.innerHTML = `<div class="chart-title">${cfg.title ? `<span>${esc(cfg.title)}</span>` : ''}${legendHTML(cfg.series)}</div>${s}<div class="tip" hidden></div>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', ev => {
    const r = svg.getBoundingClientRect(), i = clamp(Math.floor(((ev.clientX - r.left) - m.l) / gw), 0, n - 1);
    tip.innerHTML = `<div class="th">${esc(cfg.tipCats ? cfg.tipCats[i] : cfg.cats[i])}</div>` + cfg.series.map(se => `<div class="row"><span><i class="b${sCls(se.c)}"></i>${esc(se.name)}</span><b>${esc((se.fmt || fy)(se.vals[i]))}</b></div>`).join('');
    tip.hidden = false; const X = m.l + (i + 0.5) * gw, tw = tip.offsetWidth; tip.style.left = (X + 14 + tw > W ? Math.max(0, X - 14 - tw) : X + 14) + 'px';
  });
  hit.addEventListener('pointerleave', () => { tip.hidden = true; });
}

/* ---------- Histogramm ---------- */
function histogram(el, cfg) {
  el._cfg = cfg; el._fn = histogram;
  const W = cw(el), H = cfg.h || 200, m = { l: 44, r: 12, t: 12, b: 38 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const v = cfg.vals.filter(fin), lo = cfg.min ?? Math.floor(Math.min(...v)), hi = cfg.max ?? Math.ceil(Math.max(...v)), nb = cfg.bins || 30, bwv = (hi - lo) / nb || 1;
  const cnt = new Array(nb).fill(0); v.forEach(x => { cnt[clamp(Math.floor((x - lo) / bwv), 0, nb - 1)]++; });
  const mx = Math.max(1, ...cnt), xs = x => m.l + (x - lo) / (hi - lo) * iw, ys = c => m.t + ih - c / mx * ih;
  let s = `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || '')}">`;
  for (const t of niceTicks(0, mx, 3)) s += `<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${ys(t)}" y2="${ys(t)}"/><text class="tick" x="${m.l - 6}" y="${ys(t) + 4}" text-anchor="end">${nf(t / v.length * 100, 0)} %</text>`;
  cnt.forEach((c, i) => { if (!c) return; const x0 = lo + i * bwv, cls = cfg.cls ? cfg.cls(x0 + bwv / 2) : 'pos'; s += `<rect class="vbar ${cls}" x="${xs(x0) + 1}" y="${ys(c)}" width="${Math.max(1, xs(x0 + bwv) - xs(x0) - 2)}" height="${m.t + ih - ys(c)}"/>`; });
  for (const t of niceTicks(lo, hi, Math.floor(iw / 70))) s += `<text class="tick" x="${xs(t)}" y="${m.t + ih + 16}" text-anchor="middle">${esc((cfg.fmt || (x => nf(x, 0)))(t))}</text>`;
  for (const l of cfg.vlines || []) if (l.x >= lo && l.x <= hi) s += `<line class="hline" x1="${xs(l.x)}" x2="${xs(l.x)}" y1="${m.t}" y2="${m.t + ih}"/><text class="hline-label" x="${xs(l.x) + 4}" y="${m.t + 11 + (l.dy || 0)}">${esc(l.label)}</text>`;
  s += `<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${m.t + ih}" y2="${m.t + ih}"/>`;
  if (cfg.xTitle) s += `<text class="axis-label" x="${m.l + iw / 2}" y="${H - 4}" text-anchor="middle">${esc(cfg.xTitle)}</text>`;
  s += '</svg>';
  el.innerHTML = (cfg.title ? `<div class="chart-title"><span>${esc(cfg.title)}</span>${cfg.legendHTML || ''}</div>` : '') + s;
}

/* ---------- Balken (HTML) ---------- */
function barsHTML(rows, opt = {}) {
  const mx = opt.max || Math.max(1e-9, ...rows.filter(r => !r.total).map(r => Math.abs(r.v)));
  return rows.map(r => `<div class="bar-row${r.total ? ' total' : ''}"><span class="lbl">${esc(r.l)}${r.sub ? ` <span class="muted small">${esc(r.sub)}</span>` : ''}</span><span class="bar-track">${r.total ? '' : `<span class="bar-fill" style="width:${clamp(Math.abs(r.v) / mx * 100, 0, 100).toFixed(1)}%${r.color ? ';background:var(--' + r.color + ')' : ''}"></span>`}</span><span class="val">${esc(r.t ?? nf(r.v, opt.d ?? 1))}</span></div>`).join('');
}
function tornadoHTML(rows, unit, d = 1) {
  const mx = Math.max(0.05, ...rows.map(r => Math.max(Math.abs(r.lo), Math.abs(r.hi))));
  return rows.map(r => {
    const seg = (v, cls) => { const w = Math.abs(v) / mx * 50; return v < 0 ? `<span class="b dn" style="left:${50 - w}%;width:${w}%"></span>` : `<span class="b up" style="left:50%;width:${w}%"></span>`; };
    return `<div class="torn-row"><span class="lbl">${esc(r.label)} <span class="muted small">±${r.param ? nf(r.sd, 0) + (r.key === 'sky' ? ' %-Pkt.' : ' K') : nf(r.sd * 100, 0) + ' %'}</span></span><span class="torn-track"><span class="mid"></span>${seg(Math.min(r.lo, r.hi), '')}${seg(Math.max(r.lo, r.hi), '')}</span><span class="val">${nfs(r.lo, d)} / ${nfs(r.hi, d)} ${unit}</span></div>`;
  }).join('');
}

/* ---------- Grundriss von oben (mit Pfeilung, Motoren, Schwerpunkt und Neutralpunkt) ---------- */
function planformSVG(el, C) {
  el._cfg = C; el._fn = planformSVG;
  const P = C.P, pf = C.pf, tg = C.tail, W = cw(el), b = pf.b, g = C.bal ? C.bal.g : null;
  const x0 = g ? g.xLE0 : 0.35 * P.fusL, xLE = eta => pf.xLE(eta), rel = x => x - x0;
  const xht = g ? rel(g.xhLE) : 0.25 * pf.cr + tg.lt - 0.25 * tg.ch, Dp = P.propGeom === 'apc10x7' ? 0.254 : P.propD;
  const xmin = Math.min(-x0, xLE(1), g ? rel(g.xProp) : 0) - 0.04, xmax = Math.max(xht + tg.ch, P.fusL - x0, xLE(1) + pf.ct, g ? rel(g.xProp) : 0, pf.cr) + 0.06;
  const depth = xmax - xmin, sc = Math.min((W - 30) / b, 300 / depth), H = depth * sc + 58;
  const cx = W / 2, y0 = 14 - xmin * sc;
  const X = y => cx + y * sc, Y = x => y0 + x * sc;
  const N = 60, up = [], lo = [];
  for (let i = 0; i <= N; i++) { const eta = i / N, y = eta * b / 2; up.push([y, xLE(eta)]); lo.push([y, xLE(eta) + pf.chordAt(eta)]); }
  const half = sgn => 'M' + up.map(([y, x]) => `${X(sgn * y).toFixed(1)} ${Y(x).toFixed(1)}`).join('L') + 'L' + lo.slice().reverse().map(([y, x]) => `${X(sgn * y).toFixed(1)} ${Y(x).toFixed(1)}`).join('L') + 'Z';
  const x0c = P.cellX0 / 100, x1c = P.cellX1 / 100, arc = C.sol.arc || 1.01;
  let aNeed = P.solarArea / 2, etaC = 0; const dE = 0.002;
  while (aNeed > 0 && etaC < 1) { aNeed -= pf.chordAt(etaC) * (x1c - x0c) * arc * dE * b / 2; etaC += dE; }
  const full = aNeed > 1e-6;
  const cell = sgn => { const pts = []; for (let e = 0; e <= etaC + 1e-9; e += Math.max(dE, etaC / 40)) pts.push(e); pts.push(Math.min(1, etaC)); return 'M' + pts.map(e => `${X(sgn * e * b / 2).toFixed(1)} ${Y(xLE(e) + x0c * pf.chordAt(e)).toFixed(1)}`).join('L') + 'L' + pts.slice().reverse().map(e => `${X(sgn * e * b / 2).toFixed(1)} ${Y(xLE(e) + x1c * pf.chordAt(e)).toFixed(1)}`).join('L') + 'Z'; };
  // Rumpf von oben aus der Kontur (Breite = Durchmesser), Träger, Leitwerk, Propeller
  const fsh = g ? g.fus : null, cfg = C.cfg;
  const fus = fsh ? `<path d="M${fsh.st.map(p => `${X(p.d / 2).toFixed(1)} ${Y(rel(p.x)).toFixed(1)}`).join('L')}L${fsh.st.slice().reverse().map(p => `${X(-p.d / 2).toFixed(1)} ${Y(rel(p.x)).toFixed(1)}`).join('L')}Z" fill="var(--sunken)" stroke="var(--ink-2)" stroke-width="1.2"/>`
    : `<rect x="${X(-P.fusD / 2)}" y="${Y(-x0)}" width="${P.fusD * sc}" height="${P.fusL * sc}" rx="${P.fusD * sc / 2}" fill="var(--sunken)" stroke="var(--ink-2)" stroke-width="1.2"/>`;
  const yb = g ? g.yB : 0, bys = cfg.nBoom > 1 ? [-yb, yb] : cfg.nBoom ? [0] : [], fys = tg.nFin > 1 ? [-yb, yb] : [0];
  const bx0 = g ? rel(g.boom0) : P.fusL - x0, bx1 = g ? rel(g.xTail) : xht + tg.ch;
  let boom = ''; for (const o of bys) boom += `<line x1="${X(o)}" x2="${X(o)}" y1="${Y(bx0)}" y2="${Y(bx1)}" stroke="var(--ink-2)" stroke-width="${Math.max(1.5, P.boomD * sc)}"/>`;
  const ht = `<rect x="${X(-tg.bh / 2)}" y="${Y(xht)}" width="${tg.bh * sc}" height="${tg.ch * sc}" fill="${C.mass.solarHT > 0 ? 'var(--c2)' : 'var(--sunken)'}" fill-opacity="${C.mass.solarHT > 0 ? 0.22 : 1}" stroke="var(--ink-2)" stroke-width="1.2"/>`;
  let vt = ''; for (const o of fys) vt += `<rect x="${X(o - 0.006)}" y="${Y(g ? rel(g.xvLE) : xht + tg.ch - tg.cv)}" width="${Math.max(2, 0.012 * sc)}" height="${tg.cv * sc}" fill="var(--ink-2)"/>`;
  const propL = (yc, x) => `<line x1="${X(yc - Dp / 2)}" x2="${X(yc + Dp / 2)}" y1="${Y(x)}" y2="${Y(x)}" stroke="var(--c4)" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>`;
  let mot = '';
  if (g) {
    if (cfg.mot === 'fin' || g.pylon > 0) mot += `<rect x="${X(-0.035)}" y="${Y(rel(g.xMot) - 0.06)}" width="${0.07 * sc}" height="${0.2 * sc}" rx="${0.035 * sc}" fill="var(--sunken)" stroke="var(--ink-2)"/>`;
    mot += propL(0, rel(g.xProp));
  }
  const lab = (x, y, t, a = 'middle') => `<text class="tick" x="${x}" y="${y}" text-anchor="${a}">${esc(t)}</text>`;
  let s = `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grundriss des Flugzeugs von oben">`;
  s += `<path d="${half(1)}" fill="var(--panel)" stroke="var(--ink-2)" stroke-width="1.4"/><path d="${half(-1)}" fill="var(--panel)" stroke="var(--ink-2)" stroke-width="1.4"/>`;
  s += `<path d="${cell(1)}" fill="var(--c2)" fill-opacity="0.22" stroke="var(--c2)" stroke-width="1"/><path d="${cell(-1)}" fill="var(--c2)" fill-opacity="0.22" stroke="var(--c2)" stroke-width="1"/>`;
  // t/4-Linie
  s += `<path d="M${X(-b / 2)} ${Y(xLE(1) + pf.ct / 4)}L${X(0)} ${Y(pf.cr / 4)}L${X(b / 2)} ${Y(xLE(1) + pf.ct / 4)}" fill="none" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
  // Ruder: Querruder an der Flügelhinterkante, Höhenruder am Höhenleitwerk
  let ctl = '';
  const a0 = clamp(P.ailEta0, 0.1, 0.95), a1 = clamp(P.ailEta1, a0 + 0.02, 1), cfA = clamp(P.ailCf, 0.05, 0.6), nS = Math.max(1, Math.round(P.nAilSeg || 1));
  for (const sgn of [1, -1]) {
    const pts = []; for (let i = 0; i <= 12; i++) { const e = a0 + (a1 - a0) * i / 12; pts.push(e); }
    ctl += `<path d="M${pts.map(e => `${X(sgn * e * b / 2).toFixed(1)} ${Y(xLE(e) + (1 - cfA) * pf.chordAt(e)).toFixed(1)}`).join('L')}L${pts.slice().reverse().map(e => `${X(sgn * e * b / 2).toFixed(1)} ${Y(xLE(e) + pf.chordAt(e)).toFixed(1)}`).join('L')}Z" fill="var(--c5)" fill-opacity="0.25" stroke="var(--c5)" stroke-width="1"/>`;
    for (let k = 1; k < nS; k++) { const e = a0 + (a1 - a0) * k / nS; ctl += `<line x1="${X(sgn * e * b / 2)}" x2="${X(sgn * e * b / 2)}" y1="${Y(xLE(e) + (1 - cfA) * pf.chordAt(e))}" y2="${Y(xLE(e) + pf.chordAt(e))}" stroke="var(--c5)"/>`; }
  }
  const cfE = clamp(P.elevCf, 0.1, 1);
  ctl += `<rect x="${X(-tg.bh / 2)}" y="${Y(xht + (1 - cfE) * tg.ch)}" width="${tg.bh * sc}" height="${cfE * tg.ch * sc}" fill="var(--c5)" fill-opacity="0.25" stroke="var(--c5)" stroke-width="1"/>`;
  s += boom + fus + ht + vt + mot + ctl;
  if (C.bal) {
    const xs = rel(C.bal.xcg), xn = rel(C.np.xnp), w = Math.max(14, P.fusD * sc * 0.9);
    s += `<line x1="${X(0) - w}" x2="${X(0) + w}" y1="${Y(xn)}" y2="${Y(xn)}" stroke="var(--accent)" stroke-width="2"/><text class="hline-label" x="${X(0) + w + 4}" y="${Y(xn) + 4}">N</text>`;
    s += `<circle cx="${X(0)}" cy="${Y(xs)}" r="5" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><path d="M${X(0)} ${Y(xs)}L${X(0) + 5} ${Y(xs)}A5 5 0 0 0 ${X(0)} ${Y(xs) - 5}ZM${X(0)} ${Y(xs)}L${X(0) - 5} ${Y(xs)}A5 5 0 0 0 ${X(0)} ${Y(xs) + 5}Z" fill="var(--ink)"/><text class="hline-label" x="${X(0) - w - 4}" y="${Y(xs) + 4}" text-anchor="end">S</text>`;
  }
  s += lab(cx, H - 22, `Spannweite ${nf(b, 2)} m · Streckung ${nf(pf.AR, 1)}${pf.sweep ? ` · Pfeilung ${nfs(pf.sweep, 0)}°` : ''}`) + lab(cx, H - 7, `HLW ${nf(tg.Sh, 2)} m² · SLW ${nf(tg.Sv, 2)} m² · Hebelarm ${nf(tg.lt, 2)} m`);
  s += lab(X(-b / 4), Y(Math.max(pf.cr, xLE(0.5) + pf.chordAt(0.5))) + 14, `Wurzeltiefe ${nf(pf.cr * 100, 0)} cm`) + lab(X(b / 2) - 4, Y(xLE(1) + pf.ct) + 14, `Spitze ${nf(pf.ct * 100, 0)} cm`, 'end');
  s += lab(X(b / 4), Y(Math.min(0, xLE(0.5))) - 6, `Zellen ${nf(P.solarArea, 2)} m²${full ? ' – passen nicht!' : ''}`);
  s += '</svg>';
  el.innerHTML = s;
  return { etaC, full };
}

/* ---------- Profilkonturen ---------- */
function shapesSVG(el, keys, P) {
  el._cfg = keys; el._fn = (e, k) => shapesSVG(e, k, S.params);
  const W = cw(el), sc = W - 20, H = Math.round(sc * 0.2) + 24, y0 = H * 0.58;
  let s = `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profilkonturen">`;
  s += `<line class="grid" x1="10" x2="${W - 10}" y1="${y0}" y2="${y0}"/>`;
  keys.forEach((k, i) => {
    const f = foilByKey(k); if (!f) return;
    const sh = f.shape, pts = sh.x.map((x, j) => [x, sh.yu[j]]).concat(sh.x.map((x, j) => [x, sh.yl[j]]).reverse());
    s += `<path class="line s${sCls(i + 1)}" d="M${pts.map(([x, y]) => `${(10 + x * sc).toFixed(1)} ${(y0 - y * sc).toFixed(1)}`).join('L')}Z" style="stroke-width:1.6"/>`;
    if (i === 0 && P.solarGeom !== 'flach') {
      const a = P.cellX0 / 100, b = P.cellX1 / 100, seg = sh.x.map((x, j) => [x, sh.yu[j]]).filter(([x]) => x >= a && x <= b);
      if (seg.length > 1) s += `<path d="M${seg.map(([x, y]) => `${(10 + x * sc).toFixed(1)} ${(y0 - y * sc - 4).toFixed(1)}`).join('L')}" fill="none" stroke="var(--c2)" stroke-width="2.5" stroke-dasharray="5 3"/>`;
    }
  });
  s += '</svg>';
  el.innerHTML = `<div class="chart-title">${legendHTML(keys.map((k, i) => ({ name: (foilByKey(k) || {}).name, c: i + 1 })))}</div>` + s;
}

/* ---------- Neuzeichnen bei Größenänderung ---------- */
let rsTimer = null, lastW = 0;
const ro = new ResizeObserver(() => {
  const w = document.querySelector('.wrap').clientWidth; if (Math.abs(w - lastW) < 4) return; lastW = w;
  clearTimeout(rsTimer);
  rsTimer = setTimeout(() => { $$('.view:not([hidden]) .chart').forEach(el => { if (el._fn && el._cfg) el._fn(el, el._cfg); }); }, 120);
});

/* ---------- Seitenansicht des Flugzeugs (maßstäblich, x nach hinten, z nach oben) ----------
   Liefert drei Ebenen: back (Träger, hinter dem Rumpf), body (Rumpf, Kufe, Motor an Rumpf),
   wing (Flügel, Leitwerk, Motor am Leitwerk/Pylon) – wing wandert beim Verschieben mit. */
function aircraftSide(C, X, Z, sc, opt = {}) {
  const P = C.P, pf = C.pf, tg = C.tail, g = C.bal.g, cf = C.cfg, f1 = v => v.toFixed(1), stroke = 'stroke="var(--ink-2)" stroke-width="1.3"';
  const foilPath = (foil, x0, z0, c) => {
    const sh = foil.shape, up = sh.x.map((x, i) => `${f1(X(x0 + x * c))} ${f1(Z(z0 + sh.yu[i] * c))}`), lo = sh.x.map((x, i) => `${f1(X(x0 + x * c))} ${f1(Z(z0 + sh.yl[i] * c))}`).reverse();
    return 'M' + up.join('L') + 'L' + lo.join('L') + 'Z';
  };
  const Dp = 2 * g.R, prop = (x, z) => `<ellipse cx="${f1(X(x))}" cy="${f1(Z(z))}" rx="3" ry="${f1(Dp / 2 * sc)}" fill="var(--c4)" fill-opacity="0.16" stroke="var(--c4)" stroke-dasharray="4 3"/>`;
  const nacelle = (x, z) => `<ellipse cx="${f1(X(x))}" cy="${f1(Z(z))}" rx="${f1(0.1 * sc)}" ry="${f1(Math.max(2.5, 0.032 * sc))}" fill="var(--sunken)" ${stroke}/>`;
  let back = '', body = '', wing = '';
  // Propellerstrahl als Band: Achse z_s(x) ± Strahlradius R_s(x) im Reiseflug
  if (opt.slip !== false && C.slip && C.slip.zs) {
    const sl = C.slip, x1 = Math.max(g.xTail, g.xvTE) + 0.15, N = 40, up = [], lo = [];
    for (let i = 0; i <= N; i++) { const x = g.xProp + (x1 - g.xProp) * i / N, r = sl.Rs(x), z = sl.zs(x); up.push(`${f1(X(x))} ${f1(Z(z + r))}`); lo.push(`${f1(X(x))} ${f1(Z(z - r))}`); }
    back += `<path d="M${up.join('L')}L${lo.reverse().join('L')}Z" fill="var(--c4)" fill-opacity="0.09" stroke="var(--c4)" stroke-opacity="0.35" stroke-dasharray="2 3"/>`;
  }
  // Träger
  if (cf.nBoom) back += `<line x1="${f1(X(g.boom0))}" y1="${f1(Z(g.zB0))}" x2="${f1(X(g.boom1))}" y2="${f1(Z(g.zB1))}" stroke="var(--ink-2)" stroke-width="${f1(Math.max(2, P.boomD * sc))}" stroke-linecap="round"/>`;
  // Rumpf aus der Kontur
  const st = g.fus.st;
  body += `<path d="M${st.map(p => `${f1(X(p.x))} ${f1(Z(p.top))}`).join('L')}L${st.slice().reverse().map(p => `${f1(X(p.x))} ${f1(Z(p.bot))}`).join('L')}Z" fill="var(--sunken)" ${stroke}/>`;
  // Landekufe bzw. verstärkter Boden
  if (P.landGear === 'skid') { const r = P.fusD / 2; body += `<path d="M${f1(X(g.xSkid - 0.12))} ${f1(Z(-r) + 1)}Q${f1(X(g.xSkid - 0.02))} ${f1(Z(g.zLow))} ${f1(X(g.xSkid + 0.12))} ${f1(Z(g.zLow))}" fill="none" stroke="var(--ink-2)" stroke-width="2"/>`; }
  else body += `<path d="M${f1(X(0.08 * P.fusL))} ${f1(Z(-P.fusD / 2) + 1.5)}L${f1(X(Math.min(P.fusL, 1.2) * 0.9))} ${f1(Z(-P.fusD / 2) + 1.5)}" stroke="var(--ink-2)" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`;
  // Motor an Nase oder Rumpfende
  if (cf.mot === 'nose') body += `<path d="M${f1(X(0))} ${f1(Z(0.035))}L${f1(X(-0.035))} ${f1(Z(0))}L${f1(X(0))} ${f1(Z(-0.035))}Z" fill="var(--ink-2)"/>` + prop(g.xProp, g.zP);
  else if (cf.mot === 'pusher' && !(g.pylon > 0)) body += `<path d="M${f1(X(P.fusL))} ${f1(Z(0.03))}L${f1(X(P.fusL + 0.05))} ${f1(Z(0))}L${f1(X(P.fusL))} ${f1(Z(-0.03))}Z" fill="var(--ink-2)"/>` + prop(g.xProp, g.zP);
  // Flügel (Spitze gestrichelt mit V-Form) und Solarzellen
  const xTip = g.xLE0 + pf.xLE(1), zTip = zWingAt(g, pf.b / 2);
  wing += `<path d="${foilPath(C.foil, xTip, zTip, pf.ct)}" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>`;
  wing += `<path d="${foilPath(C.foil, g.xLE0, g.zw, pf.cr)}" fill="var(--panel)" ${stroke}/>`;
  const sx0 = g.xLE0 + P.cellX0 / 100 * pf.cr, sx1 = g.xLE0 + P.cellX1 / 100 * pf.cr;
  if (P.solarArea > 0) wing += `<line x1="${f1(X(sx0))}" x2="${f1(X(sx1))}" y1="${f1(Z(g.zw + C.foil.t * pf.cr * 0.75) - 3)}" y2="${f1(Z(g.zw + C.foil.t * pf.cr * 0.75) - 3)}" stroke="var(--c2)" stroke-width="3"/>`;
  // Seitenleitwerk (Vorderkante zurückgesetzt, Spitzentiefe 62 %)
  const xv0 = g.xvLE, xvt = xv0 + g.vSw * tg.bv;
  wing += `<path d="M${f1(X(xv0))} ${f1(Z(g.zV0))}L${f1(X(xvt))} ${f1(Z(g.zV1))}L${f1(X(xvt + 0.62 * tg.cv))} ${f1(Z(g.zV1))}L${f1(X(g.xvTE))} ${f1(Z(g.zV0))}Z" fill="var(--sunken)" ${stroke}/>`;
  // Höhenleitwerk
  wing += `<path d="${foilPath(C.tfoil, g.xhLE + (cf.tail === 'T' ? g.vSw * tg.bv : 0), g.zH, tg.ch)}" fill="var(--panel)" ${stroke}/>`;
  if (C.mass.solarHT > 0) wing += `<line x1="${f1(X(g.xhLE + 0.08 * tg.ch))}" x2="${f1(X(g.xhLE + 0.85 * tg.ch))}" y1="${f1(Z(g.zH) - 3)}" y2="${f1(Z(g.zH) - 3)}" stroke="var(--c2)" stroke-width="3"/>`;
  // Motor oben am Seitenleitwerk oder auf dem Pylon hinter dem Flügel
  if (cf.mot === 'fin') wing += nacelle(g.xMot + 0.03, g.zP) + prop(g.xProp, g.zP);
  if (g.pylon > 0) wing += `<path d="M${f1(X(g.xMot - 0.04))} ${f1(Z(g.zP - g.pylon))}L${f1(X(g.xMot - 0.01))} ${f1(Z(g.zP))}L${f1(X(g.xMot + 0.06))} ${f1(Z(g.zP))}L${f1(X(g.xMot + 0.08))} ${f1(Z(g.zP - g.pylon))}Z" fill="var(--sunken)" ${stroke}/>` + nacelle(g.xMot, g.zP) + prop(g.xProp, g.zP);
  // Mittlere aerodynamische Flügeltiefe
  if (opt.mac !== false) {
    const yMac = Z(g.zw + C.foil.t * pf.cr + 0.03);
    wing += `<line x1="${f1(X(g.xmac))}" x2="${f1(X(g.xmac + pf.mac))}" y1="${f1(yMac)}" y2="${f1(yMac)}" stroke="var(--muted)" stroke-width="1"/><line x1="${f1(X(g.xmac))}" x2="${f1(X(g.xmac))}" y1="${f1(yMac - 4)}" y2="${f1(yMac + 4)}" stroke="var(--muted)"/><line x1="${f1(X(g.xmac + pf.mac))}" x2="${f1(X(g.xmac + pf.mac))}" y1="${f1(yMac - 4)}" y2="${f1(yMac + 4)}" stroke="var(--muted)"/>`;
    wing += `<text class="tick" x="${f1(X(g.xmac + pf.mac) + 4)}" y="${f1(yMac + 4)}">MAC ${nf(pf.mac * 100, 0)} cm</text>`;
  }
  return { back, body, wing };
}
// Kleine Seitenansicht ohne Wägediagramm (Konfigurationsvergleich)
function sideThumbSVG(C, W, Hmax) {
  const P = C.P, g = C.bal.g, tg = C.tail, bal = C.bal;
  const xs0 = Math.min(-0.06, g.xProp - 0.04), xs1 = Math.max(g.xTail, g.xvTE, g.xProp, P.fusL) + 0.04;
  const zTop = Math.max(g.zV1 + 0.03, g.zH + 0.04, g.zP + g.R + 0.02), zBot = Math.min(g.zLow - 0.02, g.zP - g.R - 0.02);
  const sc = Math.min((W - 8) / (xs1 - xs0), (Hmax - 8) / (zTop - zBot)), H = Math.round((zTop - zBot) * sc) + 8;
  const X = x => 4 + (x - xs0) * sc, Z = z => 4 + (zTop - z) * sc, p = aircraftSide(C, X, Z, sc, { mac: false });
  const cg = `<circle cx="${X(bal.xcg).toFixed(1)}" cy="${Z(bal.zcg).toFixed(1)}" r="4" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.3"/><path d="M${X(bal.xcg).toFixed(1)} ${Z(bal.zcg).toFixed(1)}l4 0a4 4 0 0 0 -4 -4zm0 0l-4 0a4 4 0 0 0 4 4z" fill="var(--ink)"/>`;
  return `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Seitenansicht">${p.back}${p.body}${p.wing}<line x1="${X(Math.min(g.xProp, bal.xcg) - 0.05).toFixed(1)}" x2="${X(Math.max(g.xProp, bal.xcg) + 0.1).toFixed(1)}" y1="${Z(g.zP).toFixed(1)}" y2="${Z(g.zP).toFixed(1)}" stroke="var(--c4)" stroke-dasharray="5 3"/>${cg}</svg>`;
}

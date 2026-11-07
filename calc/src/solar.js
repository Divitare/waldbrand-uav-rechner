/* ===================================================================
   Solarzellen auf Flügel und Höhenleitwerk: ganze quadratische Zellen packen
   - Zellen: SunPower/Maxeon C60, 125 × 125 mm, pseudoquadratisch (Ecken vom
     160-mm-Ingot abgeschnitten), 165 µm dick, oder eine eigene quadratische
     Zelle (Kantenlänge, Ingot-Durchmesser, Dicke). Andere Formate gibt es
     nicht mehr: halbe und Viertelzellen sowie Rechteckzellen werden auf die
     ganze C60 umgestellt.
   - Biegung: jede Zelle folgt der gewölbten Oberseite. Zulässig sind
       Stich f ≤ β·l (f: größter Abstand der Kontur von der Sehne zwischen
       Zellanfang und -ende, l Zelllänge; Vorgabe β = 10 % je Zelle) und
       örtliche Randdehnung ε = κ·t/2 ≤ ε_zul (κ aus dem Stich über ein
       Zwölftel der Zelllänge, rund 1 cm: κ = 8·f_s/s², s = l/12; ε_zul = 0,10 %
       nach Rion u. a. 2009: 136 MPa Bemessungsspannung bei E = 130 GPa).
     Gleichwertiger Biegeradius ρ = l²/(8f); bei f = β·l ist ε = 4·β·t/l.
     Für jede örtliche Flügeltiefe c gibt das ein Zellband [x_vorn, x_hinten]
     auf der Profiloberseite (größter zusammenhängender Bereich zulässiger
     Zelllagen), je Profil verschieden. Weitere Grenzen: frühester Beginn und
     spätestes Ende (Eingabe), Ruderachsen.
   - Belegung in Spalten in Flugrichtung, von der Wurzel nach außen. Je Spalte
     passen n = ⌊(L_B + g)/(l + g)⌋ Zellen; L_B ist die Bogenlänge des über
     die Spaltenbreite gemeinsamen Zellbands (Minimum, also auch bei
     Zuspitzung und Pfeilung).
   - Freiräume: Rumpf an der Wurzel, Flügelspitze, äußere Flügelteilung,
     wahlweise Querruder und Höhenruder (Zellen enden vor der Drehachse).
   - Modi: so viele Zellen wie passen, vorgegebene Anzahl, oder Fläche frei
     eingegeben (nur noch für Vergleichsrechnungen; ohne Zellraster).
   =================================================================== */
const CELL_TYPES = {
  c60: { name: 'SunPower C60, 125 × 125 mm pseudoquadratisch (Ø 160 mm)', s: 0.125, d: 0.160, t: 165e-6, vmp: 0.58 },
  custom: { name: 'Eigene quadratische Zelle' }
};
// Formate bis Version 8 (halbe und Viertelzellen, AZUR-Rechteckzellen): gerechnet als ganze C60
const CELL_OLD = { c60h: 'c60', c60q: 'c60', azur: 'c60' };
// Fläche einer pseudoquadratischen Zelle: Quadrat mit Seite s, Ecken vom Ingot-Kreis (Durchmesser d) abgeschnitten
function pseudoSquareArea(s, d) {
  const h = s / 2, R = d / 2;
  if (R >= h * Math.SQRT2) return s * s;
  if (R <= h) return Math.PI * R * R;
  const x0 = Math.sqrt(R * R - h * h), F = x => 0.5 * (x * Math.sqrt(Math.max(0, R * R - x * x)) + R * R * Math.asin(Math.min(1, x / R)));
  return 4 * (h * x0 + F(h) - F(x0));
}
const nf0 = x => String(Math.round(x * 10) / 10).replace('.', ',');
function cellSpec(P) {
  const key = CELL_TYPES[P.cellType] ? P.cellType : CELL_OLD[P.cellType] || 'c60';
  if (key === 'custom') {
    const s = clamp((P.cellA || 125) / 1000, 0.02, 0.3), d0 = Math.max(0, P.cellD || 0) / 1000, d = d0 > 0 ? clamp(d0, s, s * Math.SQRT2) : s * Math.SQRT2;
    const t = clamp((P.cellThk || 165) * 1e-6, 30e-6, 1e-3);
    return { key, name: `Eigene Zelle ${nf0(s * 1000)} × ${nf0(s * 1000)} mm${d < s * Math.SQRT2 - 1e-9 ? `, Ø ${nf0(d * 1000)} mm` : ''}`, s, d, a: s, b: s, A: pseudoSquareArea(s, d), t, vmp: clamp(P.cellVmp || 0.58, 0.1, 5) };
  }
  const c = CELL_TYPES.c60;
  return { key: 'c60', name: c.name, s: c.s, d: c.d, a: c.s, b: c.s, A: pseudoSquareArea(c.s, c.d), t: c.t, vmp: c.vmp, old: P.cellType !== 'c60' && !!CELL_OLD[P.cellType] };
}

/* ---------- Profiloberseite als Bogenlängentabelle (Einheitstiefe) ----------
   Natürlicher kubischer Spline in Parameterform (x(t), y(t), t = Sehnenlänge zwischen den Konturpunkten): zweimal
   stetig differenzierbar, damit die Krümmung glatt bleibt; die Nase (senkrechte Tangente) macht keine Schwierigkeit.
   801 Stützstellen gleichmäßig im Parameter. */
function splineNat(t, v) {
  const n = t.length, h = [], al = new Array(n).fill(0), l = new Array(n).fill(1), mu = new Array(n).fill(0), z = new Array(n).fill(0), c = new Array(n).fill(0), b = [], d = [];
  for (let i = 0; i < n - 1; i++) h.push(Math.max(1e-12, t[i + 1] - t[i]));
  for (let i = 1; i < n - 1; i++) al[i] = 3 / h[i] * (v[i + 1] - v[i]) - 3 / h[i - 1] * (v[i] - v[i - 1]);
  for (let i = 1; i < n - 1; i++) { l[i] = 2 * (t[i + 1] - t[i - 1]) - h[i - 1] * mu[i - 1]; mu[i] = h[i] / l[i]; z[i] = (al[i] - h[i - 1] * z[i - 1]) / l[i]; }
  for (let j = n - 2; j >= 0; j--) { c[j] = z[j] - mu[j] * c[j + 1]; b[j] = (v[j + 1] - v[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3; d[j] = (c[j + 1] - c[j]) / (3 * h[j]); }
  return tt => {
    let lo = 0, hi = n - 1; if (tt <= t[0]) lo = 0; else if (tt >= t[n - 1]) lo = n - 2; else { while (hi - lo > 1) { const k = (lo + hi) >> 1; if (t[k] > tt) hi = k; else lo = k; } }
    const dt = tt - t[lo]; return v[lo] + b[lo] * dt + c[lo] * dt * dt + d[lo] * dt * dt * dt;
  };
}
const UP_N = 801, upCache = new Map();
function foilUpper(f) {
  const key = f && f.key ? f.key : '-';
  let U = upCache.get(key); if (U) return U;
  const sh = f && f.shape ? f.shape : { x: [0, 0.3, 1], yu: [0, 0.06, 0] }, tp = [0];
  for (let i = 1; i < sh.x.length; i++) tp.push(tp[i - 1] + Math.hypot(sh.x[i] - sh.x[i - 1], sh.yu[i] - sh.yu[i - 1]));
  const sx = splineNat(tp, sh.x), sy = splineNat(tp, sh.yu), T = tp[tp.length - 1];
  const X = new Float64Array(UP_N), Y = new Float64Array(UP_N), S = new Float64Array(UP_N);
  for (let i = 0; i < UP_N; i++) {
    const t = T * i / (UP_N - 1); X[i] = i === 0 ? sh.x[0] : i === UP_N - 1 ? sh.x[sh.x.length - 1] : Math.max(X[i - 1] + 1e-9, sx(t)); Y[i] = sy(t);
    if (i) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  }
  U = { key, X, Y, S, L: S[UP_N - 1] }; upCache.set(key, U);
  return U;
}
const upIdx = (A, v) => { let lo = 0, hi = A.length - 1; if (v <= A[0]) return 0; if (v >= A[hi]) return hi - 1; while (hi - lo > 1) { const k = (lo + hi) >> 1; if (A[k] > v) hi = k; else lo = k; } return lo; };
// Bogenlänge an der Tiefe x und umgekehrt (Einheitstiefe)
function upS(U, x) { const i = upIdx(U.X, x), t = clamp((x - U.X[i]) / (U.X[i + 1] - U.X[i] || 1), 0, 1); return U.S[i] + (U.S[i + 1] - U.S[i]) * t; }
function upX(U, s) { const i = upIdx(U.S, s), t = clamp((s - U.S[i]) / (U.S[i + 1] - U.S[i] || 1), 0, 1); return U.X[i] + (U.X[i + 1] - U.X[i]) * t; }
function upPt(U, s) { const i = upIdx(U.S, s), t = clamp((s - U.S[i]) / (U.S[i + 1] - U.S[i] || 1), 0, 1); return [U.X[i] + (U.X[i + 1] - U.X[i]) * t, U.Y[i] + (U.Y[i + 1] - U.Y[i]) * t, i]; }
// Stich der Kontur zwischen den Bogenlängen sa und sb (größter Abstand von der Sehne)
function upSag(U, sa, sb) {
  const A = upPt(U, sa), B = upPt(U, sb), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-12;
  let m = 0;
  for (let i = A[2] + 1; i <= B[2]; i++) { const d = Math.abs((U.X[i] - A[0]) * dy - (U.Y[i] - A[1]) * dx) / L; if (d > m) m = d; }
  return m;
}
/* Zulässige Zelllagen für eine Zelle der bezogenen Länge λ = l/c (Bogenlänge, Einheitstiefe).
   beta: zulässiger Stich je Zelllänge, q = ε_zul·l/t, also κ_zul = 2q/λ (bezogene Krümmung, über λ/12 gemessen),
   xa, xb: frühester Beginn und spätestes Ende als Tiefenanteil.
   Ergebnis: größter zusammenhängender Bereich zulässiger Zellanfänge [s0, s1 − λ], dazu die Gründe
   für die Grenzen vorn und hinten ('bend' Stich, 'strain' Dehnung, 'limit' Eingabe). */
const bendCache = new Map();
function bendScan(U, lam, beta, q, xa, xb) {
  const key = `${U.key}|${lam.toFixed(3)}|${beta}|${q.toFixed(4)}|${xa.toFixed(3)}|${xb.toFixed(3)}`;
  if (bendCache.has(key)) return bendCache.get(key);
  const sA = upS(U, xa), sB = upS(U, xb), ds = lam / 25, l4 = lam / 12, kLim = 2 * q / lam;
  let r = null;
  if (sB - sA >= lam) {
    const n = Math.floor((sB - sA - lam) / ds + 1e-9) + 1, w4 = Math.max(0, Math.round((lam - l4) / ds)), k4 = new Float64Array(n + w4 + 1);
    for (let k = 0; k < k4.length; k++) { const s = sA + k * ds; k4[k] = s + l4 <= sB + 1e-12 ? 8 * upSag(U, s, s + l4) / (l4 * l4) : 0; }
    const ok = new Uint8Array(n), why = new Uint8Array(n), sag = new Float64Array(n), kap = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = sA + i * ds; sag[i] = upSag(U, s, s + lam) / lam;
      let km = 0; for (let k = i; k <= i + w4; k++) if (k4[k] > km) km = k4[k];
      kap[i] = km;
      const b = sag[i] > beta, e = km > kLim; ok[i] = !b && !e; why[i] = b ? 1 : e ? 2 : 0;
    }
    let best = null;
    for (let i = 0; i < n;) { if (!ok[i]) { i++; continue; } let j = i; while (j + 1 < n && ok[j + 1]) j++; if (!best || j - i > best[1] - best[0]) best = [i, j]; i = j + 1; }
    if (best) {
      const [i0, i1] = best, rs = k => (k < 0 || k >= n ? 'limit' : why[k] === 1 ? 'bend' : why[k] === 2 ? 'strain' : 'limit');
      let fMax = 0, kMax = 0; for (let i = i0; i <= i1; i++) { fMax = Math.max(fMax, sag[i]); kMax = Math.max(kMax, kap[i]); }
      const s0 = sA + i0 * ds, s1 = sA + i1 * ds + lam;
      r = { s0, s1, x0: upX(U, s0), x1: upX(U, s1), why0: rs(i0 - 1), why1: rs(i1 + 1), fMax, kMax };
    }
  }
  if (bendCache.size > 6000) bendCache.clear();
  bendCache.set(key, r);
  return r;
}
// Grenzen der Biegung aus den Parametern
function bendLimits(P, spec) {
  const beta = clamp((P.cellBend ?? 10) / 100, 0.005, 0.5), eps = clamp((P.cellStrain ?? 0.1) / 100, 1e-5, 0.02);
  const x0 = clamp((P.cellX0 ?? 0) / 100, 0, 0.9), x1 = clamp((P.cellX1 ?? 90) / 100, x0 + 0.05, 1);
  return { beta, eps, q: eps * spec.s / spec.t, x0, x1 };
}
/* Zellband auf einem Profil der Tiefe c (m): Tiefenanteile vorn/hinten, Bogenlänge (m), Zellen in Flugrichtung.
   xEnd: zusätzliche hintere Grenze (Ruderachse) als Tiefenanteil. λ wird auf 0,01 aufgerundet (etwas vorsichtiger). */
function cellBand(foil, c, spec, lim, g, xEnd) {
  if (!(c > spec.s * 1.0001)) return null;
  const U = foilUpper(foil), lam = Math.ceil(spec.s / c * 100 - 1e-9) / 100;
  const b = bendScan(U, lam, lim.beta, lim.q, lim.x0, lim.x1); if (!b) return null;
  let s1 = b.s1, why1 = b.why1;
  if (xEnd != null && xEnd < b.x1) { s1 = Math.min(s1, upS(U, xEnd)); why1 = 'ctrl'; }
  if (s1 - b.s0 < lam - 1e-9) return null;
  const L = (s1 - b.s0) * c, n = Math.max(0, Math.floor((L + g + 1e-9) / (spec.s + g)));
  return { x0: b.x0, x1: upX(U, s1), s0: b.s0, s1, L, n, why0: b.why0, why1, fMax: b.fMax, eps: b.kMax / c * spec.t / 2, lam };
}

/* Spalten auf einer Flügelhälfte. geo: { h (Halbspannweite), yR, yT, bans [[y0, y1]], breaks,
   band(y) → { xs, xe } (Beginn und Ende der belegbaren Zone in Flugrichtung, null wenn keine),
   arcLen(y, xa, xb) → Bogenlänge der Oberseite zwischen xa und xb }.
   Ohne band: xs(y), xe(y) und der feste Bogenfaktor arc (wie bis Version 8). */
function packColumns(geo, spec, g, arc, orient) {
  const { h, yR, yT, bans, breaks } = geo;
  const lng = Math.max(spec.a, spec.b), sht = Math.min(spec.a, spec.b);
  // Ausrichtungen als [Breite in Spannweite w, Länge in Flugrichtung l]
  const ors = lng - sht < 1e-9 ? [[lng, lng]] : orient === 'span' ? [[lng, sht]] : orient === 'chord' ? [[sht, lng]] : [[lng, sht], [sht, lng]];
  const usable = (ya, yb) => {
    const pts = [ya, yb]; for (let k = 1; k < 6; k++) pts.push(ya + (yb - ya) * k / 6);
    for (const y of breaks) if (y > ya && y < yb) pts.push(y - 1e-7, y + 1e-7);
    let s = -Infinity, e = Infinity;
    if (geo.band) {
      for (const y of pts) { const b = geo.band(y); if (!b) return { L: 0, x0: 0, k: 1 }; s = Math.max(s, b.xs); e = Math.min(e, b.xe); }
      if (!(e > s)) return { L: 0, x0: s, k: 1 };
      let L = Infinity; for (const y of pts) L = Math.min(L, geo.arcLen(y, s, e));
      return { L, x0: s, k: L / (e - s) };
    }
    for (const y of pts) { s = Math.max(s, geo.xs(y)); e = Math.min(e, geo.xe(y)); }
    return { L: (e - s) * arc, x0: s, k: arc };
  };
  const cols = [];
  let y = Math.max(0, yR), guard = 0;
  while (y < yT - 1e-9 && guard++ < 5000) {
    const ban = bans.find(([b0, b1]) => y >= b0 - 1e-9 && y < b1 - 1e-9);
    if (ban) { y = ban[1]; continue; }
    const lim = Math.min(yT, bans.filter(([b0]) => b0 > y + 1e-9).reduce((m, [b0]) => Math.min(m, b0), Infinity));
    let best = null;
    for (const [w, l] of ors) {
      if (y + w > lim + 1e-9) continue;
      const u = usable(y, y + w), n = Math.max(0, Math.floor((u.L + g + 1e-9) / (l + g)));
      const dens = n * spec.A / (w + g);
      if (n > 0 && (!best || dens > best.dens + 1e-12)) best = { w, l, n, x0: u.x0, k: u.k, dens };
    }
    if (!best) {
      // hier passt nichts: bis zur nächsten Sperrzone springen, sonst in kleinen Schritten weiter (Querruderende, Biegung)
      if (lim < yT && ors.every(([w]) => y + w > lim + 1e-9)) { y = lim; continue; }
      y += 0.005; continue;
    }
    cols.push({ y0: y, y1: y + best.w, w: best.w, l: best.l, n: best.n, x0: best.x0, k: best.k });
    y += best.w + g;
  }
  return cols;
}
function colsSummary(cols, spec, g, h, limitHalf) {
  let left = limitHalf == null ? Infinity : Math.max(0, Math.floor(limitHalf));
  const used = [];
  for (const c of cols) { if (left <= 0) break; const n = Math.min(c.n, left); used.push({ ...c, n }); left -= n; }
  const n = used.reduce((s, c) => s + c.n, 0), aMod = used.reduce((s, c) => s + c.n * (c.w + g) * (c.l + g), 0);
  return { cols: used, n, a: n * spec.A, aMod, eta: used.length ? used[used.length - 1].y1 / h : 0 };
}
function solarLayout(P, C) {
  const pf = C.pf, tg = C.tail, h = pf.b / 2, spec = cellSpec(P), g = clamp((P.cellGap ?? 2) / 1000, 0, 0.03), lim = bendLimits(P, spec);
  const U = foilUpper(C.foil);
  // Flügel: Zellband je Station aus der Biegung, hinten vor der Querruderachse (ohne Freigabe)
  const ctrl = !P.cellsOnCtrl, aE0 = clamp(P.ailEta0, 0, 1), aE1 = clamp(P.ailEta1, aE0, 1), hinge = 1 - clamp(P.ailCf, 0.05, 0.6);
  const onAil = y => ctrl && y >= aE0 * h - 1e-9 && y <= aE1 * h + 1e-9;
  const bandAt = y => { const e = clamp(y / h, 0, 1), c = pf.chordAt(e); return cellBand(C.foil, c, spec, lim, g, onAil(y) ? hinge - g / c : null); };
  const bans = [];
  if (P.splits === 'outer' || P.splits === 'both') { const ys = clamp(P.splitEta, 0.05, 0.95) * h, w = Math.max(0, P.cellJointGap ?? 0.04) / 2; bans.push([ys - w, ys + w]); }
  const geoW = {
    h, yR: clamp(P.cellRootGap ?? 0.1, 0, h), yT: h - clamp(P.cellTipGap ?? 0.03, 0, h), bans,
    band: y => { const b = bandAt(y); if (!b) return null; const e = clamp(y / h, 0, 1), c = pf.chordAt(e), xl = pf.xLE(e); return { xs: xl + b.x0 * c, xe: xl + b.x1 * c }; },
    arcLen: (y, xa, xb) => { const e = clamp(y / h, 0, 1), c = pf.chordAt(e), xl = pf.xLE(e); return c * (upS(U, (xb - xl) / c) - upS(U, (xa - xl) / c)); },
    breaks: [aE0 * h, aE1 * h, (pf.type === 'rect_taper' ? pf.e : 0) * h].filter(y => y > 0 && y < h)
  };
  const colsW = packColumns(geoW, spec, g, 1, P.cellOrient);
  const maxW = colsSummary(colsW, spec, g, h);
  // Kennwerte des Zellbands an Wurzel, Knick und Spitze (für Anzeige und Profilvergleich)
  const stations = [[0, 'Wurzel'], ...(pf.type === 'rect_taper' && pf.e > 0.02 && pf.e < 0.98 ? [[pf.e, 'Knick']] : []), [0.5, 'halbe Spannweite'], [aE0 > 0.02 ? (aE0 + aE1) / 2 : 0.75, 'Querruder'], [1 - clamp(P.cellTipGap ?? 0.03, 0, h) / h, 'Spitze']];
  const bands = stations.sort((a, b) => a[0] - b[0]).filter((s, i, a) => !i || s[0] - a[i - 1][0] > 0.02).map(([e, l]) => ({ eta: e, l, c: pf.chordAt(e), b: bandAt(e * h) }));
  // Bandgrenzen über die Spannweite (für die Zeichnung): [η, x_vorn, x_hinten] als Tiefenanteile, null ohne Band
  const edge = []; for (let k = 0; k <= 60; k++) { const e = k / 60, b = bandAt(e * h); edge.push([e, b ? b.x0 : null, b ? b.x1 : null]); }
  // Höhenleitwerk (Rechteck): Zellband auf dem Leitwerksprofil, vor dem Höhenruder, Mitte für Träger und Seitenleitwerk frei
  let maxH = { cols: [], n: 0, a: 0, aMod: 0, eta: 0 }, bandH = null;
  if (tg && tg.bh > 0 && tg.ch > 0) {
    const hh = tg.bh / 2, eF = clamp(P.elevCf, 0.1, 1), hingeH = eF >= 0.999 ? 1 : 1 - eF, UH = foilUpper(C.tfoil);
    bandH = cellBand(C.tfoil, tg.ch, spec, lim, g, !P.cellsOnCtrl && hingeH < lim.x1 ? hingeH - g / tg.ch : null);
    const twin = C.cfg && C.cfg.nBoom > 1;
    const geoH = {
      h: hh, yR: twin ? 0 : 0.03, yT: hh - (twin ? 0.03 : 0.01), bans: [], breaks: [],
      band: () => (bandH ? { xs: bandH.x0 * tg.ch, xe: bandH.x1 * tg.ch } : null),
      arcLen: (y, xa, xb) => tg.ch * (upS(UH, xb / tg.ch) - upS(UH, xa / tg.ch))
    };
    maxH = colsSummary(packColumns(geoH, spec, g, 1, P.cellOrient), spec, g, hh);
  }
  const mode = ['fill', 'count', 'area'].includes(P.solarMode) ? P.solarMode : 'fill';
  // mittleres Zellband (nach Zellenzahl gewichtet) für Einstrahlung, Massenlage und Torsionskasten
  const meanBand = cols => {
    let w = 0, a = 0, b = 0;
    for (const c of cols) { if (!(c.n > 0)) continue; const ym = (c.y0 + c.y1) / 2, e = clamp(ym / h, 0, 1), ch = pf.chordAt(e), xl = pf.xLE(e); a += c.n * (c.x0 - xl) / ch; b += c.n * (c.x0 + (c.n * (c.l + g) - g) / c.k - xl) / ch; w += c.n; }
    return w > 0 ? [a / w, b / w] : null;
  };
  let wing, fits = true, want = null;
  if (mode === 'area') {
    // Fläche wie eingegeben, von der Wurzel nach außen auf dem Zellband (bei mittlerer Tiefe) verteilt
    const bm = cellBand(C.foil, pf.mac, spec, lim, g, null), x0 = bm ? bm.x0 : lim.x0, x1 = bm ? bm.x1 : lim.x1;
    let aNeed = Math.max(0, P.solarArea) / 2, eta = 0; const dE = 0.002;
    while (aNeed > 0 && eta < 1) { aNeed -= pf.chordAt(eta) * (x1 - x0) * 1.02 * dE * h; eta += dE; }
    const a = Math.max(0, P.solarArea);
    wing = { cols: [], n: spec.A > 0 ? a / spec.A : 0, a, aMod: a, eta: Math.min(1, eta), band: [x0, x1] };
    fits = aNeed <= 1e-6;
  } else if (mode === 'count') {
    want = Math.max(0, Math.round(P.nCellsWing || 0));
    const s = colsSummary(colsW, spec, g, h, Math.ceil(want / 2));
    wing = { ...s, n: 2 * s.n, a: 2 * s.a, aMod: 2 * s.aMod };
    fits = wing.n >= want;
  } else wing = { ...maxW, n: 2 * maxW.n, a: 2 * maxW.a, aMod: 2 * maxW.aMod };
  const mb = wing.band || meanBand(wing.cols) || meanBand(maxW.cols) || (bands[0].b ? [bands[0].b.x0, bands[0].b.x1] : [lim.x0, lim.x1]);
  // Höhenleitwerk: Anteil der Fläche wie eingegeben, höchstens so viel, wie ganze Zellen belegen können
  const htWant = clamp(P.htSolar / 100, 0, 0.95) * (tg ? tg.Sh : 0), htMax = 2 * maxH.a;
  const htA = mode === 'area' ? htWant : Math.min(htWant, htMax);
  return {
    mode, spec, g, lim, x0: mb[0], x1: mb[1], bands, edge, bandH, wing, colsHalf: mode === 'area' ? [] : wing.cols,
    ht: { a: htA, want: htWant, max: htMax, aMod: mode === 'area' ? htA : htA * (maxH.a > 0 ? maxH.aMod / maxH.a : 1), cols: maxH.cols, fits: htWant <= htMax + 1e-9 },
    max: { n: 2 * maxW.n, a: 2 * maxW.a, cols: maxW.cols }, want, fits, overMax: wing.a > 2 * maxW.a * 1.0001 + 1e-9,
    a: wing.a, aMod: wing.aMod, n: wing.n, eta: wing.eta, nHalf: Math.round(wing.n / 2), vHalf: Math.round(wing.n / 2) * spec.vmp
  };
}

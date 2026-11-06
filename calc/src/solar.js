/* ===================================================================
   Solarzellen auf Flügel und Höhenleitwerk: ganze Rechteckzellen packen
   - Zellformate aus Datenblättern (SunPower C60: 125 × 125 mm, Ø 160 mm,
     pseudoquadratisch; AZUR SPACE 3G30C-Advanced: 80 × 40 mm, 30,18 cm²)
     oder eigenes Maß. Halbe und Viertelzellen entstehen durch Teilen der
     ganzen Zelle (Fläche anteilig, Fasen bleiben an den Ecken).
   - Belegung in Spalten in Flugrichtung, von der Wurzel nach außen. Je Spalte
     passen n = ⌊(L·k_Bogen + g)/(l + g)⌋ Zellen; L ist die nutzbare Tiefe
     zwischen cellX0 und cellX1 (Minimum über die Spaltenbreite, also auch
     bei Zuspitzung und Pfeilung), k_Bogen das Verhältnis von Bogenlänge der
     Oberseite zu Profiltiefe. Je Spalte die Ausrichtung mit der größten
     Zellfläche je Spannweite (oder fest vorgegeben).
   - Freiräume: Rumpf an der Wurzel, Flügelspitze, äußere Flügelteilung,
     wahlweise Querruder und Höhenruder (Zellen enden vor der Drehachse).
   - Modi: so viele Zellen wie passen, vorgegebene Anzahl, oder Fläche frei
     eingegeben (wie bis Version 7; die Packung zeigt dann nur die Grenze).
   =================================================================== */
const CELL_TYPES = {
  c60h: { name: 'SunPower C60 halbiert (125 × 62,5 mm)', s: 0.125, d: 0.160, cut: 2, a: 0.125, b: 0.0625, vmp: 0.58 },
  c60: { name: 'SunPower C60 ganz (125 × 125 mm)', s: 0.125, d: 0.160, cut: 1, a: 0.125, b: 0.125, vmp: 0.58 },
  c60q: { name: 'SunPower C60 geviertelt (62,5 × 62,5 mm)', s: 0.125, d: 0.160, cut: 4, a: 0.0625, b: 0.0625, vmp: 0.58 },
  azur: { name: 'AZUR SPACE 3G30C-Advanced (80 × 40 mm)', A: 30.18e-4, a: 0.080, b: 0.040, vmp: 2.41 },
  custom: { name: 'Eigenes Format' }
};
// Fläche einer pseudoquadratischen Zelle: Quadrat mit Seite s, Ecken vom Ingot-Kreis (Durchmesser d) abgeschnitten
function pseudoSquareArea(s, d) {
  const h = s / 2, R = d / 2;
  if (R >= h * Math.SQRT2) return s * s;
  if (R <= h) return Math.PI * R * R;
  const x0 = Math.sqrt(R * R - h * h), F = x => 0.5 * (x * Math.sqrt(Math.max(0, R * R - x * x)) + R * R * Math.asin(Math.min(1, x / R)));
  return 4 * (h * x0 + F(h) - F(x0));
}
function cellSpec(P) {
  const key = CELL_TYPES[P.cellType] ? P.cellType : 'c60h', t = CELL_TYPES[key];
  if (key === 'custom') {
    const a = clamp((P.cellA || 125) / 1000, 0.005, 0.6), b = clamp((P.cellB || 125) / 1000, 0.005, 0.6);
    return { key, name: `Eigenes Format (${nf0(a * 1000)} × ${nf0(b * 1000)} mm)`, a, b, A: a * b, vmp: clamp(P.cellVmp || 0.58, 0.1, 5) };
  }
  const A = t.A || pseudoSquareArea(t.s, t.d) / t.cut;
  return { key, name: t.name, a: t.a, b: t.b, A, vmp: t.vmp };
}
const nf0 = x => String(Math.round(x * 10) / 10).replace('.', ',');

/* Spalten auf einer Flügelhälfte. geo: { h (Halbspannweite), xs(y), xe(y) (Beginn und Ende der
   belegbaren Zone in Flugrichtung), breaks (y mit Knick oder Sprung), yR, yT, bans [[y0, y1]] } */
function packColumns(geo, spec, g, arc, orient) {
  const { h, xs, xe, breaks, yR, yT, bans } = geo;
  const lng = Math.max(spec.a, spec.b), sht = Math.min(spec.a, spec.b);
  // Ausrichtungen als [Breite in Spannweite w, Länge in Flugrichtung l]
  const ors = lng - sht < 1e-9 ? [[lng, lng]] : orient === 'span' ? [[lng, sht]] : orient === 'chord' ? [[sht, lng]] : [[lng, sht], [sht, lng]];
  const usable = (ya, yb) => {
    const pts = [ya, yb]; for (let k = 1; k < 6; k++) pts.push(ya + (yb - ya) * k / 6);
    for (const y of breaks) if (y > ya && y < yb) pts.push(y - 1e-7, y + 1e-7);
    let s = -Infinity, e = Infinity; for (const y of pts) { s = Math.max(s, xs(y)); e = Math.min(e, xe(y)); }
    return { L: e - s, x0: s };
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
      const u = usable(y, y + w), n = Math.max(0, Math.floor((u.L * arc + g + 1e-9) / (l + g)));
      const dens = n * spec.A / (w + g);
      if (n > 0 && (!best || dens > best.dens + 1e-12)) best = { w, l, n, x0: u.x0, dens };
    }
    if (!best) {
      // hier passt nichts: bis zur nächsten Sperrzone springen, sonst in kleinen Schritten weiter (Querruderende)
      if (lim < yT && ors.every(([w]) => y + w > lim + 1e-9)) { y = lim; continue; }
      y += 0.005; continue;
    }
    cols.push({ y0: y, y1: y + best.w, w: best.w, l: best.l, n: best.n, x0: best.x0 });
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
  const pf = C.pf, tg = C.tail, h = pf.b / 2, spec = cellSpec(P), g = clamp((P.cellGap ?? 2) / 1000, 0, 0.03);
  const x0 = clamp(P.cellX0 / 100, 0, 0.95), x1 = clamp(P.cellX1 / 100, x0 + 0.02, 1);
  // Bogenlänge der Oberseite zwischen cellX0 und cellX1 je Tiefe (Zellen liegen auf der gewölbten Haut)
  let arc = 1.02;
  try { if (C.foil && C.foil.shape) arc = clamp(cellPanels(P, C.foil).arc, 1, 1.15); } catch (e) { /* Profil ohne Kontur */ }
  // Flügel
  const ctrl = !P.cellsOnCtrl, aE0 = clamp(P.ailEta0, 0, 1), aE1 = clamp(P.ailEta1, aE0, 1), hinge = 1 - clamp(P.ailCf, 0.05, 0.6);
  const onAil = y => ctrl && y >= aE0 * h - 1e-9 && y <= aE1 * h + 1e-9;
  const bans = [];
  if (P.splits === 'outer' || P.splits === 'both') { const ys = clamp(P.splitEta, 0.05, 0.95) * h, w = Math.max(0, P.cellJointGap ?? 0.04) / 2; bans.push([ys - w, ys + w]); }
  const geoW = {
    h, yR: clamp(P.cellRootGap ?? 0.1, 0, h), yT: h - clamp(P.cellTipGap ?? 0.03, 0, h), bans,
    xs: y => pf.xLE(y / h) + x0 * pf.chordAt(y / h),
    xe: y => { const e = y / h, c = pf.chordAt(e); return onAil(y) && hinge < x1 ? pf.xLE(e) + hinge * c - g : pf.xLE(e) + x1 * c; },
    breaks: [aE0 * h, aE1 * h, (pf.type === 'rect_taper' ? pf.e : 0) * h].filter(y => y > 0 && y < h)
  };
  const colsW = packColumns(geoW, spec, g, arc, P.cellOrient);
  const maxW = colsSummary(colsW, spec, g, h);
  // Höhenleitwerk (Rechteck): Zellen zwischen cellX0 und cellX1, vor dem Höhenruder, Mitte für Träger und Seitenleitwerk frei
  let maxH = { cols: [], n: 0, a: 0, aMod: 0, eta: 0 };
  if (tg && tg.bh > 0 && tg.ch > 0) {
    const hh = tg.bh / 2, eF = clamp(P.elevCf, 0.1, 1), hingeH = eF >= 0.999 ? 1 : 1 - eF;
    const xeH = !P.cellsOnCtrl && hingeH < x1 ? hingeH * tg.ch - g : x1 * tg.ch;
    const twin = C.cfg && C.cfg.nBoom > 1;
    const geoH = { h: hh, yR: twin ? 0 : 0.03, yT: hh - (twin ? 0.03 : 0.01), bans: [], xs: () => x0 * tg.ch, xe: () => xeH, breaks: [] };
    maxH = colsSummary(packColumns(geoH, spec, g, 1.0, P.cellOrient), spec, g, hh);
  }
  const mode = ['fill', 'count', 'area'].includes(P.solarMode) ? P.solarMode : 'fill';
  let wing, fits = true, want = null;
  if (mode === 'area') {
    // Fläche wie eingegeben, von der Wurzel nach außen auf der Zellzone verteilt (Verfahren bis Version 7)
    let aNeed = Math.max(0, P.solarArea) / 2, eta = 0; const dE = 0.002;
    while (aNeed > 0 && eta < 1) { aNeed -= pf.chordAt(eta) * (x1 - x0) * 1.02 * dE * h; eta += dE; }
    const a = Math.max(0, P.solarArea);
    wing = { cols: [], n: spec.A > 0 ? a / spec.A : 0, a, aMod: a, eta: Math.min(1, eta) };
    fits = aNeed <= 1e-6;
  } else if (mode === 'count') {
    want = Math.max(0, Math.round(P.nCellsWing || 0));
    const s = colsSummary(colsW, spec, g, h, Math.ceil(want / 2));
    wing = { ...s, n: 2 * s.n, a: 2 * s.a, aMod: 2 * s.aMod };
    fits = wing.n >= want;
  } else wing = { ...maxW, n: 2 * maxW.n, a: 2 * maxW.a, aMod: 2 * maxW.aMod };
  // Höhenleitwerk: Anteil der Fläche wie eingegeben, höchstens so viel, wie ganze Zellen belegen können
  const htWant = clamp(P.htSolar / 100, 0, 0.95) * (tg ? tg.Sh : 0), htMax = 2 * maxH.a;
  const htA = mode === 'area' ? htWant : Math.min(htWant, htMax);
  return {
    mode, spec, g, arc, x0, x1, wing, colsHalf: mode === 'area' ? [] : wing.cols, ht: { a: htA, want: htWant, max: htMax, aMod: mode === 'area' ? htA : htA * (maxH.a > 0 ? maxH.aMod / maxH.a : 1), cols: maxH.cols, fits: htWant <= htMax + 1e-9 },
    max: { n: 2 * maxW.n, a: 2 * maxW.a, cols: maxW.cols }, want, fits, overMax: wing.a > 2 * maxW.a * 1.0001 + 1e-9,
    a: wing.a, aMod: wing.aMod, n: wing.n, eta: wing.eta, nHalf: Math.round(wing.n / 2), vHalf: Math.round(wing.n / 2) * spec.vmp
  };
}

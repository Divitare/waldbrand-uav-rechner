/* ===================================================================
   Rechenkern Teil 3: Einsatzleistung (Sensorstreifen, Flächenleistung,
   Wind, Brand-Erkennung), SORA 2.5, Unsicherheit, Ausgleichsrechnung.
   =================================================================== */

/* ---------- Wind in Flughöhe (Hellmann-Profil, Weibull-Verteilung) ---------- */
function gammaFn(z) { // Lanczos
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
function windAtAlt(P) {
  const h = Math.max(2, P.hAGL), u = P.wind10 * Math.pow(h / 10, P.hellmann), k = Math.max(1.1, P.weibullK);
  const c = u / gammaFn(1 + 1 / k), exceed = x => Math.exp(-Math.pow(Math.max(0, x) / c, k));
  return { u, k, c, exceed };
}
// Mittlerer Faktor der Flächenleistung im Wind: Mäander mit Hin- und Rückflug längs und Vorhaltewinkel quer
function windCoverage(V, w) {
  const r = w / V; if (r >= 1) return 0;
  return 0.5 * (1 - r * r) + 0.5 * Math.sqrt(1 - r * r);
}
function windStats(P, V) {
  const W = windAtAlt(P);
  let fc = 0, n = 200, du = 4 * W.c / n, pdfSum = 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) * du, pdf = (W.k / W.c) * Math.pow(u / W.c, W.k - 1) * Math.exp(-Math.pow(u / W.c, W.k));
    fc += windCoverage(V, u) * pdf * du; pdfSum += pdf * du;
  }
  return { ...W, coverage: fc / pdfSum, pHold: 1 - W.exceed(0.9 * V), pHalf: W.exceed(0.5 * V), pOver: W.exceed(V) };
}

/* ---------- Sensorstreifen und Flächenleistung ---------- */
function footprint(h, hfov, resH, resV) {
  const sw = 2 * h * Math.tan(hfov / 2 * DEG), gsd = sw / resH;
  return { swath: sw, gsd, along: gsd * resV };
}
// Bandstrahldichte 8–14 µm (Planck), W/(m²·sr)
function bandRad(T, l1 = 8e-6, l2 = 14e-6) {
  const h = 6.62607e-34, c = 2.99792e8, k = 1.380649e-23, n = 60; let s = 0;
  for (let i = 0; i < n; i++) { const l = l1 + (l2 - l1) * (i + 0.5) / n; s += 2 * h * c * c / (l ** 5) / (Math.exp(h * c / (l * k * T)) - 1); }
  return s * (l2 - l1) / n;
}
// Mischpixel-Ansatz (Dozier 1981): kleinster Brand, der ein Pixel um den Schwellwert über den Hintergrund hebt
function fireDetection(P, gsd, Tfire) {
  const Tf = Tfire || P.fireT, Lb = bandRad(P.bgT), Lf = bandRad(Tf), Lt = bandRad(P.bgT + P.clutterDT), Ln = bandRad(P.bgT + 5 * P.irNETD / 1000);
  const fmin = (Lt - Lb) / (Lf - Lb), fnoise = (Ln - Lb) / (Lf - Lb);
  const Amin = fmin * gsd * gsd, k = P.irRes / (2 * Math.tan(P.irHFOV / 2 * DEG));
  // größte Flughöhe für einen Brand der Fläche fireRef, mit Transmission der klaren Atmosphäre im LWIR (β ≈ 0,15/km)
  let hMax = Math.sqrt(P.fireRef / fmin) * k;
  for (let i = 0; i < 30; i++) { const tau = Math.exp(-0.15 * hMax / 1000); hMax = Math.sqrt(P.fireRef * tau / fmin) * k; }
  return { fmin, fnoise, Amin, AminNoise: fnoise * gsd * gsd, gsdMax: hMax / k, hMax, tauAt: Math.exp(-0.15 * hMax / 1000) };
}
function missionPerf(C) {
  const P = C.P, V = P.v, ws = windStats(P, V);
  const ir = footprint(P.hAGL, P.irHFOV, P.irRes, P.irResV), rgb = footprint(P.hAGL, P.rgbHFOV, P.rgbRes, P.rgbResV);
  const legEff = P.legKm > 0 ? P.legKm * 1000 / (P.legKm * 1000 + Math.PI * Math.max(V * V / (G * Math.tan(clamp(P.bank, 5, 60) * DEG)), ir.swath / 2)) : 1;
  const rate = s => s.swath * (1 - P.overlap / 100) * V * 3600 / 1e6 * legEff * ws.coverage; // km²/h
  const fire = fireDetection(P, ir.gsd), smoulder = fireDetection(P, ir.gsd, 600), flame = fireDetection(P, ir.gsd, 1000);
  const radioKm = 4.12 * (Math.sqrt(2) + Math.sqrt(Math.max(1, P.hAGL)));
  const turnR = V * V / (G * Math.tan(clamp(P.bank, 1, 60) * DEG));
  return { ws, ir, rgb, legEff, rateIr: rate(ir), rateRgb: rate(rgb), revisitIr: P.areaKm2 / Math.max(1e-6, rate(ir)), revisitRgb: P.areaKm2 / Math.max(1e-6, rate(rgb)), fire, smoulder, flame, radioKm, turnR };
}

/* ---------- SORA 2.5 (JARUS, Main Body Tabellen 2, 5, 7) ---------- */
const IGRC = [[1, 1, 2, 3, 3], [2, 3, 4, 5, 6], [3, 4, 5, 6, 7], [4, 5, 6, 7, 8], [5, 6, 7, 8, 9], [6, 7, 8, 9, 10], [7, 8, null, null, null]];
const DENS = [['ctrl', 'Kontrolliertes Bodengebiet'], ['5', '< 5 Pers./km²'], ['50', '< 50 Pers./km²'], ['500', '< 500 Pers./km²'], ['5000', '< 5.000 Pers./km²'], ['50000', '< 50.000 Pers./km²'], ['max', '> 50.000 Pers./km²']];
const COLS = [[1, 25], [3, 35], [8, 75], [20, 120], [40, 200]];
const SAILT = { 2: ['I', 'II', 'IV', 'VI'], 3: ['II', 'II', 'IV', 'VI'], 4: ['III', 'III', 'IV', 'VI'], 5: ['IV', 'IV', 'IV', 'VI'], 6: ['V', 'V', 'V', 'VI'], 7: ['VI', 'VI', 'VI', 'VI'] };
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
const MITIG = {
  m1a: { name: 'M1(A) Abschirmung (Sheltering)', opts: [[0, 'keine'], [-1, 'niedrig (−1)'], [-2, 'mittel (−2)']] },
  m1b: { name: 'M1(B) Betriebliche Beschränkungen', opts: [[0, 'keine'], [-1, 'mittel (−1)'], [-2, 'hoch (−2)']] },
  m1c: { name: 'M1(C) Bodenbeobachtung', opts: [[0, 'keine'], [-1, 'niedrig (−1)']] },
  m2: { name: 'M2 Aufprallenergie verringert (Fallschirm)', opts: [[0, 'keine'], [-1, 'mittel (−1)'], [-2, 'hoch (−2)']] }
};
// Luftraum-Begegnungsklassen (AEC) nach SORA Annex C / Main Body Abb. 6
const AEC = [
  [1, 'Flughafen-/Heliportumgebung in Luftraum B, C oder D', 'd'],
  [2, 'Flughafen-/Heliportumgebung in Luftraum E, F oder G', 'c'],
  [3, 'Über 500 ft AGL in Mode-S-Veil oder TMZ', 'd'],
  [4, 'Über 500 ft AGL im kontrollierten Luftraum', 'd'],
  [5, 'Über 500 ft AGL, unkontrolliert, über städtischem Gebiet', 'c'],
  [6, 'Über 500 ft AGL, unkontrolliert, über ländlichem Gebiet', 'c'],
  [7, 'Unter 500 ft AGL in Mode-S-Veil oder TMZ', 'c'],
  [8, 'Unter 500 ft AGL im kontrollierten Luftraum', 'c'],
  [9, 'Unter 500 ft AGL, unkontrolliert, über städtischem Gebiet', 'c'],
  [10, 'Unter 500 ft AGL, unkontrolliert, über ländlichem Gebiet', 'b'],
  [11, 'Oberhalb FL 600', 'b'],
  [12, 'Atypischer oder abgetrennter Luftraum', 'a']
];
const TMPR = { a: 'keine', b: 'niedrig', c: 'mittel', d: 'hoch' };
function sora(P, m) {
  const cd = COLS.findIndex(c => P.span <= c[0]), cv = COLS.findIndex(c => P.vmax <= c[1]);
  const aec = AEC.find(a => a[0] === Number(P.aec)) || AEC[9];
  const arc0 = aec[2], arcI = Math.max(0, 'abcd'.indexOf(arc0) + Number(P.arcStrat || 0));
  const arc = (aec[0] === 12 ? 'a' : 'abcd'[Math.max(aec[0] === 12 ? 0 : 1, arcI)]);
  const adjR = clamp(3 * 60 * P.vmax / 1000, 5, 35), opsR = Math.max(0.1, P.opsRadius);
  const out = { col: null, aec, arc0, arc, tmpr: TMPR[arc], adjR, adjArea: Math.PI * ((opsR + adjR) ** 2 - opsR ** 2), opsArea: Math.PI * opsR * opsR, ke: m ? 0.5 * m * P.vmax ** 2 : NaN };
  if (cd < 0 || cv < 0) return out;
  const col = Math.max(cd, cv), row = DENS.findIndex(d => d[0] === P.density);
  out.col = col; out.row = row; out.colByDim = cd; out.colBySpeed = cv;
  const i = IGRC[row] ? IGRC[row][col] : null;
  out.igrc = i;
  if (i == null) return out;
  const red = Number(P.m1a) + Number(P.m1b) + Number(P.m1c) + Number(P.m2);
  const f = Math.max(IGRC[0][col], i + red);
  out.red = red; out.fgrc = f;
  out.sail = f > 7 ? null : SAILT[Math.max(2, f)]['abcd'.indexOf(arc)];
  return out;
}

/* ---------- Unsicherheit: Tornado und Monte-Carlo ---------- */
const UNC = [
  { key: 'prof', label: 'Profilwiderstand (Polaren NeuralFoil ↔ Messung)', sd: 0.08 },
  { key: 'par', label: 'Schädlicher Widerstand (Rumpf, Leitwerk, Anbauten)', sd: 0.2 },
  { key: 'ind', label: 'Induzierter Widerstand (Spannweitenwirkungsgrad)', sd: 0.04 },
  { key: 'eta', label: 'Antriebswirkungsgrad', sd: 0.05 },
  { key: 'struct', label: 'Strukturmasse', sd: 0.15 },
  { key: 'batt', label: 'Nutzbare Akkuenergie', sd: 0.05 },
  { key: 'solar', label: 'Solarertrag (Zellen, Laminat, Verschaltung)', sd: 0.05 },
  { key: 'comp', label: 'Leistung der Bordsysteme', sd: 0.15 },
  { key: 'sky', label: 'Einstrahlung (Dunst, Trübung)', sd: 5, param: true },
  { key: 'tMin', label: 'Nachttemperatur', sd: 4, param: true }
];
function evalCase(P, comps, k, n, year) {
  const C = buildCase(P, comps, k), ser = daySeries(C, envClear(P, n, year)), per = periodic(C, ser), mis = mission(C, ser, ser, false);
  return { C, per, mis, tExc: per.tExc, socMin: mis ? mis.minE / C.cap : NaN, m: C.m };
}
function applyUnc(P, u, z) {
  const k = {}, Q = { ...P };
  if (u.param) { Q[u.key] = u.key === 'sky' ? clamp(P.sky + z * u.sd, 30, 115) : P[u.key] + z * u.sd; if (u.key === 'tMin') Q.tMax = P.tMax + z * u.sd * 0.5; }
  else k[u.key] = Math.max(0.3, 1 + z * u.sd);
  return { Q, k };
}
function tornado(P, comps, z = 1) {
  const n = dayOfYear(P.date), y = yearOf(P.date), base = evalCase(P, comps, null, n, y);
  const rows = UNC.map(u => {
    const lo = applyUnc(P, u, -z), hi = applyUnc(P, u, z);
    const a = evalCase(lo.Q, comps, lo.k, n, y), b = evalCase(hi.Q, comps, hi.k, n, y);
    const fx = r => (fin(r.tExc) ? r.tExc : -24);
    return { ...u, lo: fx(a) - fx(base), hi: fx(b) - fx(base), socLo: a.socMin - base.socMin, socHi: b.socMin - base.socMin, mLo: a.m - base.m, mHi: b.m - base.m };
  });
  rows.sort((p, q) => Math.max(Math.abs(q.lo), Math.abs(q.hi)) - Math.max(Math.abs(p.lo), Math.abs(p.hi)));
  return { base, rows };
}
function monteCarlo(P, comps, N = 300, seed = 11) {
  const rnd = mulberry(seed), n = dayOfYear(P.date), y = yearOf(P.date), res = [];
  for (let i = 0; i < N; i++) {
    let Q = { ...P }; const k = {};
    for (const u of UNC) {
      const z = clamp(gauss(rnd), -2.5, 2.5), a = applyUnc(Q, u, z);
      Q = a.Q; Object.assign(k, a.k);
    }
    const r = evalCase(Q, comps, k, n, y);
    res.push({ tExc: fin(r.tExc) ? r.tExc : (r.tExc === Infinity ? 24 : -24), soc: r.socMin, m: r.m, ok: r.mis && r.mis.ok });
  }
  const t = res.map(r => r.tExc).sort((a, b) => a - b), q = p => t[Math.min(t.length - 1, Math.floor(p * t.length))];
  return {
    res, N, mean: t.reduce((s, v) => s + v, 0) / N, p5: q(0.05), p50: q(0.5), p95: q(0.95),
    pPerp: res.filter(r => r.tExc >= 0).length / N, pReq: res.filter(r => r.tExc >= P.tExcReq).length / N, pMission: res.filter(r => r.ok).length / N
  };
}

/* ---------- Ausgleichsrechnung eigener Flugdaten: P = a·V³ + b/V ---------- */
function parseFlightData(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const nums = line.replace(/,(?=\d)/g, '.').split(/[;\t ]+|,\s*/).map(s => Number(s)).filter(fin);
    if (nums.length >= 2 && nums[0] > 0 && nums[1] > 0) rows.push({ V: nums[0], P: nums[1] });
  }
  return rows;
}
function fitPower(rows) {
  if (rows.length < 3) return null;
  let s11 = 0, s12 = 0, s22 = 0, y1 = 0, y2 = 0;
  for (const r of rows) { const a = r.V ** 3, b = 1 / r.V; s11 += a * a; s12 += a * b; s22 += b * b; y1 += a * r.P; y2 += b * r.P; }
  const det = s11 * s22 - s12 * s12; if (Math.abs(det) < 1e-12) return null;
  const A = (y1 * s22 - y2 * s12) / det, B = (s11 * y2 - s12 * y1) / det;
  const mean = rows.reduce((s, r) => s + r.P, 0) / rows.length;
  let ss = 0, st = 0; for (const r of rows) { const p = A * r.V ** 3 + B / r.V; ss += (r.P - p) ** 2; st += (r.P - mean) ** 2; }
  return { A, B, rms: Math.sqrt(ss / rows.length), r2: st > 0 ? 1 - ss / st : NaN, n: rows.length, vMinP: Math.pow(B / (3 * A), 0.25), pMin: NaN };
}

/* ---------- Parameterstudien ---------- */
function studyPoint(P, comps, n, year) {
  const r = evalCase(P, comps, null, n, year), C = r.C;
  return { tExc: r.tExc, soc: r.socMin, m: C.m, mStruct: C.mass.struct, pProp: C.pProp, pTot: C.pProp + C.comp.always + C.comp.day + C.comp.mission, ok: r.mis && r.mis.ok, endur: r.mis ? r.mis.endur : null, C };
}
function sweep(P, comps, values, map) {
  const n = dayOfYear(P.date), y = yearOf(P.date);
  return values.map(v => ({ x: v, ...studyPoint(map(P, v), comps, n, y) }));
}
const range = (a, b, k) => Array.from({ length: k + 1 }, (_, i) => a + (b - a) * i / k);
const SWEEPS = {
  span: { label: 'Spannweite (gleiche Flügeltiefe)', unit: 'm', vals: P => range(Math.max(2.5, P.span - 2.5), P.span + 2.5, 20), map: (P, b) => ({ ...P, span: b, area: P.area * b / P.span, solarArea: P.solarArea * b / P.span }) },
  spanAR: { label: 'Spannweite (gleiche Streckung)', unit: 'm', vals: P => range(Math.max(2.5, P.span - 2.5), P.span + 2.5, 20), map: (P, b) => ({ ...P, span: b, area: P.area * (b / P.span) ** 2, solarArea: P.solarArea * (b / P.span) ** 2 }) },
  chord: { label: 'Mittlere Flügeltiefe (gleiche Spannweite)', unit: 'm', vals: P => range(0.15, 0.45, 20), map: (P, c) => ({ ...P, area: c * P.span, solarArea: P.solarArea * c * P.span / P.area }) },
  mBatt: { label: 'Akkumasse', unit: 'kg', vals: P => range(0.5, Math.max(6, P.mBatt * 2), 22), map: (P, x) => ({ ...P, mBatt: x }) },
  v: { label: 'Reisegeschwindigkeit', unit: 'm/s', vals: P => range(8, Math.max(20, P.v + 6), 24), map: (P, x) => ({ ...P, v: x }) },
  solarArea: { label: 'Zellfläche', unit: 'm²', vals: P => range(0.2, Math.max(1.6, P.area * 0.95), 20), map: (P, x) => ({ ...P, solarMode: 'area', solarArea: x }) },
  hAGL: { label: 'Flughöhe über Grund', unit: 'm', vals: () => range(50, 1500, 20), map: (P, x) => ({ ...P, hAGL: x }) }
};
function compareAirfoils(P, comps) {
  const n = dayOfYear(P.date), y = yearOf(P.date), out = [];
  for (const f of AF.db.foils) {
    if (f.tail) continue;
    for (const mode of f.trip ? ['free', 'trip'] : ['free']) {
      if (mode === 'trip' && P.transition !== 'trip') continue;
      const Q = { ...P, airfoil: f.key, transition: mode }, r = studyPoint(Q, comps, n, y), C = r.C, pc = powerCurve(C);
      out.push({ key: f.key, name: f.name, cat: f.cat, mode, t: f.t, f: f.f, src: f.src, pCruise: C.lvl.pel, cdp: C.lvl.cdp, alpha: C.lvl.alpha, vMinP: pc.minP.V, pMinP: pc.minP.pel, vs: C.vs, CLmax: C.CLmaxW, tExc: r.tExc, soc: r.soc, m: r.m, conf: foilMeta(f, mode, P.v * C.pf.mac / C.nu).conf, cm: C.lvl.cm, nSol: C.solar.mode === 'area' ? NaN : C.solar.n, band: C.solar.bands && C.solar.bands[0] ? C.solar.bands[0].b : null });
    }
  }
  return out;
}

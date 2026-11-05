/* ===================================================================
   Verkabelung als eigene Massengruppe
   - Jede Leitung folgt ihrem Weg durch Rumpf, Flügel, Träger und Leitwerk
     (gerade Abschnitte mit gleichmäßiger Masse, exakte Trägheitsmomente).
   - Querschnitt nach zulässigem Spannungsfall (FAA AC 43.13-1B, Tab. 11-6:
     etwa 3,5 % im Dauerbetrieb, 7 % kurzzeitig bis 2 min) und Erwärmung
     (höchstens 10 A/mm² bei Höchststrom), aufgerundet auf AWG-Normgrößen.
   - Kupfer nach IEC 60028: ρ = 1/58 Ω·mm²/m, 8890 kg/m³; Leitungsmasse mit
     Dünnwand-Isolierung als Ausgleich über die Datenblattwerte nach
     SAE AS22759/32 (26 AWG 2,1 g/m … 12 AWG 29,3 g/m).
   =================================================================== */
const CU = { rhoE: 1 / 58e6, rho: 8890 };
// Normquerschnitte: AWG und metrisch nach IEC 60228 (mm²); Bezeichnung für die Anzeige
const WIRE_SIZES = [['26 AWG', 0.128], ['24 AWG', 0.205], ['22 AWG', 0.326], ['0,5 mm²', 0.5], ['0,75 mm²', 0.75], ['18 AWG', 0.823], ['1 mm²', 1.0], ['16 AWG', 1.31], ['1,5 mm²', 1.5],
  ['14 AWG', 2.08], ['2,5 mm²', 2.5], ['12 AWG', 3.31], ['4 mm²', 4], ['10 AWG', 5.26], ['6 mm²', 6], ['8 AWG', 8.37], ['10 mm²', 10], ['6 AWG', 13.3], ['16 mm²', 16], ['4 AWG', 21.2]];
// Masse je Meter einer Ader (kg/m), Querschnitt A in mm²
const wireLinA = a => (8.89 * a + 1.4 * Math.sqrt(a) + 0.3) / 1000;
function awgFor(aReq) { for (const [n, a] of WIRE_SIZES) if (a >= aReq * 0.999) return { awg: n, a }; const L = WIRE_SIZES[WIRE_SIZES.length - 1]; return { awg: L[0], a: Math.max(aReq, L[1]) }; }
// Hin- und Rückleiter für Strom I über die einfache Länge L (m) bei Spannung U
function sizePair(L, I, U, drop, jMax = 10) {
  const aDrop = CU.rhoE * 2 * L * I / (drop * U) * 1e6, aHeat = I / jMax, w = awgFor(Math.max(aDrop, aHeat, 0.128));
  return { ...w, aDrop, aHeat, by: aDrop >= aHeat ? 'Spannungsfall' : 'Erwärmung', R: CU.rhoE * 2 * L / (w.a * 1e-6), lin: 2 * wireLinA(w.a) };
}
// Steckverbinder für den Antriebsstrom (Paar, kg): XT60 bis 60 A, XT90 bis 90 A, sonst AS150
const powerPlug = I => (I <= 45 ? 0.008 : I <= 75 ? 0.018 : 0.03);

// Servolagen: Querruder je Segment (in Segmentmitte vor dem Ruderholm), Höhen- und Seitenruder am Leitwerk
function servoLayout(C, g) {
  const P = C.P, pf = C.pf, tg = C.tail, cf = C.cfg, h = pf.b / 2, out = [];
  const nA = Math.max(1, Math.round(P.nAilSeg || 1)), a0 = clamp(P.ailEta0, 0.1, 0.95), a1 = clamp(P.ailEta1, a0 + 0.02, 1);
  for (let k = 0; k < nA; k++) {
    const ys = (a0 + (a1 - a0) * (k + 0.5) / nA) * h, xs = g.xLE0 + pf.xLE(ys / h) + 0.62 * pf.chordAt(ys / h);
    for (const sg of [1, -1]) out.push({ kind: 'ail', x: xs, y: sg * ys, z: zWingAt(g, ys) });
  }
  out.push({ kind: 'elev', x: g.xhLE + 0.3 * tg.ch, y: cf.fus === 'twin' ? g.yB : 0, z: g.zH });
  for (let k = 0; k < tg.nFin; k++) out.push({ kind: 'rud', x: g.xvLE + 0.3 * tg.cv, y: tg.nFin > 1 ? (k ? -g.yB : g.yB) : 0, z: g.zV0 + 0.05 });
  return out;
}
function harness(C, g, xb) {
  const P = C.P, pf = C.pf, tg = C.tail, cf = C.cfg, h = pf.b / 2, U = Math.max(1, P.nCells * P.cellV), runs = [];
  if (P.wireModel === 'fix') return harnessFix(C, g, xb, U);
  const comp = id => C.comps.find(c => c.id === id && c.on);
  const ap = comp('ap'), xAP = ap ? ap.x : 0.55, zAP = ap ? ap.z || 0 : 0, mp = comp('mppt'), xM = mp ? mp.x : xAP;
  const xRoot = g.xLE0 + 0.35 * pf.cr, zR = g.zw - 0.02;
  // Leitung: Name, Gruppe, Masse je Meter, Punkte (Polylinie, je Punkt [x, y, z, grp])
  const run = (key, name, lin, pts, extra = {}) => {
    const segs = []; let L = 0;
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); if (l > 1e-6) { segs.push({ a, b, l, grp: b[3] || a[3] || 'pod' }); L += l; } }
    runs.push({ key, name, lin, L, m: lin * L, segs, ...extra });
  };
  const toTail = (x0, y0, z0) => cf.fus === 'twin'
    ? [[x0, y0, z0, 'pod'], [xRoot, g.yB, zR, 'wing'], [g.xTail, g.yB, g.zRoot, 'wing']]
    : cf.fus === 'glider' ? [[x0, y0, z0, 'pod'], [P.fusL, 0, 0, 'pod'], [g.xTail, 0, g.zRoot - 0.02, 'wing']]
      : [[x0, y0, z0, 'pod'], [g.boom0, 0, g.zB0, 'pod'], [g.xTail, 0, g.zRoot - 0.02, 'wing']];
  // 1) Antriebsleitung Akku → Regler am Motor (Gleichstrom; Regler sitzt beim Motor)
  const Imax = Math.max(1, P.motImax), zb = P.zBatt || 0;
  let pm;
  if (cf.mot === 'nose') pm = [[xb, 0, zb, 'pod'], [g.xMot, 0, g.zP, 'pod']];
  else if (cf.mot === 'fin') pm = [...toTail(xb, 0, zb), [g.xMot, 0, g.zP, 'wing']];
  else if (cf.fus === 'glider') pm = [[xb, 0, zb, 'pod'], [g.xMot, 0, g.zP - g.pylon, 'pod'], [g.xMot, 0, g.zP, 'pod']];
  else pm = [[xb, 0, zb, 'pod'], [g.xMot, 0, g.zP, 'pod']];
  let Lm = 0.15; for (let i = 0; i < pm.length - 1; i++) Lm += Math.hypot(pm[i + 1][0] - pm[i][0], pm[i + 1][1] - pm[i][1], pm[i + 1][2] - pm[i][2]);
  const sm = sizePair(Lm, Imax, U, 0.07);
  run('wmot', 'Antriebsleitung', sm.lin, pm, { I: Imax, size: sm, Lone: Lm });
  const tailJoint = cf.mot === 'fin'; // abnehmbares Leitwerk: Stecker in der Antriebsleitung
  // 2) Solarleitungen je Flügelhälfte: Rückleiter von der äußersten Zelle, Anschluss Wurzel → MPPT
  const Ustr = 1.15 * U, dropS = Math.max(0.3, P.wireDropSol) / 100, etaC = C.solarEta || 0;
  if (P.solarArea > 0) {
    const Ih = P.solarArea / 2 * 1000 * P.cellEff / 100 / Ustr, yE = etaC * h, Lroot = Math.abs(xM - xRoot) + 0.15, Lt = yE + 2 * Lroot;
    const a = Math.max(CU.rhoE * Lt * Ih / (dropS * Ustr) * 1e6, Ih / 10, 0.128), w = awgFor(a), lin1 = wireLinA(w.a);
    for (const sg of [1, -1]) {
      run('wsol', 'Solarleitungen Flügel', lin1, [[xRoot, sg * yE, zWingAt(g, yE), 'wing'], [xRoot, 0, zR, 'wing']], { I: Ih, size: { ...w, by: 'Spannungsfall' } });
      run('wsol', 'Solarleitungen Flügel', 2 * lin1, [[xRoot, 0, zR, 'wing'], [xM, 0, 0, 'pod']]);
    }
  }
  if (C.mass.solarHT > 0 && C.htSolarArea > 0) {
    const Ih = C.htSolarArea * 1000 * P.cellEff / 100 / Ustr, Lt = 2 * (Math.abs(g.xhLE - xM) + g.zH + 0.2);
    const w = awgFor(Math.max(CU.rhoE * Lt * Ih / (dropS * Ustr) * 1e6, Ih / 10, 0.128));
    run('wsolht', 'Solarleitung Höhenleitwerk', 2 * wireLinA(w.a), [...toTail(xM, 0, 0), [g.xhLE + 0.3 * tg.ch, 0, g.zH, 'wing']], { I: Ih, size: { ...w, by: 'Spannungsfall' } });
  }
  // 3) Servoleitungen (3 × 26 AWG): Querruder je Segment, Höhen- und Seitenruder am Leitwerk
  const linServo = 3 * wireLinA(0.128), nA = Math.max(1, Math.round(P.nAilSeg || 1)), a0 = clamp(P.ailEta0, 0.1, 0.95), a1 = clamp(P.ailEta1, a0 + 0.02, 1);
  for (let k = 0; k < nA; k++) {
    const ys = (a0 + (a1 - a0) * (k + 0.5) / nA) * h, xs = g.xLE0 + pf.xLE(ys / h) + 0.62 * pf.chordAt(ys / h);
    for (const sg of [1, -1]) run('wservo', 'Servoleitungen', linServo, [[xAP, 0, zAP, 'pod'], [xRoot, 0, zR, 'wing'], [xRoot, sg * ys, zWingAt(g, ys), 'wing'], [xs, sg * ys, zWingAt(g, ys), 'wing']]);
  }
  const nTail = 1 + tg.nFin;
  for (let k = 0; k < nTail; k++) {
    const pts = toTail(xAP, 0, zAP);
    if (cf.fus === 'twin' && k === nTail - 1) pts.forEach(p => { if (p[1]) p[1] = -p[1]; });
    run('wservo', 'Servoleitungen', linServo, pts);
  }
  // 4) Positionslichter an den Flügelspitzen (2 × 24 AWG), übrige Verbraucher außen am Flügel
  const linSig = 2 * wireLinA(0.205), linComp = 4 * wireLinA(0.128);
  for (const c of C.comps) if (c.on && c.id !== 'servo' && Math.abs(c.y || 0) > 0.3) {
    const y = Math.min(h, Math.abs(c.y));
    for (const sg of [1, -1]) run('wlight', c.id === 'lights' ? 'Positionslichter' : 'Leitungen zu Flügel-Verbrauchern', c.id === 'lights' ? linSig : linComp, [[xAP, 0, zAP, 'pod'], [xRoot, 0, zR, 'wing'], [xRoot, sg * y, zWingAt(g, y), 'wing'], [c.x ?? xRoot, sg * y, zWingAt(g, y), 'wing']]);
  }
  // 5) Bordnetz im Rumpf: je Verbraucher Versorgung + Daten (4 × 26 AWG) vom Verteiler beim Autopiloten
  for (const c of C.comps) if (c.on && Math.abs(c.y || 0) <= 0.3 && c.id !== 'ap' && c.id !== 'servo' && (c.m > 0 || c.p > 0)) run('wfus', 'Bordnetz Rumpf', linComp, [[xAP, 0, zAP, 'pod'], [c.x ?? xAP, 0, c.z || 0, 'pod']]);
  // 6) Steckverbinder: Flügelteilungen (je Flügelteil ein Mehrfachstecker), abnehmbares Leitwerk, Akku
  const nWingPlug = { none: 1, center: 2, outer: 3, both: 4 }[P.splits] || 1;
  const plugs = [
    { n: 'Flügelstecker', m: 0.008 * nWingPlug, x: xRoot, z: zR, grp: 'wing' },
    { n: 'Leitwerksstecker', m: 0.008 + (tailJoint ? powerPlug(Imax) : 0), x: cf.fus === 'glider' ? P.fusL : g.boom0, z: 0, grp: 'pod' },
    { n: 'Akkustecker', m: powerPlug(Imax), x: xb, z: zb, grp: 'pod' },
    { n: 'Verteiler, Sicherungen', m: 0.01 + 0.002 * C.comps.filter(c => c.on).length, x: xAP, z: zAP, grp: 'pod' }
  ];
  // Summen je Gruppe; Kabelbaum-Zuschlag (Binder, Schutzschlauch, Halter) verteilt sich mit
  const kx = 1 + Math.max(0, P.wireExtra) / 100, items = [], groups = {};
  for (const r of runs) {
    for (const s of r.segs) {
      const m = r.lin * s.l * kx, [ax, ay, az] = s.a, [bx, by, bz] = s.b, gk = r.key + '|' + s.grp;
      const o = groups[gk] || (groups[gk] = { key: r.key, name: r.name, grp: s.grp, m: 0, mx: 0, my: 0, mz: 0, Sxx: 0, Syy: 0, Szz: 0, Sxz: 0 });
      o.m += m; o.mx += m * (ax + bx) / 2; o.my += m * (Math.abs(ay) + Math.abs(by)) / 2; o.mz += m * (az + bz) / 2;
      o.Sxx += m * (ax * ax + ax * bx + bx * bx) / 3; o.Syy += m * (ay * ay + ay * by + by * by) / 3; o.Szz += m * (az * az + az * bz + bz * bz) / 3;
      o.Sxz += m * (2 * ax * az + ax * bz + bx * az + 2 * bx * bz) / 6;
    }
  }
  for (const p of plugs) if (p.m > 0) { const gk = 'wplug|' + p.grp, o = groups[gk] || (groups[gk] = { key: 'wplug', name: 'Steckverbinder', grp: p.grp, m: 0, mx: 0, my: 0, mz: 0, Sxx: 0, Syy: 0, Szz: 0, Sxz: 0 }); o.m += p.m; o.mx += p.m * p.x; o.mz += p.m * p.z; o.Sxx += p.m * p.x * p.x; o.Szz += p.m * p.z * p.z; o.Sxz += p.m * p.x * p.z; }
  let total = 0; const nGrp = {};
  for (const k in groups) if (groups[k].m > 0) nGrp[groups[k].key] = (nGrp[groups[k].key] || 0) + 1;
  for (const k in groups) {
    const o = groups[k]; if (!(o.m > 0)) continue; total += o.m;
    const suf = nGrp[o.key] > 1 ? (o.grp === 'wing' ? ' · Flügel und Leitwerk' : ' · Rumpf') : '';
    items.push({ key: o.key + (o.grp === 'wing' ? 'W' : 'P'), name: o.name + suf, grp: o.grp, cat: 'wire', m: o.m, x: o.mx / o.m, y: o.my / o.m, z: o.mz / o.m, Sxx: o.Sxx, Syy: o.Syy, Szz: o.Szz, Sxz: o.Sxz, Ixx0: 0, Iyy0: 0, Izz0: 0 });
  }
  // Masse je Meter Spannweite einer Flügelhälfte bei y (für Biegemodell und Schwingungen)
  const wingRuns = runs.filter(r => r.segs.some(s => s.grp === 'wing' && Math.abs(s.b[1] - s.a[1]) > 1e-6));
  const wingLin = y => { let q = 0; for (const r of wingRuns) for (const s of r.segs) { const y0 = Math.min(Math.abs(s.a[1]), Math.abs(s.b[1])), y1 = Math.max(Math.abs(s.a[1]), Math.abs(s.b[1])); if (y1 - y0 > 1e-6 && y >= y0 && y < y1 && s.a[1] * s.b[1] >= 0 && (s.a[1] + s.b[1]) >= 0) q += r.lin * s.l / (y1 - y0); } return q * kx; };
  const byKey = {}; for (const r of runs) byKey[r.key] = (byKey[r.key] || 0) + r.m * kx;
  for (const p of plugs) byKey.wplug = (byKey.wplug || 0) + p.m;
  const motorRun = runs.find(r => r.key === 'wmot');
  return { items, total, runs, plugs, byKey, wingLin, motor: motorRun ? { L: motorRun.Lone, ...motorRun.size, I: Imax } : null, U, kx };
}
// Leitungsverlust der Antriebsleitung bei Strom I (W)
function wireLoss(hn, I) { return hn && hn.motor ? I * I * hn.motor.R : 0; }
// Gemessene Kabelmasse (z. B. Referenzflugzeug): je zur Hälfte im Rumpf beim Autopiloten und im Flügel verteilt
function harnessFix(C, g, xb, U) {
  const P = C.P, pf = C.pf, h = pf.b / 2, m = Math.max(0, P.mWireFix), ap = C.comps.find(c => c.id === 'ap' && c.on), xA = ap ? ap.x : 0.5 * P.fusL, xR = g.xLE0 + 0.35 * pf.cr, yr = 0.35 * h;
  const it = (key, name, grp, mm, x, y, z) => ({ key, name, grp, cat: 'wire', m: mm, x, y, z, Sxx: mm * x * x, Syy: mm * y * y, Szz: mm * z * z, Sxz: mm * x * z, Ixx0: 0, Iyy0: 0, Izz0: 0 });
  const items = m > 0 ? [it('wfixP', 'Kabel und Beschläge · Rumpf', 'pod', m / 2, xA, 0, 0), it('wfixW', 'Kabel und Beschläge · Flügel', 'wing', m / 2, xR, yr, g.zw)] : [];
  const sz = sizePair(Math.abs(g.xMot - xb) + 0.15, Math.max(1, P.motImax), U, 0.07);
  return { items, total: m, runs: [], plugs: [], byKey: { wfix: m }, wingLin: y => (y < 2 * yr ? m / 2 / 2 / (2 * yr) : 0), motor: { L: Math.abs(g.xMot - xb) + 0.15, ...sz, I: Math.max(1, P.motImax) }, U, kx: 1, fixed: true };
}

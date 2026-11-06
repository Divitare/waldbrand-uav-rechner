/* ===================================================================
   Kenngrößen für Anforderungen und Entwurfsvorschläge
   - baseResult(P, comps): Grundergebnis am Auslegungstag (klarer Himmel),
     wie es die Oberfläche anzeigt
   - lazyResult(P, comps): dasselbe, aber jede Teilrechnung erst bei Bedarf
     (für den Optimierer: nur, was Ziel und Bedingungen brauchen)
   - KENN: Ergebnisgrößen mit Bezeichnung, Einheit, besserer Richtung und
     Rechenaufwand ('case' Rechenfall, 'day' Tagesbilanz, 'mid' bis 50 ms,
     'high' Schwingungsrechnung, etwa 0,5 s)
   - DESIGN_CHECKS: Grundbedingungen, ohne die ein Entwurf nicht taugt
     (dieselben Grenzen wie die kritischen Hinweise der Übersicht)
   =================================================================== */
const pConsC = C => C.pProp + C.comp.always + C.comp.mission + C.comp.day;
function dayTotals(ser) {
  let eSol = 0, eCons = 0, eNight = 0, peak = 0, cold = 0;
  for (let i = 0; i < NSTEP; i++) { eSol += ser.ps[i] * DT; eCons += ser.pc[i] * DT; if (ser.ps[i] < ser.pc[i]) eNight += (ser.pc[i] - ser.ps[i]) * DT; peak = Math.max(peak, ser.ps[i]); cold += ser.cold[i]; }
  return { eSol, eCons, eNight, peak, cold: cold * DT };
}
function baseResult(P, comps) {
  const C = buildCase(P, comps), n = dayOfYear(P.date), y = yearOf(P.date);
  const e = envClear(P, n, y), ser = daySeries(C, e);
  const mis = mission(C, ser, ser, true), per = periodic(C, ser, true), margin = missionMargin(C, ser);
  const pc = powerCurve(C), so = sora(P, C.m), mp = missionPerf(C);
  return { P, comps, C, n, y, e, ser, mis, per, margin, pc, so, mp, ...dayTotals(ser) };
}
function lazyResult(P, comps) {
  const R = { P, comps, C: buildCase(P, comps), extra: {} };
  const lazy = (k, f) => Object.defineProperty(R, k, { configurable: true, enumerable: true, get() { const v = f(); Object.defineProperty(R, k, { value: v, enumerable: true }); return v; } });
  lazy('n', () => dayOfYear(P.date)); lazy('y', () => yearOf(P.date));
  lazy('e', () => envClear(P, R.n, R.y)); lazy('ser', () => daySeries(R.C, R.e));
  lazy('mis', () => mission(R.C, R.ser, R.ser, true)); lazy('per', () => periodic(R.C, R.ser, true)); lazy('margin', () => missionMargin(R.C, R.ser));
  lazy('pc', () => powerCurve(R.C)); lazy('so', () => sora(P, R.C.m)); lazy('mp', () => missionPerf(R.C));
  lazy('tot', () => dayTotals(R.ser));
  for (const k of ['eSol', 'eCons', 'eNight', 'peak', 'cold']) lazy(k, () => R.tot[k]);
  return R;
}
// Teure Zusatzrechnungen je Ergebnis nur einmal
const extraOf = (R, k, f) => { R.extra = R.extra || {}; if (!(k in R.extra)) R.extra[k] = f(); return R.extra[k]; };
const sailNum = so => (so && so.sail ? ROMAN[so.sail] : 7);
// [Schlüssel, Bezeichnung, Einheit, Nachkommastellen, besser (+1 mehr, −1 weniger, 0 keins), Aufwand, Wert, Erläuterung]
const KENN = [
  ['mass', 'Abflugmasse', 'kg', 2, -1, 'case', R => R.C.m],
  ['mStruct', 'Strukturmasse', 'kg', 2, -1, 'case', R => R.C.mass.struct],
  ['payload', 'Nutzlast (Sensorik und Zusatz)', 'kg', 2, 1, 'case', R => (R.C.mass.byGroup ? R.C.mass.byGroup.sens || 0 : 0)],
  ['pCruise', 'Leistung Reiseflug', 'W', 1, -1, 'case', R => pConsC(R.C)],
  ['pProp', 'Antriebsleistung', 'W', 1, -1, 'case', R => R.C.pProp],
  ['ld', 'Gleitzahl', '', 1, 1, 'case', R => R.C.lvl.LD],
  ['wingLoad', 'Flächenbelastung', 'kg/m²', 2, 0, 'case', R => R.C.m / R.C.pf.S],
  ['ar', 'Streckung', '', 1, 0, 'case', R => R.C.pf.AR],
  ['vs', 'Mindestfahrt', 'm/s', 2, -1, 'case', R => R.C.vs],
  ['vRatio', 'Reise / Mindestfahrt', '', 2, 1, 'case', R => R.P.v / R.C.vs],
  ['sm', 'Stabilitätsmaß', '% MAC', 1, 0, 'case', R => R.C.bal.sm * 100],
  ['ballast', 'Trimmballast', 'g', 0, -1, 'case', R => R.C.bal.ballast * 1000],
  ['cap', 'Akkuenergie (kälteste Stunde)', 'Wh', 0, 1, 'case', R => R.C.cap],
  ['solarA', 'Aktive Zellfläche', 'm²', 2, 1, 'case', R => R.C.solar.a + R.C.solar.ht.a],
  ['nSol', 'Solarzellen Flügel', '', 0, 1, 'case', R => R.C.solar.n],
  ['wire', 'Kabelmasse', 'kg', 2, -1, 'case', R => R.C.mass.wire],
  ['sail', 'SAIL', '', 0, -1, 'case', R => sailNum(R.so), 'I bis VI; 7 heißt über VI'],
  ['grc', 'Bodenrisikoklasse (final)', '', 0, -1, 'case', R => R.so.fgrc],
  ['ke', 'Kinetische Energie (SORA)', 'kJ', 1, -1, 'case', R => R.so.ke / 1000],
  ['rateIr', 'Flächenleistung Wärmebild', 'km²/h', 2, 1, 'case', R => R.mp.rateIr],
  ['windHold', 'Wind gehalten (Anteil der Zeit)', '%', 0, 1, 'case', R => R.mp.ws.pHold * 100],
  ['eSol', 'Solarertrag Auslegungstag', 'Wh', 0, 1, 'day', R => R.eSol],
  ['socMin', 'Ladezustand mindestens im Einsatz', '%', 0, 1, 'day', R => (R.mis ? R.mis.minE / Math.max(1e-9, R.mis.cap) * 100 : NaN)],
  ['endur', 'Ausdauer ab Start', 'h', 1, 1, 'day', R => (R.mis ? (R.mis.endur ?? 48) : NaN)],
  ['tExc', 'Excess Time', 'h', 2, 1, 'day', R => (fin(R.per.tExc) ? R.per.tExc : R.per.tExc === Infinity ? 24 : -24)],
  ['margin', 'Leistungsreserve', 'W', 1, 1, 'day', R => (R.margin.w == null ? NaN : R.margin.w)],
  ['vfWing', 'Flattern Flügel (eingespannt)', 'm/s', 0, 1, 'mid', R => { const A = extraOf(R, 'ae', () => aeroelastic(R.C, { nStep: 24 })); return A.flutter.vf || A.vMax || 2.64 * R.P.vmax; }],
  ['blur', 'Bewegungsunschärfe Wärmebild (3σ)', 'px', 2, -1, 'mid', R => 3 * extraOf(R, 'img', () => imageStability(R.C, {})).ir.blurE],
  ['roc', 'Steigen bei Reserve, Vollgas', 'm/s', 2, 1, 'mid', R => extraOf(R, 'batt', () => battReport(R.C)).climbRes.roc],
  ['vfMin', 'Flattersicherheit (alle Fälle)', '× 1,2·V_D', 2, 1, 'high', R => { const V = extraOf(R, 'vib', () => vibAnalysis(R.C)); return V.vfMin ? V.vfMin / V.vReq : 3; }, 'kleinste Flatter- oder Divergenzgeschwindigkeit aller Fälle durch 1,2·V_D; 3 heißt nichts gefunden']
].map(([key, l, u, d, dir, cost, get, note]) => ({ key, l, u, d, dir, cost, get, note }));
const KENN_BY = Object.fromEntries(KENN.map(k => [k.key, k]));
function kennValue(R, key) {
  const k = KENN_BY[key]; if (!k) return NaN;
  try { const v = k.get(R); return fin(v) ? v : NaN; } catch (e) { return NaN; }
}
// Grundbedingungen: Verletzung als dimensionsloser Abstand (0 = erfüllt)
const DESIGN_CHECKS = [
  { key: 'mtom', l: 'Abflugmasse höchstens die zulässige', cost: 'case', on: true, viol: R => Math.max(0, (R.C.m - R.P.mtomLimit) / R.P.mtomLimit) },
  { key: 'stall', l: 'Reise mindestens 1,25 × Mindestfahrt', cost: 'case', on: true, viol: R => Math.max(0, (1.25 - R.P.v / R.C.vs) / 1.25) },
  { key: 'sm', l: 'Stabilitätsmaß mindestens 3 % MAC', cost: 'case', on: true, viol: R => Math.max(0, (0.03 - R.C.bal.sm) / 0.03) },
  { key: 'cells', l: 'Gewünschte Zellen passen auf den Flügel', cost: 'case', on: true, viol: R => (R.C.solar.fits ? 0 : R.C.solar.mode === 'count' ? Math.max(0.01, (R.C.solar.want - R.C.solar.n) / Math.max(1, R.C.solar.want)) : 0.1) },
  { key: 'mission', l: 'Einsatz am Auslegungstag gelingt', cost: 'day', on: true, viol: R => (R.mis && R.mis.ok ? 0 : R.margin.w != null && R.margin.w < 0 ? Math.min(1, -R.margin.w / Math.max(1, pConsC(R.C))) : 1) },
  { key: 'flutter', l: 'Flügel flatterfrei bis 1,2 × V_D, keine Divergenz', cost: 'mid', on: true, viol: R => { const A = extraOf(R, 'ae', () => aeroelastic(R.C, { nStep: 24 })), vr = 1.2 * R.P.vmax; let v = 0; if (!A.okF && A.flutter.vf) v += Math.max(0.01, (vr - A.flutter.vf) / vr); if (!A.okD && fin(A.VD)) v += Math.max(0.01, (vr - A.VD) / vr); return v; } },
  { key: 'exc', l: 'Excess Time mindestens die geforderte', cost: 'day', on: false, viol: R => { const t = kennValue(R, 'tExc'); return fin(t) ? Math.max(0, (R.P.tExcReq - t) / Math.max(1, R.P.tExcReq)) : 1; } }
];

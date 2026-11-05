const { load } = require('./load.cjs');
const U = load();
const f = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : String(x));
function show(name, P, comps, ref) {
  const C = U.buildCase(P, comps);
  const n = U.dayOfYear(P.date), y = U.yearOf(P.date);
  const ser = U.daySeries(C, U.envClear(P, n, y)), per = U.periodic(C, ser), mis = U.mission(C, ser, ser, false);
  console.log(`\n== ${name}`);
  console.log('Masse gesamt', f(C.m), 'Struktur', f(C.mass.struct), 'ref', ref && ref.mTotal, ref && ref.mStruct);
  if (C.struct) console.log('  Teile', Object.entries(C.struct.parts).map(([k, v]) => k + ' ' + f(v, 3)).join(', '), '| nLim', f(C.struct.nLim), 'nUlt', f(C.struct.nUlt), 'gust dn', f(C.struct.gust.dn), 'nStall', f(C.struct.gust.nStall), 'Durchbiegung', f(C.struct.dTip, 3), 'max', f(C.struct.dMax, 3), 'stiffF', f(C.struct.stiffF));
  const L = C.lvl;
  console.log('Reise V', P.v, 'rho', f(C.rho, 3), 'CL', f(L.CL, 3), 'cdp', f(L.cdp, 4), 'CDi', f(L.CDi, 4), 'e', f(L.e, 3), 'L/D', f(L.LD, 1), 'alpha', f(L.alpha, 1), 'D', f(L.Dtot, 2), 'N');
  console.log('  Widerstand', Object.entries(L.D).map(([k, v]) => k + ' ' + f(v, 3)).join(', '));
  console.log('  eta', f(L.eta, 3), 'etaI', f(L.etaI, 3), 'P_lvl', f(L.pel, 1), 'P_turn', f(C.turn.pel, 1), 'P_prop', f(C.pProp, 1), 'P_comp', f(C.comp.always + C.comp.day + C.comp.mission, 1), 'ref', ref && ref.pProp, ref && ref.pTotal);
  console.log('  vs', f(C.vs), 'CLmaxW', f(C.CLmaxW), 'Kap', f(C.cap, 0), 'Wh', 'solK', f(C.solK, 4));
  const pc = U.powerCurve(C);
  console.log('  V_minP', f(pc.minP.V, 1), 'P', f(pc.minP.pel, 1), 'V_bestLD', f(pc.maxLD.V, 1), 'L/D', f(pc.maxLD.LD, 1));
  let es = 0; for (let i = 0; i < U.NSTEP; i++) es += ser.ps[i] * U.DT;
  console.log('Periodisch: tExc', f(per.tExc), 'tCm', f(per.tCm), 'minSoc', f(per.minSoc), 'tEq', f(per.tEq), 'reason', per.reason, ' ref tExc', ref && ref.tExc, '| Solarenergie', f(es, 0), 'Wh/Tag');
  if (mis) console.log('Einsatz', P.tStart, '-', P.tEnd, 'minSoC', f(mis.minE / mis.cap * 100, 1), '% ok', mis.ok, 'endur', f(mis.endur), 'h');
  return C;
}
const R = U.REFS;
for (const k of ['atlantik', 'skysailor']) {
  const P = { ...U.DEFAULT_PARAMS, ...R[k].params };
  show(R[k].name, P, R[k].comps, R[k].ref);
}
const P = { ...U.DEFAULT_PARAMS };
show('Waldbrand-Entwurf (Standard)', P, U.DEFAULT_COMPS.map(c => ({ ...c })), null);

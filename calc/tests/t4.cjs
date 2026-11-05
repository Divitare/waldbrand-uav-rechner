const { load } = require('./load.cjs');
const U = load();
const f = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : String(x));
const Wp = U.decodeSite(U.weather.sites[0]);
const ms = U.monthlyStats(Wp);
let t = Date.now();
const Wg = U.genWeather({ name: 'Gen', lat: 45, lon: 8, elev: 250, utc: 1, tc: 0.5 }, ms, 20, 7);
console.log('gen 20 J', Date.now() - t, 'ms');
// Monatsmittel kt über alle 20 Jahre
const acc = Array.from({ length: 12 }, () => [0, 0]);
for (let y = 0; y < 20; y++) for (let d = 0; d < 365; d++) {
  const n = d + 1, m = new Date(Date.UTC(2026, 0, n)).getUTCMonth(), s = U.sunDay(n, 45, 8, 250, 1);
  for (let h = 0; h < 24; h++) { const i = (y * 365 + d) * 24 + h, cz = U.sinElev(h + 0.5, s); acc[m][0] += Wg.ghi[i]; acc[m][1] += cz > 0 ? s.E0 * cz : 0; }
}
console.log('Ziel kt', ms.map(m => f(m.kt)).join(' '));
console.log('Gen kt', acc.map(a => f(a[0] / a[1])).join(' '));
// Tornado und Monte-Carlo, Standardentwurf
const P = { ...U.DEFAULT_PARAMS }, comps = U.DEFAULT_COMPS.map(c => ({ ...c }));
t = Date.now(); const tor = U.tornado(P, comps); console.log('tornado', Date.now() - t, 'ms, Basis tExc', f(tor.base.tExc));
tor.rows.forEach(r => console.log(' ', r.label.padEnd(52), f(r.lo), f(r.hi), '| Masse', f(r.mLo), f(r.mHi)));
t = Date.now(); const mc = U.monteCarlo(P, comps, 300); console.log('MC', Date.now() - t, 'ms', 'mean', f(mc.mean), 'p5', f(mc.p5), 'p50', f(mc.p50), 'p95', f(mc.p95), 'pPerp', f(mc.pPerp), 'pMission', f(mc.pMission));
// Einsatzleistung, SORA, Fit
const C = U.buildCase(P, comps);
const mp = U.missionPerf(C);
console.log('Wind in Flughöhe', f(mp.ws.u), 'm/s, Halten', f(mp.ws.pHold), 'Flächenfaktor', f(mp.ws.coverage), 'pOver', f(mp.ws.pOver));
console.log('IR Streifen', f(mp.ir.swath, 0), 'm GSD', f(mp.ir.gsd, 3), 'Fläche/h', f(mp.rateIr), 'km² Revisit', f(mp.revisitIr), 'h; RGB', f(mp.rgb.gsd, 3), f(mp.rateRgb));
console.log('Feuer fmin', mp.fire.fmin.toExponential(2), 'Amin', f(mp.fire.Amin * 1e4, 1), 'cm², hMax(1 m²)', f(mp.fire.hMax, 0), 'm; Schwelbrand 600 K Amin', f(mp.smoulder.Amin * 1e4, 1), 'cm², Rauschen', f(mp.fire.AminNoise * 1e4, 2), 'cm²');
console.log('Funkhorizont', f(mp.radioKm, 0), 'km, Kurvenradius', f(mp.turnR, 0), 'm, legEff', f(mp.legEff));
const so = U.sora(P, C.m); console.log('SORA', JSON.stringify(so));
const rows = U.parseFlightData('V;P\n9;48\n10;46\n11;47.5\n12;51\n13;56\n14;62\n15;69');
console.log('Fit', JSON.stringify(U.fitPower(rows)));
// Profile vergleichen bei Entwurfsbedingungen
t = Date.now();
const out = [];
for (const key of ['mh139f', 'mh139f_xf', 'sd7032', 'sd7037', 'sd7062', 'sd7080', 'sd7003', 's1223', 'e387', 'e214', 'fx63137', 'dae11', 'ag35', 'mh32', 'naca4412', 'clarky', 's9000', 'rg15', 'sa7038', 'mh114']) {
  const Q = { ...P, airfoil: key }, C2 = U.buildCase(Q, comps);
  const ser = U.daySeries(C2, U.envClear(Q, 172, 2026)), per = U.periodic(C2, ser);
  const pc = U.powerCurve(C2);
  out.push([key, f(C2.lvl.pel, 1), f(C2.lvl.cdp * 1e4, 0), f(pc.minP.V, 1), f(pc.minP.pel, 1), f(C2.vs, 1), f(per.tExc), f(C2.mass.struct, 2)]);
}
console.log('Profilvergleich (', Date.now() - t, 'ms): key, P13, cdp, VminP, PminP, vs, tExc, mStruct');
out.forEach(r => console.log(' ', r.join('  ')));

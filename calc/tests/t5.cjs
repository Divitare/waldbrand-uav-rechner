const { load } = require('./load.cjs');
const U = load();
const f = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : String(x));
const P = { ...U.DEFAULT_PARAMS }, comps = U.DEFAULT_COMPS.map(c => ({ ...c }));
let t = Date.now();
const ca = U.compareAirfoils(P, comps); console.log('compareAirfoils', ca.length, Date.now() - t, 'ms');
ca.sort((a, b) => a.pCruise - b.pCruise).slice(0, 6).forEach(r => console.log(' ', r.key, f(r.pCruise, 1), f(r.tExc), f(r.conf)));
for (const k of Object.keys(U.SWEEPS)) {
  t = Date.now(); const sw = U.SWEEPS[k], res = U.sweep(P, comps, sw.vals(P), sw.map);
  console.log(k, Date.now() - t, 'ms', res.filter((_, i) => i % 5 === 0).map(r => `${f(r.x, 2)}:${f(r.tExc, 1)}/${f(r.m, 1)}kg/${f(r.pTot, 0)}W`).join(' '));
}

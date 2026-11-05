const { load } = require('./load.cjs');
const U = load();
for (const k of ['clarky', 'naca4412', 'e387', 'sd7032']) { const f = U.foilByKey(k); for (const Re of [60e3, 100e3, 200e3]) { const m = U.foilMeta(f, 'free', Re); console.log(k, Re, 'a0', m.a0.toFixed(2), 'slope', m.slope.toFixed(2), 'clmax', m.clmax.toFixed(2)); } }
const rho = 1.225, nu = 1.46e-5, n = 9200 / 60, D = 0.254;
for (const k of ['clarky', 'naca4412']) {
  const g0 = U.propGeometry({ propGeom: 'apc10x7' }), g = { ...g0, foil: U.foilByKey(k) };
  console.log(k, [0.3, 0.5, 0.6, 0.7].map(J => { const r = U.bemt(g, J * n * D, n, rho, nu); return J + ': CT ' + r.CT.toFixed(4) + ' eta ' + r.eta.toFixed(3); }).join(' | '));
}

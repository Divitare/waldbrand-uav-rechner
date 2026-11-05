const { load } = require('./load.cjs');
const U = load();
const g = U.propGeometry({ propGeom: 'apc10x7', propFoil: process.env.PF || 'qprop' }), rho = 1.225, nu = 1.46e-5, n = 9200 / 60, D = 0.254;
const CTe = [[0.0628, 0.1201], [0.1859, 0.1139], [0.2996, 0.1045], [0.4061, 0.0923], [0.5028, 0.0785], [0.5912, 0.0597], [0.6706, 0.0403], [0.7424, 0.0248], [0.8052, 0.0098]];
const CQe = [[0.0622, 0.00878], [0.185, 0.00883], [0.2992, 0.00912], [0.4035, 0.00912], [0.5008, 0.00875], [0.5905, 0.00766], [0.6695, 0.00614], [0.7415, 0.00471], [0.8034, 0.00326]];
const ETe = [[0.1886, 0.385], [0.3024, 0.548], [0.4077, 0.656], [0.5042, 0.718], [0.5913, 0.730], [0.6710, 0.699], [0.7419, 0.625]];
const ip = (T, x) => { let i = 0; while (i < T.length - 2 && T[i + 1][0] < x) i++; const [a, fa] = T[i], [b, fb] = T[i + 1]; return fa + (fb - fa) * (x - a) / (b - a); };
console.log(' J     CT BEMT  CT Messung | CQ BEMT  CQ Messung | eta BEMT eta Messung');
for (const J of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75]) {
  const r = U.bemt(g, J * n * D, n, rho, nu), CQ = r.CP / (2 * Math.PI);
  console.log(J.toFixed(2), r.CT.toFixed(4), ip(CTe, J).toFixed(4), '|', CQ.toFixed(5), ip(CQe, J).toFixed(5), '|', r.eta.toFixed(3), J >= 0.19 ? ip(ETe, J).toFixed(3) : '');
}

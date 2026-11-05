const { load } = require('./load.cjs');
const U = load();
const f = (x, d = 3) => (typeof x === 'number' ? x.toFixed(d) : String(x));
// Eigenwerte: Begleitmatrix von (s+1)(s+2)(s^2+2s+5) = s^4+5s^3+13s^2+19s+10 → -1, -2, -1±2i
const comp = [[0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [-10, -19, -13, -5]];
console.log('eig', U.eigReal(comp).map(e => f(e.re) + (e.im ? (e.im > 0 ? '+' : '') + f(e.im) + 'i' : '')).join('  '));
const R = U.jacobiEig([[4, 1, 2], [1, 3, 0], [2, 0, 5]]); console.log('jacobi', R.values.map(v => f(v)).join(' '), '(erwartet 1.551, 3.637, 6.812 ca.)');
// VLM: elliptisch, rechteckig, Pfeilung
const helm = (A, a0, L) => { const k = a0 / (2 * Math.PI), t = Math.tan(L); return 2 * Math.PI * A / (2 + Math.sqrt(A * A / (k * k) * (1 + t * t) + 4)); };
for (const [type, AR, sw, lam] of [['ellip', 8, 0, 1], ['rect', 6, 0, 1], ['rect', 20, 0, 1], ['taper', 20, 0, 0.5], ['taper', 6, 30, 0.5], ['taper', 6, -30, 0.5], ['rect_taper', 20, 10, 0.5], ['rect_taper', 20, -10, 0.5]]) {
  const b = 5, S = b * b / AR, pf = U.planform({ span: b, area: S, planform: type, taper: lam, centerFrac: 0.5, washout: 0, sweep: sw });
  const v = U.vlmWing(pf, 2 * Math.PI), r = U.llAt(v, 0.8);
  // Neutralpunkt in % MAC relativ zur MAC-Vorderkante
  const xacRel = (v.xac + pf.cr / 4 - pf.xLEmac) / pf.mac;
  const tc2 = Math.tan(sw * Math.PI / 180) - (4 / AR) * 0.25 * (1 - lam) / (1 + lam); // t/2-Linie für Trapez
  const strip = -(2 * Math.PI / 12) * (1 + 3 * lam) / (1 + lam);
  console.log(type.padEnd(10), 'AR', AR, 'Λ', sw, '| CLα', f(v.CLa), 'Helmbold/DATCOM', f(helm(AR, 2 * Math.PI, Math.atan(tc2))), '| e', f(r.e), '| x_ac', f(xacRel * 100, 1), '% MAC | Clp', f(v.Clp), 'Streifen', f(strip), '| Clβ(1 rad V-Form)', f(v.ClbDih));
}

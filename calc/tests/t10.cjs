const { load } = require('./load.cjs');
const U = load();
const f = (x, d = 3) => (typeof x === 'number' ? x.toFixed(d) : String(x));
// Navion (Nelson, Flight Stability and Automatic Control): kurz -2,51±2,59i, Phygoide -0,017±0,213i; seitlich -0,0087, -8,43, -0,49±2,33i
const lon = U.lonMatrix({ m: 1, Iy: 1, V: 176, g: 32.2, Xu: -0.045, Xw: 0.036, Zu: -0.369, Zw: -2.02, Zq: 0, Zwd: 0, Mu: 0, Mw: -0.05, Mwd: -0.0051, Mq: -2.05 });
console.log('Navion längs', U.eigReal(lon).map(z => f(z.re) + (z.im ? (z.im > 0 ? '+' : '') + f(z.im) + 'i' : '')).join('  '));
const lat = U.latMatrix({ m: 1, Ix: 1, Iz: 1, V: 176, g: 32.2, Yv: -45.72 / 176, Yp: 0, Yr: 0, Lv: -15.98 / 176, Lp: -8.4, Lr: 2.19, Nv: 4.49 / 176, Np: -0.35, Nr: -0.76 });
console.log('Navion seitlich', U.eigReal(lat).map(z => f(z.re, 4) + (z.im ? (z.im > 0 ? '+' : '') + f(z.im) + 'i' : '')).join('  '));
// Standardentwurf
const P = { ...U.DEFAULT_PARAMS }, C = U.buildCase(P, U.DEFAULT_COMPS.map(c => ({ ...c })));
const b = C.bal;
console.log('\nSchwerpunkt', f(b.xcg), 'NP', f(b.np.xnp), 'SM', f(b.sm * 100, 1), '% Akku x', f(b.xBatt), 'Ballast', f(b.ballast), 'kg', b.msg, '| dε/dα', f(b.np.deda), 'a_t', f(b.np.at), 'Cmα_f', f(b.np.Cmaf), '| Lt', f(C.lvl.Lt, 2), 'N CLh', f(C.lvl.CLh), '| Iyy', f(b.mi.Iyy), 'Ixx', f(b.mi.Ixx));
const fd = U.flightDynamics(C);
console.log('Derivative', Object.entries(fd.d).filter(([k]) => /^C|g/.test(k)).map(([k, v]) => k + ' ' + f(v)).join(', '));
const m = (o, n) => o ? `${n}: ω ${f(o.wn, 2)} ζ ${f(o.zeta, 3)} τ ${f(o.tau, 1)} T2 ${f(o.t2, 1)}` : '';
console.log([m(fd.lon.sp, 'Anstellw.'), m(fd.lon.ph, 'Phygoide'), m(fd.lat.dr, 'Taumel'), m(fd.lat.roll, 'Roll'), m(fd.lat.spiral, 'Spirale')].join('\n'));
console.log(fd.crit.map(c => c.name + ' ' + (c.ok ? 'ok' : 'NICHT ok') + ' ' + f(c.val, 2)).join(' | '));
const fr = U.flightDynamics(C, { rigid: true }); console.log('starr: Taumel ζ', f(fr.lat.dr && fr.lat.dr.zeta), 'Spirale re', f(fr.lat.spiral && fr.lat.spiral.re, 4), '| elastisch Γ_flex', f(fd.d.gFlex * 57.3, 1), '°');
for (const mp of ['nose', 'pod', 'tail', 'wing']) {
  const C2 = U.buildCase({ ...P, motorPos: mp, nBooms: mp === 'pod' ? 2 : 1 }, U.DEFAULT_COMPS.map(c => ({ ...c })));
  console.log(mp.padEnd(5), 'm', f(C2.m, 2), 'Akku x', f(C2.bal.xBatt, 2), 'Ballast', f(C2.bal.ballast, 3), 'Kabel', f(C2.bal.mCable, 3), 'SM', f(C2.bal.sm * 100, 1), 'P', f(C2.lvl.pel, 1), 'W', 'slip', C2.slip ? f(C2.slip.qr, 3) : '-');
}

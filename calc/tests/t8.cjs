process.env.EXTRA_NAMES = 'beamModel, beamModes, divergence, flutterSearch, flutterRoots, liftEffectiveness, MAT';
const { load } = require('./load.cjs');
const U = load();
// Goland-Flügel (Goland 1945; Patil & Hodges): Flattern ≈ 137 m/s bei ≈ 70 rad/s, Divergenz ≈ 252,8 m/s
const c = 1.8288, L = 6.096;
const sec = [0, L].map(y => ({ y, c, EI: 9.77e6, GJ: 0.987e6, m: 35.71, xcg: 0.43, xea: 0.33, Ia: 8.64 }));
for (const nEl of [8, 16]) {
  const bm = U.beamModel(sec, L, nEl, 1, 0, 2 * Math.PI, 0.25, []);
  const md = U.beamModes(bm, 6);
  console.log('nEl', nEl, 'Eigenkreisfrequenzen', md.map(m => m.omega.toFixed(1) + ' ' + m.label).join(', '));
  const qD = U.divergence(bm); console.log('  Divergenz', Math.sqrt(2 * qD / 1.225).toFixed(1), 'm/s');
  let t = Date.now();
  const fl = U.flutterSearch(bm, md.slice(0, 4), 1.225, 300, 0, 60);
  console.log('  Flattern', fl.vf && fl.vf.toFixed(1), 'm/s bei', fl.wf && fl.wf.toFixed(1), 'rad/s', '(', Date.now() - t, 'ms )');
  // Pfeilung ±15°: Divergenz
  for (const sw of [-15, 15]) {
    const cl = Math.cos(sw * Math.PI / 180), tl = Math.tan(sw * Math.PI / 180);
    const b2 = U.beamModel(sec.map(s => ({ ...s, y: s.y * cl })), L, nEl, cl, tl, 2 * Math.PI, 0.25, []);
    const q2 = U.divergence(b2); console.log('   Pfeilung', sw, '° Divergenz', Number.isFinite(q2) ? Math.sqrt(2 * q2 / 1.225).toFixed(0) + ' m/s' : 'keine');
  }
}

const { load } = require('./load.cjs');
const U = load();
const f2 = x => (typeof x === 'number' ? x.toFixed(3) : x);
// 1) Traglinie: elliptisch, rechteckig
for (const [type, AR] of [['ellip', 10], ['rect', 6], ['rect', 20], ['taper', 20], ['rect_taper', 20]]) {
  const b = 5, S = b * b / AR, pf = U.planform({ span: b, area: S, planform: type, taper: 0.45, centerFrac: 0.5, washout: 0 });
  const ll = U.liftingLine(pf, 2 * Math.PI);
  const r = U.llAt(ll, 0.8);
  // Integral cl·c über die Spannweite muss CL ergeben
  let s = 0; for (const st of ll.st) s += (r.am * st.fa + st.fb) * st.c; s = s / ll.M * pf.b / pf.S;
  console.log(type, 'AR', AR, 'e', f2(r.e), 'CLa', f2(ll.CLa), 'CL-Integral', f2(s));
}
// mit Schränkung
{
  const pf = U.planform({ span: 5.5, area: 1.5, planform: 'rect_taper', taper: 0.5, centerFrac: 0.55, washout: 2 });
  const ll = U.liftingLine(pf, 6.0);
  for (const CL of [0.4, 0.8, 1.2]) { const r = U.llAt(ll, CL); console.log('washout 2°, CL', CL, 'e', f2(r.e)); }
  console.log('pf', f2(pf.cr), f2(pf.ct), 'mac', f2(pf.mac), 'AR', f2(pf.AR));
}
// 2) Polaren
const mh = U.foilByKey('mh139f'), mx = U.foilByKey('mh139f_xf');
for (const Re of [100e3, 200e3, 300e3, 500e3]) {
  const a = [0.4, 0.8, 1.0, 1.2].map(cl => (U.profileCd(mh, 'free', Re, cl) * 1e4).toFixed(0)).join(' ');
  const b = [0.4, 0.8, 1.0, 1.2].map(cl => (U.profileCd(mx, 'free', Re, cl) * 1e4).toFixed(0)).join(' ');
  console.log('Re', Re, 'NF', a, '| XF', b, 'meta', JSON.stringify(U.foilMeta(mh, 'free', Re)));
}

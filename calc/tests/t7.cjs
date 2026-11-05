const { load } = require('./load.cjs');
const U = load();
// Trefftz-Prüfung: elliptisches Γ vorgeben → e muss 1 sein
for (const N of [28, 60]) {
  const b = 5, AR = 6, S = b * b / AR, pf = U.planform({ span: b, area: S, planform: 'rect', taper: 1, washout: 0, sweep: 0 });
  const v = U.vlmWing(pf, 2 * Math.PI, N), pan = v.pan, h = b / 2;
  const G = pan.map(p => Math.sqrt(1 - (p.ym / h) ** 2));
  let CL = 0; pan.forEach((p, i) => CL += 4 * G[i] * p.dy / S);
  // Trefftz wie im Code
  let D = 0;
  for (let i = 0; i < N; i++) { let w = 0; for (let j = 0; j < N; j++) { const y = pan[i].ym, Q = pan[j]; w += G[j] / (2 * Math.PI) * (1 / (y - Q.yB) - 1 / (y - Q.yA) + 1 / (y + Q.yA) - 1 / (y + Q.yB)); } D += G[i] * w * pan[i].dy; }
  const CDi = -2 * D / S;
  console.log('N', N, 'elliptisch vorgegeben: e =', (CL * CL / (Math.PI * AR * CDi)).toFixed(4), '| VLM rect AR6 e =', U.llAt(v, 0.8).e.toFixed(4), 'CLa', v.CLa.toFixed(3));
  // VLM-Γ-Verteilung gegen elliptisch: Verhältnis Γ/Γ_ell an einigen Stellen
  const s = v.Ga.reduce((a, g, i) => a + g * pan[i].dy, 0), se = G.reduce((a, g, i) => a + g * pan[i].dy, 0);
  console.log('  Γ_VLM/Γ_ell (normiert) bei η', [0, Math.floor(N / 2), N - 3, N - 1].map(i => pan[i].eta.toFixed(2) + ':' + (v.Ga[i] / s / (G[i] / se)).toFixed(3)).join(' '));
}

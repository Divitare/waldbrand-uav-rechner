/* ===================================================================
   Werkstoffe, Steifigkeiten, Eigenschwingungen und Aeroelastik
   - Werkstoffkennwerte typischer Faserverbunde (Epoxid, Handlaminat bis
     Prepreg), Holz, Aluminium. Zulässige Spannung = Kennwert × Abminderung.
   - Flügel als Biege-Torsions-Balken entlang der gepfeilten Holmachse
     (Hermite-Elemente, Torsion linear, Massenkopplung über Schwerpunktabstand).
   - Divergenz: Streifentheorie mit Pfeilungskopplung α = θ − w'·tanΛ
     (Diederich & Budiansky 1948, Weisshaar 1980).
   - Flattern: Theodorsen-Streifentheorie, Wagner-Funktion nach R. T. Jones
     als Zustandsraum, Eigenwerte über der Geschwindigkeit (p-Verfahren).
     Geprüft am Goland-Flügel.
   =================================================================== */
const MAT = {
  // Holmgurte: E-Modul längs (GPa), G (GPa), Dichte (kg/m³), Druckfestigkeit (MPa)
  cfk_ud: { name: 'CFK UD (Rovings/Prepreg)', E: 125, G: 5, rho: 1550, sc: 1100 },
  cfk_rod: { name: 'CFK-Stäbe pultrudiert', E: 135, G: 5, rho: 1600, sc: 1200 },
  gfk_ud: { name: 'GFK UD (E-Glas)', E: 40, G: 4.5, rho: 1950, sc: 650 },
  spruce: { name: 'Kiefer/Fichte', E: 10, G: 0.65, rho: 450, sc: 40 },
  alu: { name: 'Aluminium 7075', E: 71, G: 26.9, rho: 2810, sc: 480 },
  // Schalen und Stege: Schubsteifigkeit und Dehnsteifigkeit je Flächengewicht (G/ρ, E/ρ in MN·m/kg), Schubfestigkeit je Flächengewicht
  gfk45: { name: 'GFK-Gewebe ±45°', gs: 4.7, es: 6.1, ts: 44 },
  cfk45: { name: 'CFK-Gewebe ±45°', gs: 16.7, es: 10.7, ts: 73 },
  cfk090: { name: 'CFK-Gewebe 0/90°', gs: 3.0, es: 36.7, ts: 30 },
  balsa_gfk: { name: 'Balsa 1,5 mm + GFK ±45°', gs: 2.6, es: 3.4, ts: 20 },
  foam_cfk: { name: 'Hartschaum + CFK ±45° (Sandwich)', gs: 12.6, es: 8.0, ts: 50 },
  // Rohre
  cfk_roll: { name: 'CFK-Rohr gewickelt (0/±45)', E: 70, G: 15, rho: 1550 },
  cfk_pult: { name: 'CFK-Rohr pultrudiert (UD)', E: 120, G: 5, rho: 1580 },
  gfk_tube: { name: 'GFK-Rohr', E: 25, G: 5, rho: 1900 },
  alu_tube: { name: 'Aluminiumrohr', E: 70, G: 26.5, rho: 2780 }
};
const MAT_SEL = {
  matCap: ['cfk_ud', 'cfk_rod', 'gfk_ud', 'spruce', 'alu'],
  matWeb: ['balsa_gfk', 'gfk45', 'cfk45', 'foam_cfk'],
  matSkin: ['balsa_gfk', 'gfk45', 'cfk45', 'cfk090', 'foam_cfk'],
  matBoom: ['cfk_roll', 'cfk_pult', 'gfk_tube', 'alu_tube']
};
// Fläche und Umfang der Torsionsnase (vor dem Holm) aus der Profilkontur, je c² bzw. c
const dboxCache = new Map();
function dboxGeom(foil, xs) {
  const k = foil.key + '|' + xs; if (dboxCache.has(k)) return dboxCache.get(k);
  const sh = foil.shape; let A = 0, s = 0, hS = 0;
  for (let i = 0; i < sh.x.length - 1; i++) {
    const x0 = sh.x[i], x1 = Math.min(sh.x[i + 1], xs); if (x0 >= xs) break;
    const f = (x1 - x0) / (sh.x[i + 1] - x0 || 1);
    const yu1 = sh.yu[i] + (sh.yu[i + 1] - sh.yu[i]) * f, yl1 = sh.yl[i] + (sh.yl[i + 1] - sh.yl[i]) * f;
    A += ((sh.yu[i] - sh.yl[i]) + (yu1 - yl1)) / 2 * (x1 - x0);
    s += Math.hypot(x1 - x0, yu1 - sh.yu[i]) + Math.hypot(x1 - x0, yl1 - sh.yl[i]);
    hS = yu1 - yl1;
  }
  const r = { A, s, h: hS }; dboxCache.set(k, r); return r;
}
// Querschnittswerte entlang der Halbspannweite (aus dem Strukturmodell)
function wingSections(C) {
  const P = C.P, st = C.struct || structureMass(C, C.m, true), sd = st.stations, cap = MAT[P.matCap] || MAT.cfk_ud;
  const xs = P.xSpar / 100, xea = xs - 0.04, gsSkin = (MAT[P.matSkin] || MAT.balsa_gfk).gs * 1e6, gsWeb = (MAT[P.matWeb] || MAT.balsa_gfk).gs * 1e6;
  const db = dboxGeom(C.foil, xs), x0 = P.cellX0 / 100, x1 = P.cellX1 / 100;
  const mSolTot = C.mass.solar, mBat = P.battInWing ? C.mass.batt : 0;
  return sd.y.map((y, k) => {
    const c = sd.c[k], eta = y / (C.pf.b / 2);
    const EI = cap.E * 1e9 * sd.A[k] * sd.h[k] ** 2 / (P.sparType === 'tube' ? 8 : 4);
    const Gt = P.wLE * gsSkin, Gtw = P.wWeb * gsWeb, Aenc = db.A * c * c, per = db.s * c;
    let GJ = 4 * Aenc * Aenc / (per / Gt + sd.h[k] / Gtw);
    if (P.sparType === 'tube') { const r = sd.h[k] / 2, t = sd.A[k] / (2 * Math.PI * r); GJ += cap.G * 1e9 * 2 * Math.PI * r ** 3 * t; }
    // Massenanteile je Meter Spannweite mit Lage (Anteil der Tiefe) und Streuung
    const parts = [
      [sd.mCap[k], xs, 0.02], [sd.mWeb[k], xs, 0.01], [sd.mLE[k], 0.12, 0.25], [sd.mRib[k], 0.42, 0.9], [sd.mSkin[k], 0.45, 0.9], [sd.mTE[k], 0.93, 0.12],
      [sd.mWire[k], xs, 0.05], [eta <= C.solarEta ? mSolTot / C.solarSpan : 0, (x0 + x1) / 2, x1 - x0], [eta < 0.6 ? mBat / (0.6 * C.pf.b) : 0, xs, 0.15]
    ];
    let m = 0, mx = 0; for (const [mm, x] of parts) { m += mm; mx += mm * x; }
    const xcg = mx / Math.max(1e-9, m);
    let Ia = 0; for (const [mm, x, d] of parts) Ia += mm * (((x - xea) * c) ** 2 + (d * c) ** 2 / 12);
    return { y, c, EI, GJ, m, xcg, xea, Ia, h: sd.h[k] };
  });
}
// Balkenmodell der Halbspannweite, Wurzel eingespannt; s entlang der gepfeilten Achse
function beamModel(sec, L, nEl, cosL, tanL, a2d, xac = 0.25, point = []) {
  const n = 3 * nEl, K = zeros(n, n), M = zeros(n, n), Ka = zeros(n, n), l = L / nEl;
  const at = s => { const y = s * cosL; let k = 0; while (k < sec.length - 2 && sec[k + 1].y < y) k++; const A = sec[k], B = sec[k + 1], t = clamp((y - A.y) / ((B.y - A.y) || 1), 0, 1); const o = {}; for (const key of ['c', 'EI', 'GJ', 'm', 'xcg', 'xea', 'Ia']) o[key] = A[key] + (B[key] - A[key]) * t; return o; };
  const gp = [[0.1127016654, 5 / 18], [0.5, 8 / 18], [0.8872983346, 5 / 18]];
  const Nw = (x) => [1 - 3 * x * x + 2 * x ** 3, l * (x - 2 * x * x + x ** 3), 3 * x * x - 2 * x ** 3, l * (-x * x + x ** 3)];
  const Nwp = (x) => [(-6 * x + 6 * x * x) / l, 1 - 4 * x + 3 * x * x, (6 * x - 6 * x * x) / l, -2 * x + 3 * x * x];
  const strips = [];
  for (let e = 0; e < nEl; e++) {
    const idx = [3 * e - 3, 3 * e - 2, 3 * e, 3 * e + 1], it = [3 * e - 1, 3 * e + 2]; // w_i, w'_i, w_j, w'_j | θ_i, θ_j (Wurzel-DOFs < 0 entfallen)
    const pm = at((e + 0.5) * l), cn = pm.c * cosL, xth = (pm.xcg - pm.xea) * pm.c * cosL, en = (pm.xea - xac) * pm.c * cosL;
    const add = (A, i, j, v) => { if (i >= 0 && j >= 0) A[i][j] += v; };
    const kb = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]];
    const mb = [[156, 22 * l, 54, -13 * l], [22 * l, 4 * l * l, 13 * l, -3 * l * l], [54, 13 * l, 156, -22 * l], [-13 * l, -3 * l * l, -22 * l, 4 * l * l]];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { add(K, idx[a], idx[b], pm.EI / l ** 3 * kb[a][b]); add(M, idx[a], idx[b], pm.m * cosL * l / 420 * mb[a][b]); }
    const kt = [[1, -1], [-1, 1]], mt = [[2, 1], [1, 2]];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { add(K, it[a], it[b], pm.GJ / l * kt[a][b]); add(M, it[a], it[b], pm.Ia * cosL * l / 6 * mt[a][b]); }
    for (const [x, wq] of gp) {
      const nw = Nw(x), np = Nwp(x), nt = [1 - x, x], f = wq * l;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) { const v = -pm.m * cosL * xth * nw[a] * nt[b] * f; add(M, idx[a], it[b], v); add(M, it[b], idx[a], v); }
      // Aerodynamische Steifigkeit (Divergenz): L' = q·a·cos²Λ·c_n·(θ − tanΛ·w')
      const ca = a2d * cosL * cosL * cn * f;
      for (let a = 0; a < 4; a++) { for (let b = 0; b < 2; b++) add(Ka, idx[a], it[b], ca * nw[a] * nt[b]); for (let b = 0; b < 4; b++) add(Ka, idx[a], idx[b], -ca * tanL * nw[a] * np[b]); }
      for (let a = 0; a < 2; a++) { for (let b = 0; b < 2; b++) add(Ka, it[a], it[b], ca * en * nt[a] * nt[b]); for (let b = 0; b < 4; b++) add(Ka, it[a], idx[b], -ca * en * tanL * nt[a] * np[b]); }
    }
    const nw = Nw(0.5), np = Nwp(0.5);
    strips.push({ idx, it, nw, np, nt: [0.5, 0.5], ds: l, cn, en, b: cn / 2, ah: pm.xea * 2 - 1, s: (e + 0.5) * l, y: (e + 0.5) * l * cosL });
  }
  // Punktmassen (z. B. Motorgondeln): Masse, Lage vor/hinter der elastischen Achse
  for (const pt of point) {
    const node = clamp(Math.round(pt.y / cosL / l), 1, nEl), iw = 3 * node - 3, ith = 3 * node - 1;
    M[iw][iw] += pt.m; M[ith][ith] += pt.m * pt.dx * pt.dx + (pt.J || 0); M[iw][ith] -= pt.m * pt.dx; M[ith][iw] -= pt.m * pt.dx;
  }
  return { K, M, Ka, n, nEl, l, L, strips, cosL, tanL, a2d };
}
function beamModes(bm, nm = 6) {
  const r = genSymEig(bm.K, bm.M), modes = [];
  for (let i = 0; i < Math.min(nm, r.values.length); i++) {
    const v = r.vectors[i], om = Math.sqrt(Math.max(0, r.values[i]));
    // Normierung auf Einheitsmasse, Energieanteile Biegung/Torsion
    let mm = 0; for (let a = 0; a < bm.n; a++) for (let b = 0; b < bm.n; b++) mm += v[a] * bm.M[a][b] * v[b];
    const phi = v.map(x => x / Math.sqrt(mm));
    let eb = 0, et = 0;
    for (let a = 0; a < bm.n; a++) for (let b = 0; b < bm.n; b++) { const kv = phi[a] * bm.K[a][b] * phi[b]; if (a % 3 === 2 && b % 3 === 2) et += kv; else if (a % 3 !== 2 && b % 3 !== 2) eb += kv; }
    modes.push({ omega: om, f: om / (2 * Math.PI), phi, kind: et > eb ? 'Torsion' : 'Biegung', tors: et / Math.max(1e-12, et + eb) });
  }
  let nb = 0, nt = 0; modes.forEach(m => { m.label = m.kind === 'Torsion' ? `${++nt}. Torsion` : `${++nb}. Biegung`; });
  return modes;
}
// Divergenz: K·u = q·Ka·u → größter positiver Eigenwert von K⁻¹Ka ist 1/q_D
function divergence(bm) {
  const Ki = matInv(bm.K), A = matMul(Ki, bm.Ka), ev = eigReal(A);
  let mu = 0; for (const z of ev) if (Math.abs(z.im) < 1e-9 * (1 + Math.abs(z.re)) && z.re > mu) mu = z.re;
  return mu > 0 ? 1 / mu : Infinity; // q_D in Pa
}
// Auftriebswirksamkeit der elastischen Fläche bei q (Verhältnis zur starren Fläche bei gleichem Anstellwinkel)
function liftEffectiveness(bm, q) {
  const n = bm.n, f = new Array(n).fill(0); let Lr = 0;
  for (const s of bm.strips) {
    const ca = bm.a2d * bm.cosL ** 2 * s.cn * s.ds; Lr += ca;
    s.idx.forEach((i, a) => { if (i >= 0) f[i] += ca * s.nw[a]; });
    s.it.forEach((i, a) => { if (i >= 0) f[i] += ca * s.en * s.nt[a]; });
  }
  const A = bm.K.map((r, i) => r.map((v, j) => v - q * bm.Ka[i][j])), u = luSolve(luDecomp(A), f.map(v => v * q));
  let Le = 0;
  for (const s of bm.strips) {
    const ca = bm.a2d * bm.cosL ** 2 * s.cn * s.ds; let th = 0, wp = 0;
    s.it.forEach((i, a) => { if (i >= 0) th += s.nt[a] * u[i]; }); s.idx.forEach((i, a) => { if (i >= 0) wp += s.np[a] * u[i]; });
    Le += ca * (1 + th - bm.tanL * wp);
  }
  return Le / Lr;
}
// Flattern: modaler Zustandsraum mit Theodorsen-Streifen und Jones-Näherung der Wagner-Funktion
const JA = [0.165, 0.335], JB = [0.0455, 0.3];
function flutterMatrix(bm, modes, V, rho, zeta = 0.02) {
  const nm = modes.length, ns = bm.strips.length, Vn = V * bm.cosL, kap = bm.a2d / (2 * Math.PI);
  const Ma = zeros(nm, nm), Ca = zeros(nm, nm), Kaa = zeros(nm, nm), B = zeros(nm, 2 * ns), E0 = zeros(2 * ns, nm), E1 = zeros(2 * ns, nm), D = new Array(2 * ns).fill(0);
  bm.strips.forEach((s, j) => {
    const W = modes.map(md => s.idx.reduce((acc, i, a) => acc + (i >= 0 ? s.nw[a] * md.phi[i] : 0), 0));
    const Wp = modes.map(md => s.idx.reduce((acc, i, a) => acc + (i >= 0 ? s.np[a] * md.phi[i] : 0), 0));
    const T = modes.map(md => s.it.reduce((acc, i, a) => acc + (i >= 0 ? s.nt[a] * md.phi[i] : 0), 0));
    const b = s.b, a = s.ah, ds = s.ds, pr = Math.PI * rho * b * b;
    const c0 = 2 * Math.PI * rho * Vn * b * kap * (1 - JA[0] - JA[1]), cl = [2 * Math.PI * rho * Vn * Vn * kap * JA[0] * JB[0], 2 * Math.PI * rho * Vn * Vn * kap * JA[1] * JB[1]];
    const D1 = W.map((w, k) => -w + b * (0.5 - a) * T[k]), D0 = T.map((t, k) => Vn * (t - bm.tanL * Wp[k])), Gv = W.map((w, k) => w + b * (a + 0.5) * T[k]);
    for (let r = 0; r < nm; r++) for (let k = 0; k < nm; k++) {
      Ma[r][k] += ds * pr * (W[r] * (-W[k] - b * a * T[k]) + T[r] * (-b * a * W[k] - b * b * (1 / 8 + a * a) * T[k]));
      Ca[r][k] += ds * (pr * (W[r] * Vn * T[k] - T[r] * Vn * b * (0.5 - a) * T[k]) + Gv[r] * c0 * D1[k]);
      Kaa[r][k] += ds * Gv[r] * c0 * D0[k];
    }
    for (let q = 0; q < 2; q++) {
      const col = 2 * j + q; for (let r = 0; r < nm; r++) B[r][col] = ds * Gv[r] * cl[q];
      D[col] = -JB[q] * Vn / b; for (let k = 0; k < nm; k++) { E0[col][k] = D0[k]; E1[col][k] = D1[k]; }
    }
  });
  const Mi = matInv(modes.map((_, r) => modes.map((__, k) => (r === k ? 1 : 0) - Ma[r][k])));
  const N = 2 * nm + 2 * ns, A = zeros(N, N);
  for (let r = 0; r < nm; r++) A[r][nm + r] = 1;
  const Cs = modes.map((md, r) => modes.map((__, k) => (r === k ? 2 * zeta * md.omega : 0) - Ca[r][k])), Ks = modes.map((md, r) => modes.map((__, k) => (r === k ? md.omega ** 2 : 0) - Kaa[r][k]));
  for (let r = 0; r < nm; r++) for (let k = 0; k < nm; k++) {
    let a1 = 0, a2 = 0; for (let m = 0; m < nm; m++) { a1 += Mi[r][m] * Ks[m][k]; a2 += Mi[r][m] * Cs[m][k]; }
    A[nm + r][k] = -a1; A[nm + r][nm + k] = -a2;
  }
  for (let r = 0; r < nm; r++) for (let c = 0; c < 2 * ns; c++) { let v = 0; for (let m = 0; m < nm; m++) v += Mi[r][m] * B[m][c]; A[nm + r][2 * nm + c] = v; }
  for (let c = 0; c < 2 * ns; c++) { A[2 * nm + c][2 * nm + c] = D[c]; for (let k = 0; k < nm; k++) { A[2 * nm + c][k] = E0[c][k]; A[2 * nm + c][nm + k] = E1[c][k]; } }
  return A;
}
// Strukturelle Eigenwerte (schwingend) bei V; nach Frequenz sortiert
function flutterRoots(bm, modes, V, rho, zeta) {
  const ev = eigReal(flutterMatrix(bm, modes, V, rho, zeta)), wmin = 0.3 * modes[0].omega;
  return ev.filter(z => z.im > wmin).sort((a, b) => a.im - b.im).map(z => ({ re: z.re, im: z.im, g: 2 * z.re / z.im, f: z.im / (2 * Math.PI) }));
}
function flutterSearch(bm, modes, rho, vMax, zeta = 0.02, nStep = 50) {
  const track = [];
  let vf = null, wf = null;
  const crit = V => { const r = flutterRoots(bm, modes, V, rho, zeta); return { r, g: r.length ? Math.max(...r.map(z => z.re)) : -1 }; };
  let prev = null;
  for (let i = 1; i <= nStep; i++) {
    const V = vMax * i / nStep, c = crit(V); track.push({ V, roots: c.r });
    if (vf === null && c.g > 0) {
      let lo = prev ? prev.V : 0, hi = V;
      for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (crit(m).g > 0) hi = m; else lo = m; }
      vf = hi; const rr = crit(hi).r; const z = rr.reduce((a, b) => (b.re > a.re ? b : a), rr[0]); wf = z ? z.im : null;
    }
    prev = { V };
  }
  return { vf, wf, track };
}
// Leitwerksträger als Kragarm mit Endmasse (Rayleigh)
function boomModes(C, L, d, lin, mat, mTip, Jtip) {
  const M = MAT[mat] || MAT.cfk_roll, r = d / 2, t = lin / (M.rho * 2 * Math.PI * r), I = Math.PI * r ** 3 * t, J = 2 * Math.PI * r ** 3 * t;
  const fb = Math.sqrt(3 * M.E * 1e9 * I / (L ** 3 * (mTip + 0.2357 * lin * L))) / (2 * Math.PI);
  const ft = Math.sqrt(M.G * 1e9 * J / (L * (Jtip + lin * r * r * L / 3))) / (2 * Math.PI);
  const defl = mTip * G * L ** 3 / (3 * M.E * 1e9 * I);
  return { fb, ft, t, EI: M.E * 1e9 * I, GJ: M.G * 1e9 * J, defl };
}
// Komplette Auswertung für das Flugzeug
function aeroelastic(C, opt = {}) {
  const P = C.P, sec = wingSections(C), cosL = Math.cos(C.pf.sweep * DEG), tanL = Math.tan(C.pf.sweep * DEG), L = C.pf.b / 2 / cosL;
  const a2d = clamp(foilMeta(C.foil, C.mode, P.v * C.pf.mac / C.nu).slope, 5.2, 7.0);
  const pts = (C.layout && C.layout.wingPoints) || [];
  const bm = beamModel(sec, L, opt.nEl || 12, cosL, tanL, a2d, 0.25, pts), modes = beamModes(bm, 6);
  const qD0 = divergence(bm), VD0 = Number.isFinite(qD0) ? Math.sqrt(2 * qD0 / C.rho) : Infinity, VD = VD0 > 30 * Math.max(P.vmax, 10) ? Infinity : VD0, qD = Number.isFinite(VD) ? qD0 : Infinity;
  const vMax = opt.vMax || Math.max(3 * P.vmax, 60);
  const fl = opt.noFlutter ? { vf: null, track: [] } : flutterSearch(bm, modes.slice(0, 4), C.rho, vMax, 0.02, opt.nStep || 40);
  const le = liftEffectiveness(bm, 0.5 * C.rho * P.vmax ** 2);
  // Nachweisgeschwindigkeit sinngemäß CS-23.629: flatter- und divergenzfrei bis 1,2 × V_max
  const vReq = 1.2 * P.vmax;
  // Strukturmoden bei Reisefahrt mit aerodynamischer Dämpfung
  const cruise = opt.noFlutter ? [] : flutterRoots(bm, modes.slice(0, 4), P.v, C.rho, 0.02).map(r => { const w = Math.hypot(r.re, r.im); return { f: w / (2 * Math.PI), zeta: -r.re / w }; });
  return { sec, bm, modes, qD, VD, flutter: fl, liftEff: le, a2d, rho: C.rho, vReq, cruise, okF: !(fl.vf && fl.vf < vReq), okD: !(VD < vReq) };
}
// Leitwerksträger, Leitwerk und ggf. Heckmotor als Kragarm an der Flügelwurzel
function tailBoomDyn(C) {
  const P = C.P, tg = C.tail, g = C.bal ? C.bal.g : { lBoom: tg.lBoom }, kR = 1 + P.rugged / 100;
  const mHT = P.wTail * tg.Sh * kR + (C.mass.solarHT || 0), mVT = P.wTail * tg.Sv * kR, mMot = P.motorPos === 'tail' ? C.mass.prop : 0;
  const mTip = mHT + mVT + mMot, Jtip = mHT * tg.bh ** 2 / 12 + mVT * (0.45 * tg.bv) ** 2;
  const nb = Math.max(1, P.nBooms), r = boomModes(C, g.lBoom, P.boomD, P.boomLin, P.matBoom, mTip / nb, Jtip / nb);
  return { ...r, L: g.lBoom, mTip, Jtip, nb };
}
// Anregung durch den Propeller: Drehzahl (Unwucht) und Blattfolge gegen Eigenfrequenzen
function resonance(C, freqs) {
  const P = C.P, B = Math.max(2, Math.round(P.propBlades || 2));
  let n0 = NaN, n1 = NaN;
  try { if (typeof propOperate === 'function') { const op = propOperate(C, C.lvl.Dtot, P.v, C.rho); n0 = op.n; n1 = propMaxThrust(C, P.v, C.rho).n; } } catch (e) { }
  if (!fin(n0)) { n0 = 30; n1 = 60; }
  // Dauerbetrieb um die Reisedrehzahl (±12 %) ist kritisch, beim Steigen wird der Bereich nur durchfahren
  const hits = [];
  for (const fr of freqs) for (const [k, lab] of [[1, '1. Ordnung (Unwucht)'], [B, B + '. Ordnung (Blattfolge)']]) {
    const nr = fr.f / k; if (nr >= n0 * 0.85 && nr <= n1 * 1.1) hits.push({ ...fr, k, lab, rpm: nr * 60, cruise: Math.abs(nr / n0 - 1) < 0.12 });
  }
  hits.sort((a, b) => b.cruise - a.cruise);
  return { n0, n1, rpm0: n0 * 60, rpm1: n1 * 60, B, hits, nCruise: hits.filter(h => h.cruise).length };
}
// Prüffall Goland-Flügel (Goland 1945): gleichmäßiger Kragflügel 6,1 m × 1,83 m, Meereshöhe
function golandCheck() {
  const c = 1.8288, L = 6.096, sec = [0, L].map(y => ({ y, c, EI: 9.77e6, GJ: 0.987e6, m: 35.71, xcg: 0.43, xea: 0.33, Ia: 8.64 }));
  const bm = beamModel(sec, L, 16, 1, 0, 2 * Math.PI, 0.25, []), md = beamModes(bm, 6), qD = divergence(bm), fl = flutterSearch(bm, md.slice(0, 4), 1.225, 300, 0, 60);
  return { VD: Math.sqrt(2 * qD / 1.225), VF: fl.vf, wF: fl.wf, w1: md[0].omega, w2: md[1].omega };
}

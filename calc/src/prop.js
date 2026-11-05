/* ===================================================================
   Propeller nach Blattelement-Impuls-Theorie (BEMT) mit Prandtl-Spitzen-
   und Nabenverlust, Profilbeiwerte aus der eingebetteten Polarendatenbank.
   Motor nach dem Ersatzschaltbild erster Ordnung (Drela: Kv, R, I0).
   Blatttiefenverteilung nach APC 10x7E (Geometrie aus der FLOWUnsteady-
   Datenbank), geprüft gegen Windkanaldaten von McCrink & Gregory.
   =================================================================== */
const APC_C = [[0, 0.134], [0.086, 0.137], [0.16, 0.1446], [0.2, 0.1543], [0.25, 0.175], [0.3, 0.205], [0.35, 0.208], [0.4, 0.212], [0.45, 0.205], [0.5, 0.195], [0.55, 0.186], [0.6, 0.174], [0.65, 0.161], [0.7, 0.145], [0.75, 0.129], [0.8, 0.112], [0.85, 0.096], [0.9, 0.081], [0.9245, 0.0711], [0.954, 0.0661], [1, 0.0375]];
const APC_B = [[0, 17], [0.04715, 22], [0.088145, 30], [0.15, 37.86], [0.2, 45.82], [0.25, 44.19], [0.3, 38.35], [0.35, 33.64], [0.4, 29.9], [0.45, 27.02], [0.5, 24.67], [0.55, 22.62], [0.6, 20.88], [0.65, 19.36], [0.7, 17.98], [0.75, 16.74], [0.8, 15.79], [0.85, 14.64], [0.9, 13.86], [0.95, 12.72], [1, 11.53]];
const tab = (T, x) => { let i = 0; while (i < T.length - 2 && T[i + 1][0] < x) i++; const [a, fa] = T[i], [b, fb] = T[i + 1]; return fa + (fb - fa) * clamp((x - a) / (b - a), 0, 1); };
// Generisches Propellerprofil nach QPROP (M. Drela): c_a = 0,5 + 5,8·α, c_a 0,3…1,2,
// c_w = (0,028 + 0,05·(c_a − 0,5)²)·(Re/70 000)^−0,5. Dünne, stark gewölbte Propellerprofile
// treffen die APC-Messungen damit besser als die Tragflügelprofile der Datenbank.
const QPROP_FOIL = {
  key: 'qprop', name: 'Generisch (QPROP, Drela)',
  qprop(Re, al) {
    let cl = 0.5 + 5.8 * al, d = 0, stall = 0;
    if (cl > 1.2) { d = (cl - 1.2) / 5.8; cl = 1.2 * (1 - 0.45 * Math.min(1, d / 0.3)); stall = 1; }
    else if (cl < -0.3) { d = (-0.3 - cl) / 5.8; cl = -0.3 * (1 - 0.4 * Math.min(1, d / 0.3)); stall = -1; }
    const c0 = stall > 0 ? 1.2 : stall < 0 ? -0.3 : cl, k = c0 > 0.5 ? 0.05 : 0.02;
    return { cl, cd: (0.028 + k * (c0 - 0.5) ** 2) * Math.pow(Math.max(Re, 5000) / 70000, -0.5) + 1.2 * Math.sin(Math.min(d, 1.2)) ** 2, stall };
  }
};
const propFoil = key => key === 'qprop' || !key ? QPROP_FOIL : foilByKey(key);
// Geometrie: Radius R, Nabe, Blattzahl, Tiefe c(r), Einstellwinkel β(r)
function propGeometry(P) {
  if (P.propGeom === 'apc10x7') return { R: 0.127, Rh: 0.0095, B: 2, foil: propFoil(P.propFoil), c: x => tab(APC_C, x) * 0.127, beta: x => tab(APC_B, x) * DEG, name: 'APC 10x7E' };
  const R = P.propD / 2, pitch = P.propPitch, k = P.propChord;
  return { R, Rh: Math.max(0.08 * R, 0.015), B: Math.max(2, Math.round(P.propBlades)), foil: propFoil(P.propFoil), c: x => tab(APC_C, x) * R * k, beta: x => Math.atan(pitch / (2 * Math.PI * Math.max(x, 0.05) * R)), name: `${(P.propD * 39.37).toFixed(1)}x${(pitch * 39.37).toFixed(1)} Zoll` };
}
// Profilbeiwerte über dem Anstellwinkel aus der α(c_a)-Tabelle der Polarendatenbank, damit die
// nichtlineare Auftriebskurve bei kleinen Re (laminare Ablöseblase) erhalten bleibt.
// Jenseits des Tabellenbereichs: Abriss mit abfallendem c_a und steigendem c_w (Flachplatte).
function rowCl(ps, i, aDeg) {
  const row = ps.al && ps.al[i], C = AF.cl;
  let k0 = -1, k1 = -1;
  if (row) for (let k = 0; k < row.length; k++) if (row[k] != null) { if (k0 < 0) k0 = k; k1 = k; }
  if (k1 - k0 < 2) { const m = ps.meta[i], sl = clamp(m.slope, 4.5, 7.5); const cl = sl * (aDeg - m.a0) * DEG; return cl > m.clmax ? { cl: m.clmax, d: (cl - m.clmax) / sl, edge: m.clmax } : { cl, d: 0, edge: cl }; }
  if (aDeg >= row[k1]) return { cl: C[k1], d: (aDeg - row[k1]) * DEG, edge: C[k1] };
  if (aDeg <= row[k0]) {
    const sl = (C[k0 + 1] - C[k0]) / Math.max(0.3, row[k0 + 1] - row[k0]), cl = C[k0] + (aDeg - row[k0]) * sl, clmin = -0.6;
    return cl < clmin ? { cl: clmin, d: (cl - clmin) / (sl * RAD), edge: clmin } : { cl, d: 0, edge: cl };
  }
  for (let k = k0; k < k1; k++) {
    const a = row[k], b = row[k + 1];
    if (a == null || b == null || aDeg > Math.max(a, b)) continue;
    return { cl: C[k] + (C[k + 1] - C[k]) * clamp((aDeg - a) / Math.max(1e-6, b - a), 0, 1), d: 0, edge: 0 };
  }
  return { cl: C[k1], d: 0, edge: 0 };
}
function sectionCoef(foil, Re, al) {
  if (foil.qprop) return foil.qprop(Re, al);
  const mode = 'free', ps = polarSet(foil, mode), [i, t] = reIdx(Re), aDeg = al * RAD;
  const r0 = rowCl(ps, i, aDeg), r1 = rowCl(ps, i + 1, aDeg), d = r0.d + (r1.d - r0.d) * t;
  if (d > 0) {               // Abriss: c_a fällt in ~17° auf 55 %, c_w wächst wie bei der ebenen Platte
    const edge = r0.edge + (r1.edge - r0.edge) * t;
    return { cl: edge * (1 - 0.45 * Math.min(1, d / 0.3)), cd: profileCd(foil, mode, Re, edge) + 1.2 * Math.sin(Math.min(d, 1.2)) ** 2, stall: 1 };
  }
  if (d < 0) {
    const edge = r0.edge + (r1.edge - r0.edge) * t, dd = -d;
    return { cl: edge * (1 - 0.4 * Math.min(1, dd / 0.3)), cd: profileCd(foil, mode, Re, edge) + 1.2 * Math.sin(Math.min(dd, 1.2)) ** 2, stall: -1 };
  }
  const cl = r0.cl + (r1.cl - r0.cl) * t;
  return { cl, cd: profileCd(foil, mode, Re, cl), stall: 0 };
}
// Schub und Moment bei Fluggeschwindigkeit V (m/s) und Drehzahl n (1/s)
function bemt(g, V, n, rho, nu, Ns = 18) {
  const Om = 2 * Math.PI * n, R = g.R, dr = (R - g.Rh) / Ns;
  let T = 0, Q = 0;
  for (let i = 0; i < Ns; i++) {
    const r = g.Rh + (i + 0.5) * dr, x = r / R, c = g.c(x), beta = g.beta(x), sig = g.B * c / (2 * Math.PI * r);
    const phi0 = Math.atan2(V, Om * r);
    const ev = phi => {
      const al = beta - phi, W0 = Math.hypot(V, Om * r), co = sectionCoef(g.foil, W0 * c / nu, al);
      const sp = Math.sin(phi), cp = Math.cos(phi), cn = co.cl * cp - co.cd * sp, ct = co.cl * sp + co.cd * cp;
      const ft = g.B / 2 * (R - r) / (r * sp), fh = g.B / 2 * (r - g.Rh) / (g.Rh * sp), F = Math.max(0.05, 4 / (Math.PI * Math.PI) * Math.acos(Math.exp(-ft)) * Math.acos(Math.exp(-fh)));
      const k = clamp(sig * cn / (4 * F * sp * sp), -0.7, 0.7), kp = sig * ct / (4 * F * sp * cp);
      const a = k / (1 - k), ap = kp / (1 + kp);
      return { R: sp / (1 + a) - (V / (Om * r)) * cp / (1 - ap), a, ap, co, sp, cp };
    };
    let lo = phi0 + 1e-6, hi = Math.min(Math.PI / 2 - 1e-3, beta + 0.35), flo = ev(lo), fhi = ev(hi), z;
    if (flo.R * fhi.R > 0) z = ev(phi0);
    else { for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2, fm = ev(mid); if (fm.R * flo.R > 0) { lo = mid; flo = fm; } else hi = mid; } z = ev((lo + hi) / 2); }
    const Va = V * (1 + z.a), Vt = Om * r * (1 - z.ap), W2 = Va * Va + Vt * Vt, phi = Math.atan2(Va, Vt);
    const co = sectionCoef(g.foil, Math.sqrt(W2) * c / nu, beta - phi), sp = Math.sin(phi), cp = Math.cos(phi);
    T += 0.5 * rho * W2 * g.B * c * (co.cl * cp - co.cd * sp) * dr;
    Q += 0.5 * rho * W2 * g.B * c * (co.cl * sp + co.cd * cp) * r * dr;
  }
  const D = 2 * R, P = Q * Om;
  return { T, Q, P, CT: T / (rho * n * n * D ** 4), CP: P / (rho * n ** 3 * D ** 5), J: V / (n * D), eta: P > 0 ? T * V / P : 0 };
}
// Kennlinie C_T(J), C_P(J) einmal je Propeller bei Reiseflug-Reynoldszahl
const propCache = new Map();
function propTable(C) {
  const P = C.P, g = propGeometry(P), key = [P.propGeom, P.propD, P.propPitch, P.propChord, P.propBlades, P.propFoil, Math.round(P.v), C.rho.toFixed(2)].join('|');
  if (propCache.has(key)) return propCache.get(key);
  const pts = [], D = 2 * g.R;
  for (let J = 0.04; J <= 1.6; J += 0.02) {
    const n = P.v / (J * D), r = bemt(g, P.v, n, C.rho, C.nu);
    pts.push({ J, CT: r.CT, CP: r.CP, eta: r.eta });
    if (r.CT < -0.01) break;
  }
  const t = { g, D, pts, J0: (pts.find(p => p.CT <= 0) || pts[pts.length - 1]).J };
  if (propCache.size > 60) propCache.clear(); propCache.set(key, t); return t;
}
function tabJ(t, J) { const p = t.pts; let i = 0; while (i < p.length - 2 && p[i + 1].J < J) i++; const a = p[i], b = p[i + 1], f = clamp((J - a.J) / (b.J - a.J), 0, J < a.J ? 0 : 1.5); return { CT: a.CT + (b.CT - a.CT) * f, CP: a.CP + (b.CP - a.CP) * f }; }
// Motor (Drela): Q = (I − I0)/Kv, U = I·R + Ω/Kv; Kv in rad/(s·V)
function motorAt(P, Om, Qm) {
  const Kv = P.motKv * 2 * Math.PI / 60, I = Qm * Kv + P.motI0, U = I * P.motR + Om / Kv;
  return { I, U, Pel: U * I, eta: Qm * Om / Math.max(1e-9, U * I) };
}
const battU = P => P.nCells * P.cellV;
// Betriebspunkt für geforderten Gesamtschub T bei V
function propOperate(C, T, V, rho) {
  const P = C.P, t = propTable(C), D = t.D, nP = C.motor ? C.motor.nProp : 1, Tp = T / nP, gr = P.gearRatio, eg = P.etaGear / 100;
  if (!(Tp > 0)) return { ok: true, etaTot: 1, n: 0 };
  const thrust = n => tabJ(t, V / (n * D)).CT * rho * n * n * D ** 4;
  let lo = V / (t.J0 * D) * 1.0001, hi = lo * 8;
  if (thrust(hi) < Tp) hi = lo * 30;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (thrust(m) < Tp) lo = m; else hi = m; }
  const n = (lo + hi) / 2, J = V / (n * D), c = tabJ(t, J), Psh = c.CP * rho * n ** 3 * D ** 5, Qp = Psh / (2 * Math.PI * n);
  const Om = 2 * Math.PI * n * gr, Qm = Qp / gr / eg, mo = motorAt(P, Om, Qm), Pbat = mo.Pel * nP / (P.etaEsc / 100);
  const Umax = battU(P) * 0.97, ok = mo.U <= Umax && mo.I <= P.motImax;
  return { ok, n, rpm: n * 60, J, etaP: Tp * V / Psh, etaM: mo.eta, I: mo.I, U: mo.U, throttle: mo.U / Umax, Pbat, etaTot: T * V / Pbat, Psh: Psh * nP };
}
// Größter Schub bei V (Vollgas, Strombegrenzung)
function propMaxThrust(C, V, rho) {
  const P = C.P, t = propTable(C), D = t.D, nP = C.motor ? C.motor.nProp : 1, gr = P.gearRatio, eg = P.etaGear / 100, Kv = P.motKv * 2 * Math.PI / 60, Umax = battU(P) * 0.97;
  const Qprop = n => Math.max(0, tabJ(t, V / (n * D)).CP) * rho * n * n * D ** 5 / (2 * Math.PI);
  const Qmot = n => { const Om = 2 * Math.PI * n * gr, I = Math.min(P.motImax, (Umax - Om / Kv) / P.motR); return Math.max(0, (I - P.motI0) / Kv) * gr * eg; };
  let lo = 0.1, hi = Umax * Kv / (2 * Math.PI * gr);
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (Qmot(m) > Qprop(m)) lo = m; else hi = m; }
  const n = (lo + hi) / 2, c = tabJ(t, V / (n * D));
  return { T: Math.max(0, c.CT) * rho * n * n * D ** 4 * nP, n, rpm: n * 60 };
}
// Steig- und Gleitpolare
function climbGlide(C) {
  const P = C.P, W = C.m * G, out = [];
  const v0 = Math.max(C.vs * 1.05, 4), v1 = Math.max(v0 + 2, P.vmax);
  for (let i = 0; i <= 30; i++) {
    const V = v0 + (v1 - v0) * i / 30, a = aero(C, V, 1, C.rho, C.nu);
    const Tm = propMaxThrust(C, V, C.rho).T;
    out.push({ V, D: a.Dtot, roc: fin(Tm) ? (Tm - a.Dtot) * V / W : NaN, sink: a.Dtot * V / W, LD: a.LD, Tmax: Tm });
  }
  const bestC = out.reduce((a, b) => (b.roc > a.roc ? b : a), out[0]), minS = out.reduce((a, b) => (b.sink < a.sink ? b : a), out[0]), bestG = out.reduce((a, b) => (b.LD > a.LD ? b : a), out[0]);
  return { pts: out, bestC, minS, bestG, tClimb: bestC.roc > 0 ? P.hAGL / bestC.roc : Infinity };
}
// Wirkungsgradkennfeld über Geschwindigkeit und Schub
function propMap(C, nv = 14, nt = 12) {
  const P = C.P, v0 = Math.max(C.vs * 0.95, 4), v1 = Math.max(v0 + 3, P.vmax), cells = [];
  let tMax = 0;
  const vs = Array.from({ length: nv }, (_, i) => v0 + (v1 - v0) * i / (nv - 1));
  const tm = vs.map(V => propMaxThrust(C, V, C.rho).T); tMax = Math.max(...tm);
  for (let i = 0; i < nv; i++) for (let j = 0; j < nt; j++) {
    const T = tMax * (j + 0.5) / nt; if (T > tm[i]) { cells.push({ V: vs[i], T, eta: NaN }); continue; }
    const r = propOperate(C, T, vs[i], C.rho); cells.push({ V: vs[i], T, eta: r.ok ? r.etaTot : NaN, I: r.I, rpm: r.rpm });
  }
  return { vs, tm, tMax, nt, cells };
}
// Prüffall APC 10x7E bei 9200 U/min gegen Windkanalmessung (McCrink & Gregory, über die FLOWUnsteady-Datenbank)
const APC_MEAS = {
  CT: [[0.0628, 0.1201], [0.1859, 0.1139], [0.2996, 0.1045], [0.4061, 0.0923], [0.5028, 0.0785], [0.5912, 0.0597], [0.6706, 0.0403], [0.7424, 0.0248], [0.8052, 0.0098]],
  CQ: [[0.0622, 0.00878], [0.185, 0.00883], [0.2992, 0.00912], [0.4035, 0.00912], [0.5008, 0.00875], [0.5905, 0.00766], [0.6695, 0.00614], [0.7415, 0.00471], [0.8034, 0.00326]],
  eta: [[0.1886, 0.385], [0.3024, 0.548], [0.4077, 0.656], [0.5042, 0.718], [0.5913, 0.730], [0.6710, 0.699], [0.7419, 0.625]]
};
function apcCheck(foil = 'qprop') {
  const g = propGeometry({ propGeom: 'apc10x7', propFoil: foil }), rho = 1.225, nu = 1.46e-5, n = 9200 / 60, D = 0.254, out = [];
  for (let J = 0.1; J <= 0.801; J += 0.05) { const r = bemt(g, J * n * D, n, rho, nu); out.push({ J, CT: r.CT, CQ: r.CP / (2 * Math.PI), eta: r.eta }); }
  return out;
}

/* ===================================================================
   Flugdynamik: Stabilitätsderivative und Eigenbewegungen
   - Flügel aus dem Wirbelgitter (Auftriebsanstieg, Rolldämpfung, V-Form,
     Pfeilung über Kutta-Joukowski mit Schiebewinkel, Nickdämpfung),
     Leitwerk und Rumpf nach Etkin & Reid, Nelson, DATCOM/Raymer.
   - Biegung des Flügels im Flug wirkt als zusätzliche V-Form (Lehre aus
     dem Helios-Unfall 2003).
   - Längs- und Seitenbewegung als lineare Zustandsräume (Etkin), Eigenwerte,
     Zuordnung zu Anstellwinkel-, Phygoid-, Roll-, Spiral- und Taumelschwingung,
     Vergleich mit MIL-F-8785C (Klasse I, Kategorie B, Level 1).
   =================================================================== */
const helmbold = (A, a0) => Math.PI * A / (1 + Math.sqrt(1 + (Math.PI * A / a0) ** 2));
function derivatives(C, opt = {}) {
  const P = C.P, pf = C.pf, ll = C.ll, tg = C.tail, np = C.np, bal = C.bal, lv = C.lvl;
  const S = pf.S, b = pf.b, cb = pf.mac, V = P.v, rho = C.rho, q = 0.5 * rho * V * V, W = C.m * G;
  const CL = W / (q * S), CD = lv.Dtot / (q * S), CLa = np.CLa, sm = bal.sm, Cma = -CLa * sm;
  const lt = np.xact - bal.xcg, VH = tg.Sh * lt / (S * cb), at = np.at, eT = np.etaT * (np.kFlex || 1), deda = np.deda;
  // Flügel-Nickdämpfung um den Schwerpunkt (Wirbelgitter, Überlagerung)
  const xr = bal.xcg - (bal.g.xLE0 + pf.cr / 4), k = 8 / (S * cb * cb);
  const CmqW = -k * (ll.sGqx - xr * ll.sGq - xr * ll.sGax + xr * xr * ll.sGa), CLqW = 4 / S * 2 / cb * (ll.sGq - xr * ll.sGa);
  const CLq = 2 * at * eT * VH + CLqW, Cmq = -2 * at * eT * VH * lt / cb + CmqW;
  const CLad = 2 * at * eT * VH * deda, Cmad = -2 * at * eT * VH * lt / cb * deda;
  const d1 = aero(C, V, 1.05, rho, C.nu), CDa = (d1.Dtot - lv.Dtot) / (q * S) / (0.05 * CL / CLa);
  // Seitenleitwerk: Helmbold mit Endscheibenwirkung des Höhenleitwerks (DATCOM 5.3.1.1: am Fuß 1,55, oben 1,75,
  // Doppelleitwerk 1,4), Seitenwind-/Staudruckfaktor nach DATCOM (Hochdecker), Propellerstrahl und nachgiebiger Träger
  const g = bal.g, kAV = C.cfg.fus === 'twin' ? 1.4 : C.cfg.tail === 'T' ? 1.75 : 1.55, av = helmbold(kAV * P.arV, 2 * Math.PI * 0.9);
  const lvv = g.xvLE + 0.25 * tg.cv + g.vSw * 0.46 * tg.bv - bal.xcg, zv = g.zV0 + 0.46 * tg.bv - bal.zcg;
  const fx = C.struct && C.struct.tail && C.struct.tail.flex, qv = 0.5 * rho * V * V * (C.pw ? C.pw.etaV : 1), kFlexV = fx ? 1 / (1 + qv * av * tg.Svf * fx.V) : 1;
  const sw = (0.724 + 3.06 * (tg.Sv / S) / (1 + Math.cos(pf.sweep * DEG)) - 0.4 * (bal.g.zw / P.fusD) + 0.009 * pf.AR) * (C.pw ? C.pw.etaV : 1) * kFlexV, ev = 0.9;
  const CYbV = -av * sw * tg.Sv / S;
  // Rumpf (Raymer: Cn_β = −1,3·Vol/(S·b)), Propeller-Normalkraft in der Seitenbewegung (vor dem Schwerpunkt destabilisierend)
  const volF = g.fus.Vol, CYbF = -2 * (Math.PI * P.fusD ** 2 / 4) / S, CnbF = -1.3 * volF / (S * b);
  const Np = C.pw ? C.pw.CNa * C.pw.ps.A / S : 0, CYbP = -Np, CnbP = -Np * (bal.xcg - g.xProp) / b;
  // Hochdecker: Flügel über der Rumpfachse erhöht die Rollstabilität (DATCOM 5.2.2.1): ΔCl_β = 1,2·√A·(z_w/b)·(2D/b), z_w nach unten positiv
  const ClbWF = 1.2 * Math.sqrt(pf.AR) * (-bal.g.zw / b) * (2 * P.fusD / b);
  // V-Form: geometrisch (Außenflügel) und aus der Durchbiegung bei 1 g (Γ ≈ 1,2·w_Spitze/(b/2))
  const dTip = C.struct ? C.struct.dTip : 0, gFlex = opt.rigid ? 0 : 1.2 * dTip / (b / 2), gGeo = (P.dihedral || 0) * DEG;
  const wl = wingLateral(ll, lv.CL, lv.cdp, b, S);
  const ClbW = ll.ClbDih * gGeo + ll.ClbDihFull * gFlex + wl.ClbSweep;
  const ClpH = -(at / 12) * (tg.Sh / S) * (tg.bh / b) ** 2 * 2;
  const d = {
    CL, CD, CLa, Cma, CLq, Cmq, CLad, Cmad, CDa, sm,
    CYb: CYbV + CYbF + CYbP, Clb: ClbW + ClbWF - av * sw * (tg.Sv / S) * (zv / b), Cnb: av * sw * (tg.Sv / S) * (lvv / b) + CnbF + CnbP,
    CYp: 2 * CYbV * zv / b, Clp: ll.Clp + ClpH + 2 * CYbV * (zv / b) ** 2, Cnp: wl.Cnp - 2 / (b * b) * lvv * zv * CYbV,
    CYr: -2 * CYbV * lvv / b * ev, Clr: wl.Clr - 2 * CYbV * (zv / b) * (lvv / b) * ev, Cnr: wl.Cnr + 2 * CYbV * (lvv / b) ** 2 * ev,
    gFlex, gGeo, ClbSweep: wl.ClbSweep, ClbDih: ll.ClbDih * gGeo, ClbFlex: ll.ClbDihFull * gFlex, ClbWF, ClbV: -av * sw * (tg.Sv / S) * (zv / b), CnbV: av * sw * (tg.Sv / S) * (lvv / b), CnbF, CnbP, CmqW, VH, VV: tg.Sv * lvv / (S * b), zv, lvv, kFlexV, av
  };
  return d;
}
function lonMatrix(x) {
  const md = x.m - x.Zwd;
  return [
    [x.Xu / x.m, x.Xw / x.m, 0, -x.g],
    [x.Zu / md, x.Zw / md, (x.Zq + x.m * x.V) / md, 0],
    [(x.Mu + x.Mwd * x.Zu / md) / x.Iy, (x.Mw + x.Mwd * x.Zw / md) / x.Iy, (x.Mq + x.Mwd * (x.Zq + x.m * x.V) / md) / x.Iy, 0],
    [0, 0, 1, 0]
  ];
}
// Seitenbewegung mit Deviationsmoment I_zx (Etkin & Reid 1996, Gl. 4.9,20): ṗ und ṙ aus [I_x −I_zx; −I_zx I_z]·[ṗ; ṙ] = [L; N]
function latMatrix(x) {
  const Ixz = x.Ixz || 0, den = x.Ix * x.Iz - Ixz * Ixz, Lp = (a, b) => (x.Iz * a + Ixz * b) / den, Np = (a, b) => (Ixz * a + x.Ix * b) / den;
  return [
    [x.Yv / x.m, x.Yp / x.m, x.Yr / x.m - x.V, x.g],
    [Lp(x.Lv, x.Nv), Lp(x.Lp, x.Np), Lp(x.Lr, x.Nr), 0],
    [Np(x.Lv, x.Nv), Np(x.Lp, x.Np), Np(x.Lr, x.Nr), 0],
    [0, 1, 0, 0]
  ];
}
const modeOf = z => { const w = Math.hypot(z.re, z.im); return { re: z.re, im: z.im, wn: w, zeta: w > 0 ? -z.re / w : 0, T: z.im ? 2 * Math.PI / Math.abs(z.im) : NaN, tau: z.re ? -1 / z.re : Infinity, t2: z.re > 0 ? Math.log(2) / z.re : Infinity, th: z.re < 0 ? Math.log(2) / -z.re : Infinity }; };
// Längsbewegung zuordnen. Gibt es nur ein konjugiertes Paar, entscheidet die Nähe zur Lanchester-Phygoide
// (ω ≈ √2·g/V); ein aperiodisch gedämpftes Anstellwinkelpaar bekommt ersatzweise ω_n = √(λ1λ2), ζ = −(λ1+λ2)/(2ω_n).
function classifyLon(ev, V) {
  const wPh = V ? Math.SQRT2 * G / V : 0.8;
  const cx = ev.filter(z => z.im > 1e-9).sort((a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im)), re = ev.filter(z => Math.abs(z.im) <= 1e-9).sort((a, b) => a.re - b.re);
  const out = {};
  const pairEq = (a, b) => { const wn = Math.sqrt(Math.max(0, a.re * b.re)), slow = a.re > b.re ? a : b, m = modeOf(slow); return { ...m, wn, zeta: wn > 0 ? -(a.re + b.re) / (2 * wn) : NaN, real: true, roots: [a, b] }; };
  if (cx.length >= 2) { out.sp = modeOf(cx[0]); out.ph = modeOf(cx[1]); }
  else if (cx.length === 1) {
    const z = cx[0], w = Math.hypot(z.re, z.im), wr = re.length >= 2 ? Math.sqrt(Math.abs(re[0].re * re[re.length - 1].re)) : 0;
    if (re.length >= 2 && Math.abs(Math.log(w / wPh)) < Math.abs(Math.log(w / Math.max(1e-6, wr)))) { out.ph = modeOf(z); out.sp = pairEq(re[0], re[re.length - 1]); }
    else { out.sp = modeOf(z); out.phReal = re.map(modeOf); }
  } else if (re.length === 4) { out.sp = pairEq(re[0], re[1]); out.phReal = [modeOf(re[2]), modeOf(re[3])]; }
  else out.real = re.map(modeOf);
  return out;
}
function classifyLat(ev) {
  const cx = ev.filter(z => z.im > 1e-9), re = ev.filter(z => Math.abs(z.im) <= 1e-9).sort((a, b) => a.re - b.re);
  const out = {};
  if (cx.length) out.dr = modeOf(cx[0]);
  if (re.length >= 2) { out.roll = modeOf(re[0]); out.spiral = modeOf(re[re.length - 1]); }
  else if (re.length === 1) out.roll = modeOf(re[0]);
  if (!cx.length && re.length === 4) { out.roll = modeOf(re[0]); out.spiral = modeOf(re[3]); out.drReal = [modeOf(re[1]), modeOf(re[2])]; }
  return out;
}
function flightDynamics(C, opt = {}) {
  const P = C.P, d = derivatives(C, opt), pf = C.pf, S = pf.S, b = pf.b, cb = pf.mac, V = P.v, rho = C.rho, q = 0.5 * rho * V * V, m = C.m, g = G, mi = C.bal.mi;
  const D = C.lvl.Dtot;
  const x = {
    m, V, g, Iy: mi.Iyy, Ix: mi.Ixx, Iz: mi.Izz, Ixz: mi.Ixz,
    Xu: -3 * D / V, Xw: q * S / V * (d.CL - d.CDa), Zu: -2 * m * g / V, Zw: -q * S / V * (d.CLa + d.CD), Zq: -q * S * cb / (2 * V) * d.CLq, Zwd: -q * S * cb / (2 * V * V) * d.CLad,
    Mu: 0, Mw: q * S * cb / V * d.Cma, Mwd: q * S * cb * cb / (2 * V * V) * d.Cmad, Mq: q * S * cb * cb / (2 * V) * d.Cmq,
    Yv: q * S / V * d.CYb, Yp: q * S * b / (2 * V) * d.CYp, Yr: q * S * b / (2 * V) * d.CYr,
    Lv: q * S * b / V * d.Clb, Lp: q * S * b * b / (2 * V) * d.Clp, Lr: q * S * b * b / (2 * V) * d.Clr,
    Nv: q * S * b / V * d.Cnb, Np: q * S * b * b / (2 * V) * d.Cnp, Nr: q * S * b * b / (2 * V) * d.Cnr
  };
  const evLon = eigReal(lonMatrix(x)), evLat = eigReal(latMatrix(x));
  const lon = classifyLon(evLon, V), lat = classifyLat(evLat);
  // MIL-F-8785C, Klasse I (kleine Flugzeuge), Kategorie B (Reiseflug): Level 1 / 2 / 3
  const crit = [], lvl = (a, b, c) => (a ? 1 : b ? 2 : c ? 3 : 4);
  if (lon.sp) { const z = lon.sp.zeta, st = lon.sp.real ? lon.sp.roots.every(r => r.re < 0) : true; crit.push({ k: 'sp', name: 'Anstellwinkelschwingung', val: z, unit: 'ζ', level: st ? lvl(z >= 0.3 && z <= 2, z >= 0.2 && z <= 2, z >= 0.15) : 4, req: 'ζ 0,30–2,0 (L1), 0,20–2,0 (L2), ≥ 0,15 (L3)' }); }
  if (lon.ph) { const z = lon.ph.zeta; crit.push({ k: 'ph', name: 'Phygoide', val: z, unit: 'ζ', level: lvl(z >= 0.04, z >= 0, lon.ph.t2 >= 55), req: 'ζ ≥ 0,04 (L1), ≥ 0 (L2), T₂ ≥ 55 s (L3)' }); }
  if (lat.dr) { const z = lat.dr.zeta, zw = z * lat.dr.wn, w = lat.dr.wn; crit.push({ k: 'dr', name: 'Taumelschwingung', val: z, unit: 'ζ', level: lvl(z >= 0.08 && zw >= 0.15 && w >= 0.4, z >= 0.02 && zw >= 0.05 && w >= 0.4, z >= 0 && w >= 0.4), req: 'ζ ≥ 0,08 und ζω ≥ 0,15 (L1), ζ ≥ 0,02 und ζω ≥ 0,05 (L2)' }); }
  if (lat.roll) { const t = lat.roll.tau; crit.push({ k: 'roll', name: 'Rollbewegung', val: t, unit: 's', level: lvl(t <= 1.4, t <= 3, t <= 10), req: 'τ ≤ 1,4 s (L1), ≤ 3 s (L2), ≤ 10 s (L3)' }); }
  if (lat.spiral) { const t2 = lat.spiral.re > 0 ? lat.spiral.t2 : Infinity; crit.push({ k: 'spiral', name: 'Spiralbewegung', val: t2, unit: 's', level: lvl(t2 >= 20, t2 >= 8, t2 >= 4), req: 'stabil oder T₂ ≥ 20 s (L1), ≥ 8 s (L2), ≥ 4 s (L3)' }); }
  crit.forEach(c => { c.ok = c.level === 1; });
  // V-Form der Außenflügel, bei der die Spirale gerade neutral ist (Cl_β·Cn_r = Cn_β·Cl_r)
  let dihNeutral = NaN;
  if (Math.abs(d.Cnr) > 1e-6 && Math.abs(C.ll.ClbDih) > 1e-6) { const need = d.Cnb * d.Clr / d.Cnr; dihNeutral = (d.gGeo + (need - d.Clb) / C.ll.ClbDih) * RAD; }
  const out = { d, x, evLon, evLat, lon, lat, crit, dihNeutral };
  out.dih1 = dihedralFor(C, out, 20); out.dih2 = dihedralFor(C, out, 8);
  return out;
}
// V-Form der Außenflügel, ab der die Spirale eine geforderte Verdopplungszeit erreicht (nur Cl_β verändert)
function dihedralFor(C, fd, t2req) {
  const P = C.P, d = fd.d, kL = 0.5 * C.rho * P.v * C.pf.S * C.pf.b;
  const at = gDeg => { const clb = d.Clb + C.ll.ClbDih * (gDeg * DEG - d.gGeo), lat = classifyLat(eigReal(latMatrix({ ...fd.x, Lv: kL * clb }))); return { t2: lat.spiral && lat.spiral.re > 0 ? lat.spiral.t2 : Infinity, dr: lat.dr }; };
  const g0 = P.dihedral || 0, a0 = at(g0);
  if (a0.t2 >= t2req) return { deg: g0, ok: true, dr: a0.dr };
  let lo = g0, hi = g0 + 30; if (at(hi).t2 < t2req) return { deg: NaN, ok: false };
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (at(m).t2 >= t2req) hi = m; else lo = m; }
  return { deg: hi, ok: false, dr: at(hi).dr };
}
// Prüffall Navion (Nelson, Flight Stability and Automatic Control, Beispieldaten in US-Einheiten)
function navionCheck() {
  const lon = eigReal(lonMatrix({ m: 1, Iy: 1, V: 176, g: 32.2, Xu: -0.045, Xw: 0.036, Zu: -0.369, Zw: -2.02, Zq: 0, Zwd: 0, Mu: 0, Mw: -0.05, Mwd: -0.0051, Mq: -2.05 }));
  const lat = eigReal(latMatrix({ m: 1, Ix: 1, Iz: 1, V: 176, g: 32.2, Yv: -45.72 / 176, Yp: 0, Yr: 0, Lv: -15.98 / 176, Lp: -8.4, Lr: 2.19, Nv: 4.49 / 176, Np: -0.35, Nr: -0.76 }));
  return { lon: classifyLon(lon), lat: classifyLat(lat) };
}

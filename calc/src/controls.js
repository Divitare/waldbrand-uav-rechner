/* ===================================================================
   Ruder: Querruder, Höhenruder, Seitenruder
   - Ruderwirksamkeit (Profiltheorie dünner Profile, Glauert): τ = 1 − (θ_h − sin θ_h)/π,
     θ_h = arccos(2E − 1), E = Rudertiefe/Profiltiefe; Abminderung η_δ für große
     Ausschläge nach DATCOM 6.1.1.1 (zusammengefasst bei Olson, NASA/TM-2015-218489).
   - Querruder aus dem Wirbelgitter (antimetrische Lösung über die Ruderspannweite),
     Rollmoment und induziertes Giermoment in der Trefftz-Ebene (negatives Wendemoment).
   - Rollleistung: Einfreiheitsgrad-Rollbewegung mit Rolldämpfung (Etkin & Reid 1996),
     Forderung MIL-F-8785C Klasse I: Kat. B 60° in 1,7 s, Kat. C 30° in 1,3 s (Level 1).
   - Querruder am elastischen Flügel: stationäres Rollen mit Biege-Torsions-Balken,
     Wirksamkeit und Umkehrgeschwindigkeit (Wright & Cooper 2015, Kap. 8).
   - Höhenruder: Trimmung aus dem Momentengleichgewicht (mit Schubmoment, Strahl,
     nachgiebigem Träger), Ausschlag je g (Etkin & Reid), Schwerpunkttoleranz.
   - Seitenruder: stationärer Schiebeflug bei Seitenwind (Nelson 1998), Drall- und
     Momententrimmung des Antriebs.
   - Gelenkmomente nach der Profiltheorie (Glauert 1927; Abschätzung nach oben).
   =================================================================== */
function flapTau(E) { if (E >= 0.999) return 1; const th = Math.acos(clamp(2 * E - 1, -1, 1)); return 1 - (th - Math.sin(th)) / Math.PI; }
function flapEta(dDeg, allMoving) { if (allMoving) return 1; const d = Math.abs(dDeg); return d <= 12 ? 0.85 : d >= 30 ? 0.55 : 0.85 - 0.3 * (d - 12) / 18; }
// Gelenkmomentbeiwerte (je rad, bezogen auf q·c_R² je Meter Spannweite), Auftrieb und Moment um c/4 je rad Ruderausschlag
// Gelenkmomentbeiwerte hängen nur von E ab: einmal je Rudertiefe rechnen (die Reihe hat 4000 Glieder)
const hingeCache = new Map();
function hingeCoef(E) {
  const kE = Math.round(E * 1e6) / 1e6; let hc = hingeCache.get(kE); if (hc) return hc;
  hc = hingeCoef0(kE); if (hingeCache.size > 2000) hingeCache.clear(); hingeCache.set(kE, hc); return hc;
}
function hingeCoef0(E) {
  if (E >= 0.999) return { Ca: -Math.PI / 2, Cd: -Math.PI / 2, CLd: 2 * Math.PI, Cmd: 0, th: 0 };
  const th = Math.acos(clamp(2 * E - 1, -1, 1)), ch = Math.cos(th), E2 = E * E;
  const F = t => ch * (t + Math.sin(t)) - (Math.sin(t) + t / 2 + Math.sin(2 * t) / 4);   // ∫(1 + cosθ)(cosθh − cosθ)dθ
  const Ia = F(Math.PI) - F(th);
  const ss = (a, b, t) => (a === b ? 0.5 * (t - Math.sin(2 * a * t) / (2 * a)) : 0.5 * (Math.sin((a - b) * t) / (a - b) - Math.sin((a + b) * t) / (a + b)));
  let sum = 0;
  for (let n = 1; n <= 4000; n++) {
    const J = ch * (ss(n, 1, Math.PI) - ss(n, 1, th)) - 0.5 * (ss(n, 2, Math.PI) - ss(n, 2, th));
    sum += 2 * Math.sin(n * th) / (n * Math.PI) * J;
  }
  return { Ca: -Ia / E2, Cd: -((Math.PI - th) / Math.PI * Ia + sum) / E2, CLd: 2 * (Math.PI - th + Math.sin(th)), Cmd: -0.5 * Math.sin(th) * (1 - ch), th };
}
// Querruder aus dem Wirbelgitter: Rollmoment und Giermoment je rad wirksamer Winkeländerung über e0…e1 (rechts +, links −)
function aileronVLM(C, e0, e1) {
  const ll = C.ll, pan = ll.pan, S = C.pf.S, b = C.pf.b, h = b / 2, N = pan.length;
  const rhs = pan.map(p => { const a = p.yA / h, bb = p.yB / h, ov = Math.min(e1, bb) - Math.max(e0, a); return ov > 0 ? -ov / (bb - a) : 0; });
  const dG = luSolve(ll.la, rhs);
  let Cl = 0; for (let i = 0; i < N; i++) Cl += dG[i] * pan[i].ym * pan[i].dy; Cl *= -4 / (S * b);
  // Trefftz-Ebene: antimetrischer Abwind, induziertes Giermoment mit der symmetrischen Grundlast bei c_A Reiseflug
  const am = ((C.lvl ? C.lvl.CL : 0.6) - ll.CLb) / ll.CLa, G0 = ll.Ga.map((g, i) => am * g + ll.Gb[i]);
  const w0 = ll.T.map(r => r.reduce((s, t, j) => s + t * G0[j], 0)), dw = new Array(N).fill(0);
  for (let i = 0; i < N; i++) { const y = pan[i].ym; let s = 0; for (let j = 0; j < N; j++) { const Q = pan[j]; s += (1 / (2 * Math.PI)) * (1 / (y - Q.yB) - 1 / (y - Q.yA) - 1 / (y + Q.yA) + 1 / (y + Q.yB)) * dG[j]; } dw[i] = s; }
  let Cn = 0; for (let i = 0; i < N; i++) Cn += (G0[i] * dw[i] + dG[i] * w0[i]) * pan[i].ym * pan[i].dy; Cn *= -2 / (S * b) * ll.kc;
  return { Cl, Cn };
}
// Querruder am elastischen Flügel: stationäres Rollen, Wirksamkeit (p/δ elastisch zu starr) bei Staudruck q
function aileronElastic(bm, V, q, e0, e1, tau, cmd) {
  const n = bm.n, h = bm.strips.length ? bm.L * bm.cosL : 1, Fd = new Array(n).fill(0), Fp = new Array(n).fill(0), ru = new Array(n).fill(0);
  let rp = 0, rd = 0;
  for (const s of bm.strips) {
    const ca = bm.a2d * bm.cosL ** 2 * s.cn * s.ds, inA = s.y >= e0 * h && s.y <= e1 * h;
    if (inA) { s.idx.forEach((i, a) => { if (i >= 0) Fd[i] += ca * tau * s.nw[a]; }); s.it.forEach((i, a) => { if (i >= 0) Fd[i] += (ca * tau * s.en + s.cn * s.cn * cmd * s.ds) * s.nt[a]; }); rd += ca * tau * s.y; }
    s.idx.forEach((i, a) => { if (i >= 0) { Fp[i] += ca * s.y / V * s.nw[a]; ru[i] += -ca * bm.tanL * s.np[a] * s.y; } });
    s.it.forEach((i, a) => { if (i >= 0) { Fp[i] += ca * s.en * s.y / V * s.nt[a]; ru[i] += ca * s.nt[a] * s.y; } });
    rp += ca * s.y * s.y / V;
  }
  // [K − qKa, −q·Fp; ru, rp]·[u; p] = [q·Fd; −rd] (δ = 1)
  const N1 = n + 1, A = zeros(N1, N1), rhs = new Array(N1).fill(0);
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] = bm.K[i][j] - q * bm.Ka[i][j]; A[i][n] = -q * Fp[i]; rhs[i] = q * Fd[i]; }
  for (let j = 0; j < n; j++) A[n][j] = ru[j]; A[n][n] = rp; rhs[n] = -rd;
  const x = luSolve(luDecomp(A), rhs), pE = x[n], pR = -rd / rp;
  return pE / pR;
}
function aileronReversal(bm, V, rho, e0, e1, tau, cmd, qMax) {
  const f = q => aileronElastic(bm, V, q, e0, e1, tau, cmd);
  let lo = 0, hi = qMax; if (f(hi) > 0) return Infinity;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  return Math.sqrt(2 * hi / rho);
}
// Höhenruderausschlag für Flugzustand (Fahrt V, Lastvielfaches n, Schub T, Schwerpunktverschiebung dx, Nickrate qr)
function elevatorFor(C, ct, V, n, T, dx, qr) {
  const P = C.P, pf = C.pf, tg = C.tail, bal = C.bal, np = C.np, rho = C.rho, q = 0.5 * rho * V * V, W = C.m * G, S = pf.S;
  const meta = foilMeta(C.foil, C.mode, V * pf.mac / C.nu), cmac = meta.cm + (C.ll.Cmb || 0);
  let CL = n * W / (q * S), Lt = 0;
  for (let k = 0; k < 3; k++) { const dM = thrustMoment(C, T, V, rho, CL); Lt = (n * W * (bal.xcg + dx - np.xacw) + q * S * pf.mac * cmac + dM) / (np.xact - np.xacw); CL = (n * W - Lt) / (q * S); }
  const qH = q * (P.etaTail / 100) * (C.slip && T > 0 ? 1 + C.slip.fH * (slipQr(C, T, V, rho, C.slip.kxH) - 1) : 1), CLh = Lt / (qH * tg.Sh);
  const fx = C.struct && C.struct.tail && C.struct.tail.flex, nb = fx ? fx.nb : 1, flexH = fx ? fx.H : 0;
  const rhsA = (CLh - ct.CLh0) / np.at - (1 - np.deda) * (CL - ct.CL0) / np.aw - (qr || 0) * tg.lt / V + (Lt - ct.Lt0) / nb * flexH;
  let d = rhsA / ct.tauE;
  for (let k = 0; k < 4; k++) d = rhsA / (ct.tauE0 * flapEta(d * RAD, ct.allE));
  return { d, CLh, Lt, CL, V, n, T };
}
// opt.lite: nur, was die Grundbedingung „Ruder reichen“ braucht (ohne Ausschlagskurven und Servomomente), für die Entwurfssuche
function controlSurfaces(C, fd, opt = {}) {
  const P = C.P, pf = C.pf, tg = C.tail, bal = C.bal, np = C.np, d = fd.d, rho = C.rho, S = pf.S, b = pf.b, cb = pf.mac, m = C.m, W = m * G, mi = bal.mi;
  const Vs = C.vs, Va = Math.max(1.3 * Vs, 4), Vc = P.v, out = {};
  // Querruder
  const e0 = clamp(P.ailEta0, 0.1, 0.95), e1 = clamp(P.ailEta1, e0 + 0.02, 1), Ea = clamp(P.ailCf, 0.05, 0.6), hA = hingeCoef(Ea), tauA0 = flapTau(Ea);
  const av = aileronVLM(C, e0, e1), dAm = P.ailMax * DEG;
  const ClDa = av.Cl * tauA0 * flapEta(5), CnDa = av.Cn * tauA0 * flapEta(5);       // je rad, klein ausgeschlagen
  const ClMax = av.Cl * tauA0 * flapEta(P.ailMax) * dAm;                             // bei Vollausschlag
  // elastische Wirksamkeit und Umkehr mit dem Balkenmodell
  let A = null, etaAil = 1, VR = Infinity;
  try { A = aeroelastic(C, { noFlutter: true, nEl: 12 }); const bm = A.bm, qM = 0.5 * rho * P.vmax ** 2; etaAil = aileronElastic(bm, P.vmax, qM, e0, e1, tauA0 * 0.85, hA.Cmd * 0.85); VR = aileronReversal(bm, P.vmax, rho, e0, e1, tauA0 * 0.85, hA.Cmd * 0.85, 0.5 * rho * (6 * Math.max(P.vmax, 10)) ** 2); } catch (e) { /* ohne Strukturmodell */ }
  const etaAt = V => { if (!A) return 1; try { return aileronElastic(A.bm, V, 0.5 * rho * V * V, e0, e1, tauA0 * 0.85, hA.Cmd * 0.85); } catch (e) { return 1; } };
  // Rollen: Rolldämpfung des ganzen Flugzeugs, Rollträgheit, Zeit bis Querlage
  const roll = (V, phiDeg) => {
    const q = 0.5 * rho * V * V, Lp = q * S * b * b / (2 * V) * d.Clp, La = q * S * b * Math.abs(ClMax) * etaAt(V), tau = -mi.Ixx / Lp, pss = -La / Lp;
    const phi = t => pss * (t - tau * (1 - Math.exp(-t / tau))), tgt = phiDeg * DEG; let lo = 0, hi = 30; if (phi(hi) < tgt) return { t: Infinity, pss, tau };
    for (let i = 0; i < 50; i++) { const mm = (lo + hi) / 2; if (phi(mm) < tgt) lo = mm; else hi = mm; }
    return { t: hi, pss, tau, pb2V: pss * b / (2 * V), curve: Array.from({ length: 41 }, (_, i) => { const t = i / 40 * Math.max(3, hi * 1.5); return [t, phi(t) * RAD]; }) };
  };
  const rB = roll(Vc, 60), rC = roll(Va, 30);
  // Zellen über dem Querruder: nur bei frei eingegebener Fläche oder wenn Zellen auf Rudern erlaubt sind
  const cellOverAil = C.solar.a > 0 && (C.solar.mode === 'area' || P.cellsOnCtrl) && (C.solarEta || 0) > e0 && (C.solar.mode === 'area' ? C.solar.x1 : clamp((P.cellX1 ?? 90) / 100, 0, 1)) > 1 - Ea + 1e-6;
  out.ail = { cellOverAil, e0, e1, E: Ea, tau0: tauA0, ClDa, CnDa, adverse: CnDa / Math.abs(ClDa), ClMax, etaVmax: etaAil, VR, rB, rC, h: hA, segs: Math.max(1, Math.round(P.nAilSeg)),
    lvlB: rB.t <= 1.7 ? 1 : rB.t <= 2.5 ? 2 : rB.t <= 3.4 ? 3 : 4, lvlC: rC.t <= 1.3 ? 1 : rC.t <= 1.8 ? 2 : rC.t <= 2.6 ? 3 : 4, Va, Vc };
  // Höhenruder: Bezug Reiseflug ohne Ausschlag (Einstellwinkel des Höhenleitwerks so gewählt)
  const Ee = clamp(P.elevCf, 0.1, 1), allE = Ee >= 0.999, tauE0 = flapTau(Ee), hE = hingeCoef(Ee), ref = C.lvl, hPiv = clamp((P.elevPivot ?? 23) / 100, 0.1, 0.6);
  const ct = { CLh0: ref.CLh, CL0: ref.CL, Lt0: ref.Lt, tauE0, tauE: tauE0 * flapEta(5, allE), allE };
  const cg = climbGlide(C, opt.lite ? 12 : 30), Vmin = 1.1 * Vs, dx = P.cgTol / 100, nL = Math.max(P.nLimit, 2.5), VA = Math.min(P.vmax, Vs * Math.sqrt(nL));
  const curves = { off: [], on: [], full: [] }, NV = 24;
  for (let i = 0; i <= (opt.lite ? -1 : NV); i++) {
    const V = Vmin + (P.vmax - Vmin) * i / NV, Tm = propMaxThrust(C, V, rho).T;
    curves.off.push([V, elevatorFor(C, ct, V, 1, 0, 0).d * RAD]); curves.on.push([V, elevatorFor(C, ct, V, 1, aero(C, V, 1, rho, C.nu).Dtot, 0).d * RAD]);
    if (V <= cg.bestC.V * 1.4) curves.full.push([V, elevatorFor(C, ct, V, 1, Tm, 0).d * RAD]);
  }
  const cases = [
    ['Abfangen kurz über Mindestfahrt, Schwerpunkt vorn', elevatorFor(C, ct, Vmin, 1, 0, -dx)],
    ['Vollgas-Steigflug, Schwerpunkt vorn', elevatorFor(C, ct, cg.bestC.V, 1, cg.bestC.Tmax, -dx)],
    ['Start mit Vollgas bei 1,2 × Mindestfahrt', elevatorFor(C, ct, 1.2 * Vs, 1, propMaxThrust(C, 1.2 * Vs, rho).T, -dx)],
    [`Kurve mit ${P.nCtrl.toFixed(1).replace('.', ',')} g (${(Math.acos(1 / Math.max(1, P.nCtrl)) * RAD).toFixed(0)}° Querlage), Schwerpunkt vorn`, elevatorFor(C, ct, Vc, P.nCtrl, aero(C, Vc, P.nCtrl, rho, C.nu).Dtot, -dx, G / Vc * (P.nCtrl - 1 / P.nCtrl))],
    ['Höchstgeschwindigkeit, Motor aus, Schwerpunkt hinten', elevatorFor(C, ct, P.vmax, 1, 0, dx)],
    ['Höchstgeschwindigkeit mit Motor, Schwerpunkt hinten', elevatorFor(C, ct, P.vmax, 1, aero(C, P.vmax, 1, rho, C.nu).Dtot, dx)]
  ].map(([name, r]) => ({ name, ...r, deg: r.d * RAD, ok: Math.abs(r.d * RAD) <= 0.8 * P.elevMax }));
  // Ausschlag je g (Etkin & Reid): dδ/dn = −C_W·(Cm_α/C_Lα + ρ S c̄ Cm_q/(4m))/Cm_δ
  const qc = 0.5 * rho * Vc * Vc, kF = np.kFlex || 1, CmDe = -np.at * np.etaT * kF * tg.Sh * (np.xact - bal.xcg) / (S * cb) * ct.tauE, CW = W / (qc * S);
  const dPerG = -CW * (-bal.sm + rho * S * cb * d.Cmq / (4 * m)) / CmDe;
  const ClhMax = (foilMeta(C.tfoil, 'free', Vc * tg.ch / C.nu).clmax || 0.9) + (allE ? 0 : 0.25);
  out.elev = { E: Ee, all: allE, pivot: hPiv, tau0: tauE0, CmDe, CLhDe: np.at * ct.tauE, dPerG: dPerG * RAD, curves, cases, h: hE, ClhMax, VA, maxDeg: Math.max(...cases.map(c => Math.abs(c.deg))) };
  // Seitenruder
  const Er = clamp(P.rudCf, 0.1, 0.9), tauR0 = flapTau(Er), hR = hingeCoef(Er), tauR = tauR0 * flapEta(5, Er >= 0.999);
  const etaV = C.pw ? C.pw.etaV : 1, CYDr = d.av * etaV * d.kFlexV * tauR * tg.Sv / S, CnDr = -CYDr * d.lvv / b, ClDr = CYDr * d.zv / b;
  // Stationärer Schiebeflug bei Seitenwind im Anflug (Querlage φ, Quer- und Seitenruder), Nelson 1998
  const beta = Math.atan(Math.max(P.vCross, 0.2 * Vs) / Va), CWa = W / (0.5 * rho * Va * Va * S);
  const M3 = [[0, CYDr, CWa], [ClDa, ClDr, 0], [CnDa, CnDr, 0]], r3 = [-d.CYb * beta, -d.Clb * beta, -d.Cnb * beta], x3 = luSolve(luDecomp(M3), r3);
  // Antriebstrimmung (Drall, Drehmoment) bei Vollgas, Flügel waagerecht, kein Schiebewinkel
  let pwTrim = { da: 0, dr: 0 };
  try {
    const pf2 = powerEffects(C, cg.bestC.Tmax, cg.bestC.V, rho, (aero(C, cg.bestC.V, 1, rho, C.nu, cg.bestC.Tmax).CL - C.lvl0.CL) / np.CLa, aero(C, cg.bestC.V, 1, rho, C.nu, cg.bestC.Tmax).CL);
    const M2 = [[ClDa, ClDr], [CnDa, CnDr]], r2 = [-(pf2.ClQ + pf2.ClSw + pf2.ClSwH), -pf2.CnSw], x2 = luSolve(luDecomp(M2), r2);
    pwTrim = { da: x2[0], dr: x2[1], swV: pf2.swV, CnSw: pf2.CnSw, ClQ: pf2.ClQ };
  } catch (e) { /* ohne Antriebsmodell */ }
  // Negatives Wendemoment beim Vollausschlag der Querruder: Seitenruder zum Ausgleich
  const drAdverse = -CnDa * dAm / CnDr;
  out.rud = { E: Er, tau0: tauR0, CYDr, CnDr, ClDr, beta, cross: { da: x3[0], dr: x3[1], phi: Math.asin(clamp(x3[2], -1, 1)) }, pwTrim, drAdverse, h: hR,
    maxDeg: Math.max(Math.abs(x3[1]), Math.abs(pwTrim.dr), Math.abs(drAdverse)) * RAD };
  // Gelenk- und Servomomente: Vollausschlag bei V_A, ein Drittel bei V_max; Sicherheitsfaktor 1,5
  if (opt.lite) { out.servo = []; return out; }
  const qA = 0.5 * rho * VA * VA, qM = 0.5 * rho * P.vmax ** 2, h = b / 2;
  const segSpan = (e1 - e0) * h / out.ail.segs, cA = pf.chordAt((e0 + e1) / 2) * Ea, Sail = segSpan * cA;
  const Hm = (hh, Sf, cf, dMax, aLoc) => Math.max(qA * Sf * cf * Math.abs(hh.Ca * aLoc + hh.Cd * dMax), qM * Sf * cf * Math.abs(hh.Ca * aLoc + hh.Cd * dMax / 3));
  const aW = C.lvl.CL / np.aw;
  const servo = [
    { name: `Querruder (je Segment, ${out.ail.segs} × 2)`, Sf: Sail, cf: cA, H: Hm(hA, Sail, cA, P.ailMax * DEG, aW) },
    // Pendelruder: Auftrieb am Neutralpunkt (c/4) mit dem Hebel zur Drehachse, mindestens 2 % der Tiefe (Lage des Neutralpunkts unsicher)
    allE ? { name: `Pendelhöhenruder (Drehachse bei ${Math.round(hPiv * 100)} % der Tiefe)`, Sf: tg.Sh, cf: tg.ch, H: Math.max(qA, qM / 3) * tg.Sh * tg.ch * Math.max(Math.abs(0.25 - hPiv), 0.02) * ClhMax }
      : { name: 'Höhenruder', Sf: Ee * tg.Sh, cf: Ee * tg.ch, H: Hm(hE, Ee * tg.Sh, Ee * tg.ch, P.elevMax * DEG, 6 * DEG) },
    { name: tg.nFin > 1 ? 'Seitenruder (je Seitenleitwerk)' : 'Seitenruder', Sf: Er * tg.Svf, cf: Er * tg.cv, H: Hm(hR, Er * tg.Svf, Er * tg.cv, P.rudMax * DEG, Math.max(beta, 8 * DEG)) }
  ].map(s => ({ ...s, req: 1.5 * s.H, kgcm: 1.5 * s.H / G * 100 }));
  out.servo = servo;
  return out;
}

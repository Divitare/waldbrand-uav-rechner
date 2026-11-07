/* ===================================================================
   Leitwerk, Leitwerksträger, Rumpfröhre und Motorpylon als tragende Bauteile
   Lastfälle (Grenzlast; Bemessung mit Bruchlast = Sicherheitsfaktor × Grenzlast):
   1  Höhenleitwerk: Manöver bei V_A mit c_A,H = 0,9 (CS-23.421/423) oder
      Vertikalböe (CS-23.425), dazu Trägheit der Leitwerksmassen bei n_lim und
      bei Leitwerksmotor der Schub mal seiner Höhe über der Trägerachse.
   2  Landung: Trägheit aller Massen hinter dem Trägeranschluss bei n_Landung.
   3  Seitenleitwerk: Manöver bei V_A mit c_A,S = 0,9 (CS-23.441) oder Seitenböe
      (CS-23.443) mit Torsion über den Druckpunkt; einseitige Höhenleitwerks-
      last 100/0 % (CS-23.427) als Rollmoment; Motordrehmoment.
   4  Seitlicher Landestoß 0,5 × n_Landung auf die hoch liegenden Massen
      (Biegung und Torsion des Trägers).
   Dünnwandiges Rohr: σ = M/(π r² t), τ = T/(2π r² t), (σ/σ_zul)² + (τ/τ_zul)² ≤ 1;
   Beulen unter Biegung nach NASA SP-8007: γ = 1 − 0,731(1 − e^−φ), φ = √(r/t)/16,
   σ_kr = 0,605·γ·√(E_x·E_θ)·t/r (orthotrope Näherung).
   Seitenleitwerk mit Motor: Holmgurte für die Spitzenlasten und so steif,
   dass die 1. Biegeeigenfrequenz über 1,2 × Höchstdrehzahl liegt (überkritisch).
   =================================================================== */
const SHELL_QI = { name: 'CFK-Schale quasiisotrop', E: 45, Eh: 45, G: 17, rho: 1500, sc: 400, ss: 130 };
// Mindestwanddicke eines Rohrs (Radius r) für Biegemoment M und Torsion T (Bruchlasten)
function tubeWall(M, T, r, mat, knock) {
  const sa = mat.sc * 1e6 * knock, ta = (mat.ss || 0.3 * mat.sc) * 1e6 * knock, Eb = Math.sqrt(mat.E * (mat.Eh || mat.E)) * 1e9;
  let t = Math.hypot(M / (Math.PI * r * r * sa), T / (2 * Math.PI * r * r * ta));
  // Beulen: σ = M/(π r² t) ≤ 0,605·γ·E·t/r, γ hängt von r/t ab → zwei Iterationen
  let tb = Math.sqrt(M / (Math.PI * r * 0.605 * 0.5 * Eb));
  for (let i = 0; i < 3; i++) { const ph = Math.sqrt(r / Math.max(1e-6, tb)) / 16, gam = 1 - 0.731 * (1 - Math.exp(-ph)); tb = Math.sqrt(M / (Math.PI * r * 0.605 * gam * Eb)); }
  return { t: Math.max(t, tb), tS: t, tB: tb, by: tb > t ? 'Beulen' : 'Festigkeit' };
}
function tailStructure(C, m, g) {
  const P = C.P, pf = C.pf, tg = C.tail, cf = C.cfg, kR = 1 + P.rugged / 100, SF = P.safety, kn = P.matKnock / 100, rho0 = 1.225;
  const CLm = Math.max(0.8, C.clmaxRef || 1.2), Vs0 = Math.sqrt(2 * m * G / (rho0 * pf.S * CLm)), nLim = Math.max(P.nLimit, 2.5);
  const VA = Math.min(Math.max(P.vmax, Vs0), Vs0 * Math.sqrt(nLim)), qA = 0.5 * rho0 * VA * VA;
  const land = landingGear(C, m), nLand = land.nCG, nY = 0.5 * nLand;
  const nb = Math.max(1, cf.nBoom), nF = tg.nFin;
  // Massen und Hebel am Leitwerk
  // Motorgondel (Seitenleitwerksspitze oder Pylon): Schale wie die Rumpfgondel, 85 % frei umströmt, Motorspant 15 g
  const mNac = g.nac ? 0.015 + P.wFus * 0.85 * Math.PI * g.nac.d * Math.max(0, g.nac.x1 - g.nac.x0) : 0;
  const mH = P.wTail * tg.Sh * kR + (C.mass.solarHT || 0), mMot = cf.mot === 'fin' ? C.mass.prop + mNac : 0;
  const hFinCP = 0.42 * tg.bv, hMot = g.zP - g.zRoot, hH = g.zH - g.zRoot;
  const aH = Math.PI * tg.arH / (1 + Math.sqrt(1 + (Math.PI * tg.arH / 5.7) ** 2)), aV = Math.PI * 1.55 * P.arV / (1 + Math.sqrt(1 + (Math.PI * 1.55 * P.arV / 5.7) ** 2));
  const gust = gustLoad(P, pf, m, { clmax: CLm }, rho0), deda = C.bal ? C.bal.np.deda : 0.35;
  const LHman = qA * tg.Sh * 0.9, LHgust = 0.5 * rho0 * P.vGust * P.gustU * aH * tg.Sh * gust.Kg * (1 - deda), LH = Math.max(LHman, LHgust);
  const Iz = C.bal && C.bal.mi ? C.bal.mi.Izz : m * (0.3 * pf.b / 2) ** 2, lv = Math.max(0.3, tg.lt), muV = 2 * m / (rho0 * tg.cv * aV * tg.Sv) * (Iz / m) / (lv * lv), KgV = 0.88 * muV / (5.3 + muV);
  const LVman = qA * tg.Svf * 0.9, LVgust = 0.5 * rho0 * P.vGust * P.gustU * aV * tg.Svf * KgV, LV = Math.max(LVman, LVgust);
  // Motor oben am Seitenleitwerk: Höchstschub (Näherung T ≈ 0,5·W), Drehmoment bei Höchstleistung
  const nMax = P.motKv * P.nCells * P.cellV * 0.97 * 0.85 / 60 / Math.max(1, P.gearRatio);
  const Qmot = mMot > 0 ? P.motImax * P.nCells * P.cellV * 0.8 / (2 * Math.PI * Math.max(5, nMax)) : 0, Tmot = mMot > 0 ? 0.5 * m * G : 0;
  // Hebel vom Trägeranschluss (je Träger)
  const x0 = cf.nBoom ? g.boom0 : P.fusL, lH = g.xact - x0, xVcp = g.xvLE + 0.25 * tg.cv + g.vSw * hFinCP, lV = xVcp - x0;
  const mFin0 = P.wTail * tg.Sv * kR / nF;
  const tailMasses = [[mH / nb, g.xhLE + 0.4 * tg.ch, hH], [mFin0, xVcp, hFinCP], [mMot, g.xMot, hMot], [0.06, g.xTail, 0]]; // 0,06 kg Servos/Beschläge
  const sumML = (x) => tailMasses.reduce((s, [mm, xm]) => s + mm * Math.max(0, xm - x), 0), sumMH = () => tailMasses.reduce((s, [mm, , h]) => s + mm * h, 0);
  const asym = LH / 2 * 0.42 * tg.bh / 2;   // einseitige Höhenleitwerkslast als Rollmoment am Leitwerksfuß
  // Schnittlasten (Bruchlast) an der Stelle x des Trägers bzw. der Röhre
  const cuts = x => {
    const aH2 = Math.max(0, g.xact - x), aV2 = Math.max(0, xVcp - x);
    return [
      { k: 'h', name: 'Höhenleitwerk Manöver/Böe', M: SF * ((LH / nb) * aH2 + nLim * G * sumML(x) + Tmot * hMot / nb), T: 0 },
      { k: 'land', name: 'Landestoß vertikal', M: SF * nLand * G * sumML(x), T: 0 },
      { k: 'v', name: 'Seitenleitwerk Manöver/Böe', M: SF * LV * aV2, T: SF * (LV * hFinCP + asym / nb + Qmot) },
      { k: 'lat', name: 'Landestoß seitlich', M: SF * nY * G * sumML(x), T: SF * nY * G * sumMH() }
    ];
  };
  const out = { VA, qA, LH, LHman, LHgust, LV, LVman, LVgust, nLand, nY, Qmot, Tmot, nMax, asym, lH, lV, mMot, mH, land };
  // Träger (Rohr)
  const bm = MAT[P.matBoom] || MAT.cfk_roll, rB = P.boomD / 2;
  if (cf.nBoom) {
    const cs = cuts(x0); let worst = null;
    for (const c of cs) { c.w = tubeWall(c.M, c.T, rB, bm, kn); if (!worst || c.w.t > worst.w.t) worst = c; }
    const tReq = Math.max(worst.w.t, 0.3e-3), linReq = bm.rho * 2 * Math.PI * rB * tReq, lin = Math.max(P.boomLin, linReq);
    const tHave = lin / (bm.rho * 2 * Math.PI * rB), EI = bm.E * 1e9 * Math.PI * rB ** 3 * tHave, GJ = bm.G * 1e9 * 2 * Math.PI * rB ** 3 * tHave;
    // elastische Wirksamkeit bei V_max: Leitwerk dreht sich mit der Trägerbiegung zurück
    const qM = 0.5 * C.rho * P.vmax ** 2, etaH = 1 / (1 + qM * tg.Sh / nb * aH * lH * lH / (2 * EI)), etaV = 1 / (1 + qM * tg.Svf * aV * lV * lV / (2 * EI));
    out.boom = { cases: cs, worst, tReq, linReq, lin, tHave, util: linReq / lin, mass: lin * g.lBoom * nb, EI, GJ, etaH, etaV, mat: bm, r: rB };
    out.flex = { H: lH * lH / (2 * EI), V: lV * lV / (2 * EI), nb };   // Drehung des Leitwerks je Newton Leitwerkslast (je Träger)
  }
  // Rumpfröhre des Seglerrumpfs: Wanddicke je Station, Schale mindestens wCone
  if (cf.fus === 'glider') {
    let mass = 0, utilMax = 0, worst = null, flexH = 0, flexV = 0; const sh = SHELL_QI, wMin = P.wCone, prof = [];
    const st = g.fus.st;
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i], b = st[i + 1]; if (a.x < g.fus.L1) continue;
      const xm = (a.x + b.x) / 2, r = (a.d + b.d) / 4, dx = b.x - a.x, dS = Math.PI * 2 * r * dx;
      const cs = cuts(xm); let tr = 0, wc = null; for (const c of cs) { const w = tubeWall(c.M, c.T, r, sh, kn); if (w.t > tr) { tr = w.t; wc = { ...c, w }; } }
      const wReq = tr * sh.rho, w = Math.max(wMin, wReq); mass += w * dS; prof.push({ x: xm, r, tReq: tr, wReq });
      if (wReq / wMin > utilMax) { utilMax = wReq / wMin; worst = { x: xm, ...wc }; }
      // Nachgiebigkeit: Drehung am Leitwerk je Newton Leitwerkslast, θ/F = ∫(x_L − x)/EI dx
      const EIx = sh.E * 1e9 * Math.PI * r ** 3 * (w / sh.rho);
      flexH += Math.max(0, g.xact - xm) * dx / EIx; flexV += Math.max(0, xVcp - xm) * dx / EIx;
    }
    const tw = wMin / sh.rho, r0 = (g.fus.st.find(s => s.x >= g.fus.L1) || { d: P.fusD }).d / 2, qM = 0.5 * C.rho * P.vmax ** 2;
    out.cone = { mass, util: utilMax, worst, prof, wEff: mass / Math.max(1e-9, g.fus.cone.S), EI: sh.E * 1e9 * Math.PI * r0 ** 3 * tw, flexH, flexV,
      etaH: 1 / (1 + qM * tg.Sh * aH * flexH), etaV: 1 / (1 + qM * tg.Svf * aV * flexV) };
    out.flex = { H: flexH, V: flexV, nb: 1 };
  }
  // Seitenleitwerk: Zusatzholm für Spitzenlasten (Motor, T-Leitwerk)
  const capM = MAT[P.matCap] || MAT.cfk_ud, tv = C.tfoil ? C.tfoil.t : 0.1, hr = 0.85 * tv * tg.cv * 1.2, bv = tg.bv;
  const mTip = mMot + (cf.tail === 'T' ? mH / nF : 0);
  let finExtra = 0, finInfo = null;
  if (mTip > 0) {
    const Mtip = SF * (nY * G * mTip * bv + Qmot + (cf.tail === 'T' ? asym / nF : 0)), Astr = Mtip / (capM.sc * 1e6 * kn * hr);
    let Astf = 0, fT = 0;
    if (mMot > 0) { fT = 1.2 * nMax; const EIreq = (2 * Math.PI * fT) ** 2 * bv ** 3 * (mTip + 0.24 * mFin0) / 3; Astf = 2 * EIreq / (capM.E * 1e9 * hr * hr); }
    const A = Math.max(Astr / 2, Astf);               // Festigkeit: Moment linear zur Spitze → im Mittel halbe Fläche
    finExtra = 2 * capM.rho * A * bv * nF;
    finInfo = { Mtip, Astr, Astf, fT, A, by: Astf > Astr / 2 ? 'Steifigkeit' : 'Festigkeit', EI: capM.E * 1e9 * A * hr * hr / 2 };
  }
  out.fin = { extra: finExtra, info: finInfo, base: P.wTail * tg.Sv };
  // Motorpylon (Druckpropeller über Rohr bzw. Rumpf): Verkleidung beidseitig (Tiefe c_P) + Holm für die Seitenlast
  const cP = g.pyl ? g.pyl.c : PYL_C;
  out.pylon = g.pylon > 0 ? 0.03 + 2 * cP * g.pylon * P.wTail + 2 * capM.rho * (SF * nY * G * C.mass.prop * g.pylon / (capM.sc * 1e6 * kn * 0.012)) * g.pylon * 0.5 : 0;
  out.nacelle = mNac;
  return out;
}

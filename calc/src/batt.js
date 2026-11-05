/* ===================================================================
   Akku über dem Ladezustand: Ruhespannung, Innenwiderstand, Klemmenspannung
   - Ruhespannung je Zelle über dem Ladezustand z (0 … 1) aus Kennlinien
     typischer Zellen, linear zwischen 10-%-Stützstellen:
     Li-Ionen/Li-Polymer mit 4,2 V Ladeschluss: Analog Devices Application
     Note 4189, Tab. 1; LiFePO₄ (Nennspannung bis 3,4 V): Drypower IFR18650 E1600
     (beide als Standardkurven in Zephyr RTOS, dt-bindings/battery/battery.h).
   - Innenwiderstand (Gleichstrom, Summe der drei Widerstände des Ersatz-
     schaltbilds) über dem Ladezustand nach Chen & Rincón-Mora (2006),
     IEEE Trans. Energy Conversion 21(2), 504–511:
       R_s = 0,1562·e^(−24,37 z) + 0,07446, R_TS = 0,3208·e^(−29,14 z) + 0,04669,
       R_TL = 6,603·e^(−155,2 z) + 0,04984  (850-mAh-Zelle, Zeitkonstanten 33 s und 220 s).
     Hier als Verlauf g(z) = R(z)/R(0,5) auf den spezifischen Widerstand der
     gewählten Zelle bezogen (R·Q in Ω·Ah, bei der Messzelle 0,145 Ω·Ah).
     Pack aus n_s Zellen in Reihe: R_Pack = (R·Q)·g(z)·n_s/Q_Pack.
   - Klemmenspannung bei Leistung P (Entladen positiv): U = (U₀ + √(U₀² − 4RP))/2,
     Strom I = P/U. Größte entnehmbare Leistung P_max = U₀²/(4R).
   - Grenzen: der Ladezustand des Energiemodells zählt die nutzbare Kapazität;
     die Abschaltspannung unter Last (Li-Ionen 3,0 V, LiFePO₄ 2,5 V je Zelle)
     wird bei Reserveladung und Vollgas geprüft.
   =================================================================== */
const OCV_CURVES = {
  li: { name: 'Li-Ionen/Li-Polymer', v: [3.3055, 3.6867, 3.7410, 3.7751, 3.7933, 3.8210, 3.8840, 3.9451, 4.0081, 4.0859, 4.1775], uCut: 3.0, src: 'Analog Devices AN4189' },
  lfp: { name: 'LiFePO₄', v: [2.013, 3.068, 3.159, 3.194, 3.210, 3.221, 3.229, 3.246, 3.256, 3.262, 3.348], uCut: 2.5, src: 'Drypower IFR18650 E1600' }
};
const ocvCurve = P => (P.cellV <= 3.4 ? OCV_CURVES.lfp : OCV_CURVES.li);
function cellOCV(P, z) {
  const v = ocvCurve(P).v, x = clamp(z, 0, 1) * 10, i = Math.min(9, Math.floor(x));
  return v[i] + (v[i + 1] - v[i]) * (x - i);
}
const rChen = z => 0.1562 * Math.exp(-24.37 * z) + 0.07446 + 0.3208 * Math.exp(-29.14 * z) + 0.04669 + 6.603 * Math.exp(-155.2 * z) + 0.04984;
const R_CHEN50 = rChen(0.5);
const rShape = z => rChen(Math.max(0.03, Math.min(1, z))) / R_CHEN50;
// Pack: Zellen in Reihe, Kapazität in Ah (ohne Alterung und Kälte), Widerstand bei 50 %
function battPack(C) {
  // Widerstand aus dem spezifischen Wert der Zelle bei Akkutemperatur (Eingabe), bezogen auf die Nennladung des Packs
  const P = C.P, nS = Math.max(1, Math.round(P.nCells)), Wh = Math.max(1e-6, P.mBatt * P.battSpec), Q = Wh / (nS * P.cellV);
  const R50 = Math.max(1e-6, P.battRAh) * nS / Q, crv = ocvCurve(P);
  return { nS, Q, Wh, R50, crv, uCut: crv.uCut };
}
// Zustand des Packs bei Ladezustand z und Leistung Pw an den Klemmen (W, Entladen positiv)
function battAt(C, z, Pw, pk) {
  pk = pk || battPack(C);
  const U0 = pk.nS * cellOCV(C.P, z), R = pk.R50 * rShape(z), d = U0 * U0 - 4 * R * Pw;
  if (d < 0) return { z, U0, R, U: U0 / 2, I: U0 / (2 * R), ok: false, Ucell: U0 / 2 / pk.nS, Ucell0: U0 / pk.nS, Pmax: U0 * U0 / (4 * R) };
  const U = (U0 + Math.sqrt(d)) / 2, I = Pw / U;
  return { z, U0, R, U, I, ok: true, Ucell: U / pk.nS, Ucell0: U0 / pk.nS, Pmax: U0 * U0 / (4 * R), loss: I * I * R };
}
// Vollgas-Steigflug bei Ladezustand z: Spannung unter Last, Höchstschub und Steigrate (zwei Durchgänge, da der Strom die Spannung senkt)
function climbAtSoc(C, z, V, pk) {
  pk = pk || battPack(C);
  const rho = C.rho, W = C.m * G;
  let U = pk.nS * cellOCV(C.P, z), mt = null, op = null, st = null;
  for (let it = 0; it < 3; it++) {
    mt = propMaxThrust(C, V, rho, U);
    try { op = propOperate(C, mt.T * 0.999, V, rho); } catch (e) { op = null; }
    const Pb = op && fin(op.Pbat) ? op.Pbat : 0;
    st = battAt(C, z, Pb, pk); U = st.U;
  }
  const a = aero(C, V, 1, rho, C.nu, mt.T);
  return { z, V, T: mt.T, rpm: mt.rpm, Pbat: op ? op.Pbat : NaN, I: st.I, U: st.U, Ucell: st.Ucell, ok: st.ok && st.Ucell >= pk.uCut, roc: (mt.T - a.Dtot) * V / W };
}
// Übersicht für die Ansicht Energie
function battReport(C) {
  const P = C.P, pk = battPack(C), zRes = clamp(P.reserve / 100, 0, 1), cg = climbGlide(C), Vc = cg.bestC.V;
  const pCruise = (C.pProp + C.comp.always + C.comp.mission) / (P.etaDischarge / 100);
  const curve = []; for (let i = 0; i <= 50; i++) { const z = i / 50, a = battAt(C, z, pCruise, pk); curve.push({ z, U0: a.Ucell0, Uc: a.Ucell }); }
  const climbFull = climbAtSoc(C, 1, Vc, pk), climbRes = climbAtSoc(C, Math.max(zRes, 0.02), Vc, pk), climbNom = climbAtSoc(C, 0.5, Vc, pk);
  for (const p of curve) { const a = battAt(C, p.z, climbRes.Pbat, pk); p.Ufull = a.ok ? a.Ucell : NaN; }
  const cruise = battAt(C, 0.5, pCruise, pk), cruiseRes = battAt(C, Math.max(zRes, 0.02), pCruise, pk);
  return { pk, zRes, Vc, pCruise, curve, climbFull, climbRes, climbNom, cruise, cruiseRes, U100: pk.nS * cellOCV(P, 1), Ures: pk.nS * cellOCV(P, zRes), U0: pk.nS * cellOCV(P, 0) };
}

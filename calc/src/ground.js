/* ===================================================================
   Boden: Landung ohne Fahrwerk (Kufe oder verstärkter Rumpfboden),
   Hand- oder Katapultstart, Freigang des Propellers.
   - Landestoß nach Currey (Aircraft Landing Gear Design, 1988):
     aufzunehmende Arbeit E = m·v²/2 + (W − L)·δ, Kraftfaktor der Kufe
     N = E/(η·δ·W), Lastvielfaches am Schwerpunkt n = N + L/W.
     Flügelauftrieb beim Aufsetzen L = 2/3·W (CS-23.473).
     η: Blattfeder 0,5 (linear), Schaumstoff/Bauchschale 0,7.
   - Kufe als Blattfeder gleicher Festigkeit (Dreieck): Energiedichte
     σ²/(2E)·1/3; GFK-UD (E 40 GPa, Festigkeit 650 MPa × Abminderung).
   - Start: Punktmasse in der Längsebene (Anderson, Aircraft Performance
     and Design, 1999): m·dV/dt = T − D − W·sinγ, m·V·dγ/dt = L − W·cosγ;
     Auftriebsbeiwert auf 90 % von c_A,max begrenzt, Höchstschub aus dem
     Propeller-Kennfeld, Widerstand aus dem Flugzeugmodell.
   =================================================================== */
function landingGear(C, m) {
  const P = C.P, v = Math.max(0.2, P.vSink), skid = P.landGear === 'skid';
  const d = Math.max(0.003, skid ? P.skidStroke : P.bellyStroke), eta = skid ? 0.5 : 0.7, LW = 2 / 3;
  const E = m * (v * v / 2 + (1 - LW) * G * d), nGear = E / (eta * d * m * G), nCG = nGear + LW;
  let mass, mSpring = 0;
  const hook = P.launch === 'catapult' ? 0.03 : 0;
  if (skid) {
    const sa = 650e6 * P.matKnock / 100 / P.safety, u = sa * sa / (2 * 40e9) / 3;
    mSpring = E * 1950 / u; mass = mSpring + 0.04 + hook;
  } else mass = Math.max(0, P.wBelly) * P.fusD * Math.min(P.fusL, 1.2) + hook;
  return { skid, v, d, eta, E, nGear, nCG, mass, mSpring, cda: skid ? Math.max(0, P.skidCdA) / 1e4 : 0, hook };
}
// Freigang des Propellers bei der Landung (Rumpf um th Nase hoch, Bodenpunkt unter Kufe bzw. Schwerpunkt)
function propClearance(C, thDeg) {
  const P = C.P, g = C.bal.g, th = (thDeg ?? P.landPitch) * DEG, xc = P.landGear === 'skid' ? g.xSkid : C.bal.xcg, zc = g.zLow;
  const H = (x, z) => (z - zc) * Math.cos(th) + (xc - x) * Math.sin(th);
  const open = H(g.xProp, g.zP - g.R), folded = H(g.xProp, g.zP - 0.035);
  return { open, folded, th: th * RAD, need: open < 0.03 ? (folded < 0.01 ? 'strike' : 'fold') : 'free' };
}
// Start: Flugbahn nach dem Loslassen bzw. Verlassen der Schiene
function launchSim(C, V0, gam0, h0, rho, nu, CLmax) {
  const m = C.m, W = m * G, S = C.pf.S, CLm = 0.9 * CLmax, dt = 0.02, gT = 4 * DEG, out = [];
  let V = V0, gam = gam0, h = h0, x = 0, t = 0, hMin = h0, tSafe = null, Tmin = Infinity;
  const vSafe = 1.2 * Math.sqrt(2 * W / (rho * S * CLmax));
  while (t < 8) {
    const q = 0.5 * rho * V * V, T = Math.max(0, propMaxThrust(C, Math.max(V, 1.5), rho).T);
    const Lreq = W * Math.cos(gam) + m * V * 1.5 * (gT - gam), CL = clamp(Lreq / Math.max(1e-6, q * S), 0, CLm), L = CL * q * S;
    const D = aero(C, Math.max(V, 1), Math.max(0.02, L / W), rho, nu).Dtot * (V * V) / Math.max(1, V * V);
    const dV = (T - D) / m - G * Math.sin(gam), dg = (L - W * Math.cos(gam)) / (m * Math.max(V, 0.5));
    V = Math.max(0.5, V + dV * dt); gam += dg * dt; h += V * Math.sin(gam) * dt; x += V * Math.cos(gam) * dt; t += dt;
    Tmin = Math.min(Tmin, T);
    if (h < hMin) hMin = h;
    if (tSafe === null && V >= vSafe && gam > 0) tSafe = t;
    if (out.length < 400 && Math.round(t / dt) % 5 === 0) out.push([t, h, V, gam * RAD]);
    if (h <= 0) { hMin = Math.min(hMin, 0); break; }
    if (tSafe !== null && t > Math.max(4, tSafe + 2)) break;
  }
  return { hMin, tSafe, vSafe, pts: out, x, crash: hMin <= 0.05, Tmin };
}
function launchCheck(C) {
  const P = C.P, rho = rhoAt(P.alt, P.tMax), nu = nuAt(P.alt, P.tMax);
  const s = stallSpeed(C, 1), CLmax = s.CLmax, Vs = Math.sqrt(2 * C.m * G / (rho * C.pf.S * CLmax)), Vreq = P.vLaunchK * Vs;
  const T0 = propMaxThrust(C, Math.max(2, 0.6 * Vs), rho).T, TW = T0 / (C.m * G);
  if (P.launch === 'catapult') {
    const s0 = Math.max(0.3, P.launchRail), a = Vreq * Vreq / (2 * s0), nx = a / G + Math.sin(P.launchAngle * DEG), E = 0.5 * C.m * Vreq * Vreq;
    const sim = launchSim(C, Vreq, P.launchAngle * DEG, 1.2 + s0 * Math.sin(P.launchAngle * DEG), rho, nu, CLmax);
    return { kind: 'catapult', rho, Vs, Vreq, a, nx, E, sim, TW, ok: !sim.crash && nx <= P.nLaunchMax, V0: Vreq };
  }
  const V0 = P.vHand, sim = launchSim(C, V0, 5 * DEG, 1.8, rho, nu, CLmax);
  return { kind: 'hand', rho, Vs, Vreq, V0, sim, TW, ok: !sim.crash && V0 >= 0.95 * Vs, short: V0 < Vreq };
}

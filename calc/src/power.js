/* ===================================================================
   Antriebseinflüsse auf Trimmung, Stabilität und Widerstand
   - Strahl nach der Strahltheorie (McCormick 1995, Kap. 6; Glauert 1935):
     Zusatzgeschwindigkeit auf der Achse v(ξ) = v_i·(1 + ξ/√(ξ² + R²)),
     Einschnürung aus der Kontinuität R_s = R·√((V + v_i)/(V + v(ξ))),
     Staudruckverhältnis q_s/q = ((V + v)/V)². Keine Vermischung mit der
     Außenströmung (obere Abschätzung der Wirkung am Leitwerk).
   - Strahlachse: im Reiseflug parallel zur Rumpfachse (Einstellwinkel so,
     dass der Rumpf in Flugrichtung liegt), hinter dem Flügel um den
     Abwindwinkel ε = (dε/dα)·c_A/a_w nach unten abgelenkt.
   - Drall: Drehimpulsbilanz mit Potentialwirbel r·v_t = Q/(ρ(V + v_i)πR²);
     Seitenwind am Seitenleitwerk aus der Querkomponente von v_t.
   - Normalkraft des Propellers aus der Blattelement-Ableitung (Ribner 1945,
     NACA Report 819), mit Aufwind vor bzw. Abwind hinter dem Flügel.
   - Schubmoment um die Querachse M = T·(z_S − z_P) (Nase hoch positiv).
   =================================================================== */
// Betriebspunkt des Propellers: induzierte Geschwindigkeit, Drehzahl, Moment, Normalkraftableitung
function propState(C, T, V, rho) {
  const P = C.P, R = propRadius(P), A = Math.PI * R * R, Tp = Math.max(0, T);
  const vi = (-V + Math.sqrt(V * V + 2 * Tp / (rho * A))) / 2;
  let n = NaN, Q = 0, Na = 0;
  if (Tp > 0) {
    try { const op = propOperate(C, Tp, V, rho); if (op && op.n > 0) { n = op.n; Q = op.Psh / (2 * Math.PI * op.n); } } catch (e) { /* ohne Kennfeld */ }
    if (fin(n) && n > 0) { try { Na = propNormalDeriv(propGeometry(P), V, n, rho, C.nu); } catch (e) { Na = 0; } }
  }
  return { T: Tp, V, rho, vi, R, A, n, Q, Na };
}
// Geometrie des Strahls bezogen auf die Flugzeugteile (Anteile im Strahl und Lage der Strahlachse)
function slipGeom(C, ps, aB, CL) {
  const g = C.bal.g, P = C.P, tg = C.tail, pf = C.pf, np = C.bal.np, V = ps.V, vi = ps.vi, R = ps.R;
  const eps = np ? np.deda * Math.max(0, CL ?? 0.6) / np.aw : 0, xTE = g.xLE0 + pf.cr, behind = g.xProp > xTE - 0.05;
  const kx = x => 1 + (x - g.xProp) / Math.hypot(x - g.xProp, R);                // v(x)/v_i
  const Rs = x => R * Math.sqrt((V + vi) / (V + vi * kx(x)));
  const zs = x => g.zP + (x - g.xProp) * Math.tan(aB) - (behind ? (x - g.xProp) * eps : Math.max(0, x - xTE) * eps);
  const out = { eps, kx, Rs, zs, fH: 0, fV: 0, fF: 0, kxH: 2, kxV: 2, kxF: 2, wingW: 0, kxW: 1, swV: 0, swHroll: 0 };
  // Höhenleitwerk: Spannweitenanteil im Strahl
  const xH = g.xhLE + 0.25 * tg.ch;
  if (xH > g.xProp) { const r = Rs(xH), dz = g.zH - zs(xH); if (Math.abs(dz) < r) out.fH = Math.min(1, 2 * Math.sqrt(r * r - dz * dz) / tg.bh); out.kxH = kx(xH); out.zsH = zs(xH); out.RsH = r; }
  // Seitenleitwerk(e): Höhenanteil im Strahl und Drall (Querkomponente der Umfangsgeschwindigkeit)
  const xV = g.xvLE + 0.25 * tg.cv + g.vSw * 0.42 * tg.bv, yf = tg.nFin > 1 ? g.yB : 0;
  if (xV > g.xProp) {
    const r = Rs(xV), zc = zs(xV); out.kxV = kx(xV); out.zsV = zc; out.RsV = r;
    if (yf < r) {
      const hh = Math.sqrt(r * r - yf * yf), a = Math.max(g.zV0, zc - hh), b = Math.min(g.zV1, zc + hh);
      out.fV = Math.max(0, b - a) / tg.bv;
      if (b > a && ps.Q > 0) {
        const K = ps.Q / (ps.rho * (V + vi) * Math.PI * R * R), Va = V + vi * out.kxV, rc = 0.2 * r; let s = 0; const N = 20;
        for (let i = 0; i < N; i++) { const z = a + (b - a) * (i + 0.5) / N, dz = z - zc, d = Math.hypot(yf, dz), vt = d > rc ? K / d : K * d / (rc * rc); s += Math.atan(vt * (d > 0 ? dz / d : 0) / Va); }
        out.swV = s / N;                                                              // mittlerer Seitenwind (rad) über dem angeblasenen Teil
      }
    }
  }
  // Höhenleitwerk im Drall: gegensinniger Auf- und Abwind auf beiden Hälften → Rollmoment je q
  if (out.fH > 0 && ps.Q > 0) {
    const r = out.RsH, K = ps.Q / (ps.rho * (V + vi) * Math.PI * R * R), Va = V + vi * out.kxH, dz = g.zH - out.zsH, rc = 0.2 * r; let m = 0; const N = 24;
    for (let i = 0; i < N; i++) { const y = (i + 0.5) / N * Math.min(r, tg.bh / 2), d = Math.hypot(y, dz); if (d >= r) continue; const vt = d > rc ? K / d : K * d / (rc * rc); m += 2 * (vt * y / d / Va) * y * (Math.min(r, tg.bh / 2) / N); }
    out.swHroll = m * tg.ch;                                                          // ∫ α_Drall·c·y dy beider Hälften (m³), mal q_s·a_H → Rollmoment
  }
  // Rumpf: benetzter Anteil im Strahl hinter der Propellerebene
  let sw = 0, sk = 0, st0 = 0;
  for (let i = 0; i < g.fus.st.length - 1; i++) {
    const a = g.fus.st[i], b = g.fus.st[i + 1], xm = (a.x + b.x) / 2, dm = (a.d + b.d) / 2, dS = Math.PI * dm * (b.x - a.x); st0 += dS;
    if (xm <= g.xProp) continue;
    const r = Rs(xm), dist = Math.abs((a.z + b.z) / 2 - zs(xm)), f = clamp((r - dist + dm / 2) / Math.max(1e-6, dm), 0, 1);
    sw += f * dS; sk += f * dS * kx(xm);
  }
  out.fF = st0 > 0 ? sw / st0 : 0; out.kxF = sw > 0 ? sk / sw : 2;
  // Flügelwurzel im Strahl (nur Zugpropeller vor dem Flügel)
  if (g.xProp < g.xLE0) { const xw = g.xLE0 + 0.3 * pf.cr, r = Rs(xw), dz = g.zw - zs(xw); if (Math.abs(dz) < r) out.wingW = Math.max(0, 2 * Math.sqrt(r * r - dz * dz) - P.fusD); out.kxW = kx(xw); }
  return out;
}
// Staudruckverhältnis im Strahl bei Schub T und Fahrt V an einer Stelle mit Entwicklungsfaktor kx
function slipQr(C, T, V, rho, kx) { const R = propRadius(C.P), vi = (-V + Math.sqrt(V * V + 2 * Math.max(0, T) / (rho * Math.PI * R * R))) / 2; return ((V + kx * vi) / V) ** 2; }
// Alle Antriebseinflüsse in einem Betriebspunkt (Schub T, Fahrt V, Anstellwinkel der Rumpfachse aB)
function powerEffects(C, T, V, rho, aB, CL) {
  const P = C.P, g = C.bal.g, bal = C.bal, pf = C.pf, tg = C.tail, q = 0.5 * rho * V * V, S = pf.S, b = pf.b;
  const ps = propState(C, T, V, rho), sg = slipGeom(C, ps, aB || 0, CL);
  const qrH = ((V + sg.kxH * ps.vi) / V) ** 2, qrV = ((V + sg.kxV * ps.vi) / V) ** 2;
  const behindWing = g.xProp > g.xLE0, du = behindWing ? -(C.bal.np ? C.bal.np.deda : 0.3) : 0.1;
  const CNa = ps.Na / Math.max(1e-9, q * ps.A), CNaS = ps.Na * (1 + du) / (q * S);
  const etaH = P.etaTail / 100 * (1 + sg.fH * (qrH - 1)), etaV = 1 + sg.fV * (qrV - 1);
  // Seitenleitwerk im Drall: Seitenkraft, Gier- und Rollmoment (Vorzeichen hängt vom Drehsinn ab: Beträge)
  const aV = helmbold(1.55 * P.arV, 2 * Math.PI * 0.9), lv = (g.xvLE + 0.25 * tg.cv) - bal.xcg, zv = g.zV0 + 0.42 * tg.bv - bal.zcg;
  const Ysw = q * qrV * aV * tg.Svf * sg.fV * sg.swV * tg.nFin, CnSw = Ysw * lv / (q * S * b), ClSw = Ysw * zv / (q * S * b);
  const aH = C.bal.np ? C.bal.np.at : 4.5, ClSwH = q * ((V + sg.kxH * ps.vi) / V) ** 2 * aH * sg.swHroll / (q * S * b);
  const ClQ = ps.Q / (q * S * b);                                           // Gegenmoment des Motors
  return { ps, sg, T, V, aB: aB || 0, MT: T * (bal.zcg - g.zP), dzT: g.zP - bal.zcg, CNa, CNaS, du, etaH, etaV, qrH, qrV, CnSw, ClSw, ClSwH, ClQ, swV: sg.swV };
}
// Moment des Antriebs um den Schwerpunkt bei Schub T (Nase hoch positiv): Schublinie und Normalkraft
function thrustMoment(C, T, V, rho, CL) {
  const pw = C.pw; if (!pw || !C.bal) return 0;
  const g = C.bal.g, q = 0.5 * rho * V * V, aB = C.np && C.lvl0 ? (CL - C.lvl0.CL) / C.np.CLa : 0;
  return Math.max(0, T) * (C.bal.zcg - g.zP) + q * C.pf.S * pw.CNaS * aB * (C.bal.xcg - g.xProp);
}
// Flugzustände mit und ohne Antrieb: Schubmoment, Strahl am Höhenleitwerk, Leitwerksbeiwert, Neutralpunkt
function powerStates(C) {
  const P = C.P, rho = C.rho, nu = C.nu, cg = climbGlide(C), out = [], pw0 = C.pw, sl0 = C.slip;
  const row = (k, name, V, T) => {
    const a = aero(C, V, 1, rho, nu, T), pw = powerEffects(C, T, V, rho, (a.CL - C.lvl0.CL) / C.np.CLa, a.CL);
    C.pw = T > 0 ? pw : null; C.slip = T > 0 ? pw.sg : null;
    const np = neutralPoint(C, C.bal.g, T > 0 ? undefined : { off: true });
    C.pw = pw0; C.slip = sl0;
    out.push({ k, name, V, T, MT: T > 0 ? thrustMoment(C, T, V, rho, a.CL) : 0, qrH: pw.qrH, fH: pw.sg.fH, etaH: T > 0 ? pw.etaH : P.etaTail / 100, CLh: a.CLh, xnp: np.xnp, sm: (np.xnp - C.bal.xcg) / C.pf.mac, swV: T > 0 ? pw.swV : 0, CnSw: T > 0 ? pw.CnSw : 0 });
  };
  row('glide', 'Gleitflug, Motor aus', cg.bestG.V, 0);
  row('cruise', 'Reiseflug', P.v, C.lvl.Dtot);
  row('climb', 'Steigflug mit Vollgas', cg.bestC.V, cg.bestC.Tmax);
  return { rows: out, cg };
}

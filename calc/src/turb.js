/* ===================================================================
   Turbulenz und Bildruhe an der Kamera
   - Dryden-Modell nach MIL-F-8785C, Abschn. 3.7 (auch MIL-HDBK-1797),
     niedrige Höhe (10–1000 ft über Grund, h in ft):
       L_w = h, L_u = L_v = h/(0,177 + 0,000823·h)^1,2,
       σ_w = 0,1·W₂₀, σ_u = σ_v = σ_w/(0,177 + 0,000823·h)^0,4,
     W₂₀ = Wind in 20 ft: leicht 15 kn, mittel 30 kn, stark 45 kn, oder aus dem
     mittleren Wind am Einsatzort (Hellmann-Gesetz auf 6,1 m umgerechnet).
   - Formfilter (Eingang weißes Rauschen, einseitig σ² = ∫₀^∞ |H(jω)|² dω):
       H_u = σ_u·√(2L_u/(πV))/(1 + L_u s/V)
       H_v = σ_v·√(L_v/(πV))·(1 + √3·L_v s/V)/(1 + L_v s/V)², H_w entsprechend
       H_p = σ_w·√(0,8/V)·(π/(4b))^(1/6)/(L_w^(1/3)·(1 + 4b s/(πV)))
       q_g = −(s/V)/(1 + 4b s/(πV))·w_g,  r_g = +(s/V)/(1 + 3b s/(πV))·v_g
   - Flugzeug: lineare Längs- und Seitenbewegung (dyn.js); Böen wirken als
     Relativgeschwindigkeit in den Luftkraftableitungen: B = −∂(Luftkraft)/∂x,
     auch über ẇ_g = s·w_g (Abwindverzug, Ableitungen Z_ẇ, M_ẇ; Etkin 1972, Kap. 13;
     Wright & Cooper 2015, Kap. 14).
     Frequenzgang Y(jω) = C·(jωI − A)⁻¹·B·g(jω), Leistungsdichten addiert über
     die unabhängigen Quellen u, v, w, p.
   - Der Autopilot hält Lage und Bahn unterhalb seiner Bandbreite ω_AP; gezählt
     werden die Anteile oberhalb davon (Bildruhe hängt an den schnellen Anteilen).
   - Kamera an (x, z): Drehraten wie am Schwerpunkt, Beschleunigung
     a = a_S + ω̇ × r. Bewegungsunschärfe in Pixeln: Δ = ω·t/IFOV, IFOV = Bildwinkel/Pixel,
     t = Belichtungszeit (RGB) bzw. thermische Zeitkonstante des Mikrobolometers (Wärmebild);
     Vorwärtsbewegung: Δ = V·t/GSD, GSD = h·IFOV.
   =================================================================== */
const KT = 0.514444, FT = 0.3048;
const TURB_W20 = { light: 15 * KT, moderate: 30 * KT, severe: 45 * KT };
// Kenngrößen der Turbulenz in Flughöhe
function drydenParams(P) {
  const hFt = clamp(Math.max(P.hAGL, 3) / FT, 10, 1000), k = 0.177 + 0.000823 * hFt;
  const W20 = P.turbLevel === 'wind' ? P.wind10 * Math.pow(6.1 / 10, P.hellmann) : TURB_W20[P.turbLevel] || TURB_W20.light;
  const sw = 0.1 * W20, su = sw / Math.pow(k, 0.4);
  return { hFt, W20, sw, su, sv: su, Lw: hFt * FT, Lu: hFt / Math.pow(k, 1.2) * FT, Lv: hFt / Math.pow(k, 1.2) * FT, capped: Math.max(P.hAGL, 3) / FT > 1000 };
}
// komplexe Arithmetik (Paare [re, im])
const cx = (re, im = 0) => [re, im], cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]], cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cDiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }, cAbs2 = a => a[0] * a[0] + a[1] * a[1];
// (jωI − A)·X = b lösen (Gauß mit Pivot), b komplex
function cSolve(A, w, b) {
  const n = A.length, M = A.map((r, i) => r.map((v, j) => cx(-v + 0, (i === j ? w : 0)))), x = b.map(v => v.slice());
  for (let i = 0; i < n; i++) M[i][i] = [-A[i][i], w];
  for (let c = 0; c < n; c++) {
    let p = c, pm = cAbs2(M[c][c]); for (let r = c + 1; r < n; r++) { const m = cAbs2(M[r][c]); if (m > pm) { pm = m; p = r; } }
    if (p !== c) { [M[p], M[c]] = [M[c], M[p]]; [x[p], x[c]] = [x[c], x[p]]; }
    for (let r = c + 1; r < n; r++) { const f = cDiv(M[r][c], M[c][c]); for (let k = c; k < n; k++) M[r][k] = cAdd(M[r][k], cMul([-f[0], -f[1]], M[c][k])); x[r] = cAdd(x[r], cMul([-f[0], -f[1]], x[c])); }
  }
  for (let r = n - 1; r >= 0; r--) { let s = x[r]; for (let k = r + 1; k < n; k++) s = cAdd(s, cMul([-M[r][k][0], -M[r][k][1]], x[k])); x[r] = cDiv(s, M[r][r]); }
  return x;
}
// Antwort des Flugzeugs auf Turbulenz: Leistungsdichten und Effektivwerte an der Kamera
function turbResponse(C, opt = {}) {
  const P = C.P, fd = opt.fd || flightDynamics(C), x = fd.x, V = x.V, b = C.pf.b, tp = drydenParams(P);
  const Alon = lonMatrix(x), Alat = latMatrix(x), md = x.m - x.Zwd;
  const Ixz = x.Ixz || 0, den = x.Ix * x.Iz - Ixz * Ixz, Lp = (a, c) => (x.Iz * a + Ixz * c) / den, Np = (a, c) => (Ixz * a + x.Ix * c) / den;
  // Böen-Eingänge (Spalten): Längs [u_g, w_g, q_g, ẇ_g], Seite [v_g, p_g, r_g]. Die Luftkräfte hängen von den Relativgrößen
  // w − w_g, ẇ − ẇ_g (Abwindverzug am Leitwerk) und q − q_g ab; ẇ aus der Z-Gleichung eingesetzt (m_d = m − Z_ẇ).
  const Blon = [[-x.Xu / x.m, -x.Xw / x.m, 0, 0], [-x.Zu / md, -x.Zw / md, -x.Zq / md, -x.Zwd / md],
    [-(x.Mu + x.Mwd * x.Zu / md) / x.Iy, -(x.Mw + x.Mwd * x.Zw / md) / x.Iy, -(x.Mq + x.Mwd * x.Zq / md) / x.Iy, -x.Mwd * x.m / (md * x.Iy)], [0, 0, 0, 0]];
  const Blat = [[-x.Yv / x.m, -x.Yp / x.m, -x.Yr / x.m], [-Lp(x.Lv, x.Nv), -Lp(x.Lp, x.Np), -Lp(x.Lr, x.Nr)], [-Np(x.Lv, x.Nv), -Np(x.Lp, x.Np), -Np(x.Lr, x.Nr)], [0, 0, 0]];
  // Kameralage relativ zum Schwerpunkt (Körperachsen: x vorn, z unten)
  const cam = C.comps.find(c => c.on && c.id === (opt.cam || 'ir')) || C.comps.find(c => c.on && c.group === 'sens') || { x: C.bal.xcg, z: C.bal.zcg };
  const xb = C.bal.xcg - (cam.x ?? C.bal.xcg), zb = C.bal.zcg - (cam.z ?? C.bal.zcg);
  const wAP = Math.max(0.05, P.apBand || 1.5), N = 360, w0 = 0.02, w1 = 400, out = { tp, xb, zb, cam, wAP, f: [], V };
  const keys = ['p', 'q', 'r', 'phi', 'theta', 'az', 'ay'], S = Object.fromEntries(keys.map(k => [k, new Float64Array(N)]));
  const ws = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const w = w0 * Math.pow(w1 / w0, i / (N - 1)), s = cx(0, w); ws[i] = w;
    const lag = (L, a) => cDiv(cx(a), cAdd(cx(1), cMul(cx(L / V), s)));                   // a/(1 + L s/V)
    const Hu = lag(tp.Lu, tp.su * Math.sqrt(2 * tp.Lu / (Math.PI * V)));
    const dry = (L, sg) => cDiv(cMul(cx(sg * Math.sqrt(L / (Math.PI * V))), cAdd(cx(1), cMul(cx(Math.sqrt(3) * L / V), s))), cMul(cAdd(cx(1), cMul(cx(L / V), s)), cAdd(cx(1), cMul(cx(L / V), s))));
    const Hw = dry(tp.Lw, tp.sw), Hv = dry(tp.Lv, tp.sv);
    const Hp = cDiv(cx(tp.sw * Math.sqrt(0.8 / V) * Math.pow(Math.PI / (4 * b), 1 / 6) / Math.pow(tp.Lw, 1 / 3)), cAdd(cx(1), cMul(cx(4 * b / (Math.PI * V)), s)));
    const Hq = cMul(cDiv(cMul(cx(-1 / V), s), cAdd(cx(1), cMul(cx(4 * b / (Math.PI * V)), s))), Hw);
    const Hr = cMul(cDiv(cMul(cx(1 / V), s), cAdd(cx(1), cMul(cx(3 * b / (Math.PI * V)), s))), Hv);
    const lonSrc = [[Hu, cx(0), cx(0), cx(0)], [cx(0), Hw, Hq, cMul(s, Hw)]], latSrc = [[Hv, cx(0), Hr], [cx(0), Hp, cx(0)]];
    const acc = { p: 0, q: 0, r: 0, phi: 0, theta: 0, az: 0, ay: 0 };
    for (const g of lonSrc) {
      const bv = Blon.map(row => row.reduce((a, c, k) => cAdd(a, cMul(cx(c), g[k])), cx(0))), X = cSolve(Alon, w, bv);
      const q = X[2], th = X[3], wd = cMul(s, X[1]), qd = cMul(s, q);
      const az = cAdd(cAdd(wd, cMul(cx(-V), q)), cMul(cx(-xb), qd));                       // a_z an der Kamera (nach unten positiv)
      acc.q += cAbs2(q); acc.theta += cAbs2(th); acc.az += cAbs2(az);
    }
    for (const g of latSrc) {
      const bv = Blat.map(row => row.reduce((a, c, k) => cAdd(a, cMul(cx(c), g[k])), cx(0))), X = cSolve(Alat, w, bv);
      const p = X[1], r = X[2], ph = X[3], vd = cMul(s, X[0]);
      const ay = cAdd(cAdd(cAdd(vd, cMul(cx(V), r)), cMul(cx(-x.g), ph)), cAdd(cMul(cx(xb), cMul(s, r)), cMul(cx(-zb), cMul(s, p))));
      acc.p += cAbs2(p); acc.r += cAbs2(r); acc.phi += cAbs2(ph); acc.ay += cAbs2(ay);
    }
    for (const k of keys) S[k][i] = acc[k];
  }
  // Effektivwerte oberhalb der Autopilot-Bandbreite (Trapez auf dem Raster)
  const rms = {};
  for (const k of keys) { let s2 = 0; for (let i = 1; i < N; i++) { if (ws[i] <= wAP) continue; const a = Math.max(ws[i - 1], wAP); s2 += 0.5 * (S[k][i] + S[k][i - 1]) * (ws[i] - a); } rms[k] = Math.sqrt(s2); }
  out.ws = ws; out.S = S; out.rms = rms;
  return out;
}
// Bewegungsunschärfe und Bildlage für Wärmebild- und RGB-Kamera
function imageStability(C, opt = {}) {
  const P = C.P, fd = opt.fd || flightDynamics(C), tr = turbResponse(C, { fd }), h = Math.max(1, P.hAGL), V = P.v, r = tr.rms;
  const cam = (name, hfov, nx, ny, t) => {
    const ifov = hfov * DEG / Math.max(1, nx), gsd = h * ifov, wc = Math.hypot(r.p, r.q), we = r.r * Math.hypot(nx, ny) / 2 * ifov;   // Gieren dreht das Bild um die Mitte
    return { name, ifov, gsd, t, blurC: wc * t / ifov, blurE: Math.hypot(wc * t, we * t) / ifov, blurV: V * t / gsd, footprint: h * Math.hypot(r.phi, r.theta) };
  };
  const ir = cam('Wärmebild', P.irHFOV, P.irRes, P.irResV, Math.max(1e-4, P.irTau / 1000)), rgb = cam('RGB', P.rgbHFOV, P.rgbRes, P.rgbResV, Math.max(1e-5, P.rgbExp / 1000));
  return { tr, ir, rgb, h };
}

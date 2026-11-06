/* ===================================================================
   Rechenkern Teil 1: Atmosphäre, Profilpolaren, Tragflügel (Traglinie),
   Widerstandsaufbau, Antrieb, Strukturmasse, Fallbeschreibung.
   =================================================================== */
const G = 9.80665, DEG = Math.PI / 180, RAD = 180 / Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fin = x => typeof x === 'number' && Number.isFinite(x);

/* ---------- Atmosphäre (ISA-Druck, Temperatur frei) ---------- */
function pressure(h) { return 101325 * Math.pow(Math.max(0.05, 1 - 2.25577e-5 * h), 5.25588); }
function rhoAt(h, Tc) { return pressure(h) / (287.05 * (Tc + 273.15)); }
function muAir(Tc) { const T = Tc + 273.15; return 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4); } // Sutherland
function nuAt(h, Tc) { return muAir(Tc) / rhoAt(h, Tc); }

/* ---------- Profilpolaren (NeuralFoil/XFoil-Tabellen) ---------- */
let AF = null;
function setAirfoils(db) {
  const map = new Map();
  for (const f of db.foils) {
    for (const mode of ['free', 'trip']) {
      const ps = f[mode]; if (!ps) continue;
      // gültigen cl-Bereich je Re-Zeile vorab bestimmen
      ps.rng = ps.cd.map(row => { let lo = -1, hi = -1; row.forEach((v, k) => { if (v != null) { if (lo < 0) lo = k; hi = k; } }); return [lo, hi]; });
    }
    map.set(f.key, f);
  }
  AF = { re: db.re, lre: db.re.map(Math.log), cl: db.cl, step: db.cl[1] - db.cl[0], map, db };
}
function foilByKey(key) { return (AF && AF.map.get(key)) || (AF && AF.db.foils[0]); }
function polarSet(f, mode) { return mode === 'trip' && f.trip ? f.trip : f.free; }
function reIdx(Re) {
  const L = AF.lre, x = Math.log(Math.max(1, Re)), n = L.length;
  if (x <= L[0]) return [0, 0, x < L[0] - 1e-6 ? -1 : 0];
  if (x >= L[n - 1]) return [n - 2, 1, x > L[n - 1] + 1e-6 ? 1 : 0];
  let i = 0; while (L[i + 1] < x) i++;
  return [i, (x - L[i]) / (L[i + 1] - L[i]), 0];
}
// cd einer Re-Zeile bei cl; außerhalb des anliegenden Bereichs steil quadratisch (Abriss-Strafe)
function rowCd(ps, iRe, cl, out) {
  const row = ps.cd[iRe], [lo, hi] = ps.rng[iRe], C = AF.cl, st = AF.step;
  if (lo < 0) { out.flag = 2; return 0.05; }
  if (cl <= C[lo]) { if (cl < C[lo] - 1e-9) out.flag = 1; const d = C[lo] - cl; return row[lo] / 1e5 + 0.6 * d * d; }
  if (cl >= C[hi]) { if (cl > C[hi] + 1e-9) out.flag = 1; const d = cl - C[hi]; return row[hi] / 1e5 + 0.6 * d * d + 0.05 * d; }
  let k = Math.floor((cl - C[0]) / st + 1e-9); k = clamp(k, lo, hi - 1);
  const a = row[k], b = row[k + 1];
  if (a == null || b == null) return (a ?? b) / 1e5;
  return (a + (b - a) * ((cl - C[k]) / st)) / 1e5;
}
const _cdo = { flag: 0, ext: 0 };
function profileCd(f, mode, Re, cl, out) {
  const o = out || _cdo; o.flag = 0;
  const ps = polarSet(f, mode), [i, t, ext] = reIdx(Re);
  const a = rowCd(ps, i, cl, o), b = rowCd(ps, i + 1, cl, o);
  let cd = a + (b - a) * t;
  if (ext < 0) cd *= Math.pow(Re / AF.re[0], -0.5);                       // unter 40 000: laminar extrapoliert
  else if (ext > 0) cd *= Math.pow(Re / AF.re[AF.re.length - 1], -0.15);   // über 1 Mio.
  o.ext = ext;
  return cd;
}
function foilMeta(f, mode, Re) {
  const ps = polarSet(f, mode), [i, t] = reIdx(Re), m0 = ps.meta[i] || ps.meta[i + 1], m1 = ps.meta[i + 1] || m0;
  const o = {};
  for (const k of ['clmax', 'a0', 'slope', 'cm', 'conf']) o[k] = m0[k] + (m1[k] - m0[k]) * t;
  return o;
}
// Bester Gleitwinkel des Profils und cl dazu bei gegebener Re (für Profilvergleiche)
function foilBest(f, mode, Re) {
  let best = { ld: 0, cl: 0, cd: 0 }, best32 = { v: 0, cl: 0 };
  for (let cl = 0.2; cl <= 1.6; cl += 0.02) {
    const o = { flag: 0 }, cd = profileCd(f, mode, Re, cl, o); if (o.flag) continue;
    if (cl / cd > best.ld) best = { ld: cl / cd, cl, cd };
    const v = Math.pow(cl, 1.5) / cd; if (v > best32.v) best32 = { v, cl };
  }
  return { ...best, cl32: best32.cl, f32: best32.v };
}

/* ---------- Flügelgrundriss ---------- */
function planform(P) {
  const b = P.span, S = P.area, type = P.planform || 'rect';
  const lam = clamp(P.taper ?? 1, 0.15, 1), e = clamp(P.centerFrac ?? 0.5, 0, 0.95), w = P.washout || 0;
  const I = type === 'rect' ? 1 : type === 'taper' ? (1 + lam) / 2 : type === 'ellip' ? Math.PI / 4 : e + (1 - e) * (1 + lam) / 2;
  const cr = S / (b * I);
  const chordAt = eta => {
    if (type === 'rect') return cr;
    if (type === 'taper') return cr * (1 - (1 - lam) * eta);
    if (type === 'ellip') return cr * Math.sqrt(Math.max(1e-4, 1 - eta * eta));
    return eta <= e ? cr : cr * (1 - (1 - lam) * (eta - e) / (1 - e));
  };
  const twistAt = eta => (type === 'rect_taper' ? (eta <= e ? 0 : -w * (eta - e) / (1 - e)) : -w * eta);
  const sweep = clamp(P.sweep || 0, -35, 35), tanL = Math.tan(sweep * DEG);
  // Vorderkante relativ zur Wurzel-Vorderkante: gerade t/4-Linie mit Pfeilwinkel
  const xLE = eta => eta * b / 2 * tanL + (cr - chordAt(eta)) / 4;
  let s2 = 0, sx = 0, sy = 0; const n = 400;
  for (let k = 0; k < n; k++) { const et = (k + 0.5) / n, c = chordAt(et); s2 += c * c; sx += c * xLE(et); sy += c * et; }
  const mac = b * (s2 / n) / S, xLEmac = b * (sx / n) / S, yMac = (sy / n) * b / 2 * b / S;
  return { b, S, AR: b * b / S, cr, ct: chordAt(1), mac, cmean: S / b, chordAt, twistAt, type, lam, e, washout: w, sweep, tanL, xLE, xLEmac, yMac };
}

/* ---------- Traglinie nach Glauert (symmetrisch, ungerade Glieder) ---------- */
function solveLin(A, y) {
  const n = y.length, M = A.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
function liftingLine(pf, a0, N = 16, M = 40) {
  const b = pf.b, rows = [], ra = [], rb = [];
  for (let i = 1; i <= N; i++) {
    const t = i * Math.PI / (2 * N), eta = Math.cos(t), c = pf.chordAt(eta), mu = c * a0 / (4 * b), s = Math.sin(t);
    const row = []; for (let k = 0; k < N; k++) { const n = 2 * k + 1; row.push(Math.sin(n * t) * (mu * n + s)); }
    rows.push(row); ra.push(mu * s); rb.push(mu * s * pf.twistAt(eta) * DEG);
  }
  const xa = solveLin(rows, ra), xb = solveLin(rows, rb), AR = pf.AR;
  const st = [];
  for (let j = 0; j < M; j++) {
    const eta = (j + 0.5) / M, t = Math.acos(eta), c = pf.chordAt(eta);
    let fa = 0, fb = 0;
    for (let k = 0; k < N; k++) { const s = Math.sin((2 * k + 1) * t); fa += xa[k] * s; fb += xb[k] * s; }
    st.push({ eta, c, fa: 4 * b * fa / c, fb: 4 * b * fb / c });
  }
  return { N, M, xa, xb, AR, a0, CLa: Math.PI * AR * xa[0], CLb: Math.PI * AR * xb[0], st };
}
function llAt(ll, CL) {
  const am = (CL - ll.CLb) / ll.CLa;
  let s = 0;
  for (let k = 0; k < ll.N; k++) { const n = 2 * k + 1, An = am * ll.xa[k] + ll.xb[k]; s += n * An * An; }
  const CDi = Math.PI * ll.AR * s;
  return { am, CDi, e: CDi > 0 ? CL * CL / (Math.PI * ll.AR * CDi) : 1 };
}
// Maximaler Flügelauftrieb nach dem Verfahren der kritischen Station (erste Station erreicht cl_max)
function wingClmax(C, V, nu) {
  let best = Infinity, eta = 0, xqc = 0;
  const c2 = (C.ll.cosL || 1) ** 2;
  for (const s of C.ll.st) {
    const m = foilMeta(C.foil, C.mode, V * s.c / nu), CLs = C.ll.CLb + C.ll.CLa * (0.97 * m.clmax * c2 - s.fb) / s.fa;
    if (CLs < best) { best = CLs; eta = s.eta; xqc = s.xqc || 0; }
  }
  return { CLmax: best, eta, xqc };
}

/* ---------- Reibung schlanker Körper ---------- */
function cfFlat(Re, flow) {
  const turb = 0.074 * Math.pow(Re, -0.2);
  if (flow === 'turb') return turb;
  return Re < 5e5 ? 1.328 / Math.sqrt(Re) : turb - 1742 / Re; // Prandtl–Schlichting, Umschlag bei Re 5·10⁵
}


/* ---------- Aerodynamik eines Flugzustands ----------
   n: Lastvielfaches (Kurvenflug 1/cos φ), Trimmung mit Schwerpunkt im Flügel-Neutralpunkt:
   das Höhenleitwerk gleicht nur das Nullmoment des Profils aus. */
// Zwei Durchgänge, wenn Antriebseinflüsse bekannt sind: erst ohne, dann mit Schubmoment bei Schub = Widerstand
// (oder vorgegebenem Schub T, z. B. Vollgas im Steigflug oder T = 0 im Gleitflug)
function aero(C, V, n, rho, nu, T) {
  const r0 = aeroCore(C, V, n, rho, nu, 0, T ?? null);
  if (!C.pw || !C.bal) return r0;
  const Tt = T ?? r0.Dtot, dM = thrustMoment(C, Tt, V, rho, r0.CL);
  const r1 = aeroCore(C, V, n, rho, nu, dM, Tt);
  if (T == null) { const dM2 = thrustMoment(C, r1.Dtot, V, rho, r1.CL); if (Math.abs(dM2 - dM) > 1e-3) return aeroCore(C, V, n, rho, nu, dM2, r1.Dtot); }
  return r1;
}
function aeroCore(C, V, n, rho, nu, dM, Tin) {
  const P = C.P, pf = C.pf, S = pf.S, q = 0.5 * rho * V * V, W = C.m * G;
  const meta = foilMeta(C.foil, C.mode, V * pf.mac / nu), cmac = meta.cm + (C.ll.Cmb || 0);
  const Lt = C.bal ? tailLoad(C, n, q, cmac, dM) : q * S * pf.mac * cmac / C.tail.lt;
  const CL = (n * W - Lt) / (q * S);
  const lr = llAt(C.ll, CL);
  let cdp = 0, stall = 0, ext = 0, clPeak = 0;
  const o = { flag: 0, ext: 0 }, c2 = (C.ll.cosL || 1) ** 2;
  for (const s of C.ll.st) {
    const cl = (lr.am * s.fa + s.fb) / c2, Re = V * s.c / nu;   // einfache Pfeilungstheorie: Profil sieht c_l/cos²Λ
    cdp += profileCd(C.foil, C.mode, Re, cl, o) * s.c * (s.w ?? 1 / C.ll.M);
    if (o.flag) stall = 1; if (o.ext) ext = o.ext;
    const r = cl / foilMeta(C.foil, C.mode, Re).clmax; if (r > clPeak) clPeak = r;
  }
  cdp = cdp * pf.b / S * C.k.prof;
  // Propellerstrahl: Schub (Vorgabe oder Widerstand des ersten Durchgangs) bestimmt das Staudruckverhältnis
  const sl = C.slip || null, Ts = Tin ?? (C.lvl ? C.lvl.Dtot * (V / P.v) ** 2 : 0);
  const qrAt = kx => (sl ? slipQr(C, Ts, V, rho, kx) : 1);
  // Flügelwurzel im Strahl (Zugpropeller vor dem Flügel): höherer Staudruck auf der Strahlbreite
  let slipW = 0;
  if (sl && sl.wingW > 0) {
    const s0 = C.ll.st[0], cl = (lr.am * s0.fa + s0.fb) / c2;
    slipW = (qrAt(sl.kxW) - 1) * q * profileCd(C.foil, C.mode, V * s0.c / nu, cl) * s0.c * sl.wingW;
  }
  // Höhen- und Seitenleitwerk; Teile im Propellerstrahl mit höherem Staudruck
  const tg = C.tail, g = C.bal ? C.bal.g : C.g0;
  const qH = sl ? 1 + sl.fH * (qrAt(sl.kxH) - 1) : 1, qV = sl ? 1 + sl.fV * (qrAt(sl.kxV) - 1) : 1;
  const CLh = Lt / (q * qH * (P.etaTail / 100) * tg.Sh), Reh = V * tg.ch / nu;
  const cdh = profileCd(C.tfoil, 'free', Reh, Math.abs(CLh), o), cdiH = CLh * CLh / (Math.PI * tg.arH * 0.85);
  const cdv = profileCd(C.tfoil, 'free', V * tg.cv / nu, 0, o);
  // Rumpf als Rotationskörper (Raymer: Formfaktor 1 + 60/f³ + f/400 über benetzte Fläche), Träger als Rohre
  const fu = g.fus, Ref = V * fu.L / nu, fr = fu.L / Math.max(0.02, fu.D);
  const fusCdA = cfFlat(Ref, P.fusFlow) * (1 + 60 / fr ** 3 + fr / 400) * fu.Swet;
  const lB = g.lBoom, boomCdA = lB > 0 ? cfFlat(V * lB / nu, P.fusFlow) * 1.05 * Math.PI * P.boomD * lB * C.cfg.nBoom : 0;
  const kI = 1 + P.kInt / 100, kP = C.k.par;
  // Motorgondel oben am Seitenleitwerk, Pylon des Druckmotors, Landekufe
  const nac = C.cfg.mot === 'fin' ? cfFlat(V * 0.22 / nu, 'turb') * (1 + 0.35 / 3.7) * 0.85 * Math.PI * 0.07 * 0.22 : 0;
  const pyl = g.pylon > 0 ? cfFlat(V * 0.12 / nu, 'turb') * 1.3 * 2 * 0.12 * g.pylon + cfFlat(V * 0.2 / nu, 'turb') * 1.1 * Math.PI * 0.06 * 0.2 : 0;
  const fusQ = sl && sl.fF > 0 ? 1 + sl.fF * (qrAt(sl.kxF) - 1) : 1;
  const D = {
    profile: q * S * cdp + slipW,
    induced: q * S * lr.CDi * C.k.ind,
    tail: q * (tg.Sh * (cdh + cdiH) * qH * P.etaTail / 100 + tg.Sv * cdv * qV) * kI * kP,
    fus: q * fusCdA * kI * kP * fusQ,
    boom: q * boomCdA * kI * kP,
    comps: q * (C.compCdA + nac * (sl ? qrAt(1.2) : 1) + pyl) * kI * kP,
    gear: q * (C.land ? C.land.cda : 0) * kI * kP
  };
  let sum = 0; for (const k in D) sum += D[k];
  D.reserve = sum * P.kDrag / 100;
  const Dtot = sum + D.reserve;
  const alpha = (lr.am * RAD + meta.a0);
  return { V, n, q, CL, CDi: lr.CDi, e: lr.e, cdp, D, Dtot, LD: n * W / Dtot, alpha, Lt, CLh, qH, qV, dM, stall, ext, clPeak, rho, nu, cm: meta.cm, cmac };
}

/* ---------- Antrieb: Impulstheorie + Wirkungsgradkette ---------- */
function propulsion(C, T, V, rho) {
  const P = C.P;
  if (!(T > 0)) return { pel: 0, eta: 1, etaI: 1 };
  const inst = C.motor ? C.motor.eta : 1;
  if (P.propModel === 'eta') { const eta = P.etaTotal / 100 * C.k.eta; return { pel: T * V / eta, eta, etaI: NaN }; }
  if (P.propModel === 'bemt' && typeof propOperate === 'function') {
    const r = propOperate(C, T, V, rho);
    if (r && r.ok) { const eta = r.etaTot * inst * C.k.eta; return { pel: T * V / eta, eta, etaI: NaN, op: r }; }
  }
  const A = Math.PI * P.propD * P.propD / 4 * Math.max(P.nProp, C.motor ? C.motor.nProp : 1);
  const vi = (-V + Math.sqrt(V * V + 2 * T / (rho * A))) / 2, etaI = V / (V + vi);
  const eta = etaI * P.etaProfile / 100 * P.etaMotor / 100 * P.etaEsc / 100 * P.etaGear / 100 * C.k.eta * inst;
  return { pel: T * V / eta, eta, etaI };
}
// Elektrische Leistung im stationären (Kurven-)Flug
function flightPower(C, V, n, rho, nu) {
  const a = aero(C, V, n, rho, nu), p = propulsion(C, a.Dtot, V, rho);
  // Verlust in der Antriebsleitung (I²R) kommt aus dem Akku hinzu
  const U = Math.max(1, C.P.nCells * C.P.cellV), I = p.pel / U, wl = C.harness ? wireLoss(C.harness, I) : 0;
  return { ...a, pel: p.pel + wl, eta: p.eta, etaI: p.etaI, op: p.op, wireLoss: wl };
}
/* ---------- Strukturmasse (Bauweisen-Modell, kalibriert an AtlantikSolar) ----------
   Holmgurte auf Biegung (Bruchlast) und Steifigkeit (Durchbiegung bei 1 g), Steg auf Querkraft,
   Rippen, Nasenbeplankung, Bespannung, Endleiste, Leitwerk, Träger, Gondel, Fahrwerk, Kabel. */
function gustLoad(P, pf, m, foil, rho) {
  const W = m * G, WS = W / pf.S, AR = pf.AR, a = 2 * Math.PI * AR / (AR + 2 * (AR + 4) / (AR + 2));
  const mu = 2 * WS / (rho * pf.mac * a * G), Kg = 0.88 * mu / (5.3 + mu), V = P.vGust;
  const dn = rho * P.gustU * V * a * Kg / (2 * WS);
  const nStall = 0.5 * rho * V * V * pf.S * (foil.clmax || 1.3) / W;
  return { dn, nStall, n: 1 + Math.min(dn, Math.max(0, nStall - 1)), Kg, a };
}
function structureMass(C, m, detail) {
  const P = C.P, pf = C.pf, b = pf.b, h2 = b / 2, t = C.foil.t, tg = C.tail, rho0 = 1.225, g = C.bal ? C.bal.g : C.g0;
  const wl = C.bal && C.bal.mi && C.bal.mi.harness ? C.bal.mi.harness.wingLin : null;
  const gust = gustLoad(P, pf, m, { clmax: C.clmaxRef }, rho0);
  const nLim = Math.max(P.nLimit, gust.n), nUlt = P.safety * nLim;
  const cap = MAT[P.matCap] || MAT.cfk_ud, web = MAT[P.matWeb] || MAT.balsa_gfk;
  const sig = cap.sc * P.matKnock / 100 * 1e6, E = cap.E * 1e9, rhoC = cap.rho;
  const cosL = Math.cos((pf.sweep || 0) * DEG), K = 40, dy = h2 / K, ds = dy / cosL;
  // Massen im Flügel, die die Biegung entlasten (Solarmodule, ggf. Akku, Leitungen im Flügel)
  const mSolarWing = C.mass.solar, mBattWing = P.battInWing ? C.mass.batt : 0;
  const y = [], c = [], h = [], w = [];
  for (let k = 0; k < K; k++) {
    const eta = (k + 0.5) / K, ck = pf.chordAt(eta);
    const L = nUlt * m * G / b * (ck / pf.cmean + 4 / Math.PI * Math.sqrt(1 - eta * eta)) / 2;
    const rel = nUlt * G * (mSolarWing * ck / pf.S + (eta < 0.6 ? mBattWing / (0.6 * b) : 0) + (wl ? wl(eta * h2) : 0));
    y.push(eta * h2); c.push(ck); h.push(P.sparH / 100 * t * ck); w.push(L - rel);
  }
  // Querkraft und Biegemoment von der Spitze her, Hebel entlang der gepfeilten Holmachse
  const Q = new Array(K).fill(0), M = new Array(K).fill(0);
  let q = 0, mm = 0;
  for (let k = K - 1; k >= 0; k--) { q += w[k] * dy; mm += q * ds; Q[k] = q; M[k] = Math.max(0, mm); }
  const tube = P.sparType === 'tube';
  let A = M.map((Mk, k) => Math.max(tube ? 4 * Mk / (sig * h[k]) : 2 * Mk / (sig * h[k]), (tube ? Math.PI * h[k] * 0.0005 : 2 * P.capMin * 1e-6)));
  // Steifigkeit: Durchbiegung bei 1 g
  const defl = AA => {
    let th = 0, d = 0;
    for (let k = 0; k < K; k++) {
      const I = tube ? AA[k] * h[k] * h[k] / 8 : AA[k] * h[k] * h[k] / 4;
      const kap = M[k] / nUlt / (E * I); th += kap * ds; d += th * ds;
    }
    return d * cosL;
  };
  const dTip = defl(A), dMax = P.deflMax / 100 * h2;
  let stiffF = 1;
  if (dTip > dMax) { stiffF = dTip / dMax; A = A.map(a => a * stiffF); }
  // Massen je Meter Spannweite (eine Flügelhälfte)
  const wetWing = 2.04 * pf.S, cover = Math.max(0, wetWing - (C.solar ? C.solar.aMod : P.solarArea || 0)), ts = (web.ts || 30) * 1000;
  const sd = { y, c, h, A, M, Q, mCap: [], mWeb: [], mLE: [], mRib: [], mSkin: [], mTE: [] };
  for (let k = 0; k < K; k++) {
    sd.mCap.push(A[k] * rhoC / cosL * 1.12);                       // + Holmstummel, Verklebung
    sd.mWeb.push(tube ? 0 : Math.max(P.wWeb, Q[k] / (h[k] * ts)) * h[k] / cosL);
    sd.mLE.push(P.wLE * 0.62 * c[k] / cosL);
    sd.mRib.push(P.wRib * 0.68 * t * c[k] * c[k] * 0.55 / P.ribSpacing);
    sd.mSkin.push(P.wSkin * 2.04 * c[k] * cover / wetWing);
    sd.mTE.push(P.wTE / cosL);
  }
  const sum2 = a => 2 * a.reduce((s, v) => s + v * dy, 0);
  // Steckungen: Verbinder auf das Biegemoment an der Trennstelle ausgelegt, dazu Beschläge und Stecker
  const splitY = P.splits === 'none' ? [] : P.splits === 'center' ? [0] : P.splits === 'outer' ? [P.splitEta * h2] : [0, P.splitEta * h2];
  const joints = splitY.map(yj => {
    const k = Math.min(K - 1, Math.floor(yj / h2 * K)), Aj = 2 * M[k] / (sig * h[k]), mj = Aj * 24 * h[k] * rhoC * 1.3 + P.mJoint;
    return { y: yj, m: (yj > 0 ? 2 : 1) * mj, M: M[k], len: 24 * h[k] };
  });
  // Leitwerk, Träger bzw. Rumpfröhre, Seitenleitwerk mit Zusatzholm, Pylon (Lastfälle siehe tail.js)
  const tst = tailStructure(C, m, g), land = C.land || landingGear(C, m);
  const parts = {
    spar: sum2(sd.mCap), web: sum2(sd.mWeb), le: sum2(sd.mLE), ribs: sum2(sd.mRib), skin: sum2(sd.mSkin), te: sum2(sd.mTE),
    joints: joints.reduce((s, j) => s + j.m, 0),
    ht: P.wTail * tg.Sh,
    fin: tst.fin.base + tst.fin.extra,
    boom: tst.boom ? tst.boom.mass : 0,
    fus: P.wFus * g.fus.pod.S + P.mFusFix,
    cone: tst.cone ? tst.cone.mass : 0,
    land: land.mass,
    pylon: tst.pylon
  };
  let sum = 0; for (const k in parts) sum += parts[k];
  const total = sum * (1 + P.rugged / 100) * C.k.struct;
  if (!detail) return total;
  return { total, parts, rugged: sum * P.rugged / 100, nLim, nUlt, gust, dTip: dTip / stiffF, dMax, stiffF, Mroot: M[0], Qroot: Q[0], hRoot: h[0], stations: sd, joints, sig, E, cap, tail: tst, land };
}

/* ---------- Fallbeschreibung: alles, was nicht von der Tageszeit abhängt ---------- */
const ONE = { prof: 1, par: 1, ind: 1, eta: 1, struct: 1, batt: 1, solar: 1, comp: 1 };
const llCache = new Map();
function compSummary(comps) {
  let m = 0, cda = 0; const byGroup = {};
  for (const c of comps) if (c.on) { m += c.m / 1000; cda += (c.cda || 0) / 1e4; byGroup[c.group] = (byGroup[c.group] || 0) + c.m / 1000; }
  return { m, cda, byGroup };
}
function buildCase(P, comps, k) {
  const C = { P, comps, k: { ...ONE, ...(k || {}) } };
  C.pf = planform(P);
  C.foil = foilByKey(P.airfoil); C.mode = P.transition === 'trip' ? 'trip' : 'free';
  C.tfoil = foilByKey(P.tailAirfoil);
  C.cfg = configOf(P);
  C.tail = tailGeom(P, C.pf, C.cfg);
  // Flugzustand Reiseflug: Dichte bei mittlerer Tagestemperatur in Flughöhe
  const hFly = P.alt + P.hAGL, tFly = (P.tMax + P.tMin) / 2 - 0.0065 * P.hAGL;
  C.hFly = hFly; C.tFly = tFly; C.rho = rhoAt(hFly, tFly); C.nu = nuAt(hFly, tFly);
  const Recr = P.v * C.pf.mac / C.nu, meta = foilMeta(C.foil, C.mode, Recr);
  C.clmaxRef = meta.clmax;
  const a0 = clamp(meta.slope, 5.2, 7.0);
  const lk = [P.span, P.area, P.planform, P.taper, P.centerFrac, P.washout, P.sweep, a0.toFixed(2)].join('|');
  C.ll = llCache.get(lk); if (!C.ll) { C.ll = vlmWing(C.pf, a0); if (llCache.size > 300) llCache.clear(); llCache.set(lk, C.ll); }
  const cs = compSummary(comps);
  C.compCdA = cs.cda;
  C.motor = MOTOR_POS[C.cfg.mot];
  C.g0 = geomPositions(C, 0);
  // Solarzellen als ganze Rechteckzellen auf Flügel und Höhenleitwerk (solar.js)
  C.solar = solarLayout(P, C);
  C.solarEta = C.solar.eta; C.solarSpan = Math.max(0.05, C.solarEta * C.pf.b); C.solarFits = C.solar.fits;
  C.htSolarArea = C.solar.ht.a;
  C.mass = { batt: Math.max(0, P.mBatt), solar: C.solar.aMod * P.solarAreal, solarHT: C.solar.ht.aMod * P.solarAreal, prop: P.mAntrieb, comps: cs.m, byGroup: cs.byGroup, ballast: 0, wire: 0 };
  const mFix = C.mass.batt + C.mass.solar + C.mass.solarHT + C.mass.prop + C.mass.comps;
  let m = mFix + (P.structMode === 'fix' ? P.mZelle : 2), ms = P.mZelle;
  const massLoop = () => {
    for (let it = 0; it < 60; it++) {
      C.m = m;
      C.land = landingGear(C, m);
      if (P.structMode === 'fix') { ms = P.mZelle * C.k.struct; C.struct = null; }
      else { C.struct = structureMass(C, m, true); ms = C.struct.total; }
      C.mass.struct = ms;
      C.bal = balance(C);
      const mn = mFix + ms + C.bal.ballast + C.bal.mWire;
      if (Math.abs(mn - m) < 1e-6) { m = mn; break; }
      m = mn;
    }
    C.mass.ballast = C.bal.ballast; C.mass.wire = C.bal.mWire; C.m = m; C.harness = C.bal.mi.harness;
    C.np = C.bal.np;
  };
  C.pw = null; C.slip = null; C.lvl = null; C.lvl0 = null;
  massLoop();
  // Antriebseinflüsse im Reiseflug (Schub = Widerstand), dann Schwerpunkt und Massen mit Strahl und Normalkraft neu
  C.lvl0 = flightPower(C, P.v, 1, C.rho, C.nu);
  C.pw = powerEffects(C, C.lvl0.Dtot, P.v, C.rho, 0, C.lvl0.CL); C.slip = C.pw.sg;
  massLoop();
  C.npOff = neutralPoint(C, C.bal.g, { off: true });
  C.layout = { g: C.bal.g, wingPoints: wingPointMasses(C) };
  // Reiseflug gerade und im Kurvenflug
  const nT = 1 / Math.cos(clamp(P.bank, 0, 60) * DEG);
  C.lvl = flightPower(C, P.v, 1, C.rho, C.nu);
  C.pw = powerEffects(C, C.lvl.Dtot, P.v, C.rho, 0, C.lvl.CL); C.slip = C.pw.sg;
  C.turn = flightPower(C, P.v, nT, C.rho, C.nu);
  C.nTurn = nT;
  const f = clamp(P.turnFrac / 100, 0, 1);
  let pProp = (1 - f) * C.lvl.pel + f * C.turn.pel;
  if (P.powerModel === 'mess') pProp = P.pMeas * Math.pow(m / P.mMeas, 1.5) * Math.sqrt(P.rhoMeas / C.rho);
  else if (P.powerModel === 'fit' && P.fitA > 0) {
    const pv = (n) => P.fitA * (C.rho / P.fitRho) * P.v ** 3 + P.fitB * (m * n / P.fitM) ** 2 * (P.fitRho / C.rho) / P.v;
    pProp = (1 - f) * pv(1) + f * pv(nT);
  }
  C.pProp = pProp * (1 + P.zuschlag / 100);
  C.pTurn0 = C.lvl.pel;
  // Mindestgeschwindigkeit
  const s1 = stallSpeed(C, 1);
  C.vs = s1.vs; C.CLmaxW = s1.CLmax; C.stallEta = s1.eta; C.vsTurn = s1.vs * Math.sqrt(nT);
  // Akku
  const tMinFly = P.tMin - 0.0065 * P.hAGL, tBatt = tMinFly + P.battHeat;
  C.tBattMin = tBatt;
  C.fBattT = clamp(1 - P.battTempCoef / 100 * Math.max(0, 20 - tBatt), 0.3, 1);
  C.cap = Math.max(0, P.mBatt * P.battSpec * P.battHealth / 100 * C.fBattT * C.k.batt);
  // Solar: Wirkungsgradkette ohne Geometrie und Temperatur
  C.solK = C.solar.a * P.cellEff / 100 * C.k.solar *
    (P.solarGeom === 'flach' ? P.camberEta / 100 : 1) * P.mpptEff / 100 * (1 - P.laminateLoss / 100) * (1 - P.wiringLoss / 100) * (1 - P.soiling / 100);
  C.sol = solarGeometry(P, C);
  C.solKW = C.solK; C.solKH = 0;
  // Zellen auf dem Höhenleitwerk: waagerecht, Schatten des Seitenleitwerks über alle Kurse gemittelt.
  // Wird mit dem Flügel zu einer gemeinsamen Wirkungskette zusammengefasst (gleiche Temperaturkorrektur).
  if (C.htSolarArea > 0) {
    const kH = C.htSolarArea * P.cellEff / 100 * C.k.solar * P.mpptEff / 100 * (1 - P.laminateLoss / 100) * (1 - P.wiringLoss / 100) * (1 - P.soiling / 100);
    const kW = C.solK, kT = kW + kH, s0 = C.sol, Fb = new Float64Array(91), FbH = new Float64Array(91);
    for (let j = 0; j <= 90; j++) { FbH[j] = Math.sin(j * DEG) * (1 - finShade(C.tail, j, C.cfg)); Fb[j] = (kW * s0.Fb[j] + kH * FbH[j]) / kT; }
    C.sol = { ...s0, Fb, Fd: (kW * s0.Fd + kH * 0.97) / kT, Fg: kW * s0.Fg / kT, FbW: s0.Fb, FbH };
    C.solKH = kH; C.solK = kT;
  }
  // Komponentenleistung nach Zeitplan
  C.comp = { always: 0, day: 0, night: 0, mission: 0 };
  for (const c of comps) if (c.on) C.comp[c.sched || 'always'] += c.p * c.d / 100 * C.k.comp;
  return C;
}
function stallSpeed(C, n) {
  let V = 8, r = { CLmax: 1.2 };
  for (let i = 0; i < 4; i++) { r = wingClmax(C, V, C.nu); V = Math.sqrt(2 * n * C.m * G / (C.rho * C.pf.S * Math.max(0.3, r.CLmax))); }
  return { vs: V, CLmax: r.CLmax, eta: r.eta };
}
// Leistungskurve P(V) und Kennfluggeschwindigkeiten
function powerCurve(C, vFrom, vTo, n = 1) {
  const pts = [], a = Math.max(vFrom || C.vs * 1.02, 3), bnd = Math.max(a + 1, vTo || C.P.vmax);
  let minP = { pel: Infinity }, maxLD = { LD: 0 };
  for (let i = 0; i <= 60; i++) {
    const V = a + (bnd - a) * i / 60, r = flightPower(C, V, n, C.rho, C.nu);
    pts.push(r);
    if (!r.stall && r.pel < minP.pel) minP = r;
    if (!r.stall && r.LD > maxLD.LD) maxLD = r;
  }
  return { pts, minP, maxLD };
}

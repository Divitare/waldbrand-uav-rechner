/* ===================================================================
   Schwingungen und Flattern des ganzen Flugzeugs
   - Freies Flugzeug (wie im Standschwingversuch an weicher Aufhängung):
     Halbflügel als Biege-Torsions-Balken, Rumpf samt Leitwerk als
     Starrkörper an der Wurzel. Symmetrisch: Hub und Nicken frei,
     antimetrisch: Rollen frei. Punktmassen im Flügel: Querruderservos,
     Verbraucher an der Spitze, äußere Steckungen.
   - Freiflug-Flattern (Body-Freedom-Flattern): symmetrisches Modell mit
     Höhenleitwerk (quasistationär, Abwind mit Laufzeit l_t/V, Etkin & Reid
     1996, Kap. 5) und Rumpfmoment; Flügel nach Theodorsen mit der Steigung
     des Gesamtflügels (modifizierte Streifentheorie, Yates 1966). Liefert
     nebenbei die Anstellwinkelschwingung als Gegenprobe zur Flugdynamik.
   - Seitenleitwerk als Balken auf dem nachgiebigen Träger: Querbiegung des
     Trägers (Hub und Gieren der Wurzel) und Torsion (Rollen), Motor bzw.
     T-Höhenleitwerk an der Spitze. Höhenleitwerk auf der Vertikalbiegung
     des Trägers. Leitwerke mit modifizierter Streifentheorie.
   - Ruder als zusätzliche Koordinate mit Theodorsens T-Funktionen (NACA
     Report 496), Lagerung am Servo als Drehfeder; untersucht von null
     (Spiel, Servoausfall) bis 1,5 × Nennsteifigkeit (AC 23.629-1B).
   - Nachweis flatterfrei bis 1,2 × V_D mit Strukturdämpfung g = 0,03
     (AC 23.629-1B; ASTM F3093-21, 4.3). V_D ist hier V_max.
   - Standschwingversuch: gemessene Frequenzen eichen Biege- und
     Torsionssteifigkeit von Flügel und Leitwerksträger, k = (f_Messung/f_Modell)².
   - Report 45 (CAA/FAA 1955): Torsionsnachgiebigkeit des Flügels
     F = ∫ θ c² ds ≤ 200/V_D² (mph, lb, ft) nur zur Orientierung.
   =================================================================== */
const VIB_G = 0.03, VIB_ZETA = VIB_G / 2;
// Ruderdrehfrequenz relativ zum Nennwert: Betrieb 0,5- bis 1,5-fach (Streuung, Verschleiß), Ausfall bzw. Spiel: frei (0)
const CTRL_FB = [0.5, 1, 1.5];
// Punktmassen im Halbflügel (eine Seite): Querruderservos, Verbraucher außen, äußere Steckungen
function wingPointMasses(C, g) {
  g = g || C.bal.g;
  const P = C.P, pf = C.pf, h = pf.b / 2, fea = P.xSpar / 100 - 0.04, kR = 1 + P.rugged / 100, out = [];
  const xLEy = y => g.xLE0 + pf.xLE(y / h), xea = y => xLEy(y) + fea * pf.chordAt(y / h);
  const sv = C.comps.find(c => c.id === 'servo' && c.on);
  if (sv && sv.m > 0) {
    const L = servoLayout(C, g), mm = sv.m / 1000 / L.length;
    for (const o of L) if (o.kind === 'ail' && o.y > 0) out.push({ key: 'servo', y: o.y, yI: o.y, m: mm, x: o.x, z: o.z, dx: o.x - xea(o.y), J: mm * 4e-4 });
  }
  for (const c of C.comps) if (c.on && c.id !== 'servo' && c.m > 0 && Math.abs(c.y || 0) > 0.3) {
    const y = Math.min(h, Math.abs(c.y)), x = c.x ?? xea(y);
    out.push({ key: c.id, y, yI: Math.abs(c.y), m: c.m / 2000, x, z: c.z ?? zWingAt(g, y), dx: x - xea(y), J: 0 });
  }
  const st = C.struct;
  if (st && st.joints) for (const j of st.joints) if (j.y > 0.01) {
    const c = pf.chordAt(j.y / h);
    out.push({ key: 'joint', y: j.y, yI: j.y, m: j.m * kR / 2, x: xLEy(j.y) + P.xSpar / 100 * c, z: zWingAt(g, j.y), dx: 0.04 * c, J: 0 });
  }
  return out;
}
// Masse und Momente des Flügelbalkens (beide Hälften) samt Punktmassen
function wingBeamMass(C, sec, pts) {
  const pf = C.pf, g = C.bal.g, h = pf.b / 2, dy = h / sec.length, r = { m: 0, mx: 0, mx2: 0, my2: 0, mz: 0, mz2: 0 };
  const acc = (mm, x, y, z) => { r.m += mm; r.mx += mm * x; r.mx2 += mm * x * x; r.my2 += mm * y * y; r.mz += mm * z; r.mz2 += mm * z * z; };
  for (const s of sec) acc(2 * s.m * dy, g.xLE0 + pf.xLE(s.y / h) + s.xcg * s.c, s.y, zWingAt(g, s.y));
  for (const p of pts) acc(2 * p.m, p.x, p.yI ?? p.y, p.z);
  return r;
}
// Rumpf mit Leitwerk als Starrkörper: alle Massen außer Flügelbalken und Flügelpunktmassen.
// Nickträgheit um den eigenen Schwerpunkt, Rollträgheit um die Achse in der Flügelebene.
function fuselageRigid(C, sec, pts) {
  const g = C.bal.g, mi = C.bal.mi, w = wingBeamMass(C, sec, pts);
  let M = 0, Mx = 0, Mz = 0, Sxx = 0, Syy = 0, Szz = 0, Ix0 = 0, Iy0 = 0;
  for (const it of mi.items) { M += it.m; Mx += it.m * it.x; Mz += it.m * it.z; Sxx += it.Sxx; Syy += it.Syy; Szz += it.Szz; Ix0 += it.Ixx0; Iy0 += it.Iyy0; }
  const mF = Math.max(0.05 * M, M - w.m), xF = (Mx - w.mx) / mF, zF = (Mz - w.mz) / mF;
  const SxxF = Math.max(0, Sxx - w.mx2), SyyF = Math.max(0, Syy - w.my2), SzzF = Math.max(0, Szz - w.mz2);
  const Iyy = Math.max(1e-4, SxxF - mF * xF * xF + SzzF - mF * zF * zF + Iy0);
  const Ixx = Math.max(1e-4, SyyF + SzzF - 2 * g.zw * (Mz - w.mz) + mF * g.zw * g.zw + Ix0);
  return { mF, xF, zF, Iyy, Ixx, mW: w.m, M };
}
const calibSections = (sec, kEI, kGJ) => sec.map(s => ({ ...s, EI: s.EI * kEI, GJ: s.GJ * kGJ }));
function wingA2d(C) { return clamp(foilMeta(C.foil, C.mode, C.P.v * C.pf.mac / C.nu).slope, 5.2, 7.0); }
// Flügel an der Gondel eingespannt (für Flügel- und Querruderflattern), mit Zusatzpunktmassen
function wingClamped(C, k = {}, extra = []) {
  const pf = C.pf, cosL = Math.cos(pf.sweep * DEG), tanL = Math.tan(pf.sweep * DEG), L = pf.b / 2 / cosL;
  const sec = calibSections(wingSections(C), k.kEI || 1, k.kGJ || 1), pts = (C.layout && C.layout.wingPoints) || wingPointMasses(C);
  const bm = beamModel(sec, L, k.nEl || 12, cosL, tanL, wingA2d(C), 0.25, [...pts, ...extra]);
  return { bm, modes: beamModes(bm, 6), sec };
}
// Report 45: Torsionsnachgiebigkeit F = ∫ θ(s)·c(s)² ds, θ = Verdrehung je Einheitsmoment an der Stelle s
function wingTorsionFactor(C, sec) {
  const pf = C.pf, h = pf.b / 2, ds = h / sec.length / Math.cos(pf.sweep * DEG);
  let th = 0, F = 0;
  for (const s of sec) { const tm = th + 0.5 * ds / s.GJ; F += tm * s.c * s.c * ds; th += ds / s.GJ; }
  const Flim = 200 / (C.P.vmax * 2.23694) ** 2 * (0.3048 ** 2 / 4.44822);   // 200/V_D² in rad·ft²/lb (V_D in mph) → rad·m²/N
  return { F, Flim, ratio: F / Flim };
}
// Freie Eigenformen (symmetrisch und antimetrisch) mit Rumpf als Starrkörper
function freeModes(C, opt = {}) {
  const pf = C.pf, g = C.bal.g, cosL = Math.cos(pf.sweep * DEG), tanL = Math.tan(pf.sweep * DEG), L = pf.b / 2 / cosL;
  const sec = calibSections(wingSections(C), opt.kEI || 1, opt.kGJ || 1), pts = (C.layout && C.layout.wingPoints) || wingPointMasses(C), fr = fuselageRigid(C, sec, pts);
  const a2d = wingA2d(C), xea0 = g.xLE0 + sec[0].xea * sec[0].c, nEl = opt.nEl || 12;
  const bS = beamModel(sec, L, nEl, cosL, tanL, a2d, 0.25, [...pts, { y: 0, m: fr.mF / 2, dx: fr.xF - xea0, J: fr.Iyy / 2 }], { bc: 'sym' });
  const bA = beamModel(sec, L, nEl, cosL, tanL, a2d, 0.25, [...pts, { y: 0, m: 0, dx: 0, J: 0, Jb: fr.Ixx / 2 }], { bc: 'anti' });
  return { sym: beamModes(bS, 7), anti: beamModes(bA, 6), bS, bA, fr, sec, pts, xea0, a2d };
}
// Freiflug-Flattern: symmetrisches freies Modell mit Höhenleitwerk und Rumpfmoment.
// Abwind mit Laufzeit: ε(t) = dε/dα·α_F(t − l_t/V), α_F = Θ − ẇ₀/V, daraus
// α_H = (1 − dε/dα)·(Θ − ẇ₀/V) + (1 + dε/dα)·l_t·Θ̇/V − dε/dα·l_t·ẅ₀/V²; Leitwerkskraft am Punkt w_H = w₀ − l_t·Θ
function bodyFreedom(C, fm, opt = {}) {
  const np = C.np, pf = C.pf, g = C.bal.g, tg = C.tail, bm0 = fm.bS, P = C.P;
  const bm = { ...bm0, a2d: np.aw / bm0.cosL ** 2 };                 // Streifen auf die Steigung des Gesamtflügels
  const modes = fm.sym.slice(0, 6), iW = bm.rootIdx[0], iT = bm.rootIdx[2], lt = g.xact - fm.xea0, de = np.deda;
  const fx = C.struct && C.struct.tail && C.struct.tail.flex;
  const extraFor = modes => (V, rho) => {
    const nq = modes.length, Ca = zeros(nq, nq), Ka = zeros(nq, nq), Ma = zeros(nq, nq), q = 0.5 * rho * V * V;
    const kF = fx ? 1 / (1 + q * np.etaT * tg.Sh / fx.nb * np.at * fx.H) : 1, Kt = q * np.etaT * kF * tg.Sh * np.at / 2, Kf = q * pf.S / 2 * pf.mac * np.Cmaf;
    for (let r = 0; r < nq; r++) {
      const pr = modes[r].phi, Wr = pr[iW] - lt * pr[iT];
      for (let k = 0; k < nq; k++) {
        const pk = modes[k].phi;
        // Rumpfmoment hängt vom Anstellwinkel α = Θ − ẇ₀/V ab (nicht von der Fluglage)
        Ka[r][k] += Kt * Wr * (1 - de) * pk[iT] + Kf * pr[iT] * pk[iT];
        Ca[r][k] += (Kt * Wr * (-(1 - de) * pk[iW] + (1 + de) * lt * pk[iT]) - Kf * pr[iT] * pk[iW]) / V;
        Ma[r][k] -= Kt * Wr * de * lt * pk[iW] / (V * V);
      }
    }
    return { Ca, Kaa: Ka, Ma };
  };
  const o = { extra: extraFor(modes), wmin: 0.3 };
  const fl = flutterSearch(bm, modes, C.rho, opt.vMax || Math.max(2.6 * P.vmax, 60), VIB_ZETA, opt.nStep || 30, [], o);
  // Anstellwinkelschwingung im Reiseflug: tiefste schwingende Wurzel, starr (nur Hub und Nicken) und elastisch
  const spOf = ms => { const r0 = flutterRoots(bm, ms, P.v, C.rho, VIB_ZETA, [], ms === modes ? o : { ...o, extra: extraFor(ms) }), z = r0.length ? r0[0] : null; return z ? { wn: Math.hypot(z.re, z.im), zeta: -z.re / Math.hypot(z.re, z.im), f: z.im / (2 * Math.PI) } : null; };
  const sp = spOf(modes), spRigid = spOf(modes.filter(m => m.rigid));
  // Abstand zur ersten symmetrischen Biegung (für die Anzeige)
  const b1 = fm.sym.find(m => !m.rigid);
  return { vf: fl.vf, wf: fl.wf, sp, spRigid, ratio: sp && b1 ? b1.omega / sp.wn : NaN, lt, track: fl.track };
}
// Ruder je Meter Spannweite: Masse, statisches Moment und Trägheit um die Drehachse; Ausgleichsmasse 0,25·c_R vor der Achse
function ctrlProps(P, cF, bal) {
  const xr = clamp(P.ctrlXcg / 100, 0.1, 0.8), mb0 = Math.max(1e-4, P.wCtrl * cF), xb0 = xr * cF, Ib0 = mb0 * cF * cF * (xr * xr + 0.07), d = 0.25 * cF;
  const mBal = Math.max(0, bal) * mb0 * xb0 / d;
  return { mb: mb0 + mBal, Sb: mb0 * xb0 - mBal * d, Ib: Ib0 + mBal * d * d, mBal, mb0, xb0, d, S0: mb0 * xb0, Ib0, cF };
}
// Ruderdrehfrequenz am Servo: f = √(k / I)/(2π), I = Trägheit des vom Servo gehaltenen Ruders um die Drehachse; Messwert geht vor
function ctrlFreq(P, cp, spanServo, fMeas) {
  const I = cp.Ib * spanServo, f = Math.sqrt(Math.max(1e-6, P.kServo) / Math.max(1e-9, I)) / (2 * Math.PI);
  return fMeas > 0 ? { f: fMeas, fCalc: f, I, measured: true } : { f, fCalc: f, I, measured: false };
}
// Ausgleichsmasse als Punktmassen am Balken (drei Stellen über die Ruderspannweite)
function balancePoints(cp, y0, y1, dxAt, n = 3) {
  if (!(cp.mBal > 0)) return [];
  const out = []; for (let k = 0; k < n; k++) { const y = y0 + (y1 - y0) * (k + 0.5) / n; out.push({ key: 'bal', y, m: cp.mBal * (y1 - y0) / n, dx: dxAt(y) - cp.d, J: 0 }); }
  return out;
}
// Ruderfall: kleinste Flattergeschwindigkeit über die Lagersteifigkeit und nötiger Massenausgleich.
// Betrieb (Servo intakt, 0,5–1,5 × Nennfrequenz): flatterfrei bis 1,2·V_D. Ausfall bzw. Spiel (Ruder frei):
// flatterfrei bis V_D (sinngemäß CS/FAR 25.629(b)(2) für Fehlerfälle).
// make(bal) liefert { bm, modes, cs(fb) } für einen Ausgleichsgrad; sV: Geschwindigkeitsfaktor im Propellerstrahl
function ctrlCase(make, fNom, rho, vD, vMax, sV = 1, opt = {}) {
  const P0 = make(opt.bal), vReq = 1.2 * vD;
  const search = (M, fb) => { const r = flutterSearch(M.bm, M.modes, rho, vMax * sV, VIB_ZETA, opt.nStep || 24, [M.cs(fb)]); return { vf: r.vf ? r.vf / sV : null, wf: r.wf, fb }; };
  let op = { vf: null, fb: NaN };
  for (const k of CTRL_FB) { const r = search(P0, k * fNom); if (r.vf && (!op.vf || r.vf < op.vf)) op = r; }
  const free = search(P0, 0);
  // nötiger Ausgleich (Anteil des statischen Moments) für Betrieb bzw. Ausfall
  const need = (fbs, vR) => {
    const okAt = b => { const M = make(b); return fbs.every(fb => flutterFreeTo(M.bm, M.modes, rho, vR * sV, VIB_ZETA, [M.cs(fb)], {}, 12)); };
    if (okAt(0)) return 0; if (!okAt(1.5)) return Infinity;
    let lo = 0, hi = 1.5; for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (okAt(m)) hi = m; else lo = m; } return hi;
  };
  const needOp = need(CTRL_FB.map(k => k * fNom), vReq), needFree = need([0], vD);
  // Halter des Ausgleichsgewichts: 1,5 × höchste beteiligte Frequenz (Flatterfrequenzen und die zwei tiefsten Formen)
  const fMax = Math.max(...P0.modes.slice(0, 2).map(m => m.f), (free.wf || 0) / (2 * Math.PI), (op.wf || 0) / (2 * Math.PI));
  return { vf: op.vf, wf: op.wf, fbCrit: op.fb, free, needOp, needFree, need: Math.max(needOp, needFree), cp: P0.cp, fMax, sV, modes: P0.modes, okOp: !(op.vf && op.vf < vReq), okFree: !(free.vf && free.vf < vD) };
}
// Querruder am eingespannten Flügel
function aileronCase(C, k, vD, vMax) {
  const P = C.P, pf = C.pf, h = pf.b / 2, E = clamp(P.ailCf, 0.05, 0.6), e0 = clamp(P.ailEta0, 0.1, 0.95), e1 = clamp(P.ailEta1, e0 + 0.02, 1), fea = P.xSpar / 100 - 0.04;
  const cF = pf.chordAt((e0 + e1) / 2) * E, nSeg = Math.max(1, Math.round(P.nAilSeg || 1)), spanServo = (e1 - e0) * h / nSeg;
  const make = bal => {
    const cp = ctrlProps(P, cF, bal ?? P.ctrlBal / 100);
    const W = wingClamped(C, { ...k, nEl: 10 }, balancePoints(cp, e0 * h, e1 * h, y => (1 - E - fea) * pf.chordAt(y / h)));
    return { bm: W.bm, modes: W.modes.slice(0, 4), cp, cs: fb => ({ y0: e0 * h, y1: e1 * h, c: 1 - 2 * E, Sb: cp.Sb, Ib: cp.Ib, wb: 2 * Math.PI * fb, zb: VIB_ZETA }) };
  };
  const fNom = ctrlFreq(P, ctrlProps(P, cF, P.ctrlBal / 100), spanServo, P.gvtAil);
  return { ...ctrlCase(make, fNom.f, C.rho, vD, vMax), E, cF, span: (e1 - e0) * h, fNom };
}
// Leitwerksträger bzw. Rumpfröhre als Federn an der Leitwerkswurzel in [w, w', θ] (Hub, Rollen, Drehung um die Flächenachse),
// verschoben auf die elastische Achse der Fläche bei x_ea: w_Träger = w + d·θ, d = x_ea − x_Trägerende
function boomSprings(C, plane, xea, kB = 1) {
  const P = C.P, ts = C.struct && C.struct.tail, g = C.bal.g, tg = C.tail, cf = C.cfg;
  let L, EI, GJ, mL, J, nb = 1, xb, kind;
  if (ts && ts.boom && cf.nBoom) {
    L = g.lBoom; EI = ts.boom.EI * kB; GJ = ts.boom.GJ * kB; const mB = ts.boom.lin * L; mL = 0.2357 * mB; J = mB * ts.boom.r ** 2 / 3; nb = Math.max(1, cf.nBoom); xb = g.boom1; kind = 'Träger';
  } else {
    // Seglerrumpf: gleichwertiger Kragarm aus der Nachgiebigkeit der Röhre (tail.js: θ/F = ∫ (x_L − x)/EI dx)
    const fx = ts && ts.flex, x0 = g.fus.L1 || P.fusL, xL = plane === 'l' ? g.xvLE + 0.25 * tg.cv + g.vSw * 0.42 * tg.bv : g.xact;
    L = Math.max(0.2, xL - x0); const flex = fx ? (plane === 'l' ? fx.V : fx.H) : L * L / 4000;
    EI = L * L / (2 * flex) * kB; const r = Math.max(0.01, (P.coneD + P.fusD) / 4), t = (ts && ts.cone ? ts.cone.wEff : P.wCone) / SHELL_QI.rho;
    GJ = SHELL_QI.G * 1e9 * 2 * Math.PI * r ** 3 * t * kB; const mC = ts && ts.cone ? ts.cone.mass : 0.2; mL = 0.2357 * mC; J = mC * r * r / 3; xb = xL; kind = 'Rumpfröhre';
  }
  const Kb = [[12 * EI / L ** 3, 0, 6 * EI / L ** 2], [0, GJ / L, 0], [6 * EI / L ** 2, 0, 4 * EI / L]], d = xea - xb;
  // K_w = Tᵀ·K_b·T mit T = [[1,0,d],[0,1,0],[0,0,1]]
  const T = [[1, 0, d], [0, 1, 0], [0, 0, 1]], K = matMul(transpose(T), matMul(Kb, T));
  return { K, Kb, mLump: mL, Jlump: J, nb, L, EI, GJ, xb, d, kind };
}
// Leitwerksfläche als Balken: Torsion nach Bredt aus den Deckhäuten, Biegung aus den Häuten als Gurte, dazu Zusatzholm
function tailSections(C, span, c0, taper, extraLin, extraEI) {
  const P = C.P, skin = MAT[P.matSkin] || MAT.foam_cfk, tc = C.tfoil ? C.tfoil.t : 0.1, kR = 1 + P.rugged / 100, ws = 0.2 * P.wTail, out = [], N = 8;
  for (let i = 0; i <= N; i++) {
    const eta = i / N, c = c0 * (1 - (1 - taper) * eta), A = 0.68 * tc * c * c, per = 2.04 * c;
    const GJ = 4 * A * A * skin.gs * 1e6 * ws / per, EI = 2 * skin.es * 1e6 * ws * 0.6 * c * (0.4 * tc * c) ** 2 + (extraEI || 0);
    const m = P.wTail * c * kR + (extraLin || 0), xea = 0.35, xcg = 0.42, Ia = m * c * c * (1 / 12 + (xcg - xea) ** 2);
    out.push({ y: eta * span, c, EI, GJ, m, xcg, xea, Ia });
  }
  return out;
}
// Servomasse an einem Leitwerk (aus der Servoaufteilung)
function tailServoMass(C, kind) { const sv = C.comps.find(c => c.id === 'servo' && c.on); if (!sv) return 0; const L = servoLayout(C, C.bal.g); return sv.m / 1000 / L.length * L.filter(o => o.kind === kind).length; }
// Seitenleitwerk (Querschwingungen) auf dem Träger, mit Motor bzw. T-Höhenleitwerk an der Spitze
function finModel(C, opt = {}) {
  const P = C.P, tg = C.tail, g = C.bal.g, cf = C.cfg, kR = 1 + P.rugged / 100, ts = C.struct && C.struct.tail, fea = 0.35;
  const fi = ts && ts.fin && ts.fin.info, capM = MAT[P.matCap] || MAT.cfk_ud;
  const sec = tailSections(C, tg.bv, tg.cv, 0.62, fi ? 2 * capM.rho * fi.A : 0, fi ? fi.EI : 0);
  const tanL = g.vSw - fea * 0.38 * tg.cv / tg.bv, cosL = Math.cos(Math.atan(tanL)), L = tg.bv / cosL;
  const kAV = cf.fus === 'twin' ? 1.4 : cf.tail === 'T' ? 1.75 : 1.55, av = helmbold(kAV * P.arV, 2 * Math.PI * 0.9);
  const xeaR = g.xvLE + fea * tg.cv, xeaT = g.xvLE + g.vSw * tg.bv + fea * 0.62 * tg.cv, sp = boomSprings(C, 'l', xeaR, opt.kB || 1), nb = sp.nb;
  const mH = P.wTail * tg.Sh * kR + (C.mass.solarHT || 0), bhs = tg.bh / nb, xH = g.xhLE + 0.4 * tg.ch, pts = [];
  const ht = { key: 'ht', m: mH / nb, J: mH / nb * (bhs ** 2 + tg.ch ** 2) / 12, Jb: mH / nb * bhs ** 2 / 12 };
  pts.push(cf.tail === 'T' ? { ...ht, y: tg.bv, dx: xH - xeaT } : { ...ht, y: 0, dx: xH - xeaR });
  if (cf.mot === 'fin') { const mM = C.mass.prop; pts.push({ key: 'mot', y: tg.bv, m: mM, dx: g.xMot - xeaT, J: mM * 0.06 ** 2, Jb: mM * 0.03 ** 2 }); }
  pts.push({ key: 'boom', y: 0, m: sp.mLump, dx: sp.xb - xeaR, J: 0, Jb: sp.Jlump });
  const ms = tailServoMass(C, 'rud') / Math.max(1, tg.nFin); if (ms > 0) pts.push({ key: 'servo', y: 0.15 * tg.bv, m: ms, dx: -0.05 * tg.cv, J: 0 });
  if (opt.extra) pts.push(...opt.extra);
  const bm = beamModel(sec, L, 8, cosL, tanL, av, 0.25, pts, { bc: 'free', root: { K: sp.K } });
  return { bm, modes: beamModes(bm, 6), sec, sp, av, L, cosL, xeaR, xeaT, fea, pts };
}
// Höhenleitwerk (symmetrische Vertikalschwingungen) auf dem Träger; Halbmodell.
// Pendelhöhenruder: Drehung des Trägerendes als eigener Freiheitsgrad, Servo als Drehfeder zwischen Träger und Fläche.
function htModel(C, opt = {}) {
  const P = C.P, tg = C.tail, g = C.bal.g, cf = C.cfg, kR = 1 + P.rugged / 100, fea = 0.35, half = tg.bh / 2, all = P.elevCf >= 0.999;
  const sec = tailSections(C, half, tg.ch, 1, (C.mass.solarHT || 0) / tg.bh, 0), at = C.np ? C.np.at : 4.5, xeaR = g.xhLE + fea * tg.ch;
  const sp = boomSprings(C, 'v', xeaR, opt.kB || 1), nb = sp.nb, zR = g.zRoot;
  const mV = (C.struct ? C.struct.parts.fin : P.wTail * tg.Sv) * kR, xV = g.xvLE + 0.4 * tg.cv + g.vSw * 0.42 * tg.bv, zV = g.zV0 + 0.42 * tg.bv;
  // Massen am Trägerende (Halbmodell: halbe Masse); Lage dx hinter der Drehachse der Fläche, Höhe über der Trägerachse
  const tip = [['fin', mV, xV, zV], ['boom', nb * sp.mLump, sp.xb, zR]];
  if (cf.mot === 'fin') tip.push(['mot', C.mass.prop, g.xMot, g.zP]);
  const mse = tailServoMass(C, 'elev'); if (mse > 0) tip.push(['servo', mse, g.xhLE + 0.3 * tg.ch, g.zH]);
  const tipPts = tip.map(([key, m, x, z]) => ({ key, y: 0, m: m / 2, dx: x - xeaR, J: m / 2 * (z - zR) ** 2 }));
  const mH2 = (P.wTail * tg.Sh * kR + (C.mass.solarHT || 0)) / 2, Jt = cf.tail === 'T' ? mH2 * (g.zH - zR) ** 2 : 0;   // T-Leitwerk: Fläche über der Trägerachse
  const K = sp.K.map(r => r.map(v => v * nb / 2));   // Federn je Hälfte
  let bm;
  if (!all) {
    const pts = [...tipPts, ...(Jt ? [{ key: 'htz', y: 0, m: 0, dx: 0, J: Jt }] : []), ...(opt.extra || [])];
    bm = beamModel(sec, half, 6, 1, 0, at, 0.25, pts, { bc: 'sym', root: { K } });
  } else {
    // Freiheitsgrade [w, w', θ_Fläche, θ_Träger]; Federn des Trägers an (w, θ_Träger), Servo k_p zwischen θ_Fläche und θ_Träger
    const kp = P.gvtElev > 0 ? (() => { const dyS = half / (sec.length - 1), Ip = sec.reduce((s, q, i) => s + q.Ia * dyS * (i === 0 || i === sec.length - 1 ? 0.5 : 1), 0); return Ip * (2 * Math.PI * P.gvtElev) ** 2; })() : Math.max(1e-6, P.kServo / 2);
    const Kx = zeros(4, 4), Mx = zeros(4, 4);
    Kx[0][0] += K[0][0]; Kx[0][3] += K[0][2]; Kx[3][0] += K[2][0]; Kx[3][3] += K[2][2];
    Kx[2][2] += kp; Kx[3][3] += kp; Kx[2][3] -= kp; Kx[3][2] -= kp;
    for (const p of tipPts) { Mx[0][0] += p.m; Mx[0][3] -= p.m * p.dx; Mx[3][0] -= p.m * p.dx; Mx[3][3] += p.m * p.dx * p.dx + p.J; }
    Mx[3][3] += Jt;
    bm = beamModel(sec, half, 6, 1, 0, at, 0.25, opt.extra || [], { bc: 'sym', ext: { n: 1, K: Kx, M: Mx } });
  }
  return { bm, modes: beamModes(bm, 5), sec, sp, at, xeaR, fea, all };
}
// Staudruck im Propellerstrahl an den Leitwerken bei V_max und Vollgas (Geschwindigkeitsfaktor √(q_lokal/q))
function tailSlipFactor(C) {
  try {
    const P = C.P, V = P.vmax, T = propMaxThrust(C, V, C.rho).T, CL = 2 * C.m * G / (C.rho * V * V * C.pf.S), pw = powerEffects(C, T, V, C.rho, 0, CL);
    return { H: Math.sqrt(1 + pw.sg.fH * (pw.qrH - 1)), V: Math.sqrt(1 + pw.sg.fV * (pw.qrV - 1)), T };
  } catch (e) { return { H: 1, V: 1, T: NaN }; }
}
// Leitwerksfall: Seitenleitwerk mit Seitenruder ('fin') oder Höhenleitwerk mit Höhenruder ('ht')
function tailCase(C, which, kB, vD, vMax, sV) {
  const P = C.P, tg = C.tail, isFin = which === 'fin', E = clamp(isFin ? P.rudCf : P.elevCf, 0.05, 1);
  const base = isFin ? finModel(C, { kB }) : htModel(C, { kB });
  const modes0 = base.modes.filter(m => m.omega > 0).slice(0, 4);
  if (E >= 0.999) {   // Pendelruder: Fläche dreht am Servo, keine Ruderkoordinate
    const r = flutterSearch(base.bm, modes0, C.rho, vMax * sV, VIB_ZETA, 24), vf = r.vf ? r.vf / sV : null;
    return { vf, wf: r.wf, need: 0, needOp: 0, needFree: 0, all: true, modes: base.modes, M: base, sV, fMax: Math.max(...modes0.map(m => m.f)), okOp: !(vf && vf < 1.2 * vD), okFree: true, free: { vf: null } };
  }
  const span = isFin ? tg.bv : tg.bh / 2, cMean = isFin ? 0.81 * tg.cv : tg.ch, cF = E * cMean, fea = base.fea;
  const chord = y => (isFin ? tg.cv * (1 - 0.38 * y / span) : tg.ch);
  const make = bal => {
    const cp = ctrlProps(P, cF, bal ?? P.ctrlBal / 100), ex = balancePoints(cp, 0, span, y => (1 - E - fea) * chord(y));
    const M = ex.length ? (isFin ? finModel(C, { kB, extra: ex }) : htModel(C, { kB, extra: ex })) : base;
    return { bm: M.bm, modes: M.modes.filter(m => m.omega > 0).slice(0, 4), cp, cs: fb => ({ y0: 0, y1: 1e3, c: 1 - 2 * E, Sb: cp.Sb, Ib: cp.Ib, wb: 2 * Math.PI * fb, zb: VIB_ZETA }) };
  };
  // Ein Servo je Seitenruder bzw. für das ganze Höhenruder
  const fNom = ctrlFreq(P, ctrlProps(P, cF, P.ctrlBal / 100), isFin ? span : tg.bh, isFin ? P.gvtRud : P.gvtElev);
  return { ...ctrlCase(make, fNom.f, C.rho, vD, vMax, sV), E, cF, span, modes: base.modes, M: base, fNom };
}
// Eichung aus dem Standschwingversuch: Faktor k so, dass die Modellfrequenz die gemessene trifft (k ∝ f²)
function calibrate(fModel, fMeas, k0 = 1) { return fMeas > 0 && fModel > 0 ? k0 * (fMeas / fModel) ** 2 : k0; }
// Gesamtauswertung (rechenintensiv, für die Ansicht Struktur)
function vibAnalysis(C) {
  const P = C.P, vReq = 1.2 * P.vmax, vMax = Math.max(2.2 * vReq, 60), out = { vReq, vMax, g: VIB_G };
  // Flügel frei-frei, ggf. auf den Standschwingversuch geeicht
  let kEI = 1, kGJ = 1, fm = freeModes(C);
  out.free0 = { sym: fm.sym, anti: fm.anti };
  const b1Of = f => f.sym.find(m => !m.rigid && m.kind === 'Biegung'), t1Of = f => [...f.sym, ...f.anti].filter(m => !m.rigid && m.kind === 'Torsion').sort((a, b) => a.f - b.f)[0];
  for (let it = 0; it < 4 && (P.gvtB1 > 0 || P.gvtT1 > 0); it++) {
    const b1 = b1Of(fm), t1 = t1Of(fm);
    if (P.gvtB1 > 0 && b1) kEI = calibrate(b1.f, P.gvtB1, kEI);
    if (P.gvtT1 > 0 && t1) kGJ = calibrate(t1.f, P.gvtT1, kGJ);
    fm = freeModes(C, { kEI, kGJ });
  }
  out.free = fm; out.kEI = kEI; out.kGJ = kGJ; out.b1 = b1Of(fm); out.t1 = t1Of(fm);
  // Flügel eingespannt (geeicht): Biege-Torsions-Flattern, Report-45-Kennwert
  const W = wingClamped(C, { kEI, kGJ });
  out.wing = flutterSearch(W.bm, W.modes.slice(0, 4), C.rho, vMax, VIB_ZETA, 36);
  out.r45 = wingTorsionFactor(C, W.sec);
  // Freiflug-Flattern und Anstellwinkelschwingung
  out.bff = bodyFreedom(C, fm, { vMax });
  try { const fd = flightDynamics(C); out.spDyn = fd.lon.sp || null; } catch (e) { out.spDyn = null; }
  // Querruder
  out.ail = aileronCase(C, { kEI, kGJ }, P.vmax, vMax);
  // Leitwerk: Träger auf den Standschwingversuch geeicht
  const sl = tailSlipFactor(C); out.slip = sl;
  let kL = 1, kV = 1;
  if (P.gvtFin > 0) for (let it = 0; it < 3; it++) { const f1 = finModel(C, { kB: kL }).modes.find(m => m.omega > 0); kL = calibrate(f1 ? f1.f : 0, P.gvtFin, kL); }
  if (P.gvtHT > 0) for (let it = 0; it < 3; it++) { const f1 = htModel(C, { kB: kV }).modes.find(m => m.omega > 0); kV = calibrate(f1 ? f1.f : 0, P.gvtHT, kV); }
  out.kL = kL; out.kV = kV;
  out.fin = tailCase(C, 'fin', kL, P.vmax, vMax, sl.V);
  out.ht = tailCase(C, 'ht', kV, P.vmax, vMax, sl.H);
  // Zusammenfassung
  const cases = [
    { k: 'wing', name: 'Flügel (Biegung–Torsion)', vf: out.wing.vf },
    { k: 'bff', name: 'Freiflug (Anstellwinkel–Flügelbiegung)', vf: out.bff.vf },
    { k: 'ail', name: 'Querruder', vf: out.ail.vf, free: out.ail.free.vf },
    { k: 'fin', name: out.fin.all ? 'Seitenleitwerk (Pendelruder)' : 'Seitenleitwerk mit Seitenruder', vf: out.fin.vf, free: out.fin.free.vf },
    { k: 'ht', name: out.ht.all ? 'Höhenleitwerk (Pendelruder)' : 'Höhenleitwerk mit Höhenruder', vf: out.ht.vf, free: out.ht.free.vf }
  ];
  cases.forEach(c => { c.ok = !(c.vf && c.vf < vReq); c.okFree = !(c.free && c.free < P.vmax); });
  out.cases = cases; out.vfMin = cases.reduce((a, c) => (c.vf && (!a || c.vf < a) ? c.vf : a), null);
  out.ok = cases.every(c => c.ok); out.okFree = cases.every(c => c.okFree);
  return out;
}

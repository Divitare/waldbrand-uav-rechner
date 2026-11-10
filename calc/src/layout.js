/* ===================================================================
   Anordnung: Rumpfvarianten, Leitwerksform, drei Motoranordnungen,
   Lage aller Massen in Länge und Höhe, Schwerpunkt, Trägheitstensor,
   Neutralpunkt (Flügel aus Wirbelgitter, Leitwerk mit DATCOM-Abwind,
   Rumpf nach Raymer), Trimmung über Akku, Flügellage oder Ballast.
   Koordinaten: x vom Bug nach hinten, y zur rechten Flügelspitze,
   z nach oben; Ursprung Bugspitze auf der Rumpfachse (m).
   =================================================================== */
const FUS_TYPES = {
  pod: { name: 'Gondel mit Rohrträger', short: 'Gondel + Rohr', nBoom: 1, nFin: 1, note: 'Kurze, dicke Gondel für Akku und Nutzlast, dünnes CFK-Rohr zum Leitwerk. Leicht, einfach zu bauen und zu zerlegen; Rohr und Leitwerk sind biege- und torsionsweich.' },
  glider: { name: 'Segelflugzeugrumpf', short: 'Seglerrumpf', nBoom: 0, nFin: 1, note: 'Durchgehende Schale, die sich zum Leitwerk hin verjüngt. Wenig Widerstand (schlanker Körper, keine Übergänge), steif durch den großen Durchmesser; braucht eine Form für den Schalenbau.' },
  twin: { name: 'Gondel mit zwei Leitwerksträgern', short: 'Doppelträger', nBoom: 2, nFin: 2, note: 'Zwei Rohre vom Flügel zu einem durchgehenden Höhenleitwerk mit zwei Seitenleitwerken. Platz für einen Druckpropeller zwischen den Trägern; zwei Träger und zwei Seitenleitwerke kosten Masse und Widerstand.' }
};
const TAIL_TYPES = {
  cross: { name: 'Normalleitwerk (Höhenleitwerk am Fuß)', short: 'Normal' },
  T: { name: 'T-Leitwerk (Höhenleitwerk oben)', short: 'T-Leitwerk' }
};
const MOTOR_POS = {
  nose: { name: 'Zugpropeller in der Nase', short: 'Nase (Zug)', eta: 1.0, nProp: 1, note: 'Bewährt und einfach: kurzes Kabel, Motor kühlt im Fahrtwind. Der Strahl umströmt Gondel und Flügelwurzel (mehr Reibung), Bugkameras blicken durch den Propellerkreis, der Propeller muss bei der Bauchlandung gefaltet stehen.' },
  pusher: { name: 'Druckpropeller hinter dem Flügel', short: 'Heck (Druck)', eta: 0.97, nProp: 1, note: 'Nase frei für Sensoren, kein Strahl auf der Gondel. Der Propeller arbeitet im Nachlauf von Gondel und Flügel (2–5 % Verlust, Schwingungsanregung). Doppelträger: am Gondelende zwischen den Trägern. Rohrträger und Seglerrumpf: auf einem Pylon hinter dem Flügel, so hoch, dass der Propellerkreis über Rohr bzw. Rumpf frei dreht (hohe Schublinie).' },
  fin: { name: 'Zugpropeller oben am Seitenleitwerk', short: 'Leitwerk (Zug)', eta: 0.98, nProp: 1, note: 'Propeller hoch über Gras und Steinen, Nase frei, der Strahl bläst das Seitenleitwerk an (Seitenruder wirkt auch langsam). Große Masse weit hinten und oben: Akku nach vorn, kräftigeres Seitenleitwerk und Träger, Schublinie hoch über dem Schwerpunkt (kopflastig bei Gas), langes Motorkabel. Die Motorgondel reicht so weit vor die Seitenleitwerksspitze, dass die Blätter vor der gepfeilten Vorderkante und dem Höhenleitwerk drehen; das Seitenleitwerk muss höher sein als der Propellerradius.' }
};
// Motorgondel und Pylon: Durchmesser, Pylontiefe, größter Überstand der Gondel vor der Seitenleitwerksspitze (m)
const NAC_D = 0.07, PYL_C = 0.12, NAC_MAX = 0.35;
// Wirksame Anordnung: unmögliche Kombinationen werden ersetzt und gemeldet
function configOf(P) {
  const fus = FUS_TYPES[P.fusType] ? P.fusType : 'pod', tail = P.tailType === 'T' ? 'T' : 'cross';
  let mot = MOTOR_POS[P.motorPos] ? P.motorPos : 'nose'; const notes = [];
  if (fus === 'twin' && mot === 'fin') { mot = 'pusher'; notes.push({ k: 'twinfin', t: 'Zwei Seitenleitwerke: kein Platz für einen Motor oben am Leitwerk. Gerechnet als Druckpropeller zwischen den Trägern.' }); }
  return { fus, tail, mot, nBoom: FUS_TYPES[fus].nBoom, nFin: FUS_TYPES[fus].nFin, notes };
}
const propRadius = P => (P.propGeom === 'apc10x7' ? 0.127 : P.propD / 2);
// Mindestabstände des Propellers nach 14 CFR 23.925(d): radial c_r zwischen Blattspitzen und Struktur,
// axial c_a zwischen Blättern und feststehenden Teilen. Die Blätter selbst reichen um e vor und hinter die
// Blattebene: e = 0,6·max(c·sin β) (Blatttiefe mal Einstellwinkel, Drehachse nahe 40 % der Tiefe).
const clrRadOf = P => clamp((P.clrRad ?? 25.4) / 1000, 0, 0.3), clrAxOf = P => clamp((P.clrAx ?? 12.7) / 1000, 0, 0.3);
function propClr(C) {
  if (C._clr) return C._clr;
  const P = C.P, R = propRadius(P);
  let d = 0;
  try { const pg = propGeometry(P); for (let i = 3; i <= 20; i++) { const x = i / 20; d = Math.max(d, pg.c(x) * Math.sin(pg.beta(x))); } } catch (e) { d = 0.08 * R; }
  return (C._clr = { R, e: 0.6 * d, r: clrRadOf(P), a: clrAxOf(P) });
}

/* ---------- Leitwerk aus Volumenbeiwerten ----------
   Doppelträger: Höhenleitwerk spannt zwischen den Trägern, deren Abstand
   den Propellerkreis freilassen muss; die Streckung folgt daraus. */
function tailGeom(P, pf, cf) {
  cf = cf || configOf(P);
  const lt = Math.max(0.3, P.tailArm), Sh = P.vH * pf.S * pf.mac / lt, Sv = P.vV * pf.S * pf.b / lt, nF = cf.nFin;
  let ch = Math.sqrt(Sh / P.arH), bh = Sh / ch, yB = 0;
  const Svf = Sv / nF, cv = Math.sqrt(Svf / P.arV), bv = Svf / cv;
  // Druckpropeller zwischen den Trägern: Blattspitzen mindestens c_r + 2,5 cm vom Rohr
  if (cf.fus === 'twin') { yB = Math.max(bh / 2, cf.mot === 'pusher' ? propRadius(P) + clrRadOf(P) + P.boomD / 2 + 0.025 : 0.15); bh = 2 * yB; ch = Sh / bh; }
  return { lt, Sh, Sv, Svf, ch, cv, bh, bv, arH: bh / ch, nFin: nF, yB, lBoom: Math.max(0, lt - 0.35 * P.fusL) };
}

/* ---------- Rumpfkontur ----------
   Rotationskörper mit elliptischer Nase, zylindrischem Mittelteil und Heck.
   Gondel: Heck läuft auf 25 % des Durchmessers aus. Seglerrumpf: Röhre
   verjüngt sich bis zum Leitwerk auf coneD und endet dort (am Seitenleitwerk),
   Oberkante steigt glatt auf die Höhe des Leitwerksfußes. Liefert Stationen,
   benetzte Fläche, Volumen, ∫d²dx (Rumpf-Nickmoment) und die Flächenmomente
   der Schale. Ein zu steiler Heckkegel wird in der Bauraumprüfung gemeldet. */
function fuselageShape(P, cf, xTail, zRoot) {
  const D = P.fusD, r = D / 2, L1 = Math.max(0.2, P.fusL), n1 = Math.min(0.3 * L1, 2.2 * D), t0 = 0.72 * L1, N = 64;
  const glider = cf.fus === 'glider', L = glider ? Math.max(xTail, t0 + 0.05) : L1, dE = glider ? clamp(P.coneD, 0.015, D) : 0.25 * D;
  const st = [];
  for (let i = 0; i <= N; i++) {
    const x = L * i / N; let top, bot;
    if (x <= n1) { const e = Math.sqrt(Math.max(0, 1 - (1 - x / n1) ** 2)); top = r * e; bot = -r * e; }
    else if (x <= t0) { top = r; bot = -r; }
    else if (!glider) { const xi = (x - t0) / (L - t0), d = D * (1 - 0.75 * xi * xi); top = d / 2; bot = -d / 2; }
    else { const xi = (x - t0) / (L - t0), d = dE + (D - dE) * Math.pow(1 - xi, 1.6), sm = xi * xi * (3 - 2 * xi); top = r + (zRoot - r) * sm; bot = top - d; }
    st.push({ x, top, bot, d: top - bot, z: (top + bot) / 2 });
  }
  const shell = () => ({ S: 0, Sx: 0, Sz: 0, Sxx: 0, Syy: 0, Szz: 0, Sxz: 0 }), pod = shell(), cone = shell();
  let Swet = 0, Vol = 0, W2 = 0, Smax = 0;
  for (let i = 0; i < N; i++) {
    const a = st[i], b = st[i + 1], dx = b.x - a.x, dm = (a.d + b.d) / 2, zm = (a.z + b.z) / 2, xm = (a.x + b.x) / 2;
    const dS = Math.PI * dm * Math.hypot(dx, (b.d - a.d) / 2, b.z - a.z), rr = (dm / 2) ** 2 / 2;
    Swet += dS; Vol += Math.PI * dm * dm / 4 * dx; W2 += dm * dm * dx; Smax = Math.max(Smax, Math.PI * dm * dm / 4);
    const sh = xm < L1 ? pod : cone;
    sh.S += dS; sh.Sx += dS * xm; sh.Sz += dS * zm; sh.Sxx += dS * xm * xm; sh.Syy += dS * rr; sh.Szz += dS * (zm * zm + rr); sh.Sxz += dS * xm * zm;
  }
  return { st, L, D, L1, Swet, Vol, W2, Smax, pod, cone, glider, dE, fr: L / D, n1, t0 };
}
function fusAt(fus, x) {
  const st = fus.st; if (x <= 0) return st[0]; if (x >= fus.L) return st[st.length - 1];
  const i = Math.min(st.length - 2, Math.floor(x / fus.L * (st.length - 1))), a = st[i], b = st[i + 1], t = (x - a.x) / ((b.x - a.x) || 1);
  return { x, top: a.top + (b.top - a.top) * t, bot: a.bot + (b.bot - a.bot) * t, d: a.d + (b.d - a.d) * t, z: a.z + (b.z - a.z) * t };
}
// Raymer, Abb. 16.14 (Näherung): K_f je Grad über Lage der Flügelwurzel-t/4 in % der Rumpflänge
const KFUS = [[0.1, 0.0049], [0.2, 0.007], [0.3, 0.0099], [0.4, 0.0148], [0.5, 0.0218], [0.6, 0.031]];
function kFus(r) { r = clamp(r, 0.1, 0.6); let i = 0; while (i < KFUS.length - 2 && KFUS[i + 1][0] < r) i++; const [a, ka] = KFUS[i], [b, kb] = KFUS[i + 1]; return ka + (kb - ka) * (r - a) / (b - a); }

/* ---------- Positionen bei Flügelverschiebung s ----------
   Flügel, Leitwerk und Träger wandern als Einheit; Gondel und Nase bleiben. */
function geomPositions(C, s) {
  const P = C.P, pf = C.pf, tg = C.tail, ll = C.ll, cf = C.cfg, r = P.fusD / 2, zw = r, R = propRadius(P);
  const xLE0 = P.xWingLE + s, xqc0 = xLE0 + pf.cr / 4, xacw = xqc0 + ll.xac, xact = xacw + tg.lt;
  const xhLE = xact - 0.25 * tg.ch, xhTE = xhLE + tg.ch;
  // Seitenleitwerk: Vorderkante um 0,32·Höhe zurückgesetzt, Spitzentiefe 62 %. Normal- und Kreuzleitwerk:
  // Wurzel-Endleiste bündig mit dem Höhenleitwerk; T-Leitwerk: Spitze unter dem Höhenleitwerk (Hebelarm l_t bleibt)
  const vSw = 0.32, xvLE = cf.tail === 'T' ? xhTE + 0.01 - 0.62 * tg.cv - vSw * tg.bv : xhTE + 0.01 - tg.cv, xvTE = xvLE + tg.cv;
  const zRoot = zw + P.zTail, zV0 = zRoot, zV1 = zRoot + tg.bv, zH = cf.tail === 'T' ? zV1 : zRoot;
  const xTail = xvTE + 0.01, fus = fuselageShape(P, cf, xTail, zRoot);   // Ende von Träger bzw. Rumpf am Seitenleitwerksfuß
  // Träger (Rohr): unter der Flügelwurzel bzw. unter dem Flügel bei ±yB bis zum Leitwerksfuß
  const yB = cf.fus === 'twin' ? tg.yB : 0;
  const boom0 = cf.fus === 'twin' ? xLE0 + 0.25 * pf.cr : Math.min(P.fusL * 0.92, xLE0 + pf.cr * 0.9);
  const zB0 = cf.fus === 'twin' ? zw - 0.06 * pf.cr - P.boomD / 2 : zw - P.boomD / 2, zB1 = zRoot - P.boomD / 2, boom1 = xTail;
  const lBoom = cf.nBoom ? Math.max(0.1, Math.hypot(boom1 - boom0, zB1 - zB0)) : 0;
  const zBoomAt = x => zB0 + (zB1 - zB0) * clamp((x - boom0) / Math.max(1e-6, boom1 - boom0), 0, 1);
  // Motor und Propellerebene: so gelegt, dass die Blätter die Mindestabstände einhalten (14 CFR 23.925(d)).
  // Gesperrt ist ein Zylinder um die Propellerachse mit Radius R + c_r und halber Länge e + c_a.
  const cl = propClr(C), Rz = R + cl.r, ax = cl.e + cl.a;
  const teAt = y => { const e = clamp(Math.abs(y) / (pf.b / 2), 0, 1); return xLE0 + pf.xLE(e) + pf.chordAt(e); };
  const teMax = yMax => { let m = teAt(0); for (let k = 1; k <= 6; k++) m = Math.max(m, teAt(yMax * k / 6)); return m; };
  let xMot, xProp, zP, pylon = 0, nac = null, pyl = null, finExt = 0;
  if (cf.mot === 'nose') { xProp = -Math.max(0.03, ax); xMot = 0.05; zP = 0; }
  else if (cf.mot === 'fin') {
    // Gondel auf der Seitenleitwerksspitze, Nabe 2 cm darüber. Die Blattebene liegt um e + c_a vor allem, was im
    // Propellerkreis steht: der gepfeilten Vorderkante (unten weiter vorn) und dem Höhenleitwerk. Träger und
    // Rumpfröhre unter dem Leitwerk lassen sich so nicht freistellen; das prüft die Bauraumprüfung.
    zP = zV1 + 0.02;
    const tipLE = xvLE + vSw * tg.bv, zLo = Math.max(zV0, zP - Rz), tH = 0.5 * (C.tfoil ? C.tfoil.t : 0.1) * tg.ch;
    let xp = tipLE - 0.08;
    if (zLo < zV1) xp = Math.min(xp, xvLE + vSw * (zLo - zV0) - ax);
    if (Math.abs(zP - zH) < Rz + tH) xp = Math.min(xp, xhLE - ax);
    xProp = Math.max(xp, tipLE - NAC_MAX); xMot = xProp + 0.06; finExt = tipLE - xProp;
    nac = { x0: xProp + 0.015, x1: tipLE + 0.25 * 0.62 * tg.cv, d: NAC_D, z: zP };
  } else if (cf.fus === 'twin') {
    // Gondelende zwischen den Trägern; die Blattebene liegt hinter der Flügelendleiste, soweit diese im Propellerkreis liegt
    xProp = Math.max(P.fusL + 0.09, teMax(Rz) + ax); xMot = xProp - 0.06; zP = 0;
  } else {
    // Pylon hinter dem Flügel (Gondel mit Rohr oder Seglerrumpf): Propellerkreis über Rumpf- bzw. Rohroberkante
    xProp = Math.max(xLE0 + pf.cr + 0.06, teMax(Rz) + ax); xMot = xProp - 0.06;
    const topAt = x => Math.max(x <= fus.L ? fusAt(fus, x).top : -Infinity, cf.nBoom && x >= boom0 - 1e-9 && x <= boom1 ? zBoomAt(x) + P.boomD / 2 : -Infinity);
    let top = zw; for (let k = -2; k <= 2; k++) top = Math.max(top, topAt(xProp + k * ax / 2));
    zP = top + Rz + 0.015;
    const pTE = xProp - ax - 0.005, pLE = pTE - PYL_C, base = Math.max(topAt((pLE + pTE) / 2), zw - 0.02);
    pylon = Math.max(0.02, zP - NAC_D / 2 - base);
    pyl = { x0: pLE, x1: pTE, z0: zP - NAC_D / 2 - pylon, z1: zP - NAC_D / 2, c: PYL_C };
    nac = { x0: pLE - 0.03, x1: xProp - 0.01, d: NAC_D, z: zP };
  }
  // Landekufe unter dem Holm
  const xSkid = xLE0 + 0.25 * pf.cr, zLow = -r - (P.landGear === 'skid' ? 0.05 : 0);
  return {
    s, xLE0, xqc0, xacw, xact, xhLE, xhTE, xvLE, xvTE, vSw, zw, zRoot, zH, zV0, zV1, xTail, fus, yB,
    boom0, boom1, zB0, zB1, lBoom, zBoomAt, xMot, xProp, zP, R, pylon, nac, pyl, finExt, cl, xSkid, zLow, xmac: xLE0 + pf.xLEmac,
    tanG: Math.tan((P.dihedral || 0) * DEG), yK: pf.type === 'rect_taper' ? pf.e * pf.b / 2 : 0
  };
}
// Höhe der Flügelebene an der Halbspannweitenstelle y (V-Form der Außenflügel)
const zWingAt = (g, y) => g.zw + Math.max(0, Math.abs(y) - g.yK) * g.tanG;

/* ---------- Neutralpunkt ----------
   Flügel aus dem Wirbelgitter, Höhenleitwerk mit Auftriebsanstieg nach Helmbold
   und Abwind nach DATCOM (K_A, K_λ, K_H), Rumpf nach Raymer (K_f·W²·L, hier über
   das Integral ∫d²dx gebildet, damit auch die Seglerröhre richtig eingeht). */
function neutralPoint(C, g, opt) {
  const P = C.P, pf = C.pf, tg = C.tail, ll = C.ll, aw = ll.CLa;
  const ReT = P.v * tg.ch / C.nu, a2t = clamp(foilMeta(C.tfoil, 'free', ReT).slope, 5.0, 6.8);
  const at = Math.PI * tg.arH / (1 + Math.sqrt(1 + (Math.PI * tg.arH / a2t) ** 2));
  const lam = pf.ct / pf.cr, A = pf.AR, KA = 1 / A - 1 / (1 + A ** 1.7), KL = (10 - 3 * lam) / 7, KH = (1 - Math.abs((g.zH - g.zw) / pf.b)) / Math.cbrt(2 * tg.lt / pf.b);
  const deda = clamp(4.44 * Math.pow(KA * KL * KH * Math.sqrt(Math.cos(pf.sweep * DEG)), 1.19), 0, 0.9);
  // Staudruck am Höhenleitwerk: Nachlauf (etaTail) und, mit laufendem Motor, Propellerstrahl
  const pw = opt && opt.off ? null : C.pw, etaT = pw && fin(pw.etaH) ? pw.etaH : P.etaTail / 100;
  // Nachgiebiger Träger: das Leitwerk dreht sich unter seiner eigenen Last zurück (bei Reisefahrt)
  const fx = C.struct && C.struct.tail && C.struct.tail.flex, qC = 0.5 * C.rho * P.v * P.v;
  const kFlex = fx ? 1 / (1 + qC * etaT * tg.Sh / fx.nb * at * fx.H) : 1, VhA = etaT * kFlex * tg.Sh / pf.S * at * (1 - deda);
  const fu = g.fus, rqc = clamp(g.xqc0 / fu.L, 0.1, 0.6), Cmaf = kFus(rqc) * (fu.W2 / 0.8) / (pf.mac * pf.S) * RAD;
  // Propeller-Normalkraft als Kraft in der Propellerebene (vor dem Schwerpunkt destabilisierend)
  const NpA = pw && fin(pw.CNaS) ? pw.CNaS : 0;
  const CLa = aw + VhA + NpA, xnp = (aw * g.xacw + VhA * g.xact + NpA * g.xProp) / CLa - Cmaf * pf.mac / CLa;
  return { xnp, aw, at, a2t, deda, etaT, kFlex, CLa, Cmaf, NpA, VhA, xacw: g.xacw, xact: g.xact, KH };
}

/* ---------- Massenliste mit Lage in x, y, z ----------
   Jeder Eintrag trägt die zweiten Momente um den Ursprung (Σm·x², Σm·y², Σm·z², Σm·x·z)
   und die Eigenträgheit um den eigenen Schwerpunkt. Daraus Schwerpunkt und
   Trägheitstensor (Steiner). cat: Massengruppe für Anzeige und Summen. */
function massItems(C, g, xBatt, ballast, xBal) {
  const P = C.P, pf = C.pf, tg = C.tail, cf = C.cfg, st = C.struct, items = [], kR = 1 + P.rugged / 100, h = pf.b / 2, xs = P.xSpar / 100;
  const add = (key, name, grp, cat, m, x, y = 0, z = 0, own) => {
    if (!(m > 0)) return;
    items.push({ key, name, grp, cat, m, x, y: Math.abs(y), z, Sxx: m * x * x, Syy: m * y * y, Szz: m * z * z, Sxz: m * x * z, Ixx0: own ? own.xx || 0 : 0, Iyy0: own ? own.yy || 0 : 0, Izz0: own ? own.zz || 0 : 0 });
  };
  const addDist = (key, name, grp, cat, pts) => {
    let m = 0, mx = 0, my = 0, mz = 0, Sxx = 0, Syy = 0, Szz = 0, Sxz = 0;
    for (const [mm, x, y, z] of pts) { m += mm; mx += mm * x; my += mm * Math.abs(y); mz += mm * z; Sxx += mm * x * x; Syy += mm * y * y; Szz += mm * z * z; Sxz += mm * x * z; }
    if (m > 0) items.push({ key, name, grp, cat, m, x: mx / m, y: my / m, z: mz / m, Sxx, Syy, Szz, Sxz, Ixx0: 0, Iyy0: 0, Izz0: 0 });
  };
  const addShell = (key, name, grp, w, sh) => { // Schalenmasse aus Flächenmomenten
    if (!(w > 0 && sh.S > 0)) return; const m = w * sh.S;
    items.push({ key, name, grp, cat: 'struct', m, x: sh.Sx / sh.S, y: 0, z: sh.Sz / sh.S, Sxx: w * sh.Sxx, Syy: w * sh.Syy, Szz: w * sh.Szz, Sxz: w * sh.Sxz, Ixx0: 0, Iyy0: 0, Izz0: 0 });
  };
  const wingX = (y, f) => g.xLE0 + pf.xLE(y / h) + f * pf.chordAt(y / h);
  if (st && st.stations) {
    // Flügelstruktur aus den Stationen (beide Hälften)
    const sd = st.stations, frac = { mCap: xs, mWeb: xs, mLE: 0.12, mRib: 0.42, mSkin: 0.45, mTE: 0.93 }, pts = [], dy = h / sd.y.length;
    sd.y.forEach((y, k) => { const z = zWingAt(g, y) + 0.02 * sd.c[k]; for (const f in frac) pts.push([2 * sd[f][k] * dy * kR, wingX(y, frac[f]), y, z]); });
    addDist('wingstruct', 'Flügelstruktur', 'wing', 'struct', pts);
    for (const j of st.joints) add('joint', j.y > 0.01 ? 'Steckungen außen' : 'Steckung Mitte', 'wing', 'struct', j.m * kR, wingX(j.y, xs), j.y, zWingAt(g, j.y));
  } else {
    // Feste Strukturmasse: grob 60 % Flügel, 25 % Rumpf/Träger, 15 % Leitwerk
    const ms = C.mass.struct || P.mZelle;
    add('wingstruct', 'Flügelstruktur (geschätzt)', 'wing', 'struct', 0.6 * ms, g.xLE0 + 0.4 * pf.cr, 0.42 * h, g.zw, { xx: 0, zz: 0 });
    add('fus', 'Rumpf und Träger (geschätzt)', 'pod', 'struct', 0.25 * ms, 0.55 * P.fusL);
    add('tail', 'Leitwerk (geschätzt)', 'wing', 'struct', 0.15 * ms, g.xact + 0.15 * tg.ch, 0, g.zH);
  }
  if (st && st.parts) {
    const pp = st.parts, ts = st.tail || {};
    const mH = P.wTail * tg.Sh * kR;
    add('ht', 'Höhenleitwerk', 'wing', 'struct', mH, g.xhLE + 0.4 * tg.ch, 0, g.zH, { xx: mH * tg.bh ** 2 / 12, zz: mH * tg.bh ** 2 / 12, yy: mH * tg.ch ** 2 / 12 });
    const mV = pp.fin * kR, xV = g.xvLE + 0.4 * tg.cv + g.vSw * 0.42 * tg.bv, zV = g.zV0 + 0.42 * tg.bv;
    add('vt', tg.nFin > 1 ? 'Seitenleitwerke (2)' : 'Seitenleitwerk', 'wing', 'struct', mV, xV, g.yB, zV, { xx: mV * tg.bv ** 2 / 12, yy: mV * (tg.bv ** 2 + tg.cv ** 2) / 12 });
    if (pp.boom > 0) { const mb = pp.boom * kR; add('boom', cf.nBoom > 1 ? 'Leitwerksträger (2)' : 'Leitwerksträger', 'wing', 'struct', mb, (g.boom0 + g.boom1) / 2, g.yB, (g.zB0 + g.zB1) / 2, { yy: mb * g.lBoom ** 2 / 12, zz: mb * g.lBoom ** 2 / 12 }); }
    addShell('fus', cf.fus === 'glider' ? 'Rumpf vorn (Schale)' : 'Rumpfgondel', 'pod', P.wFus * kR, g.fus.pod);
    if (cf.fus === 'glider') addShell('cone', 'Rumpfröhre zum Leitwerk', 'wing', (ts.cone ? ts.cone.wEff : P.wCone) * kR, g.fus.cone);
    add('fusfix', 'Rumpf-Einbauten', 'pod', 'struct', P.mFusFix * kR, 0.5 * P.fusL);
    if (pp.land > 0) add('land', P.landGear === 'skid' ? 'Landekufe' : 'Verstärkter Rumpfboden', 'pod', 'struct', pp.land * kR, P.landGear === 'skid' ? g.xSkid : 0.45 * P.fusL, 0, P.landGear === 'skid' ? g.zLow + 0.02 : -P.fusD / 2);
    // Pylon und Motorgondel wandern mit dem Flügel bzw. Leitwerk (ihre Lage folgt der Flügelendleiste bzw. dem Seitenleitwerk)
    if (pp.pylon > 0 && g.pyl) add('pylon', 'Motorpylon', 'wing', 'struct', pp.pylon * kR, (g.pyl.x0 + g.pyl.x1) / 2, 0, (g.pyl.z0 + g.pyl.z1) / 2);
    if (pp.nacelle > 0 && g.nac) add('nacelle', 'Motorgondel', 'wing', 'struct', pp.nacelle * kR, (g.nac.x0 + g.nac.x1) / 2, 0, g.nac.z);
  }
  // Solarmodule Flügel: von der Wurzel bis etaC, im mittleren Zellband (solar.js), auf der Oberseite
  const x0 = C.solar ? C.solar.x0 : 0.1, x1 = C.solar ? C.solar.x1 : 0.85, etaC = C.solarEta || 0.8;
  if (C.mass.solar > 0) {
    const N = 20, pts = []; let wsum = 0;
    for (let i = 0; i < N; i++) { const eta = (i + 0.5) / N * etaC, c = pf.chordAt(eta); wsum += c; pts.push([c, wingX(eta * h, (x0 + x1) / 2), eta * h, zWingAt(g, eta * h) + 0.6 * C.foil.t * c]); }
    addDist('solar', 'Solarmodule Flügel', 'wing', 'solar', pts.map(([w, x, y, z]) => [C.mass.solar * w / wsum, x, y, z]));
  }
  if (C.mass.solarHT > 0) add('solarht', 'Solarmodule Höhenleitwerk', 'wing', 'solar', C.mass.solarHT, g.xhLE + 0.45 * tg.ch, 0, g.zH + 0.01, { xx: C.mass.solarHT * tg.bh ** 2 / 12, zz: C.mass.solarHT * tg.bh ** 2 / 12 });
  // Antrieb: Motor, Regler, Propeller (Regler sitzt beim Motor)
  const mp = cf.mot, mM = C.mass.prop, onPod = mp === 'nose' || (mp === 'pusher' && cf.fus === 'twin');
  add('motor', 'Motor, Regler, Propeller', onPod ? 'pod' : 'wing', 'prop', mM, g.xMot, 0, g.zP, { xx: 0.25 * mM * (0.4 * g.R) ** 2 });
  // Akku
  if (P.battInWing) {
    const N = 12, pts = [];
    for (let i = 0; i < N; i++) { const eta = (i + 0.5) / N * 0.6, y = eta * h; pts.push([C.mass.batt / N, wingX(y, xs), y, zWingAt(g, y)]); }
    addDist('batt', 'Akku (im Flügel)', 'wing', 'batt', pts);
  } else add('batt', 'Akku', 'pod', 'batt', C.mass.batt, xBatt, 0, P.zBatt || 0);
  // Komponenten; die Servos sitzen an den Rudern (Lagen aus der Ruderaufteilung)
  for (const c of C.comps) if (c.on && c.m > 0) {
    if (c.id === 'servo') { const sv = servoLayout(C, g), mm = c.m / 1000 / sv.length; addDist('comp:servo', c.name, 'wing', 'comp', sv.map(o => [mm, o.x, o.y, o.z])); }
    else add('comp:' + c.id, c.name, 'pod', 'comp', c.m / 1000, c.x ?? 0.5, c.y || 0, c.z || 0);
  }
  // Verkabelung als eigene Massengruppe
  const xb = P.battInWing ? g.xLE0 + xs * pf.cr : xBatt, hn = harness(C, g, xb);
  for (const it of hn.items) items.push(it);
  if (ballast > 1e-6) add('ballast', xBal < g.xLE0 ? 'Ballast (Nase)' : 'Ballast (Heck)', 'pod', 'ballast', ballast, xBal, 0, xBal < g.xLE0 ? 0 : g.zRoot);
  // Summen, Schwerpunkt, Trägheitstensor um den Schwerpunkt (Körperachsen, Vorzeichen von Ixz wie Etkin)
  let M = 0, Mx = 0, Mz = 0, Sxx = 0, Syy = 0, Szz = 0, Sxz = 0, Ix0 = 0, Iy0 = 0, Iz0 = 0;
  for (const it of items) { M += it.m; Mx += it.m * it.x; Mz += it.m * it.z; Sxx += it.Sxx; Syy += it.Syy; Szz += it.Szz; Sxz += it.Sxz; Ix0 += it.Ixx0; Iy0 += it.Iyy0; Iz0 += it.Izz0; }
  const xcg = Mx / M, zcg = Mz / M;
  const Ixx = Syy + Szz - M * zcg * zcg + Ix0, Iyy = Sxx + Szz - M * (xcg * xcg + zcg * zcg) + Iy0, Izz = Sxx + Syy - M * xcg * xcg + Iz0, Ixz = Sxz - M * xcg * zcg;
  const byCat = {}; for (const it of items) byCat[it.cat] = (byCat[it.cat] || 0) + it.m;
  return { items, M, xcg, zcg, Iyy, Ixx, Izz, Ixz, byCat, harness: hn, mWire: hn.total };
}

/* ---------- Schwerpunkt auf das Ziel-Stabilitätsmaß bringen ---------- */
function balance(C) {
  const P = C.P, mac = C.pf.mac, smT = P.smTarget / 100, mode = P.trimMode;
  const xbMin = 0.1, xbMax = Math.max(0.15, P.fusL - 0.12), xNose = 0.03;
  // Startwert aus dem vorigen Durchgang der Massenschleife (gleiche Trimmart): spart Iterationen, gleiches Ergebnis
  const w0 = C.bal && C.bal.mode === mode ? C.bal : null;
  let s = mode === 'wing' && w0 ? w0.s : 0, g = geomPositions(C, s), np = neutralPoint(C, g), xb = clamp(mode === 'battery' && w0 ? w0.xBatt : P.xBatt, xbMin, xbMax), bal = 0, xBal = xNose, msg = '';
  let mi = massItems(C, g, xb, 0, xNose);
  const target = () => np.xnp - smT * mac;
  if (mode === 'wing') {
    // Flügel samt Leitwerk verschieben: Neutralpunkt und Flügelmassen wandern mit, Gondel bleibt
    for (let k = 0; k < 5; k++) {
      const mw = mi.items.filter(i => i.grp === 'wing').reduce((a, i) => a + i.m, 0), sm0 = (np.xnp - mi.xcg) / mac;
      const sn = clamp(s + (smT - sm0) * mac / Math.max(0.05, 1 - mw / mi.M), -0.45 * P.fusL, 0.6 * P.fusL);
      if (Math.abs(sn - s) < 1e-7) break;
      s = sn; g = geomPositions(C, s); np = neutralPoint(C, g); mi = massItems(C, g, xb, 0, xNose);
    }
  } else if (mode === 'battery' && !P.battInWing && C.mass.batt > 1e-6) {
    // Akku verschieben (Kabelmasse hängt von der Akkulage ab, daher wenige Iterationen)
    for (let k = 0; k < 5; k++) {
      const mb = C.mass.batt, others = mi.M * mi.xcg - mb * xb;
      const xn = clamp((target() * mi.M - others) / mb, xbMin, xbMax);
      if (Math.abs(xn - xb) < 1e-7) break;
      xb = xn; mi = massItems(C, g, xb, 0, xNose);
    }
  }
  if (mode !== 'none') {
    const xt = target(), d = mi.xcg - xt;
    if (Math.abs(d) * mi.M > 1e-4 && (mode === 'ballast' || mode === 'battery' || mode === 'wing')) {
      if (d > 0) { xBal = xNose; bal = mi.M * d / (xt - xNose); }
      else { xBal = g.xTail; bal = mi.M * (-d) / (xBal - xt); }
      if (bal < 2e-3) bal = 0;
      else {
        const why = mode === 'battery' ? (P.battInWing ? 'Akku liegt im Flügel und kann nicht trimmen.' : xb <= xbMin + 1e-6 ? 'Akku steht am vorderen Anschlag.' : xb >= xbMax - 1e-6 ? 'Akku steht am hinteren Anschlag.' : '') : mode === 'wing' ? 'Flügel steht am Ende des Verschiebewegs.' : '';
        msg = (d > 0 ? 'Schwerpunkt zu weit hinten: Ballast in der Nase nötig. ' : 'Schwerpunkt zu weit vorn: Ballast im Heck nötig. ') + why;
      }
      mi = massItems(C, g, xb, bal, xBal);
    }
  }
  return { mode, s, g, np, xBatt: xb, ballast: bal, xBal, mi, xcg: mi.xcg, zcg: mi.zcg, sm: (np.xnp - mi.xcg) / mac, msg, mWire: mi.mWire, xbMin, xbMax, target: target() };
}
// Leitwerkslast aus Momentengleichgewicht um den Schwerpunkt (Auftrieb positiv nach oben).
// Schubmoment (Schublinie über dem Schwerpunkt: kopflastig) kommt aus dem Antriebsmodell, wenn vorhanden.
function tailLoad(C, n, q, cmac, dM) {
  const b = C.bal; if (!b) return null;
  const W = C.m * G, M0 = q * C.pf.S * C.pf.mac * cmac + (dM || 0);
  return (n * W * (b.xcg - b.np.xacw) + M0) / (b.np.xact - b.np.xacw);
}

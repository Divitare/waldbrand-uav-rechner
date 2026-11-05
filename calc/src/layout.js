/* ===================================================================
   Längsaufteilung: Lage aller Massen, Schwerpunkt, Trägheitsmomente,
   Neutralpunkt (Flügel aus Wirbelgitter, Leitwerk mit DATCOM-Abwind,
   Rumpfgondel nach Raymer), Trimmung über Akku, Flügellage oder Ballast,
   vier Motoranordnungen.
   x: vom Bug nach hinten (m), y: zur rechten Flügelspitze, z: nach oben.
   =================================================================== */
const MOTOR_POS = {
  nose: { name: 'Zugmotor in der Nase', eta: 1.0, nProp: 1, note: 'Propellerstrahl umströmt Gondel und Flügelwurzel (mehr Reibung). Bugkamera und Gimbal blicken durch den Propellerkreis. Bewährte, einfache Bauweise mit kurzem Kabelweg.' },
  pod: { name: 'Druckmotor am Gondelende', eta: 0.97, nProp: 1, note: 'Nase frei für Sensoren, Motor nah am Schwerpunkt. Der Propeller arbeitet im Nachlauf der Gondel (2–5 % Verlust, Raymer). Der Leitwerksträger muss über den Propeller geführt oder doppelt ausgeführt werden.' },
  tail: { name: 'Druckmotor hinter dem Leitwerk', eta: 0.96, nProp: 1, note: 'Nase völlig frei, aber großes Moment weit hinten: Akku muss weit nach vorn oder Ballast in die Nase. Langes Motorkabel, Schwingungen am Leitwerksträger, Propeller schlägt bei Landungen leicht auf.' },
  wing: { name: 'Zwei Zugmotoren am Flügel', eta: 0.99, nProp: 2, note: 'Redundanz, Motoren entlasten den Holm, Nase frei. Zwei Gondeln mehr Widerstand, Gierausgleich bei Motorausfall nötig, Propellerstrahl über einem Teil des Flügels.' }
};
// Raymer, Abb. 16.14 (Näherung): K_f je Grad über Lage der Flügelwurzel-t/4 in % der Rumpflänge
const KFUS = [[0.1, 0.0049], [0.2, 0.007], [0.3, 0.0099], [0.4, 0.0148], [0.5, 0.0218], [0.6, 0.031]];
function kFus(r) { r = clamp(r, 0.1, 0.6); let i = 0; while (i < KFUS.length - 2 && KFUS[i + 1][0] < r) i++; const [a, ka] = KFUS[i], [b, kb] = KFUS[i + 1]; return ka + (kb - ka) * (r - a) / (b - a); }
// Positionen der Bauteile bei Flügelverschiebung s (Flügel, Leitwerk und Träger als Einheit)
function geomPositions(C, s) {
  const P = C.P, pf = C.pf, tg = C.tail, ll = C.ll;
  const xLE0 = P.xWingLE + s, xqc0 = xLE0 + pf.cr / 4, xacw = xqc0 + ll.xac, xact = xacw + tg.lt;
  const xhLE = xact - 0.25 * tg.ch, xhTE = xhLE + tg.ch;
  const mp = P.motorPos, yM = clamp(P.motorY, 0.1, 0.9) * pf.b / 2;
  const boom0 = Math.min(P.fusL * 0.92, xLE0 + pf.cr * 0.9), boom1 = xhTE + (mp === 'tail' ? 0.1 : 0.02);
  const xMot = mp === 'nose' ? 0.04 : mp === 'pod' ? P.fusL + 0.03 : mp === 'tail' ? xhTE + 0.07 : xLE0 + pf.xLE(yM / (pf.b / 2)) - 0.12;
  const xProp = mp === 'nose' ? -0.03 : mp === 'pod' ? P.fusL + 0.08 : mp === 'tail' ? xhTE + 0.13 : xMot - 0.07;
  return { s, xLE0, xqc0, xacw, xact, xhLE, xhTE, boom0, boom1, lBoom: Math.max(0.1, boom1 - boom0), xMot, xProp, yM, xmac: xLE0 + pf.xLEmac };
}
// Neutralpunkt
function neutralPoint(C, g) {
  const P = C.P, pf = C.pf, tg = C.tail, ll = C.ll, aw = ll.CLa;
  const ReT = P.v * tg.ch / C.nu, a2t = clamp(foilMeta(C.tfoil, 'free', ReT).slope, 5.0, 6.8);
  const at = Math.PI * P.arH / (1 + Math.sqrt(1 + (Math.PI * P.arH / a2t) ** 2));
  const lam = pf.ct / pf.cr, A = pf.AR, KA = 1 / A - 1 / (1 + A ** 1.7), KL = (10 - 3 * lam) / 7, KH = (1 - Math.abs(P.zTail / pf.b)) / Math.cbrt(2 * tg.lt / pf.b);
  const deda = clamp(4.44 * Math.pow(KA * KL * KH * Math.sqrt(Math.cos(pf.sweep * DEG)), 1.19), 0, 0.9);
  const etaT = P.etaTail / 100, VhA = etaT * tg.Sh / pf.S * at * (1 - deda);
  const CLa = aw + VhA;
  const rqc = clamp((g.xqc0) / P.fusL, 0.1, 0.6), Cmaf = kFus(rqc) * P.fusD ** 2 * P.fusL / (pf.mac * pf.S) * RAD;
  const xnp = (aw * g.xacw + VhA * g.xact) / CLa - Cmaf * pf.mac / CLa;
  return { xnp, aw, at, a2t, deda, etaT, CLa, Cmaf, VhA, xacw: g.xacw, xact: g.xact };
}
// Massenliste mit Lage; Rückgabe enthält die Summen für Schwerpunkt und Trägheit
function massItems(C, g, xBatt, ballast, xBal) {
  const P = C.P, pf = C.pf, tg = C.tail, st = C.struct, items = [], kR = 1 + P.rugged / 100;
  const add = (key, name, grp, m, x, y = 0, z = 0, own = 0, ownY = 0) => { if (m > 0) items.push({ key, name, grp, m, x, y, z, mx2: m * x * x + own, my2: m * y * y + ownY }); };
  const xs = P.xSpar / 100, h = pf.b / 2;
  if (st && st.stations) {
    // Flügelstruktur aus den Stationen (beide Hälften)
    const sd = st.stations, frac = { mCap: xs, mWeb: xs, mLE: 0.12, mRib: 0.42, mSkin: 0.45, mTE: 0.93, mWire: xs };
    let m = 0, mx = 0, mx2 = 0, my2 = 0;
    sd.y.forEach((y, k) => {
      const dy = h / sd.y.length, xl = g.xLE0 + pf.xLE(y / h), c = sd.c[k];
      for (const f in frac) { const mm = 2 * sd[f][k] * dy * kR, x = xl + frac[f] * c; m += mm; mx += mm * x; mx2 += mm * x * x; my2 += mm * y * y; }
    });
    items.push({ key: 'wingstruct', name: 'Flügelstruktur', grp: 'wing', m, x: mx / m, y: 0, z: 0, mx2, my2 });
    for (const j of st.joints) add('joint', j.y > 0.01 ? 'Steckung außen' : 'Steckung Mitte', 'wing', j.m * kR, g.xLE0 + pf.xLE(j.y / h) + xs * pf.chordAt(j.y / h), j.y, 0, 0, 0);
  } else {
    // Feste Strukturmasse: grob 60 % Flügel, 25 % Rumpf/Träger, 15 % Leitwerk
    const ms = C.mass.struct || P.mZelle;
    add('wingstruct', 'Flügelstruktur (geschätzt)', 'wing', 0.6 * ms, g.xLE0 + 0.4 * pf.cr, 0, 0, 0, 0.6 * ms * (0.42 * h) ** 2);
    add('fus', 'Gondel und Träger (geschätzt)', 'pod', 0.25 * ms, 0.55 * P.fusL);
    add('tail', 'Leitwerk (geschätzt)', 'wing', 0.15 * ms, g.xact + 0.15 * tg.ch);
  }
  if (st && st.parts) {
    const pp = st.parts;
    add('ht', 'Höhenleitwerk', 'wing', P.wTail * tg.Sh * kR, g.xhLE + 0.4 * tg.ch, 0, 0, 0, P.wTail * tg.Sh * kR * tg.bh ** 2 / 12);
    add('vt', 'Seitenleitwerk', 'wing', P.wTail * tg.Sv * kR, g.xhLE + 0.4 * tg.cv, 0, 0.4 * tg.bv);
    const mb = pp.boom * kR; add('boom', P.nBooms > 1 ? 'Leitwerksträger (2)' : 'Leitwerksträger', 'wing', mb, (g.boom0 + g.boom1) / 2, 0, 0, mb * g.lBoom ** 2 / 12);
    const mf = P.wFus * 0.8 * Math.PI * P.fusD * P.fusL * kR; add('fus', 'Rumpfgondel', 'pod', mf, 0.45 * P.fusL, 0, 0, mf * P.fusL ** 2 / 14);
    add('fusfix', 'Gondel-Einbauten', 'pod', P.mFusFix * kR, 0.5 * P.fusL);
    add('gear', 'Landekufe, Schutz', 'pod', P.mGear * kR, g.xLE0 + 0.3 * pf.cr);
    add('wirefus', 'Verkabelung Rumpf', 'pod', 0.05 * kR, 0.5 * P.fusL);
  }
  // Solarmodule Flügel: von der Wurzel bis etaC, zwischen cellX0 und cellX1
  const x0 = P.cellX0 / 100, x1 = P.cellX1 / 100, etaC = C.solarEta || 0.8;
  if (C.mass.solar > 0) {
    let m = 0, mx = 0, mx2 = 0, my2 = 0; const N = 20;
    for (let i = 0; i < N; i++) { const eta = (i + 0.5) / N * etaC, c = pf.chordAt(eta), w = c, x = g.xLE0 + pf.xLE(eta) + (x0 + x1) / 2 * c, y = eta * h; m += w; mx += w * x; mx2 += w * x * x; my2 += w * y * y; }
    const k = C.mass.solar / m; items.push({ key: 'solar', name: 'Solarmodule Flügel', grp: 'wing', m: C.mass.solar, x: mx / m, y: 0, z: 0, mx2: mx2 * k, my2: my2 * k });
  }
  if (C.mass.solarHT > 0) add('solarht', 'Solarmodule Höhenleitwerk', 'wing', C.mass.solarHT, g.xhLE + 0.45 * tg.ch, 0, 0, 0, C.mass.solarHT * tg.bh ** 2 / 12);
  // Antrieb
  const mp = P.motorPos;
  if (mp === 'wing') { add('motor', 'Motoren, Regler, Propeller (2)', 'wing', C.mass.prop, g.xMot, 0, 0, 0, C.mass.prop * g.yM ** 2); }
  else add('motor', 'Motor, Regler, Propeller', mp === 'tail' ? 'wing' : 'pod', C.mass.prop, g.xMot);
  // Akku
  if (P.battInWing) {
    let m = 0, mx = 0, mx2 = 0, my2 = 0; const N = 12;
    for (let i = 0; i < N; i++) { const eta = (i + 0.5) / N * 0.6, c = pf.chordAt(eta), x = g.xLE0 + pf.xLE(eta) + xs * c, y = eta * h; m += 1; mx += x; mx2 += x * x; my2 += y * y; }
    const k = C.mass.batt / m; items.push({ key: 'batt', name: 'Akku (im Flügel)', grp: 'wing', m: C.mass.batt, x: mx / m, y: 0, z: 0, mx2: mx2 * k, my2: my2 * k });
  } else add('batt', 'Akku', 'pod', C.mass.batt, xBatt);
  // Kabel Akku → Motor (Hin- und Rückleiter)
  const xb = P.battInWing ? g.xLE0 + xs * pf.cr : xBatt, lc = Math.abs(g.xMot - xb) + (mp === 'wing' ? 2 * g.yM : 0);
  const mCable = P.cableLin * lc; add('cable', 'Motorkabel', mp === 'tail' || mp === 'wing' ? 'wing' : 'pod', mCable, (g.xMot + xb) / 2, 0, 0, 0, mp === 'wing' ? mCable * (g.yM / 2) ** 2 : 0);
  // Komponenten
  for (const c of C.comps) if (c.on && c.m > 0) add('comp:' + c.id, c.name, 'pod', c.m / 1000, c.x ?? 0.5, Math.abs(c.y || 0));
  if (ballast > 1e-6) add('ballast', xBal < g.xLE0 ? 'Ballast (Nase)' : 'Ballast (Heck)', 'pod', ballast, xBal);
  let M = 0, Mx = 0, Mx2 = 0, My2 = 0;
  for (const it of items) { M += it.m; Mx += it.m * it.x; Mx2 += it.mx2; My2 += it.my2; }
  const xcg = Mx / M, Iyy = Mx2 - M * xcg * xcg, Ixx = My2 + M * (P.fusD / 2) ** 2;
  return { items, M, xcg, Iyy, Ixx, Izz: Ixx + Iyy, mCable };
}
// Schwerpunkt auf das Ziel-Stabilitätsmaß bringen
function balance(C) {
  const P = C.P, mac = C.pf.mac, smT = P.smTarget / 100, mode = P.trimMode;
  const xbMin = 0.1, xbMax = Math.max(0.15, P.fusL - 0.12), xNose = 0.03;
  let s = 0, g = geomPositions(C, 0), np = neutralPoint(C, g), xb = clamp(P.xBatt, xbMin, xbMax), bal = 0, xBal = xNose, msg = '';
  let mi = massItems(C, g, xb, 0, xNose);
  const target = () => np.xnp - smT * mac;
  if (mode === 'wing') {
    // Flügel samt Leitwerk verschieben: Neutralpunkt und Flügelmassen wandern mit, Gondel bleibt
    for (let k = 0; k < 4; k++) {
      const mw = mi.items.filter(i => i.grp === 'wing').reduce((a, i) => a + i.m, 0), sm0 = (np.xnp - mi.xcg) / mac;
      s = clamp(s + (smT - sm0) * mac / Math.max(0.05, 1 - mw / mi.M), -0.45 * P.fusL, 0.6 * P.fusL);
      g = geomPositions(C, s); np = neutralPoint(C, g); mi = massItems(C, g, xb, 0, xNose);
    }
  } else if (mode === 'battery' && !P.battInWing && C.mass.batt > 1e-6) {
    // Akku verschieben (Kabelmasse hängt von der Akkulage ab, daher wenige Iterationen)
    for (let k = 0; k < 4; k++) {
      const mb = C.mass.batt, others = mi.M * mi.xcg - mb * xb;
      xb = clamp((target() * mi.M - others) / mb, xbMin, xbMax);
      mi = massItems(C, g, xb, 0, xNose);
    }
  }
  if (mode !== 'none') {
    const xt = target(), d = mi.xcg - xt;
    if (Math.abs(d) * mi.M > 1e-4 && (mode === 'ballast' || mode === 'battery' || mode === 'wing')) {
      if (d > 0) { xBal = xNose; bal = mi.M * d / (xt - xNose); }
      else { xBal = g.boom1; bal = mi.M * (-d) / (xBal - xt); }
      if (bal < 2e-3) bal = 0;
      else {
        const why = mode === 'battery' ? (P.battInWing ? 'Akku liegt im Flügel und kann nicht trimmen.' : xb <= xbMin + 1e-6 ? 'Akku steht am vorderen Anschlag.' : xb >= xbMax - 1e-6 ? 'Akku steht am hinteren Anschlag.' : '') : mode === 'wing' ? 'Flügel steht am Ende des Verschiebewegs.' : '';
        msg = (d > 0 ? 'Schwerpunkt zu weit hinten: Ballast in der Nase nötig. ' : 'Schwerpunkt zu weit vorn: Ballast im Heck nötig. ') + why;
      }
      mi = massItems(C, g, xb, bal, xBal);
    }
  }
  return { s, g, np, xBatt: xb, ballast: bal, xBal, mi, xcg: mi.xcg, sm: (np.xnp - mi.xcg) / mac, msg, mCable: mi.mCable, xbMin, xbMax, target: target() };
}
// Leitwerkslast aus Momentengleichgewicht um den Schwerpunkt (Auftrieb positiv nach oben)
function tailLoad(C, n, q, cmac) {
  const b = C.bal; if (!b) return null;
  const W = C.m * G, M0 = q * C.pf.S * C.pf.mac * cmac;
  return (n * W * (b.xcg - b.np.xacw) + M0) / (b.np.xact - b.np.xacw);
}
// Höhenleitwerk: Schattenwurf des Seitenleitwerks über alle Kurse gemittelt (Anteil der Zellfläche)
function finShade(tg, elevDeg) {
  if (elevDeg <= 0.5) return 0.5;
  const ct = 1 / Math.tan(elevDeg * DEG), hv = tg.bv, half = tg.bh / 2; let s = 0; const n = 36;
  for (let i = 0; i < n; i++) { const ps = (i + 0.5) / n * Math.PI * 2; s += Math.min(hv * ct * Math.abs(Math.sin(ps)), half) / tg.bh; }
  return s / n * Math.min(1, tg.cv / tg.ch);
}

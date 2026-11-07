/* ===================================================================
   Bauraum und Freigang: ist der Entwurf so überhaupt baubar?
   - Propellerkreis gegen alles Feststehende (14 CFR 23.925(d)): gesperrt
     ist ein Zylinder um die Propellerachse mit Radius R + c_r und halber
     Länge e + c_a (e: halbe Bautiefe der Blätter). Jedes Teil liefert je
     Längsstelle x seinen kleinsten Abstand d(x) zur Propellerachse:
     Rumpf (Kreisquerschnitte der Kontur), Träger (Rohre), Flügel (Profil-
     schnitte beider Hälften mit V-Form), Seitenleitwerk (gepfeilte Vorder-
     und Hinterkante), Höhenleitwerk (Profil), Pylon. Motorgondel und Spinner
     gehören zum Antrieb und zählen nicht.
       axialer Abstand  a = min |x − x_P| − e   über alle x mit d(x) < R + c_r
       radialer Abstand r = min d(x) − R         über alle x mit |x − x_P| ≤ e + c_a
     Ein Teil verletzt den Freigang, wenn a < c_a (gleichbedeutend r < c_r).
   - Boden bei der Landung (23.925(a), (b) für Druckpropeller): Rumpf um den
     Landewinkel aufgerichtet, Bodenpunkt unter Kufe bzw. Schwerpunkt.
   - Heck: setzt bei der Landung nicht zuerst auf; Leitwerk hinter der Gondel
     (Gondel mit Rohr bzw. Doppelträger); Heckkegel des Seglerrumpfs nicht
     steiler als 15° (Ablösung ab etwa 14°, Tran et al. 2019); Flügel sitzt
     auf dem Rumpf; Höhenleitwerk hinter dem Flügel.
   Jede Verletzung geht als bezogener Abstand in die Grundbedingung
   „baubar“ der Entwurfsvorschläge ein.
   =================================================================== */
const CONE_MAX = 15, TAIL_GAP = 0.05;
// Zahl mit Dezimalkomma für Meldungen aus dem Rechenkern (ohne Oberflächenfunktionen, läuft auch im Worker)
const fmtDe = (x, d = 1) => (fin(x) ? (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d).replace('-', '−').replace('.', ',') : '–');
// Ober- und Unterseite eines Profils bei x/c = xi (lineare Interpolation der Kontur)
function foilYs(sh, xi) {
  const X = sh.x; if (xi <= 0) return [sh.yu[0], sh.yl[0]]; if (xi >= 1) return [sh.yu[X.length - 1], sh.yl[X.length - 1]];
  let lo = 0, hi = X.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] > xi) hi = m; else lo = m; }
  const t = (xi - X[lo]) / ((X[hi] - X[lo]) || 1);
  return [sh.yu[lo] + (sh.yu[hi] - sh.yu[lo]) * t, sh.yl[lo] + (sh.yl[hi] - sh.yl[lo]) * t];
}
const FLAT_SH = { x: [0, 1], yu: [0.05, 0], yl: [-0.05, 0] };
// Teile als Querschnitte: kleinster Abstand der Teilkontur von der Propellerachse (y = 0, z = z_P) an der Stelle x
function bauParts(C, g) {
  const P = C.P, pf = C.pf, tg = C.tail, cf = C.cfg, fu = g.fus, zP = g.zP, h = pf.b / 2, parts = [];
  const wsh = (C.foil && C.foil.shape) || FLAT_SH, tsh = (C.tfoil && C.tfoil.shape) || FLAT_SH;
  parts.push({ k: 'fus', n: cf.fus === 'glider' ? 'Rumpf' : 'Gondel', x0: 0, x1: fu.L, d: x => { const s = fusAt(fu, x); return Math.max(0, Math.abs(zP - s.z) - s.d / 2); } });
  if (cf.nBoom) parts.push({ k: 'boom', n: cf.nBoom > 1 ? 'Leitwerksträger' : 'Rohrträger', x0: g.boom0, x1: g.boom1, d: x => Math.max(0, Math.hypot(g.yB, zP - g.zBoomAt(x)) - P.boomD / 2) });
  // Flügel: 41 Schnitte je Hälfte, Profil mit örtlicher Tiefe auf der V-Form
  const ys = []; let wx0 = Infinity, wx1 = -Infinity;
  for (let k = 0; k <= 40; k++) { const y = h * k / 40, e = y / h, xl = g.xLE0 + pf.xLE(e), c = pf.chordAt(e); ys.push({ y, xl, c, z: zWingAt(g, y) }); wx0 = Math.min(wx0, xl); wx1 = Math.max(wx1, xl + c); }
  parts.push({
    k: 'wing', n: 'Flügel', x0: wx0, x1: wx1, d: x => {
      let m = Infinity;
      for (const s of ys) {
        if (x < s.xl || x > s.xl + s.c || s.y >= m) continue;
        const [yu, yl] = foilYs(wsh, (x - s.xl) / s.c), dz = Math.max(0, s.z + yl * s.c - zP, zP - (s.z + yu * s.c));
        m = Math.min(m, Math.hypot(s.y, dz));
      }
      return m;
    }
  });
  // Seitenleitwerk(e): Vorderkante x_LE(z) = x_vLE + k_LE·(z − z_V0), Hinterkante entsprechend
  const kLE = g.vSw, bv = tg.bv, kTE = (g.vSw * bv + 0.62 * tg.cv - tg.cv) / bv, tF = 0.5 * (C.tfoil ? C.tfoil.t : 0.1) * tg.cv, yF = tg.nFin > 1 ? g.yB : 0;
  parts.push({
    k: 'fin', n: tg.nFin > 1 ? 'Seitenleitwerke' : 'Seitenleitwerk', x0: g.xvLE, x1: Math.max(g.xvTE, g.xvLE + kLE * bv + 0.62 * tg.cv), d: x => {
      let zLo = g.zV0, zHi = Math.min(g.zV1, g.zV0 + (x - g.xvLE) / kLE);
      if (kTE > 1e-9) zLo = Math.max(zLo, g.zV0 + (x - g.xvTE) / kTE);
      else if (kTE < -1e-9) zHi = Math.min(zHi, g.zV0 + (x - g.xvTE) / kTE);
      else if (x > g.xvTE) return Infinity;
      if (zHi < zLo) return Infinity;
      return Math.hypot(Math.max(0, yF - tF), Math.max(0, zLo - zP, zP - zHi));
    }
  });
  parts.push({
    k: 'ht', n: 'Höhenleitwerk', x0: g.xhLE, x1: g.xhTE, d: x => {
      const xi = (x - g.xhLE) / tg.ch; if (xi < 0 || xi > 1) return Infinity;
      const [yu, yl] = foilYs(tsh, xi); return Math.max(0, g.zH + yl * tg.ch - zP, zP - (g.zH + yu * tg.ch));
    }
  });
  if (g.pyl) parts.push({ k: 'pylon', n: 'Pylon', x0: g.pyl.x0, x1: g.pyl.x1, d: x => Math.max(0, zP - g.pyl.z1) });
  return parts;
}
// Abstände jedes Teils zum gesperrten Zylinder; pen: Eindringtiefe (kürzester Weg hinaus, axial oder radial)
function propZone(C, g) {
  const cl = g.cl, R = cl.R, Rz = R + cl.r, hx = cl.e + cl.a, xP = g.xProp, W = 0.6, tol = 5e-4, out = [];
  for (const p of bauParts(C, g)) {
    const a = Math.max(p.x0, xP - W), b = Math.min(p.x1, xP + W); if (!(b >= a)) continue;
    // Stützstellen: 1 mm nahe der Blattebene, 5 mm weiter weg, dazu beide Teilenden
    const xs = [a, b]; for (let x = a; x < b; x += Math.abs(x - xP) < 0.1 ? 0.001 : 0.005) xs.push(x);
    let ax = Infinity, rad = Infinity, pen = 0, xHit = null;
    for (const x of xs) {
      const d = p.d(x); if (!(d < Infinity)) continue;
      const u = Math.abs(x - xP);
      if (d < Rz) ax = Math.min(ax, u - cl.e);
      if (u <= hx) rad = Math.min(rad, d - R);
      const q = Math.min(hx - u, Rz - d); if (q > pen) { pen = q; xHit = x; }
    }
    if (ax < Infinity || rad < Infinity) out.push({ k: p.k, n: p.n, ax, rad, pen, ok: pen <= tol, xHit });
  }
  return out;
}
// Vollständige Prüfung am fertigen Entwurf (Schwerpunkt und Lagen aus C.bal)
function bauraum(C, g) {
  g = g || C.bal.g;
  const P = C.P, cf = C.cfg, tg = C.tail, pf = C.pf, cl = g.cl, fu = g.fus, items = [];
  let viol = 0;
  const cm = v => fmtDe(v * 100, 1) + ' cm';
  const add = (k, l, sev, val, need, txt, v) => { items.push({ k, l, sev, val, need, txt }); if (sev === 'crit') viol += Math.max(0.01, v); };
  // 1) Propellerkreis gegen Struktur
  const zone = propZone(C, g);
  for (const z of zone) {
    const inDisk = z.rad < Infinity, l = `Propeller – ${z.n}`;
    if (!z.ok) {
      const txt = inDisk && z.rad < 0 ? `Propellerkreis schneidet ${z.n} (${cm(-z.rad)} im Kreis)` : inDisk ? `Blattspitzen nur ${cm(z.rad)} von ${z.n} (mindestens ${cm(cl.r)})` : `Nur ${cm(Math.max(0, z.ax))} zwischen Blättern und ${z.n} (mindestens ${cm(cl.a)})`;
      add('prop-' + z.k, l, 'crit', inDisk ? `${cm(z.rad)} radial` : `${cm(z.ax)} axial`, inDisk ? `≥ ${cm(cl.r)}` : `≥ ${cm(cl.a)}`, txt, z.pen / 0.05);
    } else if (z.ax < Infinity) add('prop-' + z.k, l, 'good', `${cm(z.ax)} axial`, `≥ ${cm(cl.a)}`, `${z.n} ${cm(z.ax)} von der Blattebene`);
    else add('prop-' + z.k, l, 'good', `${cm(z.rad)} radial`, `≥ ${cm(cl.r)}`, `Blattspitzen ${cm(z.rad)} von ${z.n}`);
  }
  // 2) Boden bei der Landung
  const pc = propClearance(C);
  if (pc.need === 'strike') add('ground', 'Propeller – Boden (Landung)', 'crit', cm(pc.folded), '> 1 cm gefaltet', `Auch der gefaltete Propeller berührt bei ${fmtDe(pc.th, 0)}° Landewinkel den Boden`, (0.01 - pc.folded) / 0.05 + 0.1);
  else if (pc.need === 'fold') add('ground', 'Propeller – Boden (Landung)', 'info', pc.open >= 0 ? `${cm(pc.open)} frei` : `${cm(-pc.open)} darunter`, '≥ 3 cm offen', pc.open >= 0 ? `Propeller nur ${cm(pc.open)} über Grund bei ${fmtDe(pc.th, 0)}°: Klapppropeller, Motor vor dem Aufsetzen stoppen` : `Propellerkreis reicht ${cm(-pc.open)} unter die Bodenlinie bei ${fmtDe(pc.th, 0)}°: Klapppropeller, Motor vor dem Aufsetzen stoppen`);
  else add('ground', 'Propeller – Boden (Landung)', 'good', `${cm(pc.open)} frei`, '≥ 3 cm', `Propeller bei der Landung frei (${cm(pc.open)} über Grund bei ${fmtDe(pc.th, 0)}°)`);
  // 3) Heck setzt bei der Landung nicht zuerst auf (tiefster Punkt am Leitwerksfuß)
  const th = P.landPitch * DEG, xc = P.landGear === 'skid' ? g.xSkid : C.bal.xcg, zc = g.zLow;
  const zTailLow = cf.fus === 'glider' ? g.zRoot - fu.dE : g.zRoot - P.boomD, hT = (zTailLow - zc) * Math.cos(th) + (xc - g.xTail) * Math.sin(th);
  add('tailground', 'Heck – Boden (Landung)', hT >= 0.02 ? 'good' : 'crit', cm(hT), '≥ 2 cm', hT >= 0.02 ? `Heck ${cm(hT)} über Grund bei ${fmtDe(P.landPitch, 0)}° Landewinkel` : `Heck setzt bei ${fmtDe(P.landPitch, 0)}° Landewinkel zuerst auf (${cm(hT)}): Leitwerksfuß höher oder kürzerer Hebelarm`, (0.02 - hT) / 0.1);
  // 4) Leitwerk hinter der Gondel (Rohr- bzw. Doppelträger)
  if (cf.fus !== 'glider') {
    const gap = Math.min(g.xhLE, g.xvLE) - P.fusL;
    add('tailpod', 'Leitwerk – Gondelende', gap >= TAIL_GAP ? 'good' : 'crit', cm(gap), `≥ ${cm(TAIL_GAP)}`, gap >= TAIL_GAP ? `Leitwerk beginnt ${cm(gap)} hinter der Gondel` : `Leitwerk sitzt über der Gondel (${cm(gap)}): Hebelarm zu kurz für ${fmtDe(P.fusL, 2)} m Gondellänge`, (TAIL_GAP - gap) / 0.1);
  } else {
    // 5) Heckkegel: mittlere Neigung von Ober- und Unterkante zwischen Kegelbeginn und Rumpfende
    const lc = Math.max(1e-3, fu.L - fu.t0), r = P.fusD / 2, aBot = Math.atan((g.zRoot - fu.dE + r) / lc) * RAD, aTop = Math.atan((r - g.zRoot) / lc) * RAD, a = Math.max(aBot, aTop);
    add('cone', 'Heckkegel des Rumpfs', a <= CONE_MAX ? 'good' : 'crit', fmtDe(a, 1) + '°', `≤ ${CONE_MAX}°`, a <= CONE_MAX ? `Heckkegel ${fmtDe(a, 1)}° geneigt (${fmtDe(lc, 2)} m lang)` : `Heckkegel ${fmtDe(a, 1)}° steil: die Strömung löst ab (ab etwa 14°). Längerer Hebelarm, Leitwerksfuß tiefer oder kürzere Gondel`, (a - CONE_MAX) / CONE_MAX);
  }
  // 6) Flügel sitzt auf dem Rumpf: mindestens 60 % der Wurzeltiefe über Rumpf bzw. Gondel (hinter der halben Nasenlänge)
  const xr0 = 0.5 * fu.n1, xr1 = cf.fus === 'glider' ? fu.L : P.fusL, ov = Math.min(xr1, g.xLE0 + pf.cr) - Math.max(xr0, g.xLE0);
  add('wingpod', 'Flügel auf dem Rumpf', ov >= 0.6 * pf.cr ? 'good' : 'crit', fmtDe(Math.max(0, ov) / pf.cr * 100, 0) + ' %', '≥ 60 % der Wurzeltiefe', ov >= 0.6 * pf.cr ? `Flügelwurzel liegt zu ${fmtDe(Math.min(1, ov / pf.cr) * 100, 0)} % auf dem Rumpf` : 'Flügelwurzel liegt nicht auf dem Rumpf: Flügellage bzw. Verschiebeweg der Trimmung prüfen', (0.6 * pf.cr - ov) / pf.cr);
  // 7) Höhenleitwerk hinter der Flügelendleiste (über die Leitwerksspannweite)
  let teW = -Infinity; for (let k = 0; k <= 6; k++) { const e = clamp(tg.bh / 2 * k / 6 / (pf.b / 2), 0, 1); teW = Math.max(teW, g.xLE0 + pf.xLE(e) + pf.chordAt(e)); }
  const gH = g.xhLE - teW;
  add('htwing', 'Höhenleitwerk – Flügel', gH >= TAIL_GAP ? 'good' : 'crit', cm(gH), `≥ ${cm(TAIL_GAP)}`, gH >= TAIL_GAP ? `Höhenleitwerk ${cm(gH)} hinter der Flügelendleiste` : 'Höhenleitwerk überlappt den Flügel', (TAIL_GAP - gH) / 0.2);
  // Angaben zur Lage des Antriebs
  if (cf.mot === 'fin') add('nac', 'Motorgondel vor der Seitenleitwerksspitze', g.finExt >= NAC_MAX - 1e-6 ? 'warn' : 'info', cm(g.finExt), `≤ ${cm(NAC_MAX)}`, `Motorgondel ragt ${cm(g.finExt)} vor die Seitenleitwerksspitze, damit die Blätter vor Vorderkante und Höhenleitwerk drehen`);
  if (g.pylon > 0) add('pyl', 'Pylon', 'info', cm(g.pylon), '', `Pylon ${cm(g.pylon)} hoch: Propellerkreis ${cm(cl.r)} + 1,5 cm über Rumpf bzw. Rohr`);
  if (cf.fus === 'twin' && cf.mot === 'pusher') add('twin', 'Abstand der Träger', 'info', cm(2 * g.yB), '', `Träger ${cm(g.yB)} neben der Propellerachse`);
  const crit = items.filter(i => i.sev === 'crit');
  return { ok: crit.length === 0, viol, items, crit, zone, pc, cl, hx: cl.e + cl.a, Rz: cl.R + cl.r };
}

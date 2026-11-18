/* ===================================================================
   CAD-Export: Geometrie des Entwurfs als JSON, gedacht für CATIA V5 (Generative Shape Design, Python-Skripte)
   - Einheiten: Längen in mm (auf 0,1 mm), Winkel in Grad, Massen in g, Trägheitsmomente in kg·m².
   - Achsen wie im Rechner: x nach hinten ab der Rumpfnase, y nach rechts (rechter Flügel), z nach oben; Ursprung in
     der Rumpfnase auf der Rumpfachse. Nur die rechte Hälfte; das Flugzeug ist symmetrisch zur xz-Ebene (y = 0).
   - Profile normiert auf die Tiefe 1 (Nase (0, 0), Hinterkante (1, 0)), Selig-Reihenfolge: Hinterkante – Oberseite –
     Nase – Unterseite – Hinterkante. Ein Schnitt entsteht durch Skalieren mit der Tiefe, Drehen um den t/4-Punkt
     (Einstellwinkel plus Verwindung, positiv Nase hoch) und Verschieben; die Schnitte stehen senkrecht (xz-Ebene).
   - Solarmodule: je Modulreihe die vier Ecken auf der Flügeloberseite (gebogen: Fläche folgt der Kontur; eben: ebene
     Fläche durch die Ecken, darunter die Kontur bis zur angegebenen Abweichung).
   =================================================================== */
const CAD_VERSION = 1;
const cadMm = v => Math.round(v * 10000) / 10;
const cadR = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const cadP = p => p.map(cadMm);
// Profilkoordinaten (Selig-Reihenfolge, normiert) aus der Datenbank; ohne Originalkoordinaten aus der Kontur (33 Punkte)
function foilDat(f) {
  const b = (f && f.base) || f;
  if (b && b.dat) return b.dat.x.map((x, i) => [x, b.dat.y[i]]);
  const s = b.shape;
  return [...s.x.map((x, i) => [x, s.yu[i]]).reverse(), ...s.x.slice(1).map((x, i) => [x, s.yl[i + 1]])];
}
// Oberseite eines Selig-Koordinatensatzes bei x (linear)
function datYu(pts, x) {
  let le = 0; for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[le][0]) le = i;
  for (let i = le; i > 0; i--) { const a = pts[i], b = pts[i - 1]; if (x >= a[0] - 1e-12 && x <= b[0] + 1e-12) return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1); }
  return x <= pts[le][0] ? pts[le][1] : pts[0][1];
}
function datYl(pts, x) {
  let le = 0; for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[le][0]) le = i;
  for (let i = le; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; if (x >= a[0] - 1e-12 && x <= b[0] + 1e-12) return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1); }
  return x <= pts[le][0] ? pts[le][1] : pts[pts.length - 1][1];
}
// Profil mit Facetten: Oberseite zwischen den Modulkanten als Sehne, Kanten als eigene Punkte
function facetDat(pts, facets) {
  if (!facets || !facets.length) return pts;
  let le = 0; for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[le][0]) le = i;
  const up = pts.slice(0, le + 1).reverse(), lo = pts.slice(le);
  const xs = Array.from(new Set([...up.map(p => p[0]), ...facets.flat()].map(v => cadR(v, 6)))).sort((a, b) => a - b);
  const yAt = x => { for (const [a, b] of facets) if (x >= a - 1e-9 && x <= b + 1e-9) { const ya = datYu(pts, a), yb = datYu(pts, b); return ya + (yb - ya) * (x - a) / ((b - a) || 1); } return datYu(pts, x); };
  return [...xs.map(x => [x, cadR(yAt(x), 6)]).reverse(), ...lo.slice(1)];
}
/* Punkt eines Flügelschnitts: Tiefenanteil xr, Höhe zr (beide auf die Tiefe bezogen) an der Halbspannweitenstelle y.
   Vorderkante bei g.xLE0 + pf.xLE(η), Sehne in Höhe zWingAt (V-Form), gedreht um den t/4-Punkt um iw + Verwindung(η). */
function cadWingPt(C, y, xr, zr) {
  const pf = C.pf, g = C.bal.g, h = pf.b / 2, e = clamp(y / h, 0, 1), c = pf.chordAt(e), th = (cadIncidence(C) + pf.twistAt(e)) * DEG;
  const xq = g.xLE0 + pf.xLE(e) + c / 4, z0 = zWingAt(g, y), dx = (xr - 0.25) * c, dz = zr * c;
  return [xq + dx * Math.cos(th) + dz * Math.sin(th), y, z0 - dx * Math.sin(th) + dz * Math.cos(th)];
}
// Einstellwinkel des Flügels gegen die Rumpfachse: Anstellwinkel der Wurzelsehne im Reiseflug (Rumpf dann in Flugrichtung)
const cadIncidence = C => (C.lvl && fin(C.lvl.alpha) ? C.lvl.alpha : 0);
function cadExport(C, opt = {}) {
  const P = C.P, pf = C.pf, g = C.bal.g, tg = C.tail, cf = C.cfg, so = C.solar, h = pf.b / 2, iw = cadIncidence(C);
  const f = C.foil0 || C.foil, wPts = foilDat(f), tPts = foilDat(C.tfoil), fc = so.facet;
  // Schnitte: Wurzel, Knick, Querruder, Teilung, Spitze (elliptisch: 13 Schnitte); dazu Anfang und Ende der V-Form
  const etas = new Set([0, 1]);
  if (pf.type === 'rect_taper' && pf.e > 0.005 && pf.e < 0.995) etas.add(cadR(pf.e, 5));
  if (pf.type === 'ellip') for (let k = 1; k < 12; k++) etas.add(cadR(Math.sin(Math.PI / 2 * k / 12), 5));
  const a0 = clamp(P.ailEta0, 0, 1), a1 = clamp(P.ailEta1, a0, 1);
  if (a1 > a0) { etas.add(cadR(a0, 5)); etas.add(cadR(a1, 5)); }
  const splitE = P.splits === 'none' ? [] : P.splits === 'center' ? [0] : P.splits === 'outer' ? [clamp(P.splitEta, 0.05, 0.95)] : [0, clamp(P.splitEta, 0.05, 0.95)];
  splitE.forEach(e => etas.add(cadR(e, 5)));
  const labelOf = e => [e === 0 ? 'Wurzel' : '', e === 1 ? 'Spitze' : '', pf.type === 'rect_taper' && Math.abs(e - pf.e) < 1e-4 ? 'Knick' : '', Math.abs(e - a0) < 1e-4 && a1 > a0 ? 'Querruder innen' : '', Math.abs(e - a1) < 1e-4 && a1 > a0 && e < 1 ? 'Querruder außen' : '', splitE.some(s => s > 0 && Math.abs(s - e) < 1e-4) ? 'Teilung' : ''].filter(Boolean).join(', ');
  // Modulreihen (eben oder gebogen) an der Stelle y: Tiefenanteile vorn und hinten
  const rowsAt = (mods, y, cAt, xlAt) => {
    const out = [];
    for (const md of mods || []) {
      if (y < md.y0 - 1e-6 || y > md.y1 + 1e-6) continue;
      const xf = md.x0 + md.t * (y - md.y0), c = cAt(y), xl = xlAt(y);
      for (let r = 0; r < md.m; r++) { const a = xf + r * (md.D + so.ms.gm) / (md.k * md.cphi), b = a + md.D / (md.k * md.cphi); out.push([cadR((a - xl) / c, 5), cadR((b - xl) / c, 5)]); }
    }
    return out.sort((p, q) => p[0] - q[0]);
  };
  const cW = y => pf.chordAt(clamp(y / h, 0, 1)), xlW = y => pf.xLE(clamp(y / h, 0, 1));
  const sections = [...etas].sort((a, b) => a - b).map(e => {
    const y = e * h, c = pf.chordAt(e), le = cadWingPt(C, y, 0, 0), te = cadWingPt(C, y, 1, 0), fr = so.mount === 'flat' ? rowsAt(so.modsHalf, y, cW, xlW) : [];
    return { eta: cadR(e, 4), label: labelOf(e), y: cadMm(y), chord: cadMm(c), le: cadP(le), te: cadP(te), twist_deg: cadR(iw + pf.twistAt(e), 3), ...(fr.length ? { facets: fr } : {}) };
  });
  // Solarmodule: vier Ecken je Modulreihe auf der Oberseite (Reihenfolge vorn innen, vorn außen, hinten außen, hinten innen)
  const modRows = (mods, ptAt) => (mods || []).flatMap((md, i) => Array.from({ length: md.m }, (_, r) => {
    const fr = (y, back) => md.x0 + md.t * (y - md.y0) + (r * (md.D + so.ms.gm) + (back ? md.D : 0)) / (md.k * md.cphi);
    return { module: i + 1, row: r + 1, cells: md.n * md.rows, on_control: !!md.ctrl, y0: cadMm(md.y0), y1: cadMm(md.y1), corners: [ptAt(md.y0, fr(md.y0, 0)), ptAt(md.y1, fr(md.y1, 0)), ptAt(md.y1, fr(md.y1, 1)), ptAt(md.y0, fr(md.y0, 1))].map(cadP) };
  }));
  const wingSurf = (y, x) => { const c = cW(y), xr = (x - xlW(y)) / c; return cadWingPt(C, y, xr, datYu(wPts, xr)); };
  // Höhenleitwerk: Einstellwinkel für getrimmten Reiseflug mit Ruder in Nulllage (Rumpf in Flugrichtung):
  // i_h = c_A,H/a_H + ε mit ε = dε/dα · c_A/a_W; Modulecken auf dem so gedrehten Leitwerk (Drehung um t/4)
  const np = C.np || C.bal.np, ih = np && C.lvl ? (C.lvl.CLh / np.at + np.deda * C.lvl.CL / np.aw) * RAD : 0;
  const htSurf = (y, x) => { const th = ih * DEG, dx = x - tg.ch / 4, dz = datYu(tPts, x / tg.ch) * tg.ch; return [g.xhLE + tg.ch / 4 + dx * Math.cos(th) + dz * Math.sin(th), y, g.zH - dx * Math.sin(th) + dz * Math.cos(th)]; };
  const allMove = P.elevCf >= 0.999;
  const fu = g.fus, items = (C.bal.mi && C.bal.mi.items) || [];
  const out = {
    format: 'waldbrand-uav-cad', version: CAD_VERSION,
    units: { length: 'mm', angle: 'deg', mass: 'g', inertia: 'kg·m²' },
    axes: 'x nach hinten ab Rumpfnase, y nach rechts (rechter Flügel), z nach oben; Ursprung Rumpfnase auf der Rumpfachse. Nur rechte Hälfte, symmetrisch zu y = 0.',
    meta: { name: opt.name || '', created: opt.date || '', tool: 'Waldbrand-UAV Energiebudget', note: 'Schnitte senkrecht (xz-Ebene), Profil skaliert mit der Tiefe und um den t/4-Punkt gedreht (twist_deg, positiv Nase hoch); le und te sind die Punkte nach der Drehung.' },
    airfoils: {
      wing: { key: f.key, name: f.name, t: cadR(f.t, 4), coords: wPts.map(p => [cadR(p[0], 5), cadR(p[1], 5)]) },
      tail: { key: C.tfoil.key, name: C.tfoil.name, t: cadR(C.tfoil.t, 4), coords: tPts.map(p => [cadR(p[0], 5), cadR(p[1], 5)]) }
    },
    wing: {
      span: cadMm(pf.b), area_mm2: Math.round(pf.S * 1e6), mac: cadMm(pf.mac), x_mac_le: cadMm(g.xmac), planform: pf.type, sweep_c4_deg: cadR(pf.sweep || 0, 2),
      incidence_deg: cadR(iw, 3), incidence_note: 'Anstellwinkel der Wurzelsehne im Reiseflug: der Rumpf liegt dann in Flugrichtung.',
      dihedral: { from_y: cadMm(g.yK), deg: cadR(P.dihedral || 0, 2) },
      sections,
      spar: { type: P.sparType, x_c: cadR(P.xSpar / 100, 3), height_of_thickness: cadR(P.sparH / 100, 3), stations: sections.map(s => ({ y: s.y, height: cadMm(P.sparH / 100 * f.t * s.chord / 1000) })) },
      ailerons: a1 > a0 ? { eta0: cadR(a0, 4), eta1: cadR(a1, 4), segments: Math.max(1, Math.round(P.nAilSeg || 1)), hinge_x_c: cadR(1 - P.ailCf, 3), hinge_line: [cadP(cadWingPt(C, a0 * h, 1 - P.ailCf, (datYu(wPts, 1 - P.ailCf) + datYl(wPts, 1 - P.ailCf)) / 2)), cadP(cadWingPt(C, a1 * h, 1 - P.ailCf, (datYu(wPts, 1 - P.ailCf) + datYl(wPts, 1 - P.ailCf)) / 2))], max_deflection_deg: P.ailMax } : null,
      splits: splitE.map(e => ({ eta: cadR(e, 4), y: cadMm(e * h) }))
    },
    htail: {
      span: cadMm(tg.bh), chord: cadMm(tg.ch), area_mm2: Math.round(tg.Sh * 1e6), x_le: cadMm(g.xhLE), z: cadMm(g.zH), layout: cf.tail,
      incidence_deg: cadR(ih, 3), incidence_note: 'Für getrimmten Reiseflug bei Ruder in Nulllage, Rumpf in Flugrichtung (i_H = c_A,H/a_H + dε/dα·c_A/a_W).',
      elevator: allMove ? { all_moving: true, pivot_x_c: cadR(P.elevPivot / 100, 3), max_deflection_deg: P.elevMax } : { all_moving: false, hinge_x_c: cadR(1 - P.elevCf, 3), max_deflection_deg: P.elevMax }
    },
    vtail: {
      count: tg.nFin, y: cadMm(g.yB), height: cadMm(tg.bv), root_chord: cadMm(tg.cv), tip_chord: cadMm(0.62 * tg.cv), x_le_root: cadMm(g.xvLE), x_le_tip: cadMm(g.xvLE + g.vSw * tg.bv), z_root: cadMm(g.zV0), z_tip: cadMm(g.zV1), area_mm2: Math.round(tg.Svf * 1e6),
      rudder: { hinge_x_c: cadR(1 - P.rudCf, 3), max_deflection_deg: P.rudMax }
    },
    fuselage: {
      type: cf.fus, length: cadMm(fu.L), diameter: cadMm(fu.D), note: 'Drehkörper: je Station Kreis mit Mittelpunkt z und Durchmesser d.',
      stations: fu.st.map(s => ({ x: cadMm(s.x), z: cadMm(s.z), d: cadMm(s.d) })),
      boom: cf.nBoom ? { count: cf.nBoom, d: cadMm(P.boomD), y: cadMm(g.yB), start: [cadMm(g.boom0), cadMm(g.yB), cadMm(g.zB0)], end: [cadMm(g.boom1), cadMm(g.yB), cadMm(g.zB1)] } : null
    },
    propulsion: {
      position: cf.mot, prop_d: cadMm(2 * g.R), prop_plane_x: cadMm(g.xProp), hub_z: cadMm(g.zP), motor_x: cadMm(g.xMot),
      nacelle: g.nac ? { x0: cadMm(g.nac.x0), x1: cadMm(g.nac.x1), d: cadMm(g.nac.d), z: cadMm(g.nac.z) } : null,
      pylon: g.pyl ? { x0: cadMm(g.pyl.x0), x1: cadMm(g.pyl.x1), z0: cadMm(g.pyl.z0), z1: cadMm(g.pyl.z1) } : null
    },
    landing: P.landGear === 'skid' ? { type: 'skid', x: cadMm(g.xSkid), z: cadMm(g.zLow) } : { type: 'belly' },
    solar: so.mode === 'area' ? { mount: 'area', note: 'Zellfläche frei eingegeben: keine Module zum Exportieren.' } : {
      mount: so.mount, cell: { name: so.spec.name, size: cadMm(so.spec.s), ingot_d: cadMm(so.spec.d), thickness_um: Math.round(so.spec.t * 1e6), gap: cadMm(so.g) },
      module: { type: so.ms.type, rows: so.ms.rows, edge: cadMm(so.ms.e), gap: cadMm(so.ms.gm), depth: cadMm(so.ms.D) },
      cells_wing: so.n, cells_ht: so.ht && so.ht.cols ? so.ht.cols.reduce((q, c) => q + c.n, 0) * 2 : 0,
      ...(fc ? { facet: { deviation_max: cadMm(fc.dev), kinks_deg: fc.kinks.map(k => cadR(k, 2)), transition_x_c: cadR(fc.xtr, 3), area_share: cadR(fc.phi, 3) } } : {}),
      wing_modules: modRows(so.modsHalf, wingSurf),
      ht_modules: modRows(so.ht ? so.ht.mods : [], htSurf),
      note: so.mount === 'flat' ? 'Eben: jede Modulreihe ist eine ebene Fläche durch ihre Ecken; die Ecken liegen auf der Profilkontur.' : 'Gebogen: jede Modulreihe folgt der Flügeloberseite zwischen ihren Ecken.'
    },
    mass: {
      total: Math.round(C.m * 1000), cg: [cadMm(C.bal.xcg), 0, cadMm(C.bal.zcg)],
      inertia: C.bal.mi ? { Ixx: cadR(C.bal.mi.Ixx, 4), Iyy: cadR(C.bal.mi.Iyy, 4), Izz: cadR(C.bal.mi.Izz, 4) } : null,
      items_note: 'y > 0: Masse je zur Hälfte bei +y und −y (beide Flügelhälften bzw. Träger).',
      items: items.map(it => ({ key: it.key, name: it.name, cat: it.cat, m: Math.round(it.m * 10000) / 10, x: cadMm(it.x), y: cadMm(it.y), z: cadMm(it.z) }))
    }
  };
  return out;
}

/* ===================================================================
   Schatten auf den Solarzellen: Seitenleitwerk(e), Motorgondel, Pylon
   und die drehende Propellerscheibe werfen Schatten auf die Zellen von
   Höhenleitwerk und Flügel.
   - Sonne aus Höhe h und Richtung ψ gegen die Flugrichtung (alle Kurse
     gleich häufig, 16 Richtungen), Richtung zur Sonne in Körperachsen
     s = (−cos h·cos ψ, cos h·sin ψ, sin h).
   - Jeder Schattenwerfer ist ein ebenes oder konvexes Vieleck; der Teil
     über der Zellebene z₀ wird entlang −s auf die Ebene projiziert:
     P′ = P − s·(P_z − z₀)/s_z. Die Schattenfläche auf jeder Zelle folgt
     aus dem Schnitt mit dem Zellrechteck (Sutherland–Hodgman).
   - Propellerscheibe teildurchlässig: sie deckt im Mittel den Anteil
     σ = B·∫c dr/(πR²) (Blattfläche je Kreisfläche).
   - Verschaltung: mit Bypassdiode je Zelle verliert ein Strang die
     verschattete Fläche (Mittel über die Zellen), ohne Bypassdioden
     bestimmt die am stärksten verschattete Zelle den Strom des ganzen
     Strangs (Quaschning und Hanitsch 1996). Stränge: je Flügelhälfte einer,
     Höhenleitwerk einer. Der Schatten nimmt nur die Direktstrahlung weg.
   Ergebnis: Verlustanteil der Direktstrahlung S(h) je Sonnenhöhe (0…90°),
   über alle Kurse gemittelt, für Flügel und Höhenleitwerk.
   =================================================================== */
const SHADE_H = [5, 8, 12, 17, 23, 30, 40, 52, 66, 78, 90], SHADE_NPSI = 16;
// Fläche eines Vielecks (Schuhbandformel) und Schnitt mit einem achsparallelen Rechteck
function polyArea(p) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; }
function clipRect(poly, x0, x1, y0, y1) {
  let p = poly;
  const edge = (inside, cut) => { const out = []; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); } p = out; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  edge(q => q[0] >= x0, (a, b) => lerp(a, b, (x0 - a[0]) / (b[0] - a[0]))); if (p.length < 3) return 0;
  edge(q => q[0] <= x1, (a, b) => lerp(a, b, (x1 - a[0]) / (b[0] - a[0]))); if (p.length < 3) return 0;
  edge(q => q[1] >= y0, (a, b) => lerp(a, b, (y0 - a[1]) / (b[1] - a[1]))); if (p.length < 3) return 0;
  edge(q => q[1] <= y1, (a, b) => lerp(a, b, (y1 - a[1]) / (b[1] - a[1]))); if (p.length < 3) return 0;
  return polyArea(p);
}
// konvexe Hülle (monotone Kette) für Körper aus mehreren Punkten
function hull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Schattenwerfer als 3D-Vielecke (Punkte [x, y, z]); body: Punktwolke eines konvexen Körpers (Hülle der Projektion)
function shadeCasters(C, g) {
  const P = C.P, tg = C.tail, cf = C.cfg, out = [];
  const fys = tg.nFin > 1 ? [-g.yB, g.yB] : [0];
  for (const y of fys) {
    const tipLE = g.xvLE + g.vSw * tg.bv;
    out.push({ k: 'fin', n: tg.nFin > 1 ? 'Seitenleitwerke' : 'Seitenleitwerk', w: 1, poly: [[g.xvLE, y, g.zV0], [tipLE, y, g.zV1], [tipLE + 0.62 * tg.cv, y, g.zV1], [g.xvTE, y, g.zV0]] });
  }
  if (g.nac) { const n = g.nac, r = n.d / 2, pts = []; for (const x of [n.x0, n.x1]) for (const y of [-r, r]) for (const z of [n.z - r, n.z + r]) pts.push([x, y, z]); out.push({ k: 'nac', n: 'Motorgondel', w: 1, body: pts }); }
  if (g.pyl) { const y = g.pyl; out.push({ k: 'pyl', n: 'Pylon', w: 1, poly: [[y.x0, 0, y.z0], [y.x0 + 0.03, 0, y.z1], [y.x1, 0, y.z1], [y.x1, 0, y.z0]] }); }
  // Propellerscheibe: im Mittel deckt sie die Blattfläche je Kreisfläche
  const pg = propGeometry(P); let ab = 0; for (let i = 0; i < 20; i++) { const x = (i + 0.5) / 20; ab += pg.c(x) * pg.R / 20; }
  const sig = clamp(pg.B * ab / (Math.PI * pg.R * pg.R), 0, 1), disk = [];
  for (let i = 0; i < 16; i++) { const a = 2 * Math.PI * i / 16; disk.push([g.xProp, pg.R * Math.cos(a), g.zP + pg.R * Math.sin(a)]); }
  out.push({ k: 'prop', n: 'Propellerkreis', w: sig, poly: disk });
  return { list: out, sig };
}
// Teil eines ebenen Vielecks oberhalb von z₀ (Schnitt mit dem Halbraum z ≥ z₀)
function clipAbove(poly, z0) {
  const out = []; for (let i = 0, n = poly.length; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n], ia = a[2] >= z0, ib = b[2] >= z0; if (ia) out.push(a); if (ia !== ib) { const t = (z0 - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z0]); } }
  return out;
}
// Schatten eines Werfers auf der Ebene z₀ als 2D-Vieleck (x, y) oder null
function shadowOn(c, s, z0) {
  const proj = q => { const t = (q[2] - z0) / s[2]; return [q[0] - s[0] * t, q[1] - s[1] * t]; };
  if (c.body) { const pts = c.body.filter(q => q[2] >= z0).map(proj); return pts.length >= 3 ? hull2(pts) : null; }
  const p = clipAbove(c.poly, z0); if (p.length < 3) return null;
  const q = p.map(proj); return polyArea(q) > 1e-9 ? q : null;
}
// Zellen als Rechtecke in (x, y) mit Höhe z; Stränge: Flügel rechts, Flügel links, Höhenleitwerk
function shadeCells(C, g) {
  const so = C.solar, pf = C.pf, tg = C.tail, h = pf.b / 2, U = foilUpper(C.foil), W = [], H = [];
  if (so.mode !== 'area') for (const c of so.colsHalf) for (let i = 0; i < c.n; i++) {
    const xa = g.xLE0 + c.x0 + i * (c.l + so.g) / c.k, xb = xa + c.l / c.k, ym = (c.y0 + c.y1) / 2, e = clamp(ym / h, 0, 1), ch = pf.chordAt(e), xl = g.xLE0 + pf.xLE(e);
    const z = zWingAt(g, ym) + upPt(U, upS(U, clamp(((xa + xb) / 2 - xl) / ch, 0, 1)))[1] * ch;
    for (const sg of [1, -1]) W.push({ x0: xa, x1: xb, y0: sg > 0 ? c.y0 : -c.y1, y1: sg > 0 ? c.y1 : -c.y0, z, str: sg > 0 ? 0 : 1 });
  }
  // Höhenleitwerk: so viele Zellen wie die belegte Fläche, von außen nach innen (weg vom Seitenleitwerk)
  if (so.ht.a > 0 && so.ht.cols.length) {
    const UH = foilUpper(C.tfoil), all = [];
    for (const c of so.ht.cols) for (let i = 0; i < c.n; i++) {
      const xa = g.xhLE + c.x0 + i * (c.l + so.g) / c.k, xb = xa + c.l / c.k, z = g.zH + upPt(UH, upS(UH, clamp(((xa + xb) / 2 - g.xhLE) / tg.ch, 0, 1)))[1] * tg.ch;
      for (const sg of [1, -1]) all.push({ x0: xa, x1: xb, y0: sg > 0 ? c.y0 : -c.y1, y1: sg > 0 ? c.y1 : -c.y0, z, str: 2, ya: (c.y0 + c.y1) / 2 });
    }
    const nUse = Math.max(1, Math.min(all.length, Math.round(so.ht.a / so.spec.A)));
    all.sort((a, b) => b.ya - a.ya); H.push(...all.slice(0, nUse));
  }
  return { W, H };
}
function shadeFactors(C, g) {
  g = g || C.bal.g;
  const P = C.P, cs = shadeCells(C, g), cas = shadeCasters(C, g), bypass = P.bypass !== 'none';
  const res = { W: new Float64Array(91), H: new Float64Array(91), sig: cas.sig, bypass, nW: cs.W.length, nH: cs.H.length, by: {} };
  if (!cs.W.length && !cs.H.length) return res;
  // Bezugshöhe je Zellgruppe (Mittel der Zellhöhen); Zellen außerhalb der Reichweite eines Werfers überspringen
  const groups = [['W', cs.W, [0, 1]], ['H', cs.H, [2]]].filter(gr => gr[1].length).map(([key, cells, strs]) => {
    cells.sort((a, b) => a.y0 - b.y0);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, wMax = 0; for (const c of cells) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); y0 = Math.min(y0, c.y0); y1 = Math.max(y1, c.y1); wMax = Math.max(wMax, c.y1 - c.y0); }
    return { key, cells, strs, z0: cells.reduce((a, c) => a + c.z, 0) / cells.length, A: cells.map(c => (c.x1 - c.x0) * (c.y1 - c.y0)), bb: [x0, x1, y0, y1], wMax, ys: cells.map(c => c.y0) };
  });
  const tab = {};
  for (const gr of groups) { tab[gr.key] = []; gr.byCaster = {}; }
  for (const hd of SHADE_H) {
    const he = hd * DEG, ce = Math.cos(he), se = Math.sin(he), acc = {}, accC = {};
    for (const gr of groups) { acc[gr.key] = 0; accC[gr.key] = {}; }
    for (let ip = 0; ip < SHADE_NPSI; ip++) {
      const ps = 2 * Math.PI * (ip + 0.5) / SHADE_NPSI, s = [-ce * Math.cos(ps), ce * Math.sin(ps), se];
      for (const gr of groups) {
        const f = new Float64Array(gr.cells.length), fc = {};
        for (const c of cas.list) {
          const sh = shadowOn(c, s, gr.z0); if (!sh) continue;
          let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity; for (const [x, y] of sh) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
          if (bx1 < gr.bb[0] || bx0 > gr.bb[1] || by1 < gr.bb[2] || by0 > gr.bb[3]) continue;
          // Zellen nach y sortiert: erste mögliche Zelle per Halbierung suchen
          let lo = 0, hi = gr.ys.length; const yq = by0 - gr.wMax; while (lo < hi) { const m = (lo + hi) >> 1; if (gr.ys[m] < yq) lo = m + 1; else hi = m; }
          for (let k = lo; k < gr.cells.length; k++) {
            const cl = gr.cells[k]; if (cl.y0 > by1) break;
            if (cl.x1 < bx0 || cl.x0 > bx1 || cl.y1 < by0) continue;
            const a = clipRect(sh, cl.x0, cl.x1, cl.y0, cl.y1); if (a > 0) { const d = c.w * a / gr.A[k]; f[k] = Math.min(1, f[k] + d); fc[c.k] = (fc[c.k] || 0) + Math.min(1, d) * gr.A[k]; }
          }
        }
        // Verlust der Direktstrahlung je Strang, dann flächengewichtet über die Stränge der Gruppe
        let loss = 0, aTot = 0;
        for (const st of gr.strs) {
          let a = 0, fa = 0, fm = 0; gr.cells.forEach((cl, k) => { if (cl.str !== st) return; a += gr.A[k]; fa += f[k] * gr.A[k]; fm = Math.max(fm, f[k]); });
          if (a > 0) { loss += (bypass ? fa : fm * a); aTot += a; }
        }
        acc[gr.key] += aTot > 0 ? loss / aTot : 0;
        const aG = gr.A.reduce((x, y) => x + y, 0); for (const k in fc) accC[gr.key][k] = (accC[gr.key][k] || 0) + fc[k] / aG;
      }
    }
    for (const gr of groups) { tab[gr.key].push([hd, acc[gr.key] / SHADE_NPSI]); for (const c of cas.list) (gr.byCaster[c.k] = gr.byCaster[c.k] || []).push([hd, (accC[gr.key][c.k] || 0) / SHADE_NPSI]); }
  }
  // auf ganze Grad interpolieren; unter 5° wie bei 5° (dort trägt die Direktstrahlung kaum noch bei)
  const interp = (pts, d) => { if (d <= pts[0][0]) return pts[0][1]; for (let i = 0; i < pts.length - 1; i++) if (d <= pts[i + 1][0]) { const [a, fa] = pts[i], [b, fb] = pts[i + 1]; return fa + (fb - fa) * (d - a) / (b - a); } return pts[pts.length - 1][1]; };
  for (const gr of groups) {
    for (let d = 0; d <= 90; d++) res[gr.key][d] = clamp(interp(tab[gr.key], d), 0, 1);
    res.by[gr.key] = Object.fromEntries(Object.entries(gr.byCaster).map(([k, pts]) => [k, pts]));
    res[gr.key + 'pts'] = tab[gr.key];
  }
  res.names = Object.fromEntries(cas.list.map(c => [c.k, c.n]));
  return res;
}

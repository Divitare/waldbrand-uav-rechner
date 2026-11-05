/* ===================================================================
   Tragflügel mit Pfeilung: Wirbelgitter nach Weissinger (ein Hufeisen-
   wirbel je Streifen auf der t/4-Linie, Aufpunkt nach Pistolesi bei
   t/4 + (t/2)·a0/2π), Spiegelung an der Symmetrieebene.
   Liefert Auftriebsanstieg, Neutralpunkt, Momentenbeiwert aus Schränkung,
   Auftriebsverteilung, induzierten Widerstand (Trefftz-Ebene) sowie
   Roll- und V-Form-Ableitungen (antisymmetrische Lösung).
   Koordinaten: Ursprung im t/4-Punkt der Flügelwurzel, x nach hinten.
   =================================================================== */
const _I4P = 1 / (4 * Math.PI);
// z-Geschwindigkeit im Punkt (x, y, 0) eines Hufeisenwirbels A→B mit Schleppwirbeln nach +x (Stärke 1)
function hsW(x, y, xA, yA, xB, yB) {
  let w = 0;
  const r1x = x - xA, r1y = y - yA, r2x = x - xB, r2y = y - yB, l1 = Math.hypot(r1x, r1y), l2 = Math.hypot(r2x, r2y);
  const cz = r1x * r2y - r1y * r2x;
  if (Math.abs(cz) > 1e-12 * (l1 * l2 + 1e-30)) { const r0x = xB - xA, r0y = yB - yA; w += _I4P / cz * ((r0x * r1x + r0y * r1y) / l1 - (r0x * r2x + r0y * r2y) / l2); }
  if (Math.abs(r1y) > 1e-12) w -= _I4P / r1y * (1 + r1x / l1);
  if (Math.abs(r2y) > 1e-12) w += _I4P / r2y * (1 + r2x / l2);
  return w;
}
function vlmWing(pf, a2d, N = 40) {
  const h = pf.b / 2, tanL = Math.tan((pf.sweep || 0) * DEG), S = pf.S, cbar = pf.mac;
  const yE = []; for (let k = 0; k <= N; k++) yE.push(h * Math.sin(Math.PI / 2 * k / N));
  const xq = y => Math.abs(y) * tanL;
  const pan = [];
  for (let j = 0; j < N; j++) {
    const yA = yE[j], yB = yE[j + 1], ym = (yA + yB) / 2, eta = ym / h, c = pf.chordAt(eta);
    const dih = pf.type === 'rect_taper' ? (eta > pf.e ? 1 : 0) : 1;
    pan.push({ yA, yB, xA: xq(yA), xB: xq(yB), ym, eta, c, dy: yB - yA, xqc: xq(ym), xcp: xq(ym) + c * a2d / (4 * Math.PI), tw: pf.twistAt(eta) * DEG, dih });
  }
  const Asym = zeros(N, N), Aant = zeros(N, N);
  for (let i = 0; i < N; i++) {
    const P = pan[i];
    for (let j = 0; j < N; j++) {
      const Q = pan[j], wr = hsW(P.xcp, P.ym, Q.xA, Q.yA, Q.xB, Q.yB), wm = hsW(P.xcp, P.ym, Q.xB, -Q.yB, Q.xA, -Q.yA);
      Asym[i][j] = wr + wm; Aant[i][j] = wr - wm;
    }
  }
  const ls = luDecomp(Asym), la = luDecomp(Aant);
  const Ga = luSolve(ls, pan.map(() => -1)), Gb = luSolve(ls, pan.map(p => -p.tw)), Gq = luSolve(ls, pan.map(p => -p.xcp));
  const Gp = luSolve(la, pan.map(p => -p.ym)), Gd = luSolve(la, pan.map(p => -p.dih)), Gd2 = luSolve(la, pan.map(() => -1));
  const sum = (G, f) => G.reduce((s, g, i) => s + g * pan[i].dy * (f ? f(pan[i]) : 1), 0);
  const CLa = 4 * sum(Ga) / S, CLb = 4 * sum(Gb) / S, xac = sum(Ga, p => p.xqc) / sum(Ga);
  const Cmb = -4 * sum(Gb, p => p.xqc - xac) / (S * cbar);
  // Trefftz-Ebene: Abwind je Einheitszirkulation
  const T = zeros(N, N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const y = pan[i].ym, Q = pan[j];
    T[i][j] = (1 / (2 * Math.PI)) * (1 / (y - Q.yB) - 1 / (y - Q.yA) + 1 / (y + Q.yA) - 1 / (y + Q.yB));
  }
  const wT = G => T.map(r => r.reduce((s, t, j) => s + t * G[j], 0));
  const wa = wT(Ga), wb = wT(Gb), dot = (G, w) => G.reduce((s, g, i) => s + g * w[i] * pan[i].dy, 0);
  // Diskretisierungsfehler der Trefftz-Summe: an exakt elliptischer Zirkulation auf demselben Gitter geeicht
  const Ge = pan.map(p => Math.sqrt(Math.max(0, 1 - (p.ym / h) ** 2))), CLe = 4 * Ge.reduce((s, g, i) => s + g * pan[i].dy, 0) / S;
  const eDisc = CLe * CLe / (Math.PI * pf.AR * (-2 * dot(Ge, wT(Ge)) / S)), kc = eDisc;
  const kaa = -2 * dot(Ga, wa) / S * kc, kbb = -2 * dot(Gb, wb) / S * kc, kab = -2 * (dot(Ga, wb) + dot(Gb, wa)) / S * kc;
  const st = pan.map((p, i) => ({ eta: p.eta, y: p.ym, c: p.c, w: p.dy / h, fa: 2 * Ga[i] / p.c, fb: 2 * Gb[i] / p.c, xqc: p.xqc, wa: wa[i] * kc, wb: wb[i] * kc }));
  return {
    vlm: true, N, M: N, AR: pf.AR, a0: a2d, CLa, CLb, xac, Cmb, kaa, kab, kbb, st, cosL: Math.cos((pf.sweep || 0) * DEG), tanL,
    Clp: -8 * sum(Gp, p => p.ym) / (S * pf.b * pf.b), ClbDih: -4 * sum(Gd, p => p.ym) / (S * pf.b), ClbDihFull: -4 * sum(Gd2, p => p.ym) / (S * pf.b),
    sGa: sum(Ga), sGax: sum(Ga, p => p.xqc), sGq: sum(Gq), sGqx: sum(Gq, p => p.xqc),
    CLqRef: 4 * sum(Gq) / S * 2 / cbar, CmqRef: -4 * sum(Gq, p => p.xqc) / (S * cbar) * 2 / cbar, Ga, Gb, Gq, pan, la, T, kc
  };
}
// Klassische Traglinie mit derselben Schnittstelle (nur noch zur Kontrolle in der Validierung)
function llAt(ll, CL) {
  const am = (CL - ll.CLb) / ll.CLa;
  let CDi;
  if (ll.vlm) CDi = ll.kaa * am * am + ll.kab * am + ll.kbb;
  else { let s = 0; for (let k = 0; k < ll.N; k++) { const n = 2 * k + 1, An = am * ll.xa[k] + ll.xb[k]; s += n * An * An; } CDi = Math.PI * ll.AR * s; }
  return { am, CDi, e: CDi > 0 ? CL * CL / (Math.PI * ll.AR * CDi) : 1 };
}
// Flügelanteile der Seitenbewegung aus der Auftriebsverteilung bei c_A (Streifenansatz, Etkin)
function wingLateral(ll, CL, cdp, b, S) {
  const am = (CL - ll.CLb) / ll.CLa;
  let sy2 = 0, sy = 0, sd = 0;
  for (const s of ll.st) {
    const cl = am * s.fa + s.fb, dy = s.w * b / 2, y = s.y;
    sy += cl * s.c * y * dy; sy2 += cl * s.c * y * y * dy;
    const cdi = -cl * (am * s.wa + s.wb) / 2; // örtlicher induzierter Widerstand
    sd += (cdp + cdi) * s.c * y * y * dy;
  }
  return {
    ClbSweep: -2 * ll.tanL * sy / (S * b),   // Kutta-Joukowski mit Schiebewinkel an gepfeilten Wirbeln
    Clr: 8 * sy2 / (S * b * b),              // elliptisch: c_A/4
    Cnr: -8 * sd / (S * b * b),              // Widerstand, ungleiche Anströmung beim Gieren
    Cnp: -CL / 8                             // Etkin, gerader Flügel (Pfeilungseinfluss hier nicht erfasst)
  };
}

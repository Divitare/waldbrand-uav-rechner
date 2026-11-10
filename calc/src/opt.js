/* ===================================================================
   Entwurfsvorschläge (Optimierer)
   - Entwurfsgrößen mit Suchbereich, Raster und Gruppe (OPT_CAT); fest-
     gehaltene Eingaben bleiben, Bereiche und erlaubte Werte aus den
     Anforderungen begrenzen die Suche (optVarSet)
   - Ziel: eine Kenngröße möglichst klein oder groß; Bedingungen: die
     Anforderungen an Ergebnisse und die Grundbedingungen (DESIGN_CHECKS)
   - Differential Evolution, Variante current-to-pbest/1/bin mit Anpassung
     von F und CR nach JADE (Zhang und Sanderson 2009) auf [0, 1]ⁿ;
     ganzzahlige Größen und Auswahllisten werden beim Entschlüsseln gerundet
   - Zulässigkeit nach Deb (2000): zulässig schlägt unzulässig, unter
     unzulässigen gewinnt die kleinere Summe der Verletzungen, unter
     zulässigen das bessere Ziel
   - Rechnung in Stufen (Rechenfall, Tagesbilanz, Flattern): ein Kind, das
     schon nach einer billigen Stufe gegen sein Elternteil verliert, wird
     nicht weiter gerechnet
   - Aufräumen (optPolish): jede geänderte Größe probeweise zurück auf den
     alten Wert; bleibt der Entwurf zulässig und kostet es kaum Ziel, bleibt
     sie alt. So zeigt ein Vorschlag nur die Änderungen, die zählen.
   - Mehrere Inseln (Web Worker) mit eigenem Startwert; optPick wählt aus
     allen Ergebnissen deutlich verschiedene Vorschläge
   =================================================================== */
const OPT_GROUPS = [
  ['wing', 'Flügel', true], ['tail', 'Leitwerk und Trimmung', true], ['prop', 'Antrieb', true],
  ['energy', 'Akku und Solarzellen', true], ['struct', 'Struktur und Werkstoffe', true], ['flight', 'Reiseflug', true],
  ['ctrl', 'Ruder', true], ['config', 'Anordnung, Rumpf, Pfeilung', false]
];
// Suchbereiche nach üblicher Praxis für Solarflugzeuge dieser Größe; liegt der jetzige Wert außerhalb, wird der
// Bereich erweitert. when: nur sinnvoll unter dieser Bedingung (sonst wirkt die Größe im Modell nicht);
// dep: Auswahlgröße, die die Bedingung ändern kann (ist sie selbst frei, gilt die Größe immer)
const OPT_CAT = [
  { k: 'span', g: 'wing', lo: 4, hi: 7, st: 0.05 },
  { k: 'area', g: 'wing', lo: 0.8, hi: 2.6, st: 0.01 },
  { k: 'planform', g: 'wing', opts: () => ['rect', 'taper', 'rect_taper'] },
  { k: 'taper', g: 'wing', lo: 0.3, hi: 1, st: 0.05, when: P => P.planform === 'taper' || P.planform === 'rect_taper', dep: 'planform' },
  { k: 'centerFrac', g: 'wing', lo: 0, hi: 0.8, st: 0.05, when: P => P.planform === 'rect_taper', dep: 'planform' },
  { k: 'washout', g: 'wing', lo: 0, hi: 4, st: 0.5 },
  { k: 'dihedral', g: 'wing', lo: 2, hi: 8, st: 0.5 },
  // Profile nach Wölbung, dann Dicke geordnet: benachbarte Werte auf der Suchachse sind ähnliche Profile
  { k: 'airfoil', g: 'wing', opts: () => (AF ? AF.db.foils.filter(f => !f.tail).slice().sort((a, b) => (a.f || 0) - (b.f || 0) || (a.t || 0) - (b.t || 0)).map(f => f.key) : []) },
  { k: 'tailArm', g: 'tail', lo: 0.9, hi: 2.2, st: 0.05 },
  { k: 'vH', g: 'tail', lo: 0.35, hi: 0.6, st: 0.01 },
  { k: 'vV', g: 'tail', lo: 0.018, hi: 0.035, st: 0.002 },
  { k: 'arH', g: 'tail', lo: 3.5, hi: 7, st: 0.5 },
  { k: 'arV', g: 'tail', lo: 1.2, hi: 2.2, st: 0.1 },
  { k: 'smTarget', g: 'tail', lo: 8, hi: 15, st: 1, when: P => P.trimMode !== 'none' },
  // Leitwerksfuß (Heck bei der Landung) und Flügellage auf dem Rumpf (bei Trimmung über Akku oder Ballast): ohne sie
  // kann die Suche die Bauraum-Prüfungen „Heck – Boden“ und „Flügel auf dem Rumpf“ oft nicht erfüllen
  { k: 'zTail', g: 'tail', lo: 0, hi: 0.4, st: 0.01 },
  { k: 'xWingLE', g: 'tail', lo: 0.15, hi: 1.2, st: 0.01, when: P => P.trimMode !== 'wing' },
  { k: 'tailAirfoil', g: 'tail', opts: () => (AF ? AF.db.foils.filter(f => f.tail).map(f => f.key) : []) },
  { k: 'propD', g: 'prop', lo: 0.35, hi: 0.8, st: 0.02, when: P => P.propModel === 'bemt' && P.propGeom !== 'apc10x7' },
  { k: 'propPitch', g: 'prop', lo: 0.15, hi: 0.7, st: 0.01, when: P => P.propModel === 'bemt' && P.propGeom !== 'apc10x7' },
  { k: 'propBlades', g: 'prop', lo: 2, hi: 3, st: 1, int: true, when: P => P.propModel === 'bemt' && P.propGeom !== 'apc10x7' },
  { k: 'gearRatio', g: 'prop', lo: 1, hi: 6, st: 0.1, when: P => P.propModel === 'bemt' },
  { k: 'nCells', g: 'prop', lo: 3, hi: 12, st: 1, int: true, when: P => P.propModel === 'bemt' },
  { k: 'mBatt', g: 'energy', lo: 0.5, hi: 8, st: 0.05 },
  { k: 'htSolar', g: 'energy', lo: 0, hi: 90, st: 5 },
  { k: 'nCellsWing', g: 'energy', lo: 20, hi: 800, st: 2, int: true, when: P => P.solarMode === 'count' },
  { k: 'solarArea', g: 'energy', lo: 0.3, hi: 2.5, st: 0.01, when: P => P.solarMode === 'area' },
  { k: 'sparType', g: 'struct', opts: () => ['caps', 'tube'], when: P => P.structMode !== 'fix' },
  { k: 'xSpar', g: 'struct', lo: 20, hi: 40, st: 1, when: P => P.structMode !== 'fix' },
  { k: 'matCap', g: 'struct', opts: () => MAT_SEL.matCap, when: P => P.structMode !== 'fix' },
  { k: 'matWeb', g: 'struct', opts: () => MAT_SEL.matWeb, when: P => P.structMode !== 'fix' },
  { k: 'matSkin', g: 'struct', opts: () => MAT_SEL.matSkin, when: P => P.structMode !== 'fix' },
  { k: 'matBoom', g: 'struct', opts: () => MAT_SEL.matBoom, when: P => P.structMode !== 'fix' && P.fusType !== 'glider', dep: 'fusType' },
  { k: 'splitEta', g: 'struct', lo: 0.4, hi: 0.7, st: 0.02, when: P => P.splits === 'outer' || P.splits === 'both', dep: 'splits' },
  { k: 'v', g: 'flight', lo: 8, hi: 16, st: 0.5 },
  // Rudergrößen (Bereiche nach Raymer 2018, Kap. 6.5: Querruder etwa 50–90 % der Halbspannweite, Höhen- und Seitenruder
  // 25–50 % der Leitwerkstiefe); sie wirken auf „Ruder reichen“ und auf die Zellen (Module enden vor der Ruderachse)
  { k: 'ailCf', g: 'ctrl', lo: 0.15, hi: 0.35, st: 0.01 },
  { k: 'ailEta0', g: 'ctrl', lo: 0.35, hi: 0.8, st: 0.01 },
  { k: 'ailEta1', g: 'ctrl', lo: 0.8, hi: 1, st: 0.01 },
  { k: 'elevCf', g: 'ctrl', lo: 0.25, hi: 0.5, st: 0.01, when: P => P.elevCf < 0.999 },
  { k: 'rudCf', g: 'ctrl', lo: 0.25, hi: 0.5, st: 0.01 },
  { k: 'sweep', g: 'config', lo: -5, hi: 10, st: 1 },
  { k: 'fusType', g: 'config', opts: () => ['pod', 'glider', 'twin'] },
  { k: 'motorPos', g: 'config', opts: () => ['nose', 'pusher', 'fin'] },
  { k: 'tailType', g: 'config', opts: () => ['cross', 'T'] },
  { k: 'fusL', g: 'config', lo: 0.8, hi: 1.8, st: 0.05 },
  { k: 'battInWing', g: 'config', opts: () => [false, true], when: P => P.structMode !== 'fix' },
  // nur beim Ziel Nutzlast (oder mit eigenem Bereich)
  { k: 'payloadExtra', g: 'payload', lo: 0, hi: 10, st: 0.05 }
];
const OPT_CAT_BY = Object.fromEntries(OPT_CAT.map(v => [v.k, v]));
// Nicht im Suchkatalog, aber für „Woran hängt es?“ probeweise verändert (Bauraum, Landung, Propeller)
const OPT_PROBE = [
  { k: 'fusL', lo: 0.6, hi: 2, st: 0.05 }, { k: 'fusD', lo: 0.08, hi: 0.3, st: 0.01 }, { k: 'boomD', lo: 0.015, hi: 0.05, st: 0.001 },
  { k: 'landPitch', lo: 0, hi: 12, st: 1 }, { k: 'propD', lo: 0.3, hi: 0.9, st: 0.02 }, { k: 'landGear', opts: ['skid', 'belly'] }
];
const OPT_COST = { case: 0, day: 1, mid: 2, high: 3 };
const OPT_EPS = 1e-9;
// Ziele: Kenngrößen mit Richtung, ohne die sehr aufwendige Schwingungsrechnung
const optObjectives = () => KENN.filter(k => k.dir !== 0 && k.cost !== 'high');
const stepDec = st => (st >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(st) - 1e-9)));
const roundTo = (v, st) => +(Math.round(v / st) * st).toFixed(stepDec(st));
// Raster um den jetzigen Wert a: a + k·st. So ist der jetzige Entwurf genau darstellbar, auch wenn sein Wert nicht auf
// einem Vielfachen der Schrittweite liegt (z. B. 0,025 bei Schritt 0,002); sonst würde schon der Startentwurf verschoben
const decOf = x => { const t = String(x).split('.')[1]; return t ? Math.min(6, t.length) : 0; };
const roundAt = (x, st, a) => (fin(a) ? +(a + Math.round((x - a) / st) * st).toFixed(Math.max(stepDec(st), decOf(a))) : roundTo(x, st));

/* Freie Größen aus Katalog, Gruppen und Anforderungen.
   req: Anforderungen des Dokuments ('p:<key>' mit fix, min/max oder allow); groups: eingeschaltete Gruppen;
   off: einzeln abgewählte Größen; objKey: Ziel (Nutzlast schaltet die Zusatznutzlast frei).
   Ergebnis: vars (für den Optimierer) und info (für die Anzeige: frei, festgehalten, unwirksam) */
function optVarSet(base, req, groups, off, objKey) {
  const on = new Set(groups || OPT_GROUPS.filter(g => g[2]).map(g => g[0])), skip = new Set(off || []);
  if (objKey === 'payload') on.add('payload');
  const rq = k => (req || {})['p:' + k] || null, isFix = k => { const r = rq(k); return !!(r && r.fix); };
  const ranged = k => { const r = rq(k); return !!(r && !r.fix && ((r.allow && r.allow.length) || r.min !== null || r.max !== null)); };
  // Auswahlgrößen, die frei sind (für die Abhängigkeiten)
  const freeSel = new Set(OPT_CAT.filter(c => c.opts && !isFix(c.k) && !skip.has(c.k) && (on.has(c.g) || ranged(c.k))).map(c => c.k));
  const vars = [], info = [];
  for (const c of OPT_CAT) {
    const cur = base[c.k], r = rq(c.k);
    const why = isFix(c.k) ? 'fix' : skip.has(c.k) ? 'off' : !(on.has(c.g) || ranged(c.k)) ? 'group' : c.when && !c.when(base) && !(c.dep && freeSel.has(c.dep)) ? 'na' : null;
    if (why) { info.push({ k: c.k, g: c.g, why }); continue; }
    if (c.opts) {
      let opts = c.opts().slice();
      if (r && r.allow && r.allow.length) opts = opts.length ? opts.filter(o => r.allow.includes(String(o))) : r.allow.slice();
      if (!opts.length) { info.push({ k: c.k, g: c.g, why: 'na' }); continue; }
      vars.push({ k: c.k, g: c.g, t: 'd', opts, src: r && r.allow ? 'req' : 'cat' });
    } else {
      let lo = c.lo, hi = c.hi, src = 'cat';
      if (r && (r.min !== null || r.max !== null)) {
        src = 'req';
        if (r.min !== null) lo = r.min;
        if (r.max !== null) hi = r.max;
        // nur eine Grenze und die liegt jenseits des üblichen Bereichs: ein Viertel des Bereichs darüber hinaus suchen
        if (r.max === null && hi <= lo) hi = lo + 0.25 * (c.hi - c.lo);
        if (r.min === null && lo >= hi) lo = hi - 0.25 * (c.hi - c.lo);
      } else if (fin(cur)) { lo = Math.min(lo, cur); hi = Math.max(hi, cur); }
      vars.push({ k: c.k, g: c.g, t: c.int ? 'i' : 'c', lo, hi, st: c.st, src, a: fin(cur) && cur >= lo && cur <= hi ? cur : undefined });
    }
    info.push({ k: c.k, g: c.g, why: 'free' });
  }
  return { vars, info };
}

/* ---------- Zufall (mulberry32), Verteilungen ---------- */
function rng32(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rNorm = rnd => { let u = 0; while (u < 1e-12) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

/* ---------- Problem: Größen ver- und entschlüsseln, Ziel und Bedingungen in Stufen ---------- */
function optCompile(spec) {
  const vars = spec.vars.map(v => ({ ...v, n: v.t === 'd' ? v.opts.length : 0 }));
  const K = KENN_BY[spec.obj.key];
  const cons = (spec.cons || []).filter(c => KENN_BY[c.key]).map(c => ({ key: c.key, min: c.min ?? null, max: c.max ?? null, st: OPT_COST[KENN_BY[c.key].cost], sc: KENN_BY[c.key].sc || 0 }));
  const checks = DESIGN_CHECKS.filter(c => (spec.checks || []).includes(c.key)).map(c => ({ key: c.key, viol: c.viol, items: c.items, st: OPT_COST[c.cost] }));
  return { spec, vars, K, dir: spec.obj.dir || K.dir || -1, objStage: OPT_COST[K.cost], cons, checks, nStage: 3, nc: cons.length + checks.length };
}
function optDecodeVal(v, u) {
  u = clamp(u, 0, 1);
  if (v.t === 'd') { const n = v.opts.length; return v.opts[Math.min(n - 1, Math.floor(u * n))]; }
  if (!(v.hi > v.lo)) return v.lo;
  const x = v.lo + u * (v.hi - v.lo);
  return clamp(v.t === 'i' ? (fin(v.a) ? v.a + Math.round((x - v.a) / v.st) * v.st : Math.round(x / v.st) * v.st) : roundAt(x, v.st, v.a), v.lo, v.hi);
}
function optEncodeVal(v, x) {
  if (v.t === 'd') { const i = v.opts.findIndex(o => String(o) === String(x)); return i < 0 ? 0.5 : (i + 0.5) / v.opts.length; }
  return v.hi > v.lo && fin(x) ? clamp((x - v.lo) / (v.hi - v.lo), 0, 1) : 0.5;
}
const optVals = (pb, u) => Object.fromEntries(pb.vars.map((v, j) => [v.k, optDecodeVal(v, u[j])]));
const optKey = vals => JSON.stringify(vals);
// Verletzung bezogen auf die Grenze; liegt die Grenze bei null (z. B. Excess Time ≥ 0), auf die typische Größe
// der Kenngröße (KENN.sc, sonst eine Einheit) – so wächst die Verletzung weiter mit dem Abstand und bleibt nicht bei 1 stehen
function consViol(v, c) {
  if (!fin(v)) return 1;
  const sc = b => { const s = Math.max(Math.abs(b), c.sc || 0); return s > 1e-9 ? s : 1; };
  let d = 0;
  if (c.min !== null && v < c.min) d += (c.min - v) / sc(c.min);
  if (c.max !== null && v > c.max) d += (v - c.max) / sc(c.max);
  return d;
}
// Deb: a mindestens so gut wie b
function optBetter(a, b) {
  const fa = a.viol <= OPT_EPS, fb = b.viol <= OPT_EPS;
  if (fa && fb) return a.f <= b.f;
  if (fa !== fb) return fa;
  return a.viol <= b.viol;
}
// Entwurf in Stufen rechnen; mit Elternteil abbrechen, sobald das Kind sicher verliert
// r.cv: Verletzung je Anforderung (zuerst Ergebnis-Anforderungen, dann Grundbedingungen), null = nicht gerechnet
function optEvalVals(pb, vals, parent, upTo) {
  const P = { ...pb.spec.base, ...vals }, nc = pb.cons.length, r = { vals, viol: 0, f: Infinity, kv: {}, cv: new Array(nc + pb.checks.length).fill(null), stage: -1, partial: false };
  let R = null;
  try { R = lazyResult(P, pb.spec.comps); void R.C; } catch (e) { r.viol = 1000; r.err = String((e && e.message) || e); r.stage = 2; return r; }
  const last = upTo ?? 2;
  for (let s = 0; s <= last; s++) {
    try {
      pb.cons.forEach((c, j) => { if (c.st !== s) return; const v = kennValue(R, c.key), d = consViol(kennGraded(R, c.key, v), c); r.kv[c.key] = v; r.cv[j] = d; r.viol += d; });
      pb.checks.forEach((c, j) => {
        if (c.st !== s) return;
        const v = c.viol(R), d = fin(v) ? Math.max(0, v) : 1; r.cv[nc + j] = d; r.viol += d;
        if (d > 0 && c.items) { try { (r.sub = r.sub || {})[c.key] = c.items(R).map(i => i.l); } catch (e) { /* ohne Einzelheiten */ } } // welche Teilprüfung
      });
      if (pb.objStage === s) { const v = kennValue(R, pb.spec.obj.key); r.kv[pb.spec.obj.key] = v; if (fin(v)) r.f = -pb.dir * v; else r.viol += 1; }
    } catch (e) { r.viol += 1000; r.err = String((e && e.message) || e); r.stage = last; return r; }
    r.stage = s;
    if (parent && s < last) {
      const lose = parent.viol <= OPT_EPS ? r.viol > OPT_EPS || (s >= pb.objStage && r.f > parent.f) : r.viol > parent.viol;
      if (lose) { r.partial = true; return r; }
    }
  }
  r.R = R;
  return r;
}

/* ---------- Diagnose je Anforderung: was die Suche erreicht hat ----------
   best: kleinste Verletzung überhaupt (mit Wert), bestO: kleinste Verletzung unter Entwürfen, die alle übrigen
   Anforderungen erfüllen; lo/hi: Wertebereich (bzw. Verletzungsbereich bei Grundbedingungen) über alle Rechnungen.
   Bleibt der Bereich null breit, hängt die Anforderung nicht von den freien Größen ab. */
function optDiagNew(nc) { return Array.from({ length: nc }, () => ({ n: 0, best: Infinity, bestV: NaN, bestO: Infinity, bestOV: NaN, lo: Infinity, hi: -Infinity, dlo: Infinity, dhi: -Infinity })); }
function optDiagAdd(pb, diag, r) {
  if (r.partial || r.viol >= 1000 || !r.cv) return;
  const nc = pb.cons.length;
  for (let j = 0; j < diag.length; j++) {
    const d = r.cv[j]; if (d == null) continue;
    const D = diag[j], v = j < nc ? r.kv[pb.cons[j].key] : NaN;
    D.n++;
    if (fin(v)) { if (v < D.lo) D.lo = v; if (v > D.hi) D.hi = v; }
    if (d < D.dlo) D.dlo = d; if (d > D.dhi) D.dhi = d;
    if (d < D.best) { D.best = d; D.bestV = v; }
    if (r.viol - d <= 1e-7 && d < D.bestO) { D.bestO = d; D.bestOV = v; }
  }
}
function optDiagMerge(list) {
  const ok = list.filter(Boolean); if (!ok.length) return null;
  return ok[0].map((_, j) => {
    const all = ok.map(d => d[j]), m = { n: 0, best: Infinity, bestV: NaN, bestO: Infinity, bestOV: NaN, lo: Infinity, hi: -Infinity, dlo: Infinity, dhi: -Infinity };
    for (const D of all) {
      m.n += D.n; m.lo = Math.min(m.lo, D.lo); m.hi = Math.max(m.hi, D.hi); m.dlo = Math.min(m.dlo, D.dlo); m.dhi = Math.max(m.dhi, D.dhi);
      if (D.best < m.best) { m.best = D.best; m.bestV = D.bestV; }
      if (D.bestO < m.bestO) { m.bestO = D.bestO; m.bestOV = D.bestOV; }
    }
    return m;
  });
}

/* ---------- Eine Insel: Differential Evolution (JADE), als Generator für Fortschritt und Abbruch ----------
   spec: { base, comps, vars, obj: {key, dir}, cons: [{key, min, max}], checks: [keys], budget, np, seed, init }
   init: Entwürfe (Werte) aus einem früheren Lauf als Startpunkte (Weiterrechnen)
   yield: Fortschritt je Generation; next(true) oder next({stop: true}) beendet vorzeitig mit dem bisherigen
   Ergebnis, next({imm: [Entwurf]}) bringt die besten Entwürfe anderer Inseln ein (Migration) */
function* optIsland(spec) {
  const pb = optCompile(spec), n = pb.vars.length, rnd = rng32(spec.seed || 1);
  const NP = spec.np || clamp(Math.round(10 + 0.6 * n), 16, 30), budget = Math.max(NP * 2, spec.budget || 1500);
  const t0 = Date.now(), cache = new Map(), arch = [], ARCH = 60, maxGen = Math.ceil(3 * budget / NP);
  let evals = 0, full = 0, hits = 0, gen = 0, restarts = 0, nImm = 0;
  const diag = optDiagNew(pb.nc);
  const archAdd = (r, u) => {
    if (r.partial || r.viol >= 1000) return;
    const key = optKey(r.vals); if (arch.some(a => a.key === key)) return;
    const e = { key, vals: r.vals, u: Array.from(u), f: r.f, viol: r.viol, kv: r.kv, cv: r.cv, sub: r.sub };
    let i = arch.findIndex(a => !optBetter(a, e)); if (i < 0) i = arch.length;
    if (i < ARCH) { arch.splice(i, 0, e); if (arch.length > ARCH) arch.pop(); }
  };
  const evalU = (u, parent) => {
    const vals = optVals(pb, u), key = optKey(vals), c = cache.get(key);
    if (c) { hits++; return { ...c, u, key }; }
    evals++;
    const r = optEvalVals(pb, vals, parent);
    delete r.R;
    if (!r.partial) { full++; if (cache.size < 6000) cache.set(key, r); archAdd(r, u); optDiagAdd(pb, diag, r); }
    return { ...r, u, key };
  };
  const better = (a, b) => optBetter(a, b) && !optBetter(b, a);
  const rank = list => [...list.keys()].sort((a, b) => (optBetter(list[a], list[b]) ? (optBetter(list[b], list[a]) ? 0 : -1) : 1));
  const lhs = m => { const perm = pb.vars.map(() => { const p = [...Array(m).keys()]; for (let i = m - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; }); return Array.from({ length: m }, (_, i) => pb.vars.map((v, j) => (perm[j][i] + rnd()) / m)); };
  // Anfangsbevölkerung: der jetzige Entwurf, Startpunkte aus einem früheren Lauf, Nachbarn, der Rest als lateinischer Hyperwürfel
  const u0 = pb.vars.map(v => optEncodeVal(v, spec.base[v.k]));
  let pop = [evalU(u0.slice())];
  for (const vals of (spec.init || []).slice(0, Math.floor(0.5 * NP))) pop.push(evalU(pb.vars.map(v => optEncodeVal(v, vals[v.k] ?? spec.base[v.k]))));
  const nLoc = Math.max(0, Math.round(0.3 * NP) - pop.length + 1);
  for (let i = 0; i < nLoc && pop.length < NP; i++) pop.push(evalU(u0.map((x, j) => (pb.vars[j].t === 'd' ? (rnd() < 0.75 ? x : rnd()) : clamp(x + 0.08 * rNorm(rnd), 0, 1)))));
  for (const u of lhs(NP - pop.length)) pop.push(evalU(u));
  let muF = 0.5, muCR = 0.7;
  let lsBest = null, phase = 'de';
  const popBest = () => pop.reduce((a, b) => (optBetter(b, a) ? b : a));
  const state = () => {
    let best = popBest();
    if (lsBest && optBetter(lsBest, best)) best = lsBest;
    return { phase, gen, evals, full, hits, budget, np: NP, n, ms: Date.now() - t0, restarts, nImm, best: { f: best.f, viol: best.viol, kv: best.kv, vals: best.vals, u: Array.from(best.u), cv: best.cv, sub: best.sub }, nFeas: pop.filter(p => p.viol <= OPT_EPS).length, muF, muCR };
  };
  // Migration: ein besserer Entwurf einer anderen Insel ersetzt ein zufälliges Mitglied der schlechteren Hälfte
  const immigrate = list => {
    for (const im of list || []) {
      if (!im || !im.u || im.u.length !== n) continue;
      const e = { vals: im.vals, f: im.f, viol: im.viol, kv: im.kv || {}, cv: im.cv || null, sub: im.sub, u: im.u.slice(), key: optKey(im.vals), stage: 2, partial: false };
      if (phase === 'de') {
        const ord = rank(pop), half = ord.slice(Math.floor(NP / 2)), i = half[Math.floor(rnd() * half.length)];
        if (pop.some(p => p.key === e.key)) continue;
        if (optBetter(e, pop[i])) { pop[i] = e; nImm++; }
      } else if (lsBest && better(e, lsBest)) { lsBest = e; nImm++; }
    }
  };
  const cmdOf = c => { if (c && typeof c === 'object' && c.imm) immigrate(c.imm); return c === true || !!(c && c.stop); };
  let stop = cmdOf(yield state());
  // Kleiner Suchraum (wenige freie Größen, grobes Raster): alle Entwürfe der Reihe nach rechnen. Sonst erzeugt die
  // Suche bald nur noch schon gerechnete Entwürfe und kommt nicht weiter.
  const gridVals = v => {
    if (v.t === 'd') return v.opts.slice();
    if (!(v.hi > v.lo)) return [v.lo];
    const K = Math.min(20000, 2 * Math.ceil((v.hi - v.lo) / v.st) + 2), seen = new Set(), out = [];
    for (let i = 0; i <= K; i++) { const x = optDecodeVal(v, i / K), sx = String(x); if (!seen.has(sx)) { seen.add(sx); out.push(x); } }
    return out;
  };
  let space = 1;
  for (const v of pb.vars) { space *= v.t === 'd' ? v.n : v.hi > v.lo ? Math.ceil((v.hi - v.lo) / v.st) + 2 : 1; if (space > 1e7) break; }
  if (spec.enumerate !== false && n > 0 && space <= budget) {
    const lists = pb.vars.map(gridVals), tot = lists.reduce((q, l) => q * l.length, 1);
    if (tot <= budget) {
      phase = 'all';
      const idx = new Array(n).fill(0), all = [];
      for (let c = 0; c < tot && !stop; c++) {
        all.push(evalU(pb.vars.map((v, j) => optEncodeVal(v, lists[j][idx[j]]))));
        for (let j = 0; j < n; j++) { if (++idx[j] < lists[j].length) break; idx[j] = 0; }
        if ((c + 1) % NP === 0) { gen++; stop = cmdOf(yield state()); }
      }
      const comb = all.concat(pop);
      pop = rank(comb).slice(0, NP).map(i => comb[i]);
      for (const q of comb) archAdd(q, q.u);
      return { ...state(), arch, vars: pb.vars, seed: spec.seed, diag, exhaustive: tot };
    }
  }
  // Grenze auch über die Generationen: im Raster wiederholte Entwürfe kommen aus dem Zwischenspeicher und zählen nicht
  const deBudget = Math.round((spec.deFrac ?? 0.5) * budget);
  // Neustart bei Stillstand: ist die Bevölkerung zusammengefallen oder bleibt der beste Entwurf über stallMax
  // Generationen gleich, bleiben die besten 20 %, der Rest wird neu gewürfelt (halb um die Besten, halb im ganzen Raum)
  const stallMax = spec.stall || Math.max(20, Math.round(0.4 * deBudget / NP));
  let stall = 0, lastBest = popBest();
  while (!stop && evals < deBudget && gen < maxGen && (!spec.tMax || Date.now() - t0 < spec.tMax)) {
    gen++;
    const order = rank(pop);
    const nTop = Math.max(2, Math.round(0.2 * NP)), next = pop.slice(), SF = [], SCR = [];
    for (let i = 0; i < NP; i++) {
      let F; do { F = muF + 0.1 * Math.tan(Math.PI * (rnd() - 0.5)); } while (F <= 0); F = Math.min(1, F);
      const CR = clamp(muCR + 0.1 * rNorm(rnd), 0, 1);
      const xb = pop[order[Math.floor(rnd() * nTop)]].u;
      let r1, r2; do { r1 = Math.floor(rnd() * NP); } while (r1 === i); do { r2 = Math.floor(rnd() * NP); } while (r2 === i || r2 === r1);
      const xi = pop[i].u, a = pop[r1].u, b = pop[r2].u, jr = Math.floor(rnd() * n), u = new Array(n);
      for (let j = 0; j < n; j++) {
        if (j === jr || rnd() < CR) {
          let x = xi[j] + F * (xb[j] - xi[j]) + F * (a[j] - b[j]);
          if (x < 0) x = xi[j] / 2; else if (x > 1) x = (xi[j] + 1) / 2;
          // Auswahlgrößen: ab und zu frei würfeln, damit keine Option verloren geht
          if (pb.vars[j].t === 'd' && rnd() < 0.5 / n) x = rnd();
          u[j] = x;
        } else u[j] = xi[j];
      }
      const c = evalU(u, pop[i]);
      if (!c.partial && optBetter(c, pop[i])) { next[i] = c; SF.push(F); SCR.push(CR); }
    }
    pop = next;
    if (SCR.length) { muCR = 0.9 * muCR + 0.1 * SCR.reduce((s, x) => s + x, 0) / SCR.length; muF = 0.9 * muF + 0.1 * SF.reduce((s, x) => s + x * x, 0) / SF.reduce((s, x) => s + x, 0); }
    const gb = popBest();
    if (better(gb, lastBest) && !(gb.viol <= OPT_EPS && lastBest.viol <= OPT_EPS && Math.abs(gb.f - lastBest.f) <= 1e-6 * Math.max(1, Math.abs(gb.f)))) stall = 0; else stall++;
    lastBest = gb;
    let spread = 0; for (let j = 0; j < n; j++) { let m = 0, q = 0; for (const p of pop) { m += p.u[j]; q += p.u[j] * p.u[j]; } m /= NP; spread += Math.sqrt(Math.max(0, q / NP - m * m)); }
    spread /= Math.max(1, n);
    if ((stall >= stallMax || spread < 0.02) && evals + 4 * NP < deBudget) {
      const ord = rank(pop), keep = Math.max(2, Math.round(0.2 * NP)), elite = ord.slice(0, keep).map(i => pop[i]), fresh = [];
      const nG = Math.round((NP - keep) / 2);
      for (let i = 0; i < nG; i++) { const e = elite[Math.floor(rnd() * keep)]; fresh.push(evalU(e.u.map((x, j) => (pb.vars[j].t === 'd' ? (rnd() < 0.8 ? x : rnd()) : clamp(x + 0.15 * rNorm(rnd), 0, 1))))); }
      for (const u of lhs(NP - keep - nG)) fresh.push(evalU(u));
      pop = elite.concat(fresh); muF = 0.5; muCR = 0.7; stall = 0; restarts++;
    }
    stop = cmdOf(yield state());
  }
  // Feinschliff 1: (1+1)-Evolutionsstrategie mit 1/5-Erfolgsregel (Rechenberg 1973) um den besten Entwurf.
  // Schrittweite je Größe aus der Streuung der besten Fünftel der Bevölkerung; alle Zahlengrößen
  // bewegen sich gemeinsam, so kommt die Suche auch an aktiven Grenzen weiter (z. B. Nutzlast und Akku zugleich)
  let best = popBest(), h = 0.05, sinceYield = 0;
  phase = 'local'; lsBest = best;
  const num = pb.vars.map((v, j) => j).filter(j => pb.vars[j].t !== 'd' && pb.vars[j].hi > pb.vars[j].lo);
  const dis = pb.vars.map((v, j) => j).filter(j => pb.vars[j].t === 'd' && pb.vars[j].n > 1);
  if (spec.es !== false && num.length) {
    const top = rank(pop).slice(0, Math.max(3, Math.round(0.2 * NP))).map(i => pop[i]);
    const sig = pb.vars.map((v, j) => { const m = top.reduce((s, p) => s + p.u[j], 0) / top.length, sd = Math.sqrt(top.reduce((s, p) => s + (p.u[j] - m) ** 2, 0) / top.length); return clamp(sd, 0.015, 0.12); });
    const esBudget = evals + Math.round((spec.esFrac ?? 0.7) * (budget - evals));
    let s = 1, stale = 0;
    const staleMax = Math.max(200, 20 * NP);
    while (!stop && evals < esBudget && stale < staleMax && (!spec.tMax || Date.now() - t0 < spec.tMax)) {
      if (lsBest !== best && better(lsBest, best)) { best = lsBest; s = 1; } // Migrant übernommen
      const u = best.u.slice();
      for (const j of num) u[j] = clamp(u[j] + s * sig[j] * rNorm(rnd), 0, 1);
      if (dis.length && rnd() < 0.1) u[dis[Math.floor(rnd() * dis.length)]] = rnd();
      const h0 = hits, c = evalU(u, best); sinceYield++;
      stale = hits > h0 ? stale + 1 : 0; // nur schon gerechnete Entwürfe: abbrechen statt endlos kreisen
      if (c.key === best.key) s = Math.min(3, s * 1.15);
      else if (!c.partial && optBetter(c, best)) { best = lsBest = c; s = Math.min(3, s * Math.exp(1 / 3)); }
      else s *= Math.exp(-1 / 12);
      if (s < 0.05) { s = 0.6; } // neu ansetzen statt einschlafen
      if (sinceYield >= NP) { sinceYield = 0; gen++; stop = cmdOf(yield state()); }
    }
  }
  // Feinschliff 2: Auswahlgrößen (Profil, Grundriss, Werkstoffe …) beim besten Entwurf der Reihe nach durchprobieren;
  // die Differential Evolution trifft einzelne Optionen sonst nur zufällig
  if (!stop && dis.length && spec.dsweep !== false) {
    for (let i = dis.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [dis[i], dis[j]] = [dis[j], dis[i]]; }
    for (const j of dis) {
      const v = pb.vars[j], cur = Math.min(v.n - 1, Math.floor(best.u[j] * v.n));
      for (let k = 0; k < v.n && !stop && evals < budget; k++) {
        if (k === cur) continue;
        const u = best.u.slice(); u[j] = (k + 0.5) / v.n;
        const c = evalU(u, best); sinceYield++;
        if (!c.partial && better(c, best)) best = lsBest = c;
        if (sinceYield >= NP) { sinceYield = 0; gen++; stop = cmdOf(yield state()); }
      }
    }
  }
  // Feinschliff 3: Koordinatensuche, Schritt halbieren bis unter das Raster (nur Zahlengrößen)
  while (!stop && num.length && h > 0.003 && evals < budget && (!spec.tMax || Date.now() - t0 < spec.tMax)) {
    let improved = false;
    if (lsBest !== best && better(lsBest, best)) { best = lsBest; h = 0.05; }
    for (let i = num.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [num[i], num[j]] = [num[j], num[i]]; }
    for (const j of num) {
      if (evals >= budget) break;
      for (const sg of [1, -1]) {
        const u = best.u.slice(); u[j] = clamp(u[j] + sg * h, 0, 1);
        const c = evalU(u, best); sinceYield++;
        if (!c.partial && better(c, best)) { best = lsBest = c; improved = true; break; }
      }
      if (sinceYield >= NP) { sinceYield = 0; gen++; stop = cmdOf(yield state()); if (stop) break; }
    }
    if (!improved) h /= 2;
  }
  if (lsBest && better(lsBest, best)) best = lsBest;
  const worst = pop.reduce((w, p, i) => (optBetter(pop[w], p) ? w : i), 0);
  if (optBetter(best, pop[worst])) pop[worst] = best;
  const st = state();
  for (const p of pop) archAdd(p, p.u);
  archAdd(best, best.u);
  return { ...st, arch, vars: pb.vars, seed: spec.seed, diag };
}
// Alles in einem Zug (Tests, Rechnen ohne Worker in Scheiben)
function optRun(spec, onGen) {
  const it = optIsland(spec); let r = it.next();
  while (!r.done) { if (onGen) onGen(r.value); r = it.next(false); }
  return r.value;
}
// Bester Entwurf aus den Ständen mehrerer Inseln (für die Migration)
function optGlobalBest(states) {
  let gb = null;
  for (const s of states) if (s && s.best && fin(s.best.viol) && (!gb || (optBetter(s.best, gb) && !optBetter(gb, s.best)))) gb = s.best;
  return gb;
}
// Mehrere Inseln abwechselnd in einem Faden, alle `migrate` Runden wandert der beste Entwurf zu den schlechteren
// Inseln (Tests und Rechnen ohne Worker; im Browser übernimmt die Seite diese Rolle zwischen den Workern)
function optRunIslands(spec, nIsl = 2, opt = {}) {
  const every = opt.migrate ?? 8, its = Array.from({ length: nIsl }, (_, i) => optIsland({ ...spec, seed: (spec.seed || 1) + i })), cur = its.map(it => it.next());
  for (let round = 1; cur.some(c => !c.done); round++) {
    const gb = every > 0 && round % every === 0 ? optGlobalBest(cur.map(c => (c.done ? null : c.value))) : null;
    cur.forEach((c, i) => {
      if (c.done) return;
      const own = c.value.best, give = gb && own && optBetter(gb, own) && !optBetter(own, gb);
      cur[i] = its[i].next(give ? { imm: [gb] } : false);
    });
    if (opt.onRound) opt.onRound(cur.map(c => c.value));
  }
  return cur.map(c => c.value);
}

/* ---------- Auswahl verschiedener Vorschläge aus allen Inseln ---------- */
function optDistinct(vars, a, b) {
  let d = 0;
  vars.forEach((v, j) => { if (v.t === 'd' ? String(a.vals[v.k]) !== String(b.vals[v.k]) : Math.abs(a.u[j] - b.u[j]) > 0.12) d++; });
  return d >= 2;
}
function optPick(results, nMax) {
  const vars = results[0].vars, all = [], seen = new Set();
  for (const r of results) for (const a of r.arch) if (!seen.has(a.key)) { seen.add(a.key); all.push(a); }
  all.sort((a, b) => (optBetter(a, b) ? (optBetter(b, a) ? 0 : -1) : 1));
  const picks = [];
  for (const a of all) {
    if (picks.length >= (nMax || 4)) break;
    if (picks.length && a.viol > OPT_EPS && picks[0].viol <= OPT_EPS) break; // Alternativen nur, wenn zulässig
    if (picks.every(p => optDistinct(vars, a, p))) picks.push(a);
  }
  return picks;
}

/* ---------- Aufräumen und Ergebnis mit allen Kenngrößen ---------- */
function optPolish(spec, vals, opt = {}) {
  const pb = optCompile(spec), base = spec.base, inRange = (v, x) => (v.t === 'd' ? v.opts.some(o => String(o) === String(x)) : fin(x) && x >= v.lo - 1e-9 && x <= v.hi + 1e-9);
  const ev = vv => optEvalVals(pb, vv, null);
  let cur = { ...vals }, best = ev(cur), nEval = 1;
  const r0 = ev(Object.fromEntries(pb.vars.map(v => [v.k, inRange(v, base[v.k]) ? base[v.k] : vals[v.k]])));
  // Zulässige Einbuße am Ziel für eine Größe, die beim alten Wert bleibt
  const gain = r0.viol <= OPT_EPS && best.viol <= OPT_EPS ? Math.max(0, r0.f - best.f) : 0;
  const tol = Math.max((opt.tol ?? 0.002) * Math.abs(best.f), 0.01 * gain, 1e-9);
  const changed = () => pb.vars.filter(v => String(cur[v.k]) !== String(base[v.k]) && inRange(v, base[v.k]));
  if (best.viol <= OPT_EPS && !opt.noClean) {
    const f0 = best.f, trial = changed().map(v => { const t = { ...cur, [v.k]: base[v.k] }, r = ev(t); nEval++; return { v, loss: r.viol <= OPT_EPS ? r.f - f0 : Infinity }; }).filter(x => x.loss < Infinity).sort((a, b) => a.loss - b.loss);
    for (const { v } of trial) {
      const t = { ...cur, [v.k]: base[v.k] }, r = ev(t); nEval++;
      if (r.viol <= OPT_EPS && r.f - f0 <= tol) { cur = t; best = r; }
    }
  }
  // Ergebnis: alle Kenngrößen bis 'mid', 'high' nur wenn gefordert (oder opt.high)
  const P = { ...base, ...cur }, R = best.R || lazyResult(P, spec.comps), kv = {}, needHigh = new Set(pb.cons.filter(c => c.st === 3).map(c => c.key));
  for (const K of KENN) if (K.cost !== 'high' || needHigh.has(K.key) || opt.high) kv[K.key] = kennValue(R, K.key);
  let viol = 0; const cv = {};
  for (const c of pb.cons) { cv[c.key] = consViol(kv[c.key], c); viol += cv[c.key]; }
  const chk = {}; for (const c of DESIGN_CHECKS) { let v; try { v = c.viol(R); } catch (e) { v = 1; } chk[c.key] = fin(v) ? Math.max(0, v) : 1; }
  for (const c of pb.checks) viol += chk[c.key];
  const f = fin(kv[spec.obj.key]) ? -pb.dir * kv[spec.obj.key] : Infinity;
  const diff = pb.vars.filter(v => String(cur[v.k]) !== String(base[v.k])).map(v => ({ k: v.k, from: base[v.k], to: cur[v.k], edge: v.t !== 'd' && v.hi > v.lo && (Math.abs(cur[v.k] - v.lo) < 0.5 * v.st || Math.abs(cur[v.k] - v.hi) < 0.5 * v.st) ? (Math.abs(cur[v.k] - v.lo) < 0.5 * v.st ? 'lo' : 'hi') : null }));
  // Teilprüfungen der verletzten Grundbedingungen (Bauraum, Ruder, Spitze) mit Text
  const sub = {}; for (const c of DESIGN_CHECKS) if (c.items && chk[c.key] > OPT_EPS) { try { sub[c.key] = c.items(R); } catch (e) { /* ohne Einzelheiten */ } }
  return { vals: cur, diff, kv, cv, chk, viol, f, feasible: viol <= OPT_EPS, nEval, base0: { f: r0.f, viol: r0.viol }, sub, bau: sub.build || [] };
}

/* ---------- Einfluss der freien Größen auf die Bedingungen (Woran hängt es?) ----------
   Jede freie Größe einzeln an den unteren und oberen Rand ihres Suchbereichs (Auswahlgrößen: bis zu acht
   Optionen), alles andere wie im Entwurf vals. Je Bedingung: welche Größen die Verletzung verringern und um wie
   viel, ob überhaupt eine Größe etwas daran ändert. opt.extra: weitere Größen, die nicht frei sind (festgehalten,
   Gruppe aus, abgewählt), mit Katalogbereich – ob sie helfen würden. Ergebnis je Bedingung j (Reihenfolge wie r.cv):
   { d0, v0, any, help: [{ k, x, d, v, dd, locked, why }] } – d Verletzung danach, v Wert danach (Kenngrößen), dd Verringerung */
function optInfluence(spec, vals, opt = {}) {
  const pb = optCompile(spec), nc = pb.nc, cur = { ...vals };
  for (const v of pb.vars) if (!(v.k in cur)) cur[v.k] = spec.base[v.k];
  const b = optEvalVals(pb, cur, null), out = Array.from({ length: nc }, (_, j) => ({ d0: b.cv[j], v0: j < pb.cons.length ? b.kv[pb.cons[j].key] : NaN, any: false, help: [] }));
  let nEval = 1;
  const extra = (opt.extra || []).filter(v => !pb.vars.some(f => f.k === v.k)).map(v => ({ ...v, locked: true }));
  for (const v of pb.vars.concat(extra)) {
    let xs;
    if (v.t === 'd') { const n = v.opts.length, m = Math.min(n, opt.nOpt || 8); xs = Array.from({ length: m }, (_, i) => v.opts[Math.round(i * (n - 1) / Math.max(1, m - 1))]); }
    else xs = [v.lo, v.hi];
    xs = [...new Set(xs.map(String))].map(sx => xs.find(x => String(x) === sx)).filter(x => String(x) !== String(cur[v.k]));
    for (const x of xs) {
      const r = optEvalVals(pb, { ...cur, [v.k]: x }, null); nEval++;
      if (r.viol >= 1000) continue;
      for (let j = 0; j < nc; j++) {
        const d0 = b.cv[j], d = r.cv[j]; if (d0 == null || d == null) continue;
        if (Math.abs(d - d0) > 1e-9 * Math.max(1, d0)) out[j].any = true;
        if (d < d0 - 1e-9) {
          const h = out[j].help.find(e => e.k === v.k), e = { k: v.k, x, d, v: j < pb.cons.length ? r.kv[pb.cons[j].key] : NaN, dd: d0 - d, locked: !!v.locked, why: v.why || null };
          if (!h) out[j].help.push(e); else if (e.dd > h.dd) Object.assign(h, e);
        }
      }
    }
  }
  for (const o of out) o.help.sort((a, c) => c.dd - a.dd);
  return { viol: b.viol, cv: b.cv, kv: b.kv, cons: out, nEval };
}

/* ---------- Einstieg im Web Worker: je Auftrag eine Insel oder ein Aufräumen ---------- */
function optWorkerMain() {
  let stop = false, imm = null;
  const fail = err => self.postMessage({ type: 'error', msg: String((err && err.message) || err) });
  self.onmessage = e => {
    const m = e.data;
    if (m.type === 'init') setAirfoils(m.airfoils);
    else if (m.type === 'stop') stop = true;
    else if (m.type === 'migrate') imm = m.imm;
    else if (m.type === 'run') {
      stop = false; imm = null;
      const it = optIsland(m.spec);
      const step = () => {
        let r;
        const cmd = stop ? true : imm ? { imm } : false; imm = null;
        try { r = it.next(cmd); } catch (err) { fail(err); return; }
        if (r.done) self.postMessage({ type: 'done', res: r.value });
        else { self.postMessage({ type: 'progress', p: r.value }); setTimeout(step, 0); }
      };
      step();
    } else if (m.type === 'polish') {
      try { self.postMessage({ type: 'polished', id: m.id, res: optPolish(m.spec, m.vals) }); } catch (err) { fail(err); }
    } else if (m.type === 'influence') {
      try { self.postMessage({ type: 'influence', id: m.id, res: optInfluence(m.spec, m.vals, m.opt || {}) }); } catch (err) { fail(err); }
    }
  };
}

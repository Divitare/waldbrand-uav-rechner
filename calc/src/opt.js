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
  ['config', 'Anordnung, Rumpf, Pfeilung', false]
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
  { k: 'airfoil', g: 'wing', opts: () => (AF ? AF.db.foils.filter(f => !f.tail).map(f => f.key) : []) },
  { k: 'tailArm', g: 'tail', lo: 0.9, hi: 2.2, st: 0.05 },
  { k: 'vH', g: 'tail', lo: 0.35, hi: 0.6, st: 0.01 },
  { k: 'vV', g: 'tail', lo: 0.018, hi: 0.035, st: 0.002 },
  { k: 'arH', g: 'tail', lo: 3.5, hi: 7, st: 0.5 },
  { k: 'arV', g: 'tail', lo: 1.2, hi: 2.2, st: 0.1 },
  { k: 'smTarget', g: 'tail', lo: 8, hi: 15, st: 1, when: P => P.trimMode !== 'none' },
  { k: 'tailAirfoil', g: 'tail', opts: () => (AF ? AF.db.foils.filter(f => f.tail).map(f => f.key) : []) },
  { k: 'propD', g: 'prop', lo: 0.35, hi: 0.8, st: 0.02, when: P => P.propModel === 'bemt' && P.propGeom !== 'apc10x7' },
  { k: 'propPitch', g: 'prop', lo: 0.15, hi: 0.7, st: 0.01, when: P => P.propModel === 'bemt' && P.propGeom !== 'apc10x7' },
  { k: 'propBlades', g: 'prop', lo: 2, hi: 3, st: 1, int: true, when: P => P.propModel === 'bemt' && P.propGeom !== 'apc10x7' },
  { k: 'gearRatio', g: 'prop', lo: 1, hi: 6, st: 0.1, when: P => P.propModel === 'bemt' },
  { k: 'nCells', g: 'prop', lo: 3, hi: 12, st: 1, int: true, when: P => P.propModel === 'bemt' },
  { k: 'mBatt', g: 'energy', lo: 0.5, hi: 8, st: 0.05 },
  { k: 'htSolar', g: 'energy', lo: 0, hi: 90, st: 5 },
  { k: 'cellX0', g: 'energy', lo: 0, hi: 30, st: 1, when: P => P.solarGeom !== 'flach' || P.solarMode !== 'area' },
  { k: 'cellX1', g: 'energy', lo: 60, hi: 98, st: 1, when: P => P.solarGeom !== 'flach' || P.solarMode !== 'area' },
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
const OPT_COST = { case: 0, day: 1, mid: 2, high: 3 };
const OPT_EPS = 1e-9;
// Ziele: Kenngrößen mit Richtung, ohne die sehr aufwendige Schwingungsrechnung
const optObjectives = () => KENN.filter(k => k.dir !== 0 && k.cost !== 'high');
const stepDec = st => (st >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(st) - 1e-9)));
const roundTo = (v, st) => +(Math.round(v / st) * st).toFixed(stepDec(st));

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
      vars.push({ k: c.k, g: c.g, t: c.int ? 'i' : 'c', lo, hi, st: c.st, src });
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
  const cons = (spec.cons || []).filter(c => KENN_BY[c.key]).map(c => ({ key: c.key, min: c.min ?? null, max: c.max ?? null, st: OPT_COST[KENN_BY[c.key].cost] }));
  const checks = DESIGN_CHECKS.filter(c => (spec.checks || []).includes(c.key)).map(c => ({ key: c.key, viol: c.viol, st: OPT_COST[c.cost] }));
  return { spec, vars, K, dir: spec.obj.dir || K.dir || -1, objStage: OPT_COST[K.cost], cons, checks, nStage: 3 };
}
function optDecodeVal(v, u) {
  u = clamp(u, 0, 1);
  if (v.t === 'd') { const n = v.opts.length; return v.opts[Math.min(n - 1, Math.floor(u * n))]; }
  if (!(v.hi > v.lo)) return v.lo;
  const x = v.lo + u * (v.hi - v.lo);
  return clamp(v.t === 'i' ? Math.round(x / v.st) * v.st : roundTo(x, v.st), v.lo, v.hi);
}
function optEncodeVal(v, x) {
  if (v.t === 'd') { const i = v.opts.findIndex(o => String(o) === String(x)); return i < 0 ? 0.5 : (i + 0.5) / v.opts.length; }
  return v.hi > v.lo && fin(x) ? clamp((x - v.lo) / (v.hi - v.lo), 0, 1) : 0.5;
}
const optVals = (pb, u) => Object.fromEntries(pb.vars.map((v, j) => [v.k, optDecodeVal(v, u[j])]));
const optKey = vals => JSON.stringify(vals);
function consViol(v, c) {
  if (!fin(v)) return 1;
  const sc = b => (Math.abs(b) > 1e-9 ? Math.abs(b) : Math.max(1, Math.abs(v)));
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
function optEvalVals(pb, vals, parent, upTo) {
  const P = { ...pb.spec.base, ...vals }, r = { vals, viol: 0, f: Infinity, kv: {}, stage: -1, partial: false };
  let R = null;
  try { R = lazyResult(P, pb.spec.comps); void R.C; } catch (e) { r.viol = 1000; r.err = String((e && e.message) || e); r.stage = 2; return r; }
  const last = upTo ?? 2;
  for (let s = 0; s <= last; s++) {
    try {
      for (const c of pb.cons) if (c.st === s) { const v = kennValue(R, c.key); r.kv[c.key] = v; r.viol += consViol(v, c); }
      for (const c of pb.checks) if (c.st === s) { const v = c.viol(R); r.viol += fin(v) ? Math.max(0, v) : 1; }
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

/* ---------- Eine Insel: Differential Evolution (JADE), als Generator für Fortschritt und Abbruch ----------
   spec: { base, comps, vars, obj: {key, dir}, cons: [{key, min, max}], checks: [keys], budget, np, seed }
   yield: Fortschritt je Generation; next(true) beendet vorzeitig mit dem bisherigen Ergebnis */
function* optIsland(spec) {
  const pb = optCompile(spec), n = pb.vars.length, rnd = rng32(spec.seed || 1);
  const NP = spec.np || clamp(Math.round(10 + 0.6 * n), 16, 30), budget = Math.max(NP * 2, spec.budget || 1500);
  const t0 = Date.now(), cache = new Map(), arch = [], ARCH = 60, maxGen = Math.ceil(3 * budget / NP);
  let evals = 0, full = 0, hits = 0, gen = 0;
  const archAdd = (r, u) => {
    if (r.partial || r.viol >= 1000) return;
    const key = optKey(r.vals); if (arch.some(a => a.key === key)) return;
    const e = { key, vals: r.vals, u: Array.from(u), f: r.f, viol: r.viol, kv: r.kv };
    let i = arch.findIndex(a => !optBetter(a, e)); if (i < 0) i = arch.length;
    if (i < ARCH) { arch.splice(i, 0, e); if (arch.length > ARCH) arch.pop(); }
  };
  const evalU = (u, parent) => {
    const vals = optVals(pb, u), key = optKey(vals), c = cache.get(key);
    if (c) { hits++; return { ...c, u, key }; }
    evals++;
    const r = optEvalVals(pb, vals, parent);
    delete r.R;
    if (!r.partial) { full++; if (cache.size < 6000) cache.set(key, r); archAdd(r, u); }
    return { ...r, u, key };
  };
  // Anfangsbevölkerung: der jetzige Entwurf, Nachbarn davon, der Rest als lateinisches Hyperwürfel-Muster
  const u0 = pb.vars.map(v => optEncodeVal(v, spec.base[v.k]));
  let pop = [evalU(u0.slice())];
  const nLoc = Math.round(0.3 * NP);
  for (let i = 1; i < nLoc; i++) pop.push(evalU(u0.map((x, j) => (pb.vars[j].t === 'd' ? (rnd() < 0.75 ? x : rnd()) : clamp(x + 0.08 * rNorm(rnd), 0, 1)))));
  const nL = NP - pop.length, perm = pb.vars.map(() => { const p = [...Array(nL).keys()]; for (let i = nL - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; });
  for (let i = 0; i < nL; i++) pop.push(evalU(pb.vars.map((v, j) => (perm[j][i] + rnd()) / nL)));
  let muF = 0.5, muCR = 0.7;
  let lsBest = null, phase = 'de';
  const state = () => {
    let best = pop.reduce((a, b) => (optBetter(b, a) ? b : a));
    if (lsBest && optBetter(lsBest, best)) best = lsBest;
    return { phase, gen, evals, full, hits, budget, np: NP, n, ms: Date.now() - t0, best: { f: best.f, viol: best.viol, kv: best.kv, vals: best.vals }, nFeas: pop.filter(p => p.viol <= OPT_EPS).length, muF, muCR };
  };
  let stop = yield state();
  // Grenze auch über die Generationen: im Raster wiederholte Entwürfe kommen aus dem Zwischenspeicher und zählen nicht
  const deBudget = Math.round((spec.deFrac ?? 0.45) * budget);
  while (!stop && evals < deBudget && gen < maxGen && (!spec.tMax || Date.now() - t0 < spec.tMax)) {
    gen++;
    const order = [...pop.keys()].sort((a, b) => (optBetter(pop[a], pop[b]) ? (optBetter(pop[b], pop[a]) ? 0 : -1) : 1));
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
    stop = yield state();
  }
  // Feinschliff 1: (1+1)-Evolutionsstrategie mit 1/5-Erfolgsregel (Rechenberg 1973) um den besten Entwurf.
  // Schrittweite je Größe aus der Streuung der besten Fünftel der Bevölkerung; alle Zahlengrößen
  // bewegen sich gemeinsam, so kommt die Suche auch an aktiven Grenzen weiter (z. B. Nutzlast und Akku zugleich)
  let best = pop.reduce((a, b) => (optBetter(b, a) ? b : a)), h = 0.05, sinceYield = 0;
  phase = 'local'; lsBest = best;
  const num = pb.vars.map((v, j) => j).filter(j => pb.vars[j].t !== 'd' && pb.vars[j].hi > pb.vars[j].lo);
  const dis = pb.vars.map((v, j) => j).filter(j => pb.vars[j].t === 'd' && pb.vars[j].n > 1);
  if (spec.es !== false && num.length) {
    const top = [...pop].sort((a, b) => (optBetter(a, b) ? (optBetter(b, a) ? 0 : -1) : 1)).slice(0, Math.max(3, Math.round(0.2 * NP)));
    const sig = pb.vars.map((v, j) => { const m = top.reduce((s, p) => s + p.u[j], 0) / top.length, sd = Math.sqrt(top.reduce((s, p) => s + (p.u[j] - m) ** 2, 0) / top.length); return clamp(sd, 0.015, 0.12); });
    const esBudget = evals + Math.round((spec.esFrac ?? 0.8) * (budget - evals));
    let s = 1, fails = 0;
    while (!stop && evals < esBudget && (!spec.tMax || Date.now() - t0 < spec.tMax)) {
      const u = best.u.slice();
      for (const j of num) u[j] = clamp(u[j] + s * sig[j] * rNorm(rnd), 0, 1);
      if (dis.length && rnd() < 0.1) u[dis[Math.floor(rnd() * dis.length)]] = rnd();
      const c = evalU(u, best); sinceYield++;
      if (c.key === best.key) s = Math.min(3, s * 1.15);
      else if (!c.partial && optBetter(c, best)) { best = lsBest = c; s = Math.min(3, s * Math.exp(1 / 3)); fails = 0; }
      else { s *= Math.exp(-1 / 12); fails++; }
      if (s < 0.05) { s = 0.6; } // neu ansetzen statt einschlafen
      if (sinceYield >= NP) { sinceYield = 0; gen++; stop = yield state(); }
    }
  }
  // Feinschliff 2: Koordinatensuche, Schritt halbieren bis unter das Raster (nur Zahlengrößen)
  while (!stop && num.length && h > 0.003 && evals < budget && (!spec.tMax || Date.now() - t0 < spec.tMax)) {
    let improved = false;
    for (let i = num.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [num[i], num[j]] = [num[j], num[i]]; }
    for (const j of num) {
      if (evals >= budget) break;
      for (const sg of [1, -1]) {
        const u = best.u.slice(); u[j] = clamp(u[j] + sg * h, 0, 1);
        const c = evalU(u, best); sinceYield++;
        if (!c.partial && optBetter(c, best) && !optBetter(best, c)) { best = lsBest = c; improved = true; break; }
      }
      if (sinceYield >= NP) { sinceYield = 0; gen++; stop = yield state(); if (stop) break; }
    }
    if (!improved) h /= 2;
  }
  const worst = pop.reduce((w, p, i) => (optBetter(pop[w], p) ? w : i), 0);
  if (optBetter(best, pop[worst])) pop[worst] = best;
  const st = state();
  for (const p of pop) archAdd(p, p.u);
  return { ...st, arch, vars: pb.vars, seed: spec.seed };
}
// Alles in einem Zug (Tests, Rechnen ohne Worker in Scheiben)
function optRun(spec, onGen) {
  const it = optIsland(spec); let r = it.next();
  while (!r.done) { if (onGen) onGen(r.value); r = it.next(false); }
  return r.value;
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
  return { vals: cur, diff, kv, cv, chk, viol, f, feasible: viol <= OPT_EPS, nEval, base0: { f: r0.f, viol: r0.viol } };
}

/* ---------- Einstieg im Web Worker: je Auftrag eine Insel oder ein Aufräumen ---------- */
function optWorkerMain() {
  let stop = false;
  const fail = err => self.postMessage({ type: 'error', msg: String((err && err.message) || err) });
  self.onmessage = e => {
    const m = e.data;
    if (m.type === 'init') setAirfoils(m.airfoils);
    else if (m.type === 'stop') stop = true;
    else if (m.type === 'run') {
      stop = false;
      const it = optIsland(m.spec);
      const step = () => {
        let r;
        try { r = it.next(stop); } catch (err) { fail(err); return; }
        if (r.done) self.postMessage({ type: 'done', res: r.value });
        else { self.postMessage({ type: 'progress', p: r.value }); setTimeout(step, 0); }
      };
      step();
    } else if (m.type === 'polish') {
      try { self.postMessage({ type: 'polished', id: m.id, res: optPolish(m.spec, m.vals) }); } catch (err) { fail(err); }
    }
  };
}

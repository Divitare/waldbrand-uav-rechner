// Entwurfsvorschläge im Rechenkern (ohne Browser): Bedingungen eingehalten, Bereiche und Festgehaltenes beachtet,
// Nutzlast als Ziel, gleiche Startwerte geben gleiche Ergebnisse, Aufräumen ohne Änderung bleibt leer
const U = require('./load.cjs').load();
const base = { ...U.DEFAULT_PARAMS }, comps = U.DEFAULT_COMPS.map(c => ({ ...c }));
let fails = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok   ' : 'FEHLT'} ${text}`); if (!ok) fails++; };
const req = { 'p:span': { fix: false, min: 5, max: 6, allow: null }, 'p:airfoil': { fix: true, val: base.airfoil } };
const checks = U.DESIGN_CHECKS.filter(c => c.on).map(c => c.key);
const t0 = Date.now();
// 1) möglichst leicht, Excess Time mindestens 2 h (der Ausgangsentwurf erfüllt das nicht)
{
  const { vars } = U.optVarSet(base, req, null, null, 'mass');
  const spec = { base, comps, vars, obj: { key: 'mass', dir: -1 }, cons: [{ key: 'tExc', min: 2, max: null }], checks, budget: 450, seed: 3 };
  const res = U.optRun(spec), picks = U.optPick([res], 3), pol = U.optPolish(spec, picks[0].vals);
  check(pol.feasible, `zulässig gefunden: ${pol.kv.mass.toFixed(2)} kg, Excess Time ${pol.kv.tExc.toFixed(2)} h`);
  const P = { ...base, ...pol.vals };
  check(P.span >= 5 - 1e-9 && P.span <= 6 + 1e-9, `Spannweite im Bereich (${P.span} m)`);
  check(P.airfoil === base.airfoil, 'festgehaltenes Profil unverändert');
  check(pol.kv.tExc >= 2 - 1e-9 && pol.cv.tExc === 0, 'Anforderung an das Ergebnis erfüllt');
  check(pol.diff.every(d => vars.some(v => v.k === d.k)), `nur freie Größen geändert (${pol.diff.length})`);
  check(picks.length >= 1 && picks.every((p, i) => picks.slice(0, i).every(q => U.optDistinct(res.vars, p, q))), `${picks.length} deutlich verschiedene Vorschläge`);
  const again = U.optRun(spec);
  check(JSON.stringify(again.arch[0].vals) === JSON.stringify(res.arch[0].vals), 'gleicher Startwert, gleiches Ergebnis');
}
// 2) möglichst viel Nutzlast: die Zusatznutzlast wird frei und steigt
{
  const { vars } = U.optVarSet(base, req, null, null, 'payload');
  check(vars.some(v => v.k === 'payloadExtra'), 'Ziel Nutzlast gibt die Zusatznutzlast frei');
  const spec = { base, comps, vars, obj: { key: 'payload', dir: 1 }, cons: [], checks, budget: 350, seed: 1 };
  const res = U.optRun(spec), pol = U.optPolish(spec, U.optPick([res], 1)[0].vals);
  const p0 = U.kennValue(U.lazyResult(base, comps), 'payload');
  check(pol.feasible && pol.kv.payload > p0 + 0.2, `Nutzlast steigt: ${p0.toFixed(2)} → ${pol.kv.payload.toFixed(2)} kg, Masse ${pol.kv.mass.toFixed(2)} kg ≤ ${base.mtomLimit} kg`);
}
// 3) Aufräumen: der jetzige Entwurf selbst ergibt keine Änderung
{
  const { vars } = U.optVarSet(base, {}, null, null, 'mass');
  const spec = { base, comps, vars, obj: { key: 'mass', dir: -1 }, cons: [], checks, budget: 100, seed: 1 };
  const pol = U.optPolish(spec, Object.fromEntries(vars.map(v => [v.k, base[v.k]])));
  check(pol.diff.length === 0 && pol.feasible, 'jetziger Entwurf: keine Änderung, zulässig');
}
// 4) Grenze bei null: Excess Time ≥ 0 h bei höchstens 5 m Spannweite. Früher blieb die Verletzung hier bei 100 % stehen
//    (Bezug |Wert| statt typischer Größe), die Suche fand keinen Weg; jetzt wächst sie mit dem Abstand
{
  check(Math.abs(U.consViol(-9, { min: 0, max: null, sc: 1 }) - 9) < 1e-12 && U.consViol(-9, { min: 0, max: null, sc: 1 }) > U.consViol(-2, { min: 0, max: null, sc: 1 }), 'Verletzung bei Grenze null wächst mit dem Abstand (−9 h → 9, −2 h → 2)');
  const rq = { 'p:span': { fix: false, min: null, max: 5, allow: null } }, { vars } = U.optVarSet(base, rq, null, null, 'mass');
  const spec = { base, comps, vars, obj: { key: 'mass', dir: -1 }, cons: [{ key: 'tExc', min: 0, max: null }], checks, budget: 500, seed: 2 };
  const res = U.optRunIslands(spec, 2), pol = U.optPolish(spec, U.optPick(res, 1)[0].vals);
  check(pol.feasible && pol.kv.tExc >= 0, `Dauerflug bei 5 m Spannweite gefunden: Excess Time ${pol.kv.tExc.toFixed(2)} h, ${pol.kv.mass.toFixed(2)} kg`);
  check(res.every(r => r.diag && r.diag.length === 1 + checks.length), 'Diagnose je Anforderung aus jeder Insel');
  const D = U.optDiagMerge(res.map(r => r.diag));
  check(D[0].n > 0 && D[0].best === 0 && D[0].hi > D[0].lo, `Diagnose Excess Time: erreicht, Bereich ${D[0].lo.toFixed(1)} bis ${D[0].hi.toFixed(1)} h`);
  // Weiterrechnen: Startpunkte aus dem letzten Ergebnis landen in der Anfangsbevölkerung
  const r2 = U.optRun({ ...spec, budget: 120, init: [pol.vals], seed: 9 });
  check(r2.best.viol === 0 && r2.best.kv.mass <= pol.kv.mass + 1e-9, `Weiterrechnen hält den besten Entwurf (${r2.best.kv.mass.toFixed(2)} kg)`);
}
// 5) Unerreichbare Anforderung: SAIL ≤ II hängt nicht von den freien Größen ab, die Diagnose zeigt einen null breiten Bereich
{
  const { vars } = U.optVarSet(base, {}, ['wing'], null, 'mass');
  const spec = { base, comps, vars, obj: { key: 'mass', dir: -1 }, cons: [{ key: 'sail', min: null, max: 2 }], checks, budget: 150, seed: 4 };
  const res = U.optRun(spec), D = res.diag[0];
  check(res.best.viol > 0 && D.best > 0 && D.hi === D.lo, `SAIL ≤ II nie erreicht, Wert immer ${D.lo}: hängt nicht von den freien Größen ab`);
}
// 6) Excess Time ohne Gleichgewicht (Solar nie über dem Verbrauch): für die Suche abgestuft statt pauschal −24 h
{
  const P1 = { ...base, solarMode: 'count', nCellsWing: 20, payloadExtra: 2 }, P2 = { ...P1, nCellsWing: 30 };
  const R1 = U.lazyResult(P1, comps), R2 = U.lazyResult(P2, comps), g1 = U.kennGraded(R1, 'tExc', U.kennValue(R1, 'tExc')), g2 = U.kennGraded(R2, 'tExc', U.kennValue(R2, 'tExc'));
  check(R1.per.reason === 'nosolar' && U.kennValue(R1, 'tExc') === -24 && g1 < -24 && g2 > g1, `ohne Gleichgewicht abgestuft: 20 Zellen ${g1.toFixed(1)} h, 30 Zellen ${g2.toFixed(1)} h`);
}
console.log(`\n${fails ? fails + ' Prüfung(en) fehlgeschlagen' : 'Alle Prüfungen bestanden'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);

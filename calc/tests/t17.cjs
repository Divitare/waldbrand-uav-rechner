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
console.log(`\n${fails ? fails + ' Prüfung(en) fehlgeschlagen' : 'Alle Prüfungen bestanden'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);

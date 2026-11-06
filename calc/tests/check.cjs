// Schnelle Prüfung vor jedem Deploy: Rechenkerne gegen Referenzwerte und fertige Seiten.
// Schlägt eine Prüfung fehl, endet der Lauf mit Fehlercode und Cloudflare veröffentlicht nichts.
// Aufruf: node calc/tests/check.cjs
const fs = require('fs'), path = require('path');
process.env.EXTRA_NAMES = 'golandCheck, navionCheck, apcCheck, APC_MEAS';
const U = require('./load.cjs').load();
let bad = 0;
const chk = (name, val, ref, tol) => {
  const ok = Number.isFinite(val) && Math.abs(val / ref - 1) <= tol;
  if (!ok) bad++;
  console.log(`${ok ? 'ok    ' : 'FEHLER'} ${name.padEnd(42)} ${Number(val).toPrecision(4).padStart(9)}  Referenz ${ref} ±${Math.round(tol * 100)} %`);
};
const t0 = Date.now();
// AtlantikSolar (ETH-Werkzeug, Oettershagen et al. 2017)
{
  const R = U.REFS.atlantik, P = { ...U.DEFAULT_PARAMS, ...R.params }, C = U.buildCase(P, R.comps);
  const ser = U.daySeries(C, U.envClear(P, U.dayOfYear(P.date), U.yearOf(P.date))), per = U.periodic(C, ser);
  chk('AtlantikSolar Abflugmasse (kg)', C.m, 6.92, 0.03);
  chk('AtlantikSolar Leistung Reiseflug (W)', C.lvl.pel, 35.8, 0.05);
  chk('AtlantikSolar Excess Time (h)', per.tExc, 7.0, 0.08);
}
// Goland-Flügel
{ const g = U.golandCheck(); chk('Goland Flattergeschwindigkeit (m/s)', g.VF, 137.2, 0.02); chk('Goland Divergenz (m/s)', g.VD, 252.8, 0.02); }
// Typischer Profilschnitt (Hodges & Pierce), ohne und mit steifer Klappe (Theodorsen-Ruderterme)
{ const t = U.sectionCheck(); chk('Profilschnitt U_F/(b·ω_θ)', t.vf, 2.17, 0.02); chk('Profilschnitt mit steifer Klappe', t.vfFlap, Number(t.vf.toFixed(4)), 0.005); }
// Navion (Nelson)
{ const n = U.navionCheck(); chk('Navion Anstellwinkelschwingung Realteil', n.lon.sp.re, -2.51, 0.03); chk('Navion Taumelschwingung Imaginärteil', n.lat.dr.im, 2.33, 0.03); chk('Navion Rollbewegung', n.lat.roll.re, -8.43, 0.02); }
// APC 10x7E (McCrink & Gregory), Arbeitsbereich
{ const a = U.apcCheck('qprop'), at = J => a.reduce((p, r) => Math.abs(r.J - J) < Math.abs(p.J - J) ? r : p); chk('APC 10x7E Schubbeiwert bei J = 0,4', at(0.4).CT, 0.0928, 0.1); chk('APC 10x7E Wirkungsgrad bei J = 0,5', at(0.5).eta, 0.716, 0.05); }
// Standardentwurf rechnet durch und ist trimmbar
{
  const C = U.buildCase({ ...U.DEFAULT_PARAMS }, U.DEFAULT_COMPS.map(c => ({ ...c }))), A = U.aeroelastic(C), fd = U.flightDynamics(C);
  chk('Standardentwurf Stabilitätsmaß (% MAC)', C.bal.sm * 100, U.DEFAULT_PARAMS.smTarget, 0.05);
  // Freies Flugzeug: Starrkörperformen und Anstellwinkelschwingung gegen die Flugdynamik (Gegenprobe zweier Modelle)
  const fm = U.freeModes(C), bf = U.bodyFreedom(C, fm, { nStep: 6 });
  const nR = fm.sym.filter(m => m.rigid).length * 10 + fm.anti.filter(m => m.rigid).length;
  chk('Freies Flugzeug Starrkörperformen (sym·10 + anti)', nR, 21, 0);
  chk('Anstellwinkelschwingung ω frei / Flugdynamik', bf.spRigid.wn / fd.lon.sp.wn, 1, 0.03);
  chk('Anstellwinkelschwingung ζ frei / Flugdynamik', bf.spRigid.zeta / fd.lon.sp.zeta, 1, 0.03);
  if (!(Number.isFinite(C.m) && Number.isFinite(C.lvl.pel) && A.modes.length && fd.crit.length)) { bad++; console.log('FEHLER Standardentwurf liefert keine vollständigen Ergebnisse'); }
}
// Solarzellen: Fläche der pseudoquadratischen C60-Zelle (Datenblatt 125 mm, Ø 160 mm) und Packung von Hand nachgezählt
{
  chk('C60-Zelle Fläche (cm²)', U.pseudoSquareArea(0.125, 0.160) * 1e4, 153.3, 0.002);
  // Rechteck 0,3 m tief, Halbspannweite 1 m, Zellen 125 × 62,5 mm, 2 mm Fuge, frei von 0,1 bis 0,97 m:
  // 6 Spalten zu 4 Zellen (lange Kante in Spannweite), dann eine schmale Spalte zu 2 Zellen = 26
  const spec = { a: 0.125, b: 0.0625, A: 0.125 * 0.0625 };
  const geo = { h: 1, yR: 0.1, yT: 0.97, bans: [], xs: () => 0, xe: () => 0.3, breaks: [] };
  const n = U.packColumns(geo, spec, 0.002, 1, 'auto').reduce((s, c) => s + c.n, 0);
  chk('Packung Rechteck von Hand (Zellen je Hälfte)', n, 26, 0);
  const P = { ...U.DEFAULT_PARAMS }, comps = U.DEFAULT_COMPS.map(c => ({ ...c }));
  const Cc = U.buildCase({ ...P, solarMode: 'count', nCellsWing: 60 }, comps);
  chk('Feste Zellzahl wird eingehalten', Cc.solar.n, 60, 0);
  const Ca = U.buildCase({ ...P, solarMode: 'area', solarArea: 0.9 }, comps);
  chk('Freie Zellfläche bleibt wie eingegeben (m²)', Ca.solar.a, 0.9, 1e-9);
}
// Gepfeilter Flügel: Wurzel über Zwangsbedingungen an den Flugzeugachsen, Gegenprobe zur Flugdynamik (Wirbelgitter)
{
  const C = U.buildCase({ ...U.DEFAULT_PARAMS, sweep: 10 }, U.DEFAULT_COMPS.map(c => ({ ...c }))), fd = U.flightDynamics(C), bf = U.bodyFreedom(C, U.freeModes(C), { nStep: 4 });
  chk('Pfeilung 10°: ω frei / Flugdynamik', bf.spRigid.wn / fd.lon.sp.wn, 1, 0.05);
  chk('Pfeilung 10°: ζ frei / Flugdynamik', bf.spRigid.zeta / fd.lon.sp.zeta, 1, 0.05);
}
// Fertige Seiten vorhanden
for (const f of ['dist/uav-budget.html', 'public/index.html']) {
  const p = path.join(__dirname, '..', '..', f), ok = fs.existsSync(p) && /<title>Waldbrand-UAV/.test(fs.readFileSync(p, 'utf8'));
  if (!ok) bad++; console.log(`${ok ? 'ok    ' : 'FEHLER'} Seite ${f}`);
}
console.log(`\n${bad ? bad + ' Prüfung(en) fehlgeschlagen' : 'Alle Prüfungen bestanden'} (${Date.now() - t0} ms)`);
process.exit(bad ? 1 : 0);

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
  const Cc = U.buildCase({ ...P, solarMode: 'count', nCellsWing: 40 }, comps);
  chk('Feste Zellzahl wird eingehalten', Cc.solar.n, 40, 0);
  // Biegung: Oberseite als Kreisbogen mit Radius ρ = 2 (Einheitstiefe). Eine Zelle der Länge λ = 0,5 hat den Stich
  // f = ρ(1 − cos(λ/2ρ)), also f/λ = 3,12 %, und überall die Krümmung 1/ρ.
  const rho = 2, xs = [], yu = []; for (let i = 0; i <= 32; i++) { const x = i / 32; xs.push(x); yu.push(Math.sqrt(rho * rho - (x - 0.5) ** 2) - Math.sqrt(rho * rho - 0.25)); }
  const U0 = U.foilUpper({ key: 'kreisbogen-test', shape: { x: xs, yu, yl: yu.map(() => 0) } }), fRef = rho * (1 - Math.cos(0.5 / (2 * rho))) / 0.5;
  chk('Biegung: Stich je Zelllänge auf dem Kreisbogen', U.upSag(U0, 0.2, 0.7) / 0.5, fRef, 0.01);
  // zwischen 10 und 90 % der Tiefe (an den Enden des Splines ist die Krümmung nicht die des Kreises)
  const sIn = U.upS(U0, 0.9) - U.upS(U0, 0.1), bendOk = (beta, q) => { const b = U.bendScan(U0, 0.5, beta, q, 0.1, 0.9); return b ? (b.s1 - b.s0) / sIn : 0; };
  chk('Biegung: Stich knapp über der Grenze, keine Zelle', bendOk(fRef * 0.97, 100) === 0 ? 1 : 0, 1, 0);
  chk('Biegung: Stich knapp unter der Grenze, ganzes Band', bendOk(fRef * 1.03, 100), 1, 0.04);
  // Dehnung: κ = 1/ρ; zulässig κ_zul = 2q/λ, also Grenze bei q = λ/(2ρ) = 0,125
  chk('Dehnung knapp über der Grenze, keine Zelle', bendOk(1, 0.125 * 0.95) === 0 ? 1 : 0, 1, 0);
  chk('Dehnung knapp unter der Grenze, ganzes Band', bendOk(1, 0.125 * 1.05), 1, 0.04);
  const Ca = U.buildCase({ ...P, solarMode: 'area', solarArea: 0.9 }, comps);
  chk('Freie Zellfläche bleibt wie eingegeben (m²)', Ca.solar.a, 0.9, 1e-9);
}
// Schatten: Schnitt Vieleck mit Zellrechteck; senkrechtes Rechteck (0,3 m tief, 0,4 m hoch) bei 45° Sonne von der Seite
// wirft einen Schatten von 0,3 × 0,4 m auf die Ebene seines Fußes
{
  chk('Schatten: halbe Überdeckung einer Zelle (m²)', U.clipRect([[0.05, -1], [1, -1], [1, 1], [0.05, 1]], 0, 0.1, 0, 0.1), 0.005, 1e-9);
  const fin = { poly: [[0, 0, 0], [0, 0, 0.4], [0.3, 0, 0.4], [0.3, 0, 0]] }, h = 45 * Math.PI / 180, s = [0, Math.cos(h), Math.sin(h)];
  chk('Schatten: senkrechtes Rechteck bei 45° (m²)', U.polyArea(U.shadowOn(fin, s, 0)), 0.12, 1e-6);
  // Seitenleitwerk über Höhenleitwerkszellen: Verlust nimmt mit der Sonnenhöhe ab und ist ohne Bypassdioden größer
  const comps = U.DEFAULT_COMPS.map(c => ({ ...c })), C1 = U.buildCase({ ...U.DEFAULT_PARAMS, htSolar: 80, cellsOnCtrl: true }, comps), C2 = U.buildCase({ ...U.DEFAULT_PARAMS, htSolar: 80, cellsOnCtrl: true, bypass: 'none' }, comps), C3 = U.buildCase({ ...U.DEFAULT_PARAMS, htSolar: 80, cellsOnCtrl: true, tailType: 'T' }, comps);
  chk('Schatten Höhenleitwerk: ohne Bypassdioden mehr Verlust', C2.shade.H[30] > 1.5 * C1.shade.H[30] && C1.shade.H[30] > 0.05 ? 1 : 0, 1, 0);
  chk('Schatten Höhenleitwerk: T-Leitwerk schattenfrei', C3.shade.H[30] < 1e-6 ? 1 : 0, 1, 0);
}
// Wirbelflattern: Normalkraft aus den Ableitungen gegen die Normalkraft des Propellermodells, Rückwärtswirbel bei
// weicher, gleich steifer Lagerung, höhere Flattergeschwindigkeit bei steiferer Lagerung
{
  const P = { ...U.DEFAULT_PARAMS }, g = U.propGeometry(P), rho = 1.225, nu = 1.5e-5, n = 2900 / 60, d = U.whirlDerivs(g, 15, n, rho, nu);
  chk('Wirbelflattern: ½·V·I_Bt / Normalkraft-Ableitung', 0.5 * 15 * d.IBt / U.propNormalDeriv(g, 15, n, rho, nu), 1, 0.02);
  const vf = f => { const a = 0.3, I = 0.6 * a * a + 0.002, k = 1 / Math.sqrt(I), M = { modes: [{ omega: 2 * Math.PI * f, psi: 0, v: 0, th: k, u: a * k }, { omega: 2 * Math.PI * f, psi: k, v: a * k, th: 0, u: 0 }] };
    for (let V = 3; V <= 150; V += 1) { const A = U.whirlMatrix(M, U.whirlDerivs(g, V, n, rho, nu), V, 0, 2 * Math.PI * n, 1.8e-3, 1, 0.015), z = U.eigReal(A).filter(z => z.im > 1e-6).find(z => z.re > 0); if (z) return { V, kind: U.whirlSense(A, z, M, 1) }; } return { V: Infinity }; };
  const a5 = vf(5), a10 = vf(10);
  chk('Wirbelflattern weich gelagert: rückwärts umlaufend', a5.kind === 'rückwärts' ? 1 : 0, 1, 0);
  chk('Wirbelflattern: steifere Lagerung, später instabil', a10.V > 1.3 * a5.V ? 1 : 0, 1, 0);
}
// Gepfeilter Flügel: Wurzel über Zwangsbedingungen an den Flugzeugachsen, Gegenprobe zur Flugdynamik (Wirbelgitter)
{
  const C = U.buildCase({ ...U.DEFAULT_PARAMS, sweep: 10 }, U.DEFAULT_COMPS.map(c => ({ ...c }))), fd = U.flightDynamics(C), bf = U.bodyFreedom(C, U.freeModes(C), { nStep: 4 });
  chk('Pfeilung 10°: ω frei / Flugdynamik', bf.spRigid.wn / fd.lon.sp.wn, 1, 0.05);
  chk('Pfeilung 10°: ζ frei / Flugdynamik', bf.spRigid.zeta / fd.lon.sp.zeta, 1, 0.05);
}
// Entwurfsvorschläge: freie Größen aus Gruppen und Anforderungen, Ver- und Entschlüsseln, Vergleich nach Deb
{
  const P = { ...U.DEFAULT_PARAMS };
  const req = { 'p:span': { fix: false, min: 5, max: 6, allow: null }, 'p:airfoil': { fix: true, val: P.airfoil }, 'p:matCap': { fix: false, min: null, max: null, allow: ['cfk_ud', 'gfk_ud'] } };
  const { vars, info } = U.optVarSet(P, req, ['wing', 'struct'], ['dihedral'], 'payload'), by = Object.fromEntries(vars.map(v => [v.k, v]));
  const okSet = by.span && by.span.lo === 5 && by.span.hi === 6 && !by.airfoil && info.find(i => i.k === 'airfoil').why === 'fix' && !by.dihedral && by.matCap.opts.join() === 'cfk_ud,gfk_ud' && by.payloadExtra && !by.v && by.taper && !by.propD;
  if (!okSet) bad++; console.log(`${okSet ? 'ok    ' : 'FEHLER'} Freie Größen: Bereich, festgehalten, abgewählt, erlaubte Werte, Gruppen, Nutzlast`);
  chk('Raster beim Entschlüsseln (Spannweite 0,05 m)', U.optDecodeVal(by.span, 0.4321), 5.45, 1e-12);
  chk('Auswahl ver- und entschlüsseln', by.matCap.opts.indexOf(U.optDecodeVal(by.matCap, U.optEncodeVal(by.matCap, 'gfk_ud'))), 1, 0);
  chk('Verletzung relativ zur Grenze', U.consViol(9, { min: null, max: 8 }), 0.125, 1e-12);
  const order = [{ viol: 0.2, f: 1 }, { viol: 0, f: 5 }, { viol: 0, f: 3 }, { viol: 0.1, f: 9 }].sort((a, b) => (U.optBetter(a, b) ? (U.optBetter(b, a) ? 0 : -1) : 1)).map(x => x.f).join();
  if (order !== '3,5,9,1') bad++; console.log(`${order === '3,5,9,1' ? 'ok    ' : 'FEHLER'} Vergleich nach Deb: zulässig vor unzulässig, dann Ziel bzw. Verletzung`);
}
// Fertige Seiten vorhanden, alle eingebetteten Skripte syntaktisch in Ordnung (sonst bliebe die Seite leer)
for (const f of ['dist/uav-budget.html', 'public/index.html']) {
  const p = path.join(__dirname, '..', '..', f), html = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  let ok = /<title>Waldbrand-UAV/.test(html), err = '';
  for (const m of html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1].trim()) continue;
    try { new (require('vm').Script)(m[1]); } catch (e) { ok = false; err = ` – ${e.message}`; break; }
  }
  if (!ok) bad++; console.log(`${ok ? 'ok    ' : 'FEHLER'} Seite ${f}${err}`);
}
console.log(`\n${bad ? bad + ' Prüfung(en) fehlgeschlagen' : 'Alle Prüfungen bestanden'} (${Date.now() - t0} ms)`);
process.exit(bad ? 1 : 0);

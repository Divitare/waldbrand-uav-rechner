// CAD-Geometrie (dasselbe JSON wie „Datei → CAD-Geometrie für CATIA“ im Rechner) ohne Browser erzeugen.
// Aufruf: node calc/tools/cad_export.cjs [modell.uav.json] [ausgabe.cad.json]
//   ohne Modelldatei: Standardentwurf; ohne Ausgabe: <Modellname>.cad.json im aktuellen Ordner
// Die Modelldatei ist der Export „Datei → Datei herunterladen“ (format waldbrand-uav-modell).
const fs = require('fs'), path = require('path');
const U = require(path.join(__dirname, '..', 'tests', 'load.cjs')).load();
const [inFile, outArg] = process.argv.slice(2);
let params = {}, comps = null, name = 'Standardentwurf';
if (inFile) {
  const o = JSON.parse(fs.readFileSync(inFile, 'utf8')), doc = o && o.format === 'waldbrand-uav-modell' ? o.doc : o;
  if (!doc || !doc.params) throw new Error('Keine Modelldatei des Rechners (doc.params fehlt).');
  params = doc.params; comps = Array.isArray(doc.comps) ? doc.comps : null;
  name = o.name || (doc.meta && doc.meta.name) || path.basename(inFile).replace(/\.(uav\.)?json$/, '');
}
// unbekannte Schlüssel weglassen, fehlende aus den Vorgaben (wie beim Laden im Rechner)
const P = { ...U.DEFAULT_PARAMS };
for (const k of Object.keys(U.DEFAULT_PARAMS)) if (params[k] !== undefined && params[k] !== null) P[k] = typeof U.DEFAULT_PARAMS[k] === 'number' ? Number(params[k]) : params[k];
const C = U.buildCase(P, comps || U.DEFAULT_COMPS.map(c => ({ ...c })));
const out = U.cadExport(C, { name, date: new Date().toISOString().slice(0, 10) });
const file = outArg || `${name.replace(/[^A-Za-z0-9._-]+/g, '-')}.cad.json`;
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`${file}: ${out.wing.sections.length} Flügelschnitte, ${out.solar.wing_modules ? out.solar.wing_modules.length : 0} Modulreihen, ${out.mass.items.length} Massen, Einbau ${out.solar.mount}, Abflugmasse ${(out.mass.total / 1000).toFixed(2)} kg`);

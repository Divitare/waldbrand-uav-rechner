// Baut die Rechenkern-Dateien zu einem Modul zusammen (wie im Browser ein gemeinsamer Gültigkeitsbereich).
// Exportiert werden alle Namen, die in den Dateien auf oberster Ebene deklariert sind.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src'), DATA = path.join(__dirname, '..', 'data');
const MODEL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'modules.json'), 'utf8')).model;
function load() {
  const parts = MODEL.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')), names = new Set();
  for (const src of parts) for (const m of src.matchAll(/^(?:function\*?\s+|const\s+|let\s+)([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  const code = parts.join('\n;\n') + `\nmodule.exports = { ${[...names].join(', ')} };\n`;
  // erst unter eigenem Namen schreiben, dann umbenennen: parallele Prozesse lesen nie eine halbe Datei
  const tmp = path.join(__dirname, '_model.cjs'), part = `${tmp}.${process.pid}.tmp`;
  fs.writeFileSync(part, code); fs.renameSync(part, tmp);
  delete require.cache[require.resolve(tmp)];
  const U = require(tmp);
  U.setAirfoils(JSON.parse(fs.readFileSync(path.join(DATA, 'airfoils.json'), 'utf8')));
  U.weather = JSON.parse(fs.readFileSync(path.join(DATA, 'weather.json'), 'utf8'));
  return U;
}
module.exports = { load };

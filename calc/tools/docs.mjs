// Erzeugt docs/BERECHNUNGEN.md aus dem Formelkatalog (calc/src/formulas.js).
// Aufruf: node calc/tools/docs.mjs   (läuft auch im Build mit, damit Dokument und Rechner gleich bleiben)
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..'), require = createRequire(import.meta.url);
const U = require(join(here, '..', 'tests', 'load.cjs')).load();
const { FORMULAS, FORMULA_CH, LIT, litOf } = U;
// Bezeichnungen der Stellgrößen aus der Parameterbeschreibung der Oberfläche
const pm = {}, uiBase = readFileSync(join(here, '..', 'src', 'ui-base.js'), 'utf8');
for (const m of uiBase.matchAll(/\['(\w+)', '([^']+)', '([^']*)'/g)) if (!pm[m[1]]) pm[m[1]] = { l: m[2], u: m[3] };
const label = k => (pm[k] ? `${pm[k].l} (\`${k}\`)` : `\`${k}\``);
const anchor = s => s.toLowerCase().replace(/[äöü]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c])).replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const used = new Set(); FORMULAS.forEach(f => (f.s || []).forEach(s => used.add(litOf(s).k)));
const litList = Object.entries(LIT).filter(([k]) => used.has(k)).sort((a, b) => a[1].localeCompare(b[1], 'de'));
const litNo = Object.fromEntries(litList.map(([k], i) => [k, i + 1]));
const L = [];
L.push('# Berechnungen und Quellen', '');
L.push('Dieses Dokument wird aus dem Formelkatalog des Rechners erzeugt (`calc/src/formulas.js`, Werkzeug `calc/tools/docs.mjs`).');
L.push('Dieselben Einträge zeigt der Rechner in der Ansicht **Formeln**; die aufklappbaren Hinweise in den Ansichten verweisen darauf.', '');
L.push('**Koordinaten:** x vom Bug nach hinten, y zur rechten Flügelspitze, z nach oben; Ursprung an der Bugspitze auf der Rumpfachse.');
L.push('Flugdynamik in Körperachsen nach Etkin (x vorn, z unten). Einheiten SI, Winkel im Bogenmaß, soweit nicht anders angegeben.', '');
L.push('**Prüffälle** (`calc/tests/check.cjs`, laufen vor jedem Deploy): AtlantikSolar (Masse, Leistung, Excess Time), Goland-Flügel (Flattern, Divergenz),',
  'typischer Profilschnitt nach Hodges & Pierce (ohne und mit Ruder), Navion (Eigenwerte), APC 10×7E (Schub, Wirkungsgrad), freies Flugzeug gegen die Flugdynamik.', '');
L.push('## Inhalt', '');
for (const [k, l] of FORMULA_CH) { const n = FORMULAS.filter(f => f.ch === k).length; if (n) L.push(`- [${l}](#${anchor(l)}) (${n})`); }
L.push(`- [Literatur](#literatur) (${litList.length})`, '');
for (const [k, l] of FORMULA_CH) {
  const list = FORMULAS.filter(f => f.ch === k); if (!list.length) continue;
  L.push(`## ${l}`, '');
  for (const f of list) {
    L.push(`### ${f.t}`, '', '```', f.f, '```', '');
    if (f.v) L.push(f.v, '');
    if (f.n) L.push(`*${f.n}*`, '');
    if (f.p && f.p.length) L.push(`**Stellgrößen:** ${f.p.map(label).join(', ')}`, '');
    L.push(`**Quelle:** ${(f.s || []).map(s => { const x = litOf(s); return `[${litNo[x.k] || '?'}] ${x.text.split('. ')[0]}${x.at ? `, ${x.at}` : ''}`; }).join('; ') || '–'}`, '');
    L.push(`**Im Code:** \`${f.at}\``, '');
  }
}
L.push('## Literatur', '');
litList.forEach(([k, t], i) => L.push(`${i + 1}. ${t}`));
L.push('');
const text = L.join('\n'), file = join(root, 'docs', 'BERECHNUNGEN.md');
const noLabel = [...new Set(FORMULAS.flatMap(f => f.p || []))].filter(k => !pm[k]); if (noLabel.length) console.log('Stellgrößen ohne Beschreibung:', noLabel.join(', '));
if (process.argv.includes('--check')) {
  let old = ''; try { old = readFileSync(file, 'utf8'); } catch (e) { /* fehlt */ }
  if (old !== text) { console.error('docs/BERECHNUNGEN.md ist nicht aktuell: node calc/tools/docs.mjs ausführen und einchecken'); process.exit(1); }
  console.log('docs/BERECHNUNGEN.md ist aktuell');
} else {
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(file, text);
  console.log(`docs/BERECHNUNGEN.md: ${FORMULAS.length} Formeln, ${litList.length} Quellen`);
}
const unused = Object.keys(LIT).filter(k => !used.has(k)); if (unused.length) console.log('nicht zitiert:', unused.join(', '));
const missing = [...used].filter(k => !LIT[k]); if (missing.length) { console.error('fehlende Quellen:', missing.join(', ')); process.exit(1); }

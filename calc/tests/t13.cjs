// Datei-Export und -Import: Rundreise mit Anforderung, Kommentar und geänderter Eingabe
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#uebersicht'); await p.waitForTimeout(1500);
  // Zustand vorbereiten: Spannweite, Anforderung und Kommentar direkt im Zustand
  await p.evaluate(() => { const el = document.querySelector('[data-k="span"]'); el.value = '5.8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(600);
  await p.click('#btn-share'); await p.fill('#exp-name', 'Testmodell Ü'); 
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exp-file')]);
  const file = path.join(__dirname, 'out', 'export-test.uav.json'); await dl.saveAs(file);
  const o = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('Datei:', dl.suggestedFilename(), '| Format', o.format, o.version, '| span', o.doc.params.span, '| Name', o.name, '| Masse', o.summary && o.summary.mass_kg);
  // Eingabe ändern, dann die Datei importieren
  await p.click('#share-close');
  await p.evaluate(() => { const el = document.querySelector('[data-k="span"]'); el.value = '4.2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(600);
  await p.click('#btn-share');
  await p.setInputFiles('#imp-file', file); await p.waitForTimeout(400);
  console.log('Vorschau:', (await p.textContent('#imp-preview')).replace(/\s+/g, ' ').slice(0, 220));
  await p.click('#imp-apply'); await p.waitForTimeout(1200);
  const span = await p.evaluate(() => document.querySelector('[data-k="span"]').value);
  console.log('nach Import span =', span, '| Meldung:', await p.textContent('#share-msg'));
  await p.click('#imp-undo'); await p.waitForTimeout(800);
  console.log('nach Rückgängig span =', await p.evaluate(() => document.querySelector('[data-k="span"]').value));
  // alter Text (Version 7): nur params/comps
  await p.fill('#imp-text', JSON.stringify({ v: 5, params: { span: 6.1, solarArea: 0.9 }, comps: [] })); await p.waitForTimeout(300);
  console.log('alter Text:', (await p.textContent('#imp-preview')).replace(/\s+/g, ' ').slice(0, 160));
  await p.click('#imp-apply'); await p.waitForTimeout(1000);
  console.log('nach altem Text span =', await p.evaluate(() => document.querySelector('[data-k="span"]').value), 'Belegung =', await p.evaluate(() => document.querySelector('[data-k="solarMode"]').value));
  console.log(errs.length ? 'FEHLER\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
})();

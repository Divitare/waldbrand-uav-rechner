// Module gebogen oder eben: Vergleich in der Ansicht Energie (drei Einbauarten, Profilschnitt), Übernehmen per Klick,
// Zellband mit Abweichung statt Biegung, Moduldaten wie AtlantikSolar, CAD-Export als JSON-Datei
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
const OUT = path.join(__dirname, 'out');
const W = Number(process.env.W || 1280), DARK = !!process.env.DARK;
let fails = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok   ' : 'FEHLT'} ${text}`); if (!ok) fails++; };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: W, height: 900 }, colorScheme: DARK ? 'dark' : 'light', acceptDownloads: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#energie'); await p.waitForSelector('#tbl-mount tbody tr', { timeout: 90000 }); await p.waitForTimeout(500);
  const rows = await p.$$eval('#tbl-mount tbody tr', rs => rs.map(r => ({ k: r.dataset.mount, t: r.textContent.replace(/\s+/g, ' ') })));
  rows.forEach(r => console.log('  ' + r.k + ': ' + r.t.slice(0, 160)));
  check(rows.length === 3 && rows.map(r => r.k).join() === 'bent,trip,flat', 'drei Einbauarten: gebogen, gebogen mit Umschlag, eben');
  check(/Abweichung bis [\d,]+ mm, Knicke/.test(rows[2].t), 'eben: Abweichung und Knicke genannt');
  check(await p.$eval('#svg-mount', el => el.querySelectorAll('path').length > 4 && /Knick/.test(el.textContent) && /Umschlag/.test(el.textContent)), 'Profilschnitt mit Knicken und Umschlag gezeichnet');
  check(await p.$eval('#tbl-mount tr[data-mount="bent"]', r => r.classList.contains('sel')), 'gebogen ist vorgewählt');
  await p.evaluate(() => document.querySelector('#svg-mount').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  await (await p.$('#svg-mount')).screenshot({ path: path.join(OUT, `t21-mount-${W}${DARK ? 'd' : ''}.png`) });
  // eben übernehmen
  await p.click('#tbl-mount tr[data-mount="flat"]');
  await p.waitForFunction(() => document.querySelector('#tbl-mount tr[data-mount="flat"]') && document.querySelector('#tbl-mount tr[data-mount="flat"]').classList.contains('sel'), null, { timeout: 60000 });
  check(await p.$eval('#f-solar-cellMount', el => el.value) === 'flat', 'Klick auf „eben“ stellt den Einbau um');
  check(await p.$eval('[data-fk="facetDev"]', el => !el.hidden) && await p.$eval('#v-energie [data-fk="cellStrain"]', el => el.hidden), 'eben: Abweichung statt Dehnung im Formular');
  check(/Abweichung max\./.test(await p.textContent('#tbl-band thead')), 'Zellband zeigt die Abweichung der ebenen Module');
  check(/Facettenprofil/.test(await p.textContent('#cells-msg')), 'Hinweis auf das Facettenprofil');
  await (await p.$('#svg-cells')).screenshot({ path: path.join(OUT, `t21-cells-flat-${W}${DARK ? 'd' : ''}.png`) });
  // zurück auf gebogen
  await p.click('#tbl-mount tr[data-mount="bent"]');
  await p.waitForFunction(() => document.querySelector('#tbl-mount tr[data-mount="bent"]') && document.querySelector('#tbl-mount tr[data-mount="bent"]').classList.contains('sel'), null, { timeout: 60000 });
  check(await p.$eval('#f-solar-cellMount', el => el.value) === 'bent', 'zurück auf gebogen');
  // Moduldaten wie AtlantikSolar
  await p.fill('#f-solar-cellEff', '21'); await p.waitForTimeout(400);
  await p.click('#btn-atl-mod'); await p.waitForTimeout(600);
  check(await p.$eval('#f-solar-cellEff', el => el.value) === '23.7' && await p.$eval('#f-solar2-laminateLoss', el => el.value) === '0', 'Moduldaten wie AtlantikSolar übernommen (23,7 %, Laminatverlust 0)');
  // CAD-Export
  await p.click('#btn-share'); await p.waitForSelector('#cad-file', { state: 'visible' });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cad-file')]);
  const fn = path.join(OUT, 't21-' + dl.suggestedFilename()); await dl.saveAs(fn);
  const o = JSON.parse(fs.readFileSync(fn, 'utf8'));
  console.log('  CAD:', dl.suggestedFilename(), (fs.statSync(fn).size / 1024).toFixed(0), 'KB,', o.wing.sections.length, 'Schnitte,', o.solar.wing_modules.length, 'Modulreihen,', o.mass.items.length, 'Massen');
  check(/\.cad\.json$/.test(dl.suggestedFilename()) && o.format === 'waldbrand-uav-cad' && o.units.length === 'mm', 'CAD-Datei mit Format und Einheiten');
  check(o.wing.sections.length >= 3 && o.airfoils.wing.coords.length > 40 && o.solar.wing_modules.every(m => m.corners.length === 4), 'Schnitte, Profilkoordinaten und Modulecken enthalten');
  check(/CAD-Geometrie gespeichert/.test(await p.textContent('#share-msg')), 'Meldung nach dem Speichern');
  console.log(errs.length ? 'FEHLER:\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
  console.log(fails || errs.length ? `\n${fails} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  process.exit(fails || errs.length ? 1 : 0);
})();

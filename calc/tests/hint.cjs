const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html'), OUT = path.join(__dirname, 'out');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#uebersicht'); await p.waitForTimeout(3500);
  const n = await p.evaluate(() => document.querySelectorAll('#verdict details.pillx').length); console.log('aufklappbare Hinweise in der Übersicht:', n);
  await p.click('#verdict details.pillx summary'); await p.waitForTimeout(300);
  console.log('Inhalt:', (await p.evaluate(() => document.querySelector('#verdict details.pillx[open] .pillx-body').textContent)).slice(0, 220));
  const sb = await p.$('#verdict details.pillx[open] [data-sens]');
  if (sb) { await sb.click(); await p.waitForTimeout(6000); console.log('Einfluss:', (await p.evaluate(() => document.querySelector('#verdict .fx-sens').textContent)).slice(0, 400)); }
  await p.screenshot({ path: `${OUT}/hint-open.png`, clip: { x: 0, y: 150, width: 1280, height: 750 } });
  // Sprung zur Stellgröße
  const chip = await p.$('#verdict details.pillx[open] .chip'); const k = await chip.getAttribute('data-jump'); await chip.click(); await p.waitForTimeout(1500);
  console.log('Sprung:', k, '→', await p.evaluate(() => location.hash), 'fokussiert:', await p.evaluate(() => document.activeElement && document.activeElement.dataset.k));
  // Formelkatalog: Suche
  await p.evaluate(() => { location.hash = 'formeln'; }); await p.waitForTimeout(1500);
  await p.fill('#fx-q', 'Theodorsen'); await p.waitForTimeout(400);
  console.log('Suche Theodorsen:', await p.evaluate(() => document.querySelectorAll('#fx-list .fx-card').length), 'Karten');
  console.log(errs.length ? 'FEHLER\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
})();

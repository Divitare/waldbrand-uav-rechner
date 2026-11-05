const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#struktur'); await p.waitForTimeout(6000);
  const n = await p.evaluate(() => document.querySelectorAll('#v-struktur details.pillx').length); console.log('Hinweise Struktur:', n);
  await p.click('#ae-msg details.pillx summary'); await p.waitForTimeout(300);
  const sb = await p.$('#ae-msg details.pillx[open] [data-sens]'); await sb.click(); await p.waitForTimeout(15000);
  console.log('Flattern-Einfluss:', (await p.evaluate(() => document.querySelector('#ae-msg .fx-sens').textContent)).replace(/\s+/g, ' ').slice(0, 500));
  await p.click('#ae-msg details.pillx[open] a[data-fid]'); await p.waitForTimeout(1500);
  console.log('Katalog:', await p.evaluate(() => location.hash), 'markiert:', await p.evaluate(() => { const e = document.querySelector('.fx-card.sel'); return e ? e.id : null; }));
  console.log(errs.length ? 'FEHLER\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
})();

const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html'), OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#schwerpunkt'); await p.waitForTimeout(2500);
  const kpi = async () => p.evaluate(() => [...document.querySelectorAll('#kpis-cg .kpi')].slice(0, 4).map(k => k.querySelector('.v').textContent.trim()).join(' | '));
  console.log('Start', await kpi());
  // 1) Ziehen einer Komponente (Wärmebildkamera) um ~ +0,3 m
  const key = await p.evaluate(() => { const g = [...document.querySelectorAll('.lolli.drag')].find(e => e.dataset.key === 'comp:ir'); return g && g.dataset.key; });
  await p.evaluate(() => document.querySelector('#svg-side').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  const box = await p.evaluate(k => { const c = document.querySelector(`.lolli[data-key="${k}"] .hit`); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, key);
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x + 60, box.y, { steps: 6 });
  const live = await p.evaluate(() => document.querySelector('#cg-live').textContent); await p.mouse.up(); await p.waitForTimeout(1500);
  console.log('gezogen', key, '| live:', live, '| x neu', await p.evaluate(k => { const c = window.__S ? null : null; return document.querySelector(`.lolli[data-key="${k}"]`).dataset.x; }, key), '|', await kpi());
  // 2) Pfeiltaste auf dem Flügel (Trimmung über Akku: Flügel ziehbar)
  await p.focus('.lolli[data-drag="wing"]'); await p.keyboard.press('Shift+ArrowRight'); await p.waitForTimeout(1500);
  console.log('Flügel +5 cm', await p.evaluate(() => document.querySelector('input[data-k="xWingLE"]').value), '|', await kpi());
  // 3) Motor oben am Seitenleitwerk über die Vergleichstabelle
  await p.click('tr[data-mot="fin"]'); await p.waitForTimeout(2500);
  console.log('Leitwerksmotor', await p.evaluate(() => document.querySelector('select[data-k="motorPos"]').value), '|', await kpi(), '|', await p.evaluate(() => document.querySelector('#cg-msg').textContent.slice(0, 160)));
  // 3b) Konfigurationsmatrix: Seglerrumpf mit Druckpropeller übernehmen
  await p.evaluate(() => { location.hash = 'konfiguration'; }); await p.waitForTimeout(3000);
  await p.click('#cf-matrix .cell[data-fus="glider"][data-mot="pusher"]'); await p.waitForTimeout(3000);
  console.log('Matrix', await p.evaluate(() => ['fusType', 'motorPos'].map(k => k + '=' + document.querySelector(`select[data-k="${k}"]`).value).join(' ')), '|', await p.evaluate(() => [...document.querySelectorAll('#kpis-cf .kpi')].map(k => k.querySelector('.v').textContent.trim()).join(' | ')));
  await p.click('#cf-matrix .cell[data-fus="pod"][data-mot="fin"]'); await p.waitForTimeout(2500);
  await p.evaluate(() => { location.hash = 'schwerpunkt'; }); await p.waitForTimeout(2500);
  // 4) Trimmung über Flügel
  await p.selectOption('select[data-k="trimMode"]', 'wing'); await p.waitForTimeout(2500);
  console.log('Trimmung Flügel', await kpi());
  // 5) Pfeilung -10° im Flugzeug-Formular
  await p.evaluate(() => { location.hash = 'flugzeug'; }); await p.waitForTimeout(1500);
  await p.fill('input[data-k="sweep"]', '-10'); await p.dispatchEvent('input[data-k="sweep"]', 'input'); await p.waitForTimeout(1500);
  await p.evaluate(() => { location.hash = 'struktur'; }); await p.waitForTimeout(4000);
  console.log('Struktur bei -10°', await p.evaluate(() => [...document.querySelectorAll('#kpis-ae .kpi')].slice(0, 4).map(k => k.querySelector('.k').textContent + ' ' + k.querySelector('.v').textContent.trim()).join(' | ')));
  // 6) Werkstoff per Klick
  await p.click('tr[data-mk="matSkin"][data-mv="balsa_gfk"]'); await p.waitForTimeout(4000);
  console.log('Balsa-Nase', await p.evaluate(() => document.querySelector('select[data-k="matSkin"]').value), await p.evaluate(() => [...document.querySelectorAll('#kpis-ae .kpi')].slice(1, 3).map(k => k.querySelector('.v').textContent.trim()).join(' | ')));
  // 7) Antrieb: Kennfeld im Energiehaushalt
  await p.evaluate(() => { location.hash = 'antrieb'; }); await p.waitForTimeout(2500);
  const before = await p.evaluate(() => document.querySelector('#strip').textContent);
  await p.click('#op-act button'); await p.waitForTimeout(2500);
  console.log('Antriebsmodell', await p.evaluate(() => document.querySelector('select[data-k="propModel"]').value), '| Streifen vorher', before.match(/Reiseflug(\d+ W)/)?.[1], 'nachher', (await p.evaluate(() => document.querySelector('#strip').textContent)).match(/Reiseflug(\d+ W)/)?.[1]);
  // 8) Flugdynamik: Reiter
  await p.evaluate(() => { location.hash = 'flugdynamik'; }); await p.waitForTimeout(2000);
  await p.click('#dyn-tabs [data-dt="rigid"]'); await p.waitForTimeout(800);
  console.log('starr', await p.evaluate(() => document.querySelector('#tbl-dmodes tbody').textContent.replace(/\s+/g, ' ').slice(0, 200)));
  // 9) Neu laden: Zustand bleibt
  await p.reload(); await p.waitForTimeout(2500);
  console.log('nach Neuladen', await p.evaluate(() => ['sweep', 'motorPos', 'fusType', 'trimMode', 'matSkin', 'propModel'].map(k => k + '=' + document.querySelector(`[data-k="${k}"]`).value).join(' ')));
  await p.evaluate(() => { location.hash = 'komponenten'; }); await p.waitForTimeout(1500);
  console.log('Komponenten x', await p.evaluate(() => [...document.querySelectorAll('#tbl-comps input[data-cf="x"]')].slice(0, 4).map(e => e.value).join(', ')));
  console.log(errs.length ? 'FEHLER\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
})();

const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html'), OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#schwerpunkt'); await p.waitForTimeout(2000);
  for (const pre of ['atlantik', 'skysailor', 'design']) {
    await p.selectOption('#preset-sel', pre); await p.waitForTimeout(1500);
    const out = [];
    for (const v of ['schwerpunkt', 'struktur', 'antrieb', 'flugdynamik', 'uebersicht']) {
      await p.evaluate(v => { location.hash = v; }, v); await p.waitForTimeout(v === 'struktur' ? 3500 : 1500);
      const k = await p.evaluate(v => { const el = document.querySelector(`#v-${v} .kpis`); return el ? [...el.querySelectorAll('.kpi')].slice(0, 3).map(x => x.querySelector('.v').textContent.trim()).join(' | ') : ''; }, v);
      out.push(v + ': ' + k);
    }
    console.log('== ' + pre + '\n  ' + out.join('\n  '));
  }
  // feste Strukturmasse
  await p.evaluate(() => { location.hash = 'flugzeug'; }); await p.waitForTimeout(800);
  await p.selectOption('select[data-k="structMode"]', 'fix'); await p.waitForTimeout(1200);
  for (const v of ['struktur', 'flugdynamik', 'schwerpunkt']) { await p.evaluate(v => { location.hash = v; }, v); await p.waitForTimeout(2000); }
  console.log('fix:', await p.evaluate(() => document.querySelector('#v-schwerpunkt #kpis-cg').textContent.slice(0, 80)));
  console.log(errs.length ? 'FEHLER\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
})();

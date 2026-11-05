// Elementaufnahmen: node tests/elshot.cjs <breite> <dunkel 0/1> view:selektor ...
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html'), OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const [W, dark, ...items] = process.argv.slice(2);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: Number(W), height: 900 }, colorScheme: dark === '1' ? 'dark' : 'light' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#uebersicht'); await p.waitForTimeout(1200);
  let i = 0;
  for (const it of items) {
    const [v, sel] = it.split(':');
    await p.evaluate(v => { location.hash = v; }, v); await p.waitForTimeout(2200);
    const el = await p.$(sel); if (!el) { console.log('fehlt', sel); continue; }
    const panel = await el.evaluateHandle(e => e.closest('.panel') || e);
    const f = `${OUT}/el-${W}${dark === '1' ? 'd' : ''}-${i++}.png`;
    await panel.asElement().screenshot({ path: f }); console.log(f);
  }
  console.log(errs.length ? errs.join('\n') : 'keine Fehler');
  await b.close();
})();

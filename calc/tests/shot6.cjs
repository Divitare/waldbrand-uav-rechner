const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html'), OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const views = (process.env.VIEWS || 'uebersicht,flugzeug,schwerpunkt,struktur,antrieb,flugdynamik,validierung').split(',');
  const W = Number(process.env.W || 1280), dark = process.env.DARK === '1';
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(PAGE + '#uebersicht'); await p.waitForTimeout(1500);
  for (const v of views) {
    const t0 = Date.now();
    await p.evaluate(v => { location.hash = v; }, v); await p.waitForTimeout(Number(process.env.WAIT || 2500));
    const h = await p.evaluate(() => document.body.scrollHeight);
    await p.screenshot({ path: `${OUT}/${v}${dark ? '-dark' : ''}-${W}.png`, fullPage: true });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(v, 'Höhe', h, 'Überlauf', ov, (Date.now() - t0) + ' ms');
  }
  console.log(errs.length ? errs.join('\n') : 'keine Fehler');
  await b.close();
})();

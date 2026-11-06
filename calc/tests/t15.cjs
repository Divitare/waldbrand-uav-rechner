// Entwurf berechnen: Bereich und Ergebnis-Grenze setzen, Nutzlast maximieren, Vorschlag übernehmen und zurücknehmen
const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
const W = Number(process.env.W || 1280), DARK = !!process.env.DARK, EFFORT = process.env.EFFORT || 'quick';
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: W, height: 900 }, colorScheme: DARK ? 'dark' : 'light' }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#flugzeug'); await p.waitForTimeout(1800);
  // Spannweite 5–6 m, Profil festhalten
  await p.click('#v-flugzeug .rq-btn[data-rq="span"]'); await p.check('#rq-pop input[name=rqmode][value=range]');
  await p.fill('#rq-min', '5'); await p.fill('#rq-max', '6'); await p.click('#rq-save'); await p.waitForTimeout(400);
  await p.click('#v-flugzeug .rq-btn[data-rq="airfoil"]'); await p.check('#rq-pop input[name=rqmode][value=fix]'); await p.click('#rq-save'); await p.waitForTimeout(400);
  // Excess Time mindestens 2 h
  await p.evaluate(() => { location.hash = 'anforderungen'; }); await p.waitForTimeout(900);
  await p.selectOption('#rq-new-k', 'tExc'); await p.fill('#rq-new-min', '2'); await p.click('#rq-new-add'); await p.waitForTimeout(500);
  // Entwurf: Nutzlast maximieren
  await p.evaluate(() => { location.hash = 'entwurf'; }); await p.waitForTimeout(900);
  await p.selectOption('#op-obj', 'payload'); await p.waitForTimeout(300);
  await p.check(`#op-effort input[value=${EFFORT}]`); await p.waitForTimeout(200);
  console.log('Ziel:', await p.textContent('#op-obj-cur'), '|', await p.textContent('#op-obj-note'));
  console.log('Bedingungen:', (await p.textContent('#op-cons')).replace(/\s+/g, ' '));
  console.log('Freie Größen:', await p.textContent('#op-vars-sub'));
  console.log('Lauf:', await p.textContent('#op-run-note'));
  await p.screenshot({ path: path.join(__dirname, 'out', `op-setup-${W}${DARK ? 'd' : ''}.png`), fullPage: true });
  const t0 = Date.now();
  await p.click('#op-run');
  let mid = false;
  for (let i = 0; i < 400; i++) {
    await p.waitForTimeout(500);
    if (!mid && Date.now() - t0 > 6000) { mid = true; console.log('während:', (await p.textContent('#op-stat')).replace(/\s+/g, ' ')); await p.screenshot({ path: path.join(__dirname, 'out', `op-run-${W}${DARK ? 'd' : ''}.png`) }); }
    if (await p.evaluate(() => !document.querySelector('#op-run').disabled)) break;
  }
  console.log('Dauer', ((Date.now() - t0) / 1000).toFixed(1), 's |', (await p.textContent('#op-stat')).replace(/\s+/g, ' '));
  console.log('Ergebnis:', await p.textContent('#op-res-sub'));
  const cards = await p.$$eval('.op-card', cs => cs.map(c => `${c.querySelector('h3').textContent} | ${c.querySelector('.op-obj').textContent.replace(/\s+/g, ' ')} | ${c.querySelector('.op-diff tbody').textContent.replace(/\s+/g, ' ').slice(0, 300)}`));
  cards.forEach(c => console.log('  ' + c));
  await p.screenshot({ path: path.join(__dirname, 'out', `op-res-${W}${DARK ? 'd' : ''}.png`), fullPage: true });
  // übernehmen und zurück
  const before = (await p.textContent('#strip')).replace(/\s+/g, ' ');
  if (await p.$('[data-opapply="0"]')) {
    await p.click('[data-opapply="0"]'); await p.waitForTimeout(900);
    console.log('nach Übernehmen:', (await p.textContent('#strip')).replace(/\s+/g, ' '));
    console.log('Karte:', (await p.textContent('.op-card.applied footer')).replace(/\s+/g, ' '));
    await p.click('[data-opundo]'); await p.waitForTimeout(900);
    const after = (await p.textContent('#strip')).replace(/\s+/g, ' ');
    console.log('zurück gleich wie vorher:', after === before);
  }
  console.log(errs.length ? 'FEHLER:\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();

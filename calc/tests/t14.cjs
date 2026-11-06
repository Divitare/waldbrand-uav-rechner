// Anforderungen und Kommentare: Bereich, Festhalten, Ergebnis-Grenzen, Kommentar, Stand
const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
const W = Number(process.env.W || 1280), DARK = !!process.env.DARK;
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: W, height: 900 }, colorScheme: DARK ? 'dark' : 'light' }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#flugzeug'); await p.waitForTimeout(1800);
  // Spannweite: Bereich 5–6 m
  await p.click('#v-flugzeug .rq-btn[data-rq="span"]'); await p.waitForTimeout(200);
  await p.check('#rq-pop input[name=rqmode][value=range]'); await p.fill('#rq-min', '5'); await p.fill('#rq-max', '6');
  await p.fill('#rq-note', 'Transportkiste 3,2 m, zweiteilig'); 
  if (await p.$('#rq-name')) await p.fill('#rq-name', 'Max');
  await p.click('#rq-add'); await p.click('#rq-save'); await p.waitForTimeout(800);
  console.log('Spannweite Abzeichen:', await p.evaluate(() => document.querySelector('#v-flugzeug .field[data-fk="span"] .rq-badge').textContent), '| Klassen', await p.evaluate(() => document.querySelector('#v-flugzeug .field[data-fk="span"]').className));
  // Profil festhalten
  await p.click('#v-flugzeug .rq-btn[data-rq="airfoil"]'); await p.check('#rq-pop input[name=rqmode][value=fix]'); await p.click('#rq-save'); await p.waitForTimeout(600);
  console.log('Profil gesperrt:', await p.evaluate(() => document.querySelector('#v-flugzeug [data-k="airfoil"]').disabled));
  const panel = await p.$('#v-flugzeug [data-form="wing"]');
  await panel.evaluate(el => el.closest('.panel').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
  await (await panel.evaluateHandle(el => el.closest('.panel'))).screenshot({ path: path.join(__dirname, 'out', `rq-form-${W}${DARK ? 'd' : ''}.png`) });
  await p.click('#v-flugzeug .rq-btn[data-rq="span"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(__dirname, 'out', `rq-pop-${W}${DARK ? 'd' : ''}.png`) });
  await p.click('#rq-pop .rq-x'); await p.waitForTimeout(200);
  // Ergebnis-Anforderungen im Streifen: Abflugmasse höchstens 8,2 kg, SAIL höchstens III
  await p.click('#strip > [data-rq="m:mass"]'); await p.check('#rq-pop input[name=rqmode][value=range]'); await p.fill('#rq-max', '8.2'); await p.click('#rq-save'); await p.waitForTimeout(700);
  await p.click('#strip > [data-rq="m:sail"]'); await p.check('#rq-pop input[name=rqmode][value=range]'); await p.fill('#rq-max', '3'); await p.click('#rq-save'); await p.waitForTimeout(700);
  console.log('Streifen:', await p.evaluate(() => [...document.querySelectorAll('#strip > div, #strip > a')].map(d => d.className + ':' + d.textContent.trim().replace(/\s+/g, ' ')).join(' | ')));
  // Ansicht Anforderungen, Flattern als aufwendige Größe
  await p.evaluate(() => { location.hash = 'anforderungen'; }); await p.waitForTimeout(1200);
  await p.selectOption('#rq-new-k', 'vfMin'); await p.fill('#rq-new-min', '1'); await p.click('#rq-new-add'); await p.waitForTimeout(400);
  console.log('sofort:', await p.evaluate(() => document.querySelector('#tbl-rq-out').textContent.replace(/\s+/g, ' ').slice(0, 400)));
  await p.waitForTimeout(3500);
  console.log('später:', await p.evaluate(() => document.querySelector('#tbl-rq-out').textContent.replace(/\s+/g, ' ').slice(0, 400)));
  console.log('Eingaben:', await p.evaluate(() => document.querySelector('#tbl-rq-in').textContent.replace(/\s+/g, ' ').slice(0, 300)));
  console.log('Kommentare:', await p.evaluate(() => document.querySelector('#rq-all-notes').textContent.replace(/\s+/g, ' ').slice(0, 200)));
  console.log('Stand:', await p.textContent('#rq-sum'));
  await p.screenshot({ path: path.join(__dirname, 'out', `rq-${W}${DARK ? 'd' : ''}.png`), fullPage: true });
  // festgehaltene Eingabe über einen anderen Weg ändern (Profil-Auswahl in der Ansicht Profile)
  const before = await p.evaluate(() => document.querySelector('[data-k="airfoil"]').value);
  await p.evaluate(() => { location.hash = 'profile'; }); await p.waitForTimeout(1500);
  const picked = await p.evaluate(() => { const el = document.querySelector('[data-pick]'); if (!el) return null; el.click(); return el.dataset.pick; });
  await p.waitForTimeout(900);
  console.log('Profil vorher', before, '| angeklickt', picked, '| nachher', await p.evaluate(() => document.querySelector('[data-k="airfoil"]').value), '| Hinweis:', await p.evaluate(() => (document.querySelector('#toast') || {}).textContent));
  console.log(errs.length ? 'FEHLER\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
})();

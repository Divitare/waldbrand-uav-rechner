// Entwurf berechnen bei strengen Anforderungen: Fortschritt nennt, was fehlt; ohne zulässigen Entwurf erklärt die
// Diagnose, woran es liegt (SAIL hängt nicht von den freien Größen ab); Weiterrechnen setzt bei der letzten Suche an;
// ohne die unerreichbare Anforderung wird ein zulässiger Entwurf gefunden
const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
const W = Number(process.env.W || 1280), DARK = !!process.env.DARK;
let fails = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok   ' : 'FEHLT'} ${text}`); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: W, height: 900 }, colorScheme: DARK ? 'dark' : 'light' }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#flugzeug'); await p.waitForSelector('#v-flugzeug .rq-btn[data-rq="span"]', { timeout: 90000 }); await p.waitForTimeout(800);
  // Spannweite höchstens 5 m; Excess Time mindestens 0 h (Grenze bei null); SAIL höchstens II (mit den freien Größen nicht erreichbar)
  await p.click('#v-flugzeug .rq-btn[data-rq="span"]'); await p.check('#rq-pop input[name=rqmode][value=range]');
  await p.fill('#rq-min', ''); await p.fill('#rq-max', '5'); await p.click('#rq-save'); await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = 'anforderungen'; }); await p.waitForTimeout(900);
  await p.selectOption('#rq-new-k', 'tExc'); await p.fill('#rq-new-min', '0'); await p.click('#rq-new-add'); await p.waitForTimeout(400);
  await p.selectOption('#rq-new-k', 'sail'); await p.fill('#rq-new-min', ''); await p.fill('#rq-new-max', '2'); await p.click('#rq-new-add'); await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = 'entwurf'; }); await p.waitForTimeout(900);
  await p.selectOption('#op-obj', 'mass'); await p.waitForTimeout(200);
  await p.check('#op-effort input[value=quick]'); await p.waitForTimeout(200);
  const note = await p.textContent('#op-run-note');
  console.log('Lauf:', note);
  check(/Läufe parallel/.test(note) && /tauschen/.test(note), 'Hinweis nennt parallele Läufe und Austausch');
  check(await p.$$eval('#op-effort input', l => l.length) === 4, 'vier Stufen für den Rechenaufwand');
  check(await p.$eval('#op-more', e => e.hidden), 'Weiterrechnen vor der ersten Suche verborgen');
  const run = async label => {
    const t0 = Date.now(); let mid = '';
    for (let i = 0; i < 600; i++) {
      await p.waitForTimeout(500);
      if (!mid && Date.now() - t0 > 4000) { mid = (await p.textContent('#op-stat')).replace(/\s+/g, ' '); console.log(`während (${label}):`, mid); await p.screenshot({ path: path.join(__dirname, 'out', `op18-run-${label}-${W}${DARK ? 'd' : ''}.png`) }); }
      if (await p.evaluate(() => !document.querySelector('#op-run').disabled)) break;
    }
    console.log(`Dauer (${label})`, ((Date.now() - t0) / 1000).toFixed(1), 's |', (await p.textContent('#op-stat')).replace(/\s+/g, ' '));
    return mid;
  };
  await p.click('#op-run');
  const mid = await run('streng');
  check(/am nächsten dran|bester zulässiger/.test(mid), 'Fortschritt nennt, was noch fehlt');
  console.log('Ergebnis:', await p.textContent('#op-res-sub'));
  const diagShown = await p.$eval('#op-diag', e => !e.hidden);
  check(diagShown, 'Diagnose sichtbar, wenn kein Entwurf zulässig ist');
  if (diagShown) {
    const rows = await p.$$eval('#op-diag tbody tr', rs => rs.map(r => [...r.children].map(td => td.textContent.trim()).join(' | ')));
    rows.forEach(r => console.log('  ' + r));
    check(rows.some(r => /^SAIL/.test(r) && /hängt nicht von den freien Größen ab/.test(r)), 'SAIL als nicht beeinflussbar erkannt');
  }
  await p.screenshot({ path: path.join(__dirname, 'out', `op18-res-${W}${DARK ? 'd' : ''}.png`), fullPage: true });
  check(!(await p.$eval('#op-more', e => e.hidden)), 'Weiterrechnen nach der Suche sichtbar');
  // Weiterrechnen
  await p.click('#op-more'); await p.waitForTimeout(300);
  const sub = await p.textContent('#op-prog-sub');
  console.log('Weiterrechnen:', sub);
  check(/weitergerechnet ab \d+ Entwürfen/.test(sub), 'Weiterrechnen setzt bei den Entwürfen der letzten Suche an');
  await run('weiter');
  check(/Fortsetzung/.test(await p.textContent('#op-stat')), 'Fertig-Meldung nennt die Fortsetzung');
  // SAIL-Anforderung entfernen: jetzt zulässig
  await p.evaluate(() => { location.hash = 'anforderungen'; }); await p.waitForTimeout(800);
  const del = await p.$('[data-rqdel="m:sail"]');
  check(!!del, 'SAIL-Anforderung lässt sich entfernen');
  if (del) { await del.click(); await p.waitForTimeout(400); }
  await p.evaluate(() => { location.hash = 'entwurf'; }); await p.waitForTimeout(900);
  await p.click('#op-run');
  await run('ohne-sail');
  const res = await p.textContent('#op-res-sub');
  console.log('Ergebnis:', res);
  check(/zulässig/.test(res) && !/Kein zulässiger/.test(res), 'ohne SAIL-Anforderung zulässiger Entwurf gefunden');
  check(await p.$eval('#op-diag', e => e.hidden), 'Diagnose bei zulässigem Ergebnis verborgen');
  const cards = await p.$$eval('.op-card', cs => cs.map(c => `${c.querySelector('h3').textContent} | ${c.querySelector('.op-obj').textContent.replace(/\s+/g, ' ')}`));
  cards.forEach(c => console.log('  ' + c));
  await p.screenshot({ path: path.join(__dirname, 'out', `op18-ok-${W}${DARK ? 'd' : ''}.png`), fullPage: true });
  // Jetziger Entwurf und „Woran hängt es?“: Excess Time ≥ 0 h verletzt, Flügelgruppe aus → Flügelfläche würde helfen
  const now = (await p.textContent('#op-now')).replace(/\s+/g, ' ');
  console.log('Jetziger Entwurf:', now.slice(0, 220));
  check(/Excess Time/.test(now) && /verletzt/.test(now), 'jetziger Entwurf: verletzte Bedingung angezeigt');
  await p.uncheck('[data-opgrp="wing"]'); await p.waitForTimeout(300);
  await p.click('#op-why');
  await p.waitForFunction(() => !document.querySelector('#op-why').disabled && !/Prüfe/.test(document.querySelector('#op-why-res').textContent), null, { timeout: 180000 });
  const why = (await p.textContent('#op-why-res')).replace(/\s+/g, ' ');
  console.log('Woran hängt es:', why.slice(0, 400));
  check(/nicht frei/.test(why) && /Flügelfläche/.test(why), '„Woran hängt es?“ nennt die nicht freie Flügelfläche');
  // Nur eine freie Gruppe mit einer Größe (Reisegeschwindigkeit): die Suche wird fertig (früher endlos)
  for (const g of ['tail', 'prop', 'energy', 'struct']) await p.uncheck(`[data-opgrp="${g}"]`);
  await p.check('[data-opgrp="flight"]'); await p.waitForTimeout(300);
  console.log('frei:', await p.textContent('#op-vars-sub'));
  const t1 = Date.now(); await p.click('#op-run'); await run('eine-groesse');
  const dt = (Date.now() - t1) / 1000;
  check(dt < 120 && /Fertig/.test(await p.textContent('#op-stat')), `Suche mit einer freien Größe wird fertig (${dt.toFixed(0)} s)`);
  const ms = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('waldbrand-uav-opt')).msEval; } catch (e) { return null; } });
  check(ms > 0, `Rechenzeit je Entwurf gemessen und gemerkt (${ms} ms)`);
  console.log(errs.length ? 'FEHLER:\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
  console.log(fails || errs.length ? `\n${fails} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  process.exit(fails || errs.length ? 1 : 0);
})();

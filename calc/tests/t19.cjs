// „Baubar“ als Hindernis: Der jetzige Entwurf zeigt, welche Bauraum-Prüfung verletzt ist; „Woran hängt es?“ nennt, was
// hilft (auch Eingaben außerhalb der Suche); Heck-Bodenfreiheit und Flügellage kann die Suche jetzt selbst beheben
const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
const W = Number(process.env.W || 1280);
let fails = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok   ' : 'FEHLT'} ${text}`); if (!ok) fails++; };
async function scenario(b, params, label) {
  const p = await b.newPage({ viewport: { width: W, height: 900 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(pp => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('waldbrand-uav-v5', JSON.stringify({ params: pp })); sessionStorage.setItem('seeded', '1'); } } catch (e) { /* */ } }, params);
  await p.goto(PAGE + '#entwurf'); await p.waitForSelector('#op-now .op-nr', { timeout: 90000 }); await p.waitForTimeout(800);
  const now = (await p.textContent('#op-now')).replace(/\s+/g, ' ');
  console.log(`[${label}] Jetziger Entwurf:`, now.slice(0, 260));
  return { p, errs, now };
}
async function runQuick(p) {
  await p.check('#op-effort input[value=quick]'); await p.click('#op-run');
  for (let i = 0; i < 600; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => !document.querySelector('#op-run').disabled)) break; }
}
(async () => {
  const b = await chromium.launch();
  // 1) Doppelträger mit Druckpropeller am Gondelende, Bauchlandung mit 8°: gefalteter Propeller berührt den Boden.
  //    Keine freie Größe hilft; „Woran hängt es?“ nennt Landewinkel bzw. Motoranordnung
  {
    const { p, errs, now } = await scenario(b, { fusType: 'twin', motorPos: 'fin', landGear: 'belly', landPitch: 8 }, 'Boden');
    check(/Baubar/.test(now) && /gefaltete Propeller/.test(now), 'jetziger Entwurf nennt die verletzte Bauraum-Prüfung');
    await p.click('#op-why');
    await p.waitForFunction(() => !document.querySelector('#op-why').disabled && !/Prüfe/.test(document.querySelector('#op-why-res').textContent), null, { timeout: 180000 });
    const why = (await p.textContent('#op-why-res')).replace(/\s+/g, ' ');
    console.log('Woran hängt es:', why.slice(0, 500));
    check(/nicht frei/.test(why) && /(Lage beim Aufsetzen|Motor|Landung)/.test(why), '„Woran hängt es?“ nennt, was hilft (Landewinkel, Motor oder Landung)');
    // nur die Reisegeschwindigkeit frei: damit ist „Baubar“ nicht zu erreichen, die Diagnose muss erklären, warum
    for (const g of ['wing', 'tail', 'prop', 'energy', 'struct']) await p.uncheck(`[data-opgrp="${g}"]`);
    await p.check('[data-opgrp="flight"]'); await p.waitForTimeout(300);
    await runQuick(p);
    console.log('Ergebnis:', (await p.textContent('#op-res-sub')).slice(0, 100));
    const diag = (await p.textContent('#op-diag')).replace(/\s+/g, ' ');
    await p.waitForFunction(() => !/Prüfe die freien/.test(document.querySelector('#op-diag').textContent), null, { timeout: 180000 }).catch(() => {});
    const diag2 = (await p.textContent('#op-diag')).replace(/\s+/g, ' ');
    console.log('Diagnose:', diag2.slice(0, 700));
    check(/Beim nächstbesten Entwurf: .*gefaltete Propeller/.test(diag) || /gefaltete Propeller/.test(diag2), 'Diagnose nennt die Bauraum-Prüfung des nächstbesten Entwurfs');
    check(/Was vom nächstbesten Entwurf aus noch hilft/.test(diag2) && /nicht frei/.test(diag2), 'Diagnose zeigt, welche nicht freie Größe helfen würde');
    const pills = await p.$$eval('.op-card .op-fail', l => l.map(x => x.textContent.replace(/\s+/g, ' ')));
    check(pills.some(t => /Nicht baubar: Propeller – Boden/.test(t)), 'Vorschlagskarte nennt die verletzte Bauraum-Prüfung');
    await p.screenshot({ path: path.join(__dirname, 'out', `op19-boden-${W}.png`), fullPage: true });
    check(!errs.length, 'keine Fehler im Browser' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await p.close();
  }
  // 2) Heck setzt auf (Leitwerksfuß 5 cm unter der Flügelebene, 10° Landewinkel): die Suche hebt den Leitwerksfuß
  {
    const { p, errs, now } = await scenario(b, { zTail: -0.05, landPitch: 10 }, 'Heck');
    check(/Heck setzt bei 10° Landewinkel zuerst auf/.test(now), 'jetziger Entwurf: Heck setzt zuerst auf');
    await runQuick(p);
    const sub = await p.textContent('#op-res-sub');
    const cards = await p.$$eval('.op-card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' ')));
    console.log('Ergebnis:', sub.slice(0, 120)); console.log('  ' + (cards[0] || '').slice(0, 300));
    check(/zulässig/.test(sub) && !/Kein zulässiger/.test(sub), 'Suche findet baubaren Entwurf');
    check(/Leitwerksfuß/.test(cards[0] || ''), 'Vorschlag ändert den Leitwerksfuß');
    check(!errs.length, 'keine Fehler im Browser' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await p.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  process.exit(fails ? 1 : 0);
})();

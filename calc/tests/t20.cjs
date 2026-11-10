// Rechteckige Solarmodule und Ruderbedingungen: Module werden gezeichnet und gezählt, frei eingegebene Fläche wird gegen
// ganze Module geprüft und lässt sich umstellen, die Grundbedingungen „Ruder reichen“ und „Spitze“ erscheinen im Entwurf
const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
let fails = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok   ' : 'FEHLT'} ${text}`); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const open = async (state, hash) => {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.addInitScript(st => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('waldbrand-uav-v5', JSON.stringify(st)); sessionStorage.setItem('seeded', '1'); } } catch (e) { /* */ } }, state);
    await p.goto(PAGE + '#' + hash); await p.waitForTimeout(2500);
    return p;
  };
  // 1) Standard: Streifenmodule wie AtlantikSolar, Umrisse gezeichnet
  {
    const p = await open({ v: 8, params: {} }, 'energie');
    await p.waitForSelector('#svg-cells svg', { timeout: 90000 });
    const k = (await p.textContent('#kpis-cells')).replace(/\s+/g, ' ');
    console.log('Standard:', k.slice(0, 200));
    check(/Module Flügel\s*\d+/.test(k) && /× 6 Zellen/.test(k), 'Kennwert „Module Flügel“ mit Modullängen');
    const outl = await p.$$eval('#svg-cells path[fill="none"]', l => l.length);
    check(outl > 0, `Modulumrisse gezeichnet (${outl})`);
    await p.close();
  }
  // 2) Alter Stand (vor Version 8): Fläche frei eingegeben, zu groß für ganze Module → Meldung und Umstellen
  {
    const p = await open({ params: { span: 5, area: 0.809, planform: 'taper', taper: 0.3, solarArea: 0.6 } }, 'energie');
    await p.waitForSelector('#cells-msg', { timeout: 90000 });
    const m = (await p.textContent('#cells-msg')).replace(/\s+/g, ' ');
    console.log('Fläche frei:', m.slice(0, 260));
    check(/passt nicht: als ganze Module/.test(m), 'zu große frei eingegebene Fläche gemeldet');
    await p.click('[data-tofill]'); await p.waitForTimeout(1500);
    const k = (await p.textContent('#kpis-cells')).replace(/\s+/g, ' ');
    check(/Module Flügel/.test(k) && await p.$eval('[data-k="solarMode"]', e => e.value === 'fill'), 'auf ganze Module umgestellt');
    // Entwurf: Ruder und Spitze als Grundbedingungen, mit Begründung
    await p.evaluate(() => { location.hash = 'entwurf'; }); await p.waitForSelector('#op-now .op-nr'); await p.waitForTimeout(1500);
    const now = (await p.textContent('#op-now')).replace(/\s+/g, ' ');
    console.log('Jetziger Entwurf:', now.slice(0, 500));
    check(/Ruder reichen/.test(now) && /Flügelspitze nicht zu klein/.test(now), 'Grundbedingungen „Ruder reichen“ und „Flügelspitze“ im Entwurf');
    const chk = await p.$$eval('[data-opchk]', l => l.map(x => x.dataset.opchk));
    check(chk.includes('ctrl') && chk.includes('tip'), 'beide abwählbar in den Grundbedingungen');
    const groups = await p.$$eval('[data-opgrp]', l => l.map(x => x.dataset.opgrp));
    check(groups.includes('ctrl'), 'Gruppe „Ruder“ unter den freien Größen');
    await p.evaluate(() => { location.hash = 'ruder'; }); await p.waitForTimeout(3500);
    const ru = (await p.textContent('#ru-msg')).replace(/\s+/g, ' ');
    console.log('Ruder:', ru.slice(0, 300));
    check(/Ruder reichen/.test(ru), 'Ansicht Ruder nennt die verletzte Grundbedingung');
    await p.close();
  }
  await b.close();
  check(!errs.length, 'keine Fehler im Browser' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(fails ? `\n${fails} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  process.exit(fails ? 1 : 0);
})();

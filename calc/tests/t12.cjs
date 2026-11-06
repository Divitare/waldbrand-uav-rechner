// Doppelträger mit Pendelhöhenruder, Drehachse hinter dem Neutralpunkt, Pfeilung: Hinweise in den Ansichten
const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '../../dist/uav-budget.html');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE + '#flugzeug'); await p.waitForTimeout(1500);
  // Wert über das erste Eingabefeld setzen (gleiche Felder stehen in mehreren Ansichten; der Handler gleicht sie ab)
  const set = async (k, v) => {
    await p.evaluate(([k, v]) => { const el = document.querySelector(`[data-k="${k}"]`); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]);
    await p.waitForTimeout(900);
  };
  const flags = async (view, sel) => { await p.evaluate(v => { location.hash = v; }, view); await p.waitForTimeout(3500); return p.evaluate(s => [...document.querySelectorAll(s + ' .pill, ' + s + ' .pillx summary, ' + s + ' details summary')].map(e => e.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean), sel); };
  await set('fusType', 'twin'); await set('elevCf', 1);
  console.log('Doppelträger + Pendel:', (await flags('struktur', '#vib-msg')).filter(t => /Pendel|Doppel/.test(t)));
  const rows = await p.evaluate(() => [...document.querySelectorAll('#tbl-vib tbody tr')].map(r => r.textContent.trim().replace(/\s+/g, ' ')));
  console.log(rows.filter(r => /Höhenleitwerk/.test(r)));
  await p.evaluate(() => { location.hash = 'flugzeug'; }); await p.waitForTimeout(800);
  await set('fusType', 'pod'); await set('elevPivot', 32);
  console.log('Pendel 32 %:', (await flags('struktur', '#vib-msg')).filter(t => /Drehachse/.test(t)));
  const servo = await p.evaluate(() => { location.hash = 'ruder'; return true; }); await p.waitForTimeout(3000);
  console.log('Servo:', await p.evaluate(() => [...document.querySelectorAll('table')].map(t => t.textContent).join(' ').match(/Pendelhöhenruder \(Drehachse[^)]*\)/g)));
  await p.evaluate(() => { location.hash = 'flugzeug'; }); await p.waitForTimeout(800);
  await set('sweep', -20);
  console.log('Pfeilung −20°:', (await flags('schwerpunkt', '#cg-msg')).filter(t => /reicht dort|Spannweite/.test(t)));
  console.log(errs.length ? 'FEHLER\n' + errs.join('\n') : 'keine Fehler');
  await b.close();
})();

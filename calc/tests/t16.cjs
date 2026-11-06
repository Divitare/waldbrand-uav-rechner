// Teamarbeit mit zwei Browsern gegen die nachgebildete Cloudflare-Laufzeit (calc/tests/cfsim.mjs):
// anmelden, Modell anlegen und öffnen, Änderungen live, gleichzeitige Änderungen, Anwesenheit,
// Anforderung und Kommentar, Komponente, Verlauf mit Rückgängig, Stände, Verbindungsabbruch, Umbenennen, Löschen
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8790 + Math.floor(Math.random() * 200), BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(__dirname, 'out'), SUF = `${process.env.W || 1280}${process.env.DARK ? 'd' : ''}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok   ' : 'FEHLT'} ${text}`); if (!ok) fails++; };
(async () => {
  const sim = spawn(process.execPath, [path.join(__dirname, 'cfsim.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let simLog = ''; sim.stdout.on('data', d => { simLog += d; }); sim.stderr.on('data', d => { simLog += d; });
  for (let i = 0; i < 50 && !simLog.includes('bereit'); i++) await sleep(100);
  const b = await chromium.launch({ args: ['--no-proxy-server'] }), errs = [];
  const mk = async name => {
    const ctx = await b.newContext({ viewport: { width: Number(process.env.W || 1280), height: 900 }, colorScheme: process.env.DARK ? 'dark' : 'light' }), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    // fehlgeschlagene Verbindungsversuche während der nachgestellten Unterbrechung meldet der Browser selbst
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|fonts\.g|WebSocket connection to .* failed/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
    return p;
  };
  const A = await mk('Anna'), B = await mk('Ben');
  const val = (p, k) => p.evaluate(k => document.querySelector(`#v-flugzeug [data-k="${k}"], [data-k="${k}"]`).value, k);
  const setVal = async (p, k, v) => { await p.evaluate(([k, v]) => { const el = document.querySelector(`#v-${location.hash.slice(1) || 'uebersicht'} [data-k="${k}"]`) || document.querySelector(`[data-k="${k}"]`); el.focus(); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); };
  const until = async (p, fn, arg, ms = 6000) => { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch (e) { return false; } };
  const login = async (p, name) => { await p.fill('#tm-name', name); await p.fill('#tm-key', 'test'); await p.click('#tm-login-btn'); await until(p, () => document.querySelector('#tm-login-panel').hidden); };
  const connected = p => until(p, () => !!document.querySelector('#tm-bar .tm-dot.open'), null, 8000);

  // Anna legt das Modell an
  await A.goto(BASE + '/#team'); await A.waitForTimeout(1500);
  await login(A, 'Anna');
  check(await until(A, () => /Noch keine Teammodelle/.test(document.querySelector('#tm-models').textContent)), 'Anna angemeldet, Liste leer');
  await A.fill('#tm-new-name', 'Entwurf Team'); await A.click('#tm-new-btn');
  check(await connected(A), 'Anna: Modell angelegt und verbunden');
  const id = new URL(A.url()).searchParams.get('m');
  check(/^[a-z0-9]{6,24}$/.test(id || ''), `Kennung im Link (${id})`);
  // Ben öffnet über den Link
  await B.goto(`${BASE}/?m=${id}#team`); await B.waitForTimeout(1500);
  await login(B, 'Ben');
  check(await connected(B), 'Ben: über den Link verbunden');
  check(await until(A, () => document.querySelectorAll('#tm-bar .tm-av').length === 1), 'Anna sieht Ben in der Kopfleiste');
  // Änderung live
  await A.goto(`${BASE}/?m=${id}#flugzeug`); await connected(A);
  await B.evaluate(() => { location.hash = 'flugzeug'; }); await B.waitForTimeout(400);
  const stripB0 = await B.textContent('#strip');
  await setVal(A, 'span', 5.8);
  check(await until(B, () => document.querySelector('#v-flugzeug [data-k="span"]').value === '5.8'), 'Spannweite von Anna erscheint bei Ben');
  check(await until(B, s => document.querySelector('#strip').textContent !== s, stripB0), 'Bens Kennwerte rechnen neu');
  check(await until(B, () => document.querySelector('#v-flugzeug .field[data-fk="span"]').classList.contains('tm-flash')), 'Bens Feld blinkt mit Annas Farbe', 3000);
  // verschiedene Felder gleichzeitig
  await Promise.all([setVal(A, 'area', 1.6), setVal(B, 'taper', 0.6)]);
  await sleep(1200);
  const [a1, a2, b1, b2] = [await val(A, 'area'), await val(A, 'taper'), await val(B, 'area'), await val(B, 'taper')];
  check(a1 === '1.6' && a2 === '0.6' && b1 === '1.6' && b2 === '0.6', `gleichzeitig verschiedene Felder: beide gelten (A ${a1}/${a2}, B ${b1}/${b2})`);
  // dasselbe Feld: die spätere Änderung gilt
  await setVal(A, 'washout', 2); await sleep(60); await setVal(B, 'washout', 3); await sleep(1200);
  const [wa, wb] = [await val(A, 'washout'), await val(B, 'washout')];
  check(wa === '3' && wb === '3', `dasselbe Feld: die spätere gilt (A ${wa}, B ${wb})`);
  // Anwesenheit im Feld
  await B.focus('#v-flugzeug [data-k="dihedral"]');
  check(await until(A, () => { const f = document.querySelector('#v-flugzeug .field[data-fk="dihedral"]'); return f.classList.contains('tm-busy') && f.dataset.tmName === 'Ben'; }), 'Anna sieht, dass Ben in „V-Form“ steht');
  await A.screenshot({ path: path.join(OUT, `team-live-A-${SUF}.png`) });
  await B.evaluate(() => document.activeElement.blur()); await sleep(300);
  // Anforderung (Ben) und Kommentar (Anna)
  await B.click('#v-flugzeug .rq-btn[data-rq="span"]'); await B.check('#rq-pop input[name=rqmode][value=range]');
  await B.fill('#rq-min', '5'); await B.fill('#rq-max', '6'); await B.click('#rq-save');
  check(await until(A, () => { const bd = document.querySelector('#v-flugzeug .field[data-fk="span"] .rq-badge'); return bd && /5,00 m bis 6,00 m/.test(bd.textContent); }), 'Bens Bereich für die Spannweite erscheint bei Anna');
  await A.click('#v-flugzeug .rq-btn[data-rq="span"]'); await A.fill('#rq-note', 'Kiste 3,2 m'); await A.click('#rq-add'); await A.click('#rq-pop .rq-x');
  check(await until(B, () => /1/.test((document.querySelector('#v-flugzeug .rq-btn[data-rq="span"] .rq-n') || {}).textContent || '')), 'Annas Kommentar erscheint bei Ben');
  // Komponente
  await A.evaluate(() => { location.hash = 'komponenten'; }); await B.evaluate(() => { location.hash = 'komponenten'; }); await sleep(500);
  const c0 = await B.evaluate(() => document.querySelector('#tbl-comps [data-cf="on"]').checked);
  await A.click('#tbl-comps [data-cf="on"]');
  check(await until(B, c => document.querySelector('#tbl-comps [data-cf="on"]').checked !== c, c0), 'Komponente an/aus erscheint bei Ben');
  // Verlauf und Rückgängig
  await A.evaluate(() => { location.hash = 'team'; });
  check(await until(A, () => document.querySelectorAll('#tm-hist > li').length >= 3), 'Verlauf zeigt die Arbeitsgänge');
  console.log('      Verlauf:', (await A.$$eval('#tm-hist > li', ls => ls.slice(0, 4).map(l => l.querySelector('.who').textContent + ': ' + l.querySelector('ul').textContent.replace(/\s+/g, ' ').slice(0, 90)))).join(' || '));
  await A.click('#tm-hist > li:first-child [data-tmundo]');
  check(await until(B, c => document.querySelector('#tbl-comps [data-cf="on"]').checked === c, c0), 'Rückgängig im Verlauf gilt auch bei Ben');
  // Stand speichern, ändern, wiederherstellen
  await A.fill('#tm-vname', 'Vor dem Test'); await A.click('#tm-vsave');
  check(await until(A, () => /Vor dem Test/.test(document.querySelector('#tm-vlist').textContent)), 'Stand gespeichert');
  await B.evaluate(() => { location.hash = 'flugzeug'; }); await sleep(300);
  await setVal(B, 'span', 5.2);
  check(await until(A, () => document.querySelector('#v-flugzeug [data-k="span"]').value === '5.2'), 'Ben ändert die Spannweite auf 5,2');
  await A.click('#tm-vlist li:first-child [data-tmv]'); await A.click('#tm-vlist li:first-child [data-tmv]');
  check(await until(B, () => document.querySelector('#v-flugzeug [data-k="span"]').value === '5.8'), 'Stand wiederhergestellt – auch bei Ben');
  // Verbindungsabbruch: Ben ändert ohne Verbindung, Anna sieht es nach dem Wiederverbinden
  await B.evaluate(() => document.activeElement && document.activeElement.blur());
  await fetch(`${BASE}/__sim/pause?ms=2500`, { method: 'POST' });
  check(await until(B, () => !document.querySelector('#tm-bar .tm-dot.open')), 'Ben merkt den Abbruch');
  await setVal(B, 'dihedral', 5); await sleep(300);
  console.log('      Kopfleiste Ben ohne Verbindung:', await B.getAttribute('#tm-bar .tm-chip', 'title'));
  check(await connected(B) && await connected(A), 'beide wieder verbunden');
  check(await until(A, () => document.querySelector('#v-flugzeug [data-k="dihedral"]').value === '5'), 'Bens Änderung ohne Verbindung kommt bei Anna an');
  // umbenennen (Anna), Name bei Ben
  await A.evaluate(() => { location.hash = 'team'; }); await sleep(300);
  await A.click(`[data-mid="${id}"] [data-tm="rename"]`); await A.fill('[data-tm-ren]', 'Entwurf Team 6 m'); await A.click('[data-tm="rename-ok"]');
  check(await until(B, () => /Entwurf Team 6 m/.test(document.querySelector('#tm-bar').textContent)), 'neuer Name erscheint bei Ben');
  await A.screenshot({ path: path.join(OUT, `team-view-A-${SUF}.png`), fullPage: true });
  await B.evaluate(() => { location.hash = 'team'; }); await sleep(500);
  await B.screenshot({ path: path.join(OUT, `team-view-B-${SUF}.png`), fullPage: true });
  // in den Papierkorb: Ben wird getrennt
  await A.click(`[data-mid="${id}"] [data-tm="del"]`); await A.click(`[data-mid="${id}"] [data-tm="del"]`);
  check(await until(B, () => document.querySelector('#tm-bar').hidden), 'gelöscht: Ben ist nicht mehr verbunden');
  check(await until(A, () => !document.querySelector('#tm-trash-wrap').hidden), 'Modell im Papierkorb');
  // wiederherstellen, kopieren
  await A.evaluate(() => { document.querySelector('#tm-trash-wrap').open = true; });
  await A.click(`#tm-trash [data-mid="${id}"] [data-tm="restore"]`);
  check(await until(A, i => !!document.querySelector(`#tm-models [data-mid="${i}"]`), id), 'aus dem Papierkorb wiederhergestellt');
  await A.click(`#tm-models [data-mid="${id}"] [data-tm="copy"]`);
  check(await until(A, () => document.querySelectorAll('#tm-models .tm-model').length === 2 && /\(Kopie\)/.test(document.querySelector('#tm-models').textContent)), 'Kopie angelegt');
  // Datei einlesen und als neues Teammodell anlegen
  const fileText = JSON.stringify({ format: 'waldbrand-uav-modell', version: 1, name: 'Aus Datei', doc: { v: 8, params: { span: 5.6 }, comps: [], req: {}, notes: {}, meta: { name: 'Aus Datei', knapp: 5 } } });
  await A.click('#btn-share'); await A.fill('#imp-text', fileText); await A.waitForTimeout(300);
  check(!!(await A.$('#imp-actions .imp-hook')), 'Datei-Dialog bietet „Als neues Teammodell anlegen“');
  await A.click('#imp-actions .imp-hook');
  check(await until(A, () => /Aus Datei/.test(document.querySelector('#tm-bar').textContent) && !!document.querySelector('#tm-bar .tm-dot.open')), 'Datei als neues Teammodell angelegt und geöffnet');
  check((await val(A, 'span')) === '5.6', 'Inhalt der Datei im neuen Teammodell');
  await A.click('#share-close');
  console.log(errs.length ? 'FEHLER:\n' + errs.join('\n') : 'keine Fehler im Browser');
  if (/Error|Fehler/.test(simLog.replace(/cfsim bereit.*\n/, ''))) console.log('Server:', simLog.slice(0, 2000));
  await b.close(); sim.kill();
  process.exit(fails || errs.length ? 1 : 0);
})();

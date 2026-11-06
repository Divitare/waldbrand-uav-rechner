/* ===================================================================
   Oberfläche: Modell als Datei speichern und laden
   - Eine JSON-Datei enthält das ganze Dokument: Eingaben, Komponenten,
     Wettergenerator, eigene Wetterdatei, Anforderungen, Kommentare, Name
   - Import prüft Format und Werte (sanitize), zeigt eine Vorschau und legt
     vor dem Übernehmen den bisherigen Stand im Browser ab (rückgängig)
   - Auch der kurze Text früherer Versionen (params/comps) wird gelesen
   =================================================================== */
const FILE_FORMAT = 'waldbrand-uav-modell', FILE_VERSION = 1, BACKUP_KEY = 'waldbrand-uav-v8-backup', NAME_KEY = 'waldbrand-uav-name';
// Name der Person an diesem Rechner (für Kommentare, Anforderungen, Export und Teamarbeit)
const ME = { name: '' };
try { ME.name = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* ignorieren */ }
function setMyName(n) { ME.name = String(n || '').trim().slice(0, 60); try { localStorage.setItem(NAME_KEY, ME.name); } catch (e) { /* ignorieren */ } }
const myName = () => ME.name || 'unbekannt';
const docOf = s => ({ v: s.v, params: s.params, comps: s.comps, gen: s.gen, wx: s.wx, req: s.req, notes: s.notes, meta: s.meta, preset: s.preset });
function summaryOf(R) {
  if (!R) return null;
  const [, txt] = verdictOf(R), rs = typeof reqCounts === 'function' ? reqCounts(R) : null;
  return { mass_kg: Math.round(R.C.m * 1000) / 1000, power_w: Math.round(pCons(R.C) * 10) / 10, verdict: txt, sail: R.so.sail || null, tExc_h: fin(R.per.tExc) ? Math.round(R.per.tExc * 100) / 100 : null, req: rs };
}
const fileName = name => `${(name || 'Modell').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'Modell'}_${new Date().toISOString().slice(0, 10)}.uav.json`;
function exportObj(name) {
  return { format: FILE_FORMAT, version: FILE_VERSION, app: 'Waldbrand-UAV-Rechner v8', exported: new Date().toISOString(), name: name || S.meta.name || '', by: ME.name, doc: docOf(S), summary: summaryOf(R) };
}
function downloadJSON(obj, fname) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fname; a.rel = 'noopener'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function parseImport(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { throw new Error('Kein gültiges JSON. Bitte eine exportierte Modelldatei wählen.'); }
  if (o && o.format === FILE_FORMAT) {
    if (!o.doc || typeof o.doc !== 'object' || !o.doc.params) throw new Error('In der Datei fehlt das Modell.');
    return { name: String(o.name || (o.doc.meta && o.doc.meta.name) || ''), by: String(o.by || ''), exported: String(o.exported || ''), version: Number(o.version) || 1, doc: o.doc, summary: o.summary || null };
  }
  if (o && o.params && Array.isArray(o.comps)) return { name: '', by: '', exported: '', version: 0, doc: o, summary: null, legacy: true };
  throw new Error('Das ist keine Modelldatei dieses Rechners.');
}
const IMP = { cur: null };
function impPreview() {
  const box = $('#imp-preview'), x = IMP.cur;
  $('#imp-apply').disabled = !x;
  if (!x) { box.innerHTML = ''; impHooks(); return; }
  const d = sanitize(x.doc), nReq = Object.keys(d.req).length, nNotes = Object.values(d.notes).reduce((s, l) => s + l.length, 0), sm = x.summary;
  const when = x.exported ? new Date(x.exported) : null;
  const rows = [
    ['Name', x.name || '–'], ['Exportiert', when && !isNaN(when) ? `${when.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}${x.by ? ' von ' + x.by : ''}` : x.legacy ? 'Text einer früheren Version' : '–'],
    ['Inhalt', `${Object.keys(x.doc.params || {}).length} Eingaben, ${d.comps.length} Komponenten, ${nReq} Anforderungen, ${nNotes} Kommentare${d.wx ? ', Wetterdatei „' + d.wx.name + '“' : ''}`],
    ...(sm && fin(sm.mass_kg) ? [['Stand beim Export', `${nf(sm.mass_kg, 2)} kg, ${nf(sm.power_w, 0)} W${sm.verdict ? ' · ' + sm.verdict : ''}`]] : [])
  ];
  box.innerHTML = `<div class="imp-card"><b>Bereit zum Übernehmen</b>${x.version > FILE_VERSION ? ' ' + pill('warn', 'aus einer neueren Version des Rechners') : ''}<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
  impHooks();
}
// weitere Wege für eine gelesene Datei (Teamarbeit: als neues Teammodell anlegen)
function impHooks() {
  $$('#imp-actions .imp-hook').forEach(b => b.remove());
  if (!IMP.cur) return;
  for (const h of IMPORT_HOOKS) {
    if (!h.show()) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn imp-hook'; b.textContent = h.label;
    b.addEventListener('click', () => { const x = IMP.cur; if (x) h.run(x); });
    $('#imp-actions').insertBefore(b, $('#imp-undo'));
  }
}
function impLoadText(text, src) {
  const msg = $('#share-msg');
  try { IMP.cur = parseImport(text); msg.textContent = src ? `„${src}“ gelesen.` : 'Text gelesen.'; }
  catch (e) { IMP.cur = null; msg.textContent = e.message; }
  impPreview();
}
// Hook für die Teamarbeit: kann den Import als neues Teammodell anlegen
const IMPORT_HOOKS = [];
function applyImported(x) {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: Date.now(), s: S })); } catch (e) { /* zu groß: ohne Sicherung */ }
  const s = sanitize(x.doc);
  if (!s.meta.name && x.name) s.meta.name = x.name.slice(0, 120);
  S = s; refreshAll(); markPresetFromState();
  $('#imp-undo').hidden = false;
  $('#share-msg').textContent = `Übernommen${x.name ? ': „' + x.name + '“' : ''}. Der vorherige Stand liegt im Browser und lässt sich wiederherstellen.`;
}
function markPresetFromState() { const el = $('#preset-sel'); if (el) el.value = S.preset || ''; }
function openFileDialog() {
  const dlg = $('#share-dlg');
  $('#exp-name').value = S.meta.name || '';
  const nReq = Object.keys(S.req).length, nNotes = Object.values(S.notes).reduce((s, l) => s + l.length, 0);
  $('#exp-info').textContent = `${S.comps.length} Komponenten, ${nReq} Anforderungen, ${nNotes} Kommentare${S.wx ? ', eigene Wetterdatei' : ''}. Dateiname: ${fileName($('#exp-name').value)}`;
  let hasBackup = false; try { hasBackup = !!localStorage.getItem(BACKUP_KEY); } catch (e) { /* ignorieren */ }
  $('#imp-undo').hidden = !hasBackup; $('#share-msg').textContent = ''; impPreview();
  try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
}
$('#btn-share').addEventListener('click', openFileDialog);
$('#share-close').addEventListener('click', () => { const dlg = $('#share-dlg'); try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } });
$('#exp-name').addEventListener('input', e => { S.meta.name = e.target.value.slice(0, 120); $('#exp-info').textContent = `Dateiname: ${fileName(S.meta.name)}`; schedule(); });
$('#exp-file').addEventListener('click', () => { const o = exportObj($('#exp-name').value.trim()); downloadJSON(o, fileName(o.name)); $('#share-msg').textContent = `Gespeichert als ${fileName(o.name)}.`; });
$('#exp-copy').addEventListener('click', () => {
  const t = JSON.stringify(exportObj($('#exp-name').value.trim())), msg = $('#share-msg'), box = $('#imp-text');
  const fall = () => { box.value = t; box.focus(); box.select(); msg.textContent = 'Text unten markiert – mit Strg+C kopieren.'; };
  try { navigator.clipboard.writeText(t).then(() => { msg.textContent = `Kopiert (${nf(t.length / 1024, 0)} KB).`; }, fall); } catch (e) { fall(); }
});
$('#imp-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return; f.text().then(t => impLoadText(t, f.name)); e.target.value = ''; });
$('#imp-text').addEventListener('input', e => { const t = e.target.value.trim(); if (t.length > 20) impLoadText(t, ''); else { IMP.cur = null; impPreview(); } });
{
  const dz = $('#imp-drop');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) f.text().then(t => impLoadText(t, f.name)); });
}
$('#imp-apply').addEventListener('click', () => { if (!IMP.cur) return; const x = IMP.cur; IMP.cur = null; $('#imp-text').value = ''; impPreview(); applyImported(x); });
$('#imp-undo').addEventListener('click', () => {
  let b = null; try { b = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); } catch (e) { b = null; }
  if (!b || !b.s) { $('#share-msg').textContent = 'Keine Sicherung vorhanden.'; return; }
  S = sanitize(b.s); refreshAll(); markPresetFromState();
  try { localStorage.removeItem(BACKUP_KEY); } catch (e) { /* ignorieren */ }
  $('#imp-undo').hidden = true; $('#share-msg').textContent = `Stand vom ${new Date(b.at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} wiederhergestellt.`;
});

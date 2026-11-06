/* ===================================================================
   Oberfläche: Anforderungen, festgehaltene Eingaben und Kommentare
   - Eingaben: festhalten (Wert bleibt, Feld gesperrt), Bereich (von–bis)
     oder erlaubte Auswahl; Ergebnisse (Kenngrößen): mindestens/höchstens
   - Stand je Anforderung: erfüllt, knapp (Abstand zur Grenze unter dem
     eingestellten Anteil), verletzt, offen (teure Rechnung läuft noch)
   - Kommentare an Eingaben, Kenngrößen und am Modell, mit Name und Zeit
   - Fähnchen an jedem Eingabefeld öffnet den Editor
   =================================================================== */
const RQ = { items: [], by: {}, pop: null, popFor: null, evalKey: null, timer: null };
const ICON_FLAG = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3.5 1.5v13M3.5 2.5h8l-2 3 2 3h-8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_NOTE = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2 3.2A1.7 1.7 0 0 1 3.7 1.5h8.6A1.7 1.7 0 0 1 14 3.2v6.1a1.7 1.7 0 0 1-1.7 1.7H7l-3.4 3v-3h0A1.6 1.6 0 0 1 2 9.4z" fill="currentColor"/></svg>';
const RQ_LABEL = { ok: 'erfüllt', near: 'knapp', bad: 'verletzt', na: 'wird gerechnet' };
const isSelParam = k => PM[k] && PM[k].sel && PM[k].sel !== 'bool' && PM[k].sel !== 'date' && PM[k].sel !== 'time';
const isNumParam = k => PM[k] && !PM[k].sel && typeof DEFAULT_PARAMS[k] === 'number';
function paramOptions(k) {
  const m = PM[k]; if (!isSelParam(k)) return [];
  const key = m.sel === true ? k : m.sel;
  if (key === 'airfoil' || key === 'tailAirfoil') return AF.db.foils.filter(f => !!f.tail === (key === 'tailAirfoil')).map(f => [f.key, f.name]);
  if (MAT_SEL[key]) return MAT_SEL[key].map(x => [x, MAT[x].name]);
  if (key === 'density') return DENS.map(([v, l]) => [v, l]);
  if (key === 'aec') return AEC.map(([n, l]) => [String(n), `AEC ${n}: ${l}`]);
  if (MITIG[key]) return MITIG[key].opts.map(([v, l]) => [String(v), l]);
  return (SEL[key] || []).map(([v, l]) => [String(v), l]);
}
// Wert einer Eingabe als Text (ohne Bezeichnung)
function pvText(k, v) {
  const m = PM[k];
  if (!m) return String(v ?? '–');
  if (m.sel === 'bool') return v ? 'ja' : 'nein';
  if (isSelParam(k)) { const o = paramOptions(k).find(o => String(o[0]) === String(v)); return o ? o[1] : String(v ?? '–'); }
  if (typeof v === 'number') { const d = m.step >= 1 ? 0 : m.step >= 0.1 ? 1 : m.step >= 0.01 ? 2 : 3; return nf(v, d) + (m.u ? ' ' + m.u : ''); }
  return String(v ?? '–');
}
const kvText = (k, v) => { const K = KENN_BY[k]; return fin(v) ? (k === 'sail' ? (v >= 7 ? 'über VI' : ROMAN_OF[v] || nf(v, 0)) : nf(v, K.d) + (K.u ? ' ' + K.u : '')) : '–'; };
const ROMAN_OF = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
function targetLabel(t) {
  const [kind, key] = t.split(':');
  if (t === 'model') return 'Modell allgemein';
  if (kind === 'p') return PM[key] ? PM[key].l : key;
  if (kind === 'm') return KENN_BY[key] ? KENN_BY[key].l : key;
  if (kind === 'c') { const c = S.comps.find(x => x.id === key); return c ? `Komponente ${c.name}` : 'Komponente'; }
  return t;
}
function reqText(t, r) {
  const [kind, key] = t.split(':'), fmt = v => (kind === 'p' ? pvText(key, v) : kvText(key, v));
  if (r.fix) return `fest: ${pvText(key, r.val)}`;
  if (r.allow && r.allow.length) return `nur: ${r.allow.map(v => pvText(key, v)).join(', ')}`;
  if (r.min !== null && r.max !== null) return `${fmt(r.min)} bis ${fmt(r.max)}`;
  if (r.min !== null) return `mindestens ${fmt(r.min)}`;
  if (r.max !== null) return `höchstens ${fmt(r.max)}`;
  return '–';
}
function rangeState(v, min, max, knapp, int) {
  if (!fin(v)) return { st: 'na', margin: NaN };
  const sc = (b) => (Math.abs(b) > 1e-9 ? Math.abs(b) : Math.max(1, Math.abs(v)));
  let m = Infinity;
  if (min !== null && max !== null && max > min) m = Math.min(v - min, max - v) / (max - min);
  else { if (min !== null) m = Math.min(m, (v - min) / sc(min)); if (max !== null) m = Math.min(m, (max - v) / sc(max)); }
  const tol = int ? 0 : 1e-9 * Math.max(1, Math.abs(v));
  if ((min !== null && v < min - tol) || (max !== null && v > max + tol)) return { st: 'bad', margin: m };
  const near = int ? (min !== null && Math.abs(v - min) < 0.5) || (max !== null && Math.abs(v - max) < 0.5) : m < knapp / 100;
  return { st: near ? 'near' : 'ok', margin: m };
}
// Stand aller Anforderungen; teure Kenngrößen aus dem Zwischenspeicher oder offen
function reqEval(R) {
  const knapp = S.meta.knapp || 5, out = [];
  for (const [t, r] of Object.entries(S.req)) {
    const [kind, key] = t.split(':');
    if (kind === 'p') {
      const v = S.params[key]; let s;
      if (r.fix) s = { st: (typeof v === 'number' ? Math.abs(v - r.val) <= 1e-9 * Math.max(1, Math.abs(v)) : String(v) === String(r.val)) ? 'ok' : 'bad', margin: NaN };
      else if (r.allow && r.allow.length) s = { st: r.allow.includes(String(v)) ? 'ok' : 'bad', margin: NaN };
      else s = rangeState(Number(v), r.min, r.max, knapp, PM[key] && PM[key].step >= 1 && Number.isInteger(Number(v)));
      out.push({ t, kind, key, r, v, vText: pvText(key, v), ...s });
    } else {
      const K = KENN_BY[key]; if (!K) continue;
      let v = NaN, pending = false;
      if (K.cost === 'mid' || K.cost === 'high') { const c = UI.cache['kenn:' + key]; if (c && c.k === keyOf()) v = c.v; else pending = true; }
      else v = R ? kennValue(R, key) : NaN;
      const s = pending ? { st: 'na', margin: NaN } : rangeState(v, r.min, r.max, knapp, key === 'sail' || key === 'grc' || key === 'nSol');
      out.push({ t, kind, key, r, v, vText: pending ? '…' : kvText(key, v), ...s, pending });
    }
  }
  return out;
}
function reqCounts(R) {
  const it = R === undefined || R === RQ.R ? RQ.items : reqEval(R), c = { ok: 0, near: 0, bad: 0, na: 0 };
  for (const i of it) c[i.st]++;
  return c;
}
// nach jeder Rechnung: Stand, Markierungen, Leiste; teure Kenngrößen im Leerlauf
function reqUpdate(R) {
  RQ.R = R; RQ.items = reqEval(R); RQ.by = Object.fromEntries(RQ.items.map(i => [i.t, i]));
  reqDecorate(); reqStrip(R);
  if (VIEW === 'anforderungen') renderReqView(R);
  if (RQ.pop && !RQ.pop.hidden && RQ.popFor) reqPopStatus();
  clearTimeout(RQ.timer);
  const todo = RQ.items.filter(i => i.pending).map(i => i.key);
  if (todo.length) RQ.timer = setTimeout(() => reqSlow(todo), 700);
}
function reqSlow(todo) {
  const R0 = RQ.R; if (!R0 || R0 !== R) return;
  const key = todo.shift(); if (!key) return;
  try { cached('kenn:' + key, () => kennValue(R0, key)); } catch (e) { console.error(e); }
  if (todo.length) RQ.timer = setTimeout(() => reqSlow(todo), 30);
  else if (RQ.R === R0) reqUpdate(R0);
}
// festgehaltene Eingaben bleiben, auch wenn sie anderswo (Tabellen, Vorlagen) gesetzt würden
function enforceFixed() {
  let changed = [];
  for (const [t, r] of Object.entries(S.req)) {
    if (!r.fix || !t.startsWith('p:')) continue;
    const k = t.slice(2); if (r.val === null || r.val === undefined) continue;
    if (String(S.params[k]) !== String(r.val)) { S.params[k] = r.val; changed.push(k); }
  }
  if (changed.length) { fillForms(); toast(`Festgehalten: ${changed.map(k => PM[k] ? PM[k].l : k).join(', ')} – Wert bleibt.`); }
  return changed.length > 0;
}
function toast(text) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
}
// Felder markieren: Rahmen, Abzeichen, Sperre, Zähler der Kommentare
function reqDecorate() {
  $$('.field[data-fk]').forEach(f => {
    const k = f.dataset.fk, t = 'p:' + k, r = S.req[t], it = RQ.by[t], n = (S.notes[t] || []).length;
    f.classList.toggle('rq-has', !!r); f.classList.toggle('rq-fix', !!(r && r.fix));
    f.classList.remove('rq-ok', 'rq-near', 'rq-bad');
    if (r && it && it.st !== 'na') f.classList.add('rq-' + it.st);
    const lab = f.querySelector('label'), ctl = f.querySelector('select, input:not([type=checkbox])'); let bd = f.querySelector('.rq-badge');
    if (r) {
      // unter dem Eingabefeld, damit die Felder einer Zeile bündig bleiben; bei Kästchen in der Bezeichnung
      if (!bd) { bd = document.createElement('span'); bd.className = 'rq-badge'; if (ctl && !f.classList.contains('chk')) ctl.insertAdjacentElement('afterend', bd); else (lab || f).appendChild(bd); }
      bd.innerHTML = (r.fix ? ICON_LOCK + ' ' : '') + esc(r.fix ? 'fest' : reqText(t, r)) + (it && (it.st === 'near' || it.st === 'bad') ? ` · ${RQ_LABEL[it.st]}` : '');
      bd.title = `${reqText(t, r)}${r.by ? ` – ${r.by}` : ''}`;
    } else if (bd) bd.remove();
    f.querySelectorAll('[data-k]').forEach(el => { el.disabled = !!(r && r.fix); });
    const b = f.querySelector('.rq-btn');
    if (b) { b.classList.toggle('on', !!r || n > 0); b.innerHTML = ICON_FLAG + (n ? `<span class="rq-n">${n}</span>` : ''); b.title = (r ? reqText(t, r) + '. ' : '') + (n ? `${n} Kommentar${n > 1 ? 'e' : ''}` : 'Anforderung oder Kommentar'); }
  });
}
// Kennwert-Streifen: Anforderungen der gezeigten Kenngrößen, dazu der Gesamtstand
const STRIP_KENN = ['mass', 'pCruise', 'socMin', 'endur', 'tExc', 'sail'];
function reqStrip(R) {
  const box = $('#strip'); if (!box) return;
  const cells = [...box.children].slice(0, STRIP_KENN.length);
  cells.forEach((el, i) => {
    const t = 'm:' + STRIP_KENN[i], it = RQ.by[t];
    el.classList.toggle('rq-has', !!it); el.dataset.rq = t; el.classList.remove('rq-ok', 'rq-near', 'rq-bad');
    if (it && it.st !== 'na') el.classList.add('rq-' + it.st);
    el.title = it ? `Anforderung ${reqText(t, it.r)}: ${RQ_LABEL[it.st]}` : 'Klicken: Anforderung festlegen';
  });
  let sum = box.querySelector('.rq-sum');
  const c = reqCounts();
  if (!sum) { sum = document.createElement('a'); sum.className = 'rq-sum'; sum.href = '#anforderungen'; box.appendChild(sum); }
  const tot = RQ.items.length;
  sum.innerHTML = `<div class="k">Anforderungen</div><div class="v">${tot ? `<span class="good">${c.ok}</span>${c.near ? ` · <span class="warn">${c.near} knapp</span>` : ''}${c.bad ? ` · <span class="crit">${c.bad} ×</span>` : ''}${c.na ? ` · ${c.na} …` : ''}` : '<span class="muted">keine</span>'}</div>`;
}
/* ---------- Editor (Popover) ---------- */
function reqPop() {
  if (RQ.pop) return RQ.pop;
  const p = document.createElement('div'); p.id = 'rq-pop'; p.className = 'rq-pop'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'false');
  document.body.appendChild(p); RQ.pop = p;
  p.addEventListener('click', reqPopClick);
  p.addEventListener('change', e => { if (e.target.name === 'rqmode') reqPopMode(); });
  p.addEventListener('keydown', e => { if (e.key === 'Escape') reqPopClose(); if (e.key === 'Enter' && e.target.id === 'rq-note' && (e.ctrlKey || e.metaKey)) $('#rq-add').click(); });
  document.addEventListener('mousedown', e => { if (!p.hidden && !p.contains(e.target) && !e.target.closest('.rq-btn,[data-rq]')) reqPopClose(); });
  return p;
}
function notesHTML(t) {
  const l = S.notes[t] || [];
  if (!l.length) return '<li class="empty">Noch kein Kommentar.</li>';
  return l.map(n => `<li data-nid="${esc(n.id)}"><div class="rq-nmeta"><b>${esc(n.by || 'unbekannt')}</b> · ${n.ts ? esc(new Date(n.ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })) : ''}<button type="button" class="rq-del" data-del="${esc(n.id)}" aria-label="Kommentar löschen" title="Löschen">×</button></div><div class="rq-ntext">${esc(n.text)}</div></li>`).join('');
}
function reqOpen(t, anchor) {
  const p = reqPop(), [kind, key] = t.split(':'), r = S.req[t] || null;
  RQ.popFor = t;
  const isP = kind === 'p', num = isP ? isNumParam(key) : true, sel = isP && isSelParam(key), bool = isP && PM[key] && PM[key].sel === 'bool';
  const mode = !r ? 'none' : r.fix ? 'fix' : r.allow && r.allow.length ? 'allow' : 'range';
  const unit = isP ? (PM[key] && PM[key].u) || '' : KENN_BY[key].u, step = isP && PM[key] ? PM[key].step || 'any' : 'any';
  const cur = isP ? pvText(key, S.params[key]) : (RQ.by[t] ? RQ.by[t].vText : '…');
  const opts = sel ? paramOptions(key) : [];
  const modes = [['none', 'keine Anforderung'], ['fix', isP ? 'festhalten' : null], ['range', num && !bool ? (isP ? 'Bereich' : 'Grenzen') : null], ['allow', sel ? 'erlaubte Werte' : null]].filter(m => m[1]);
  p.innerHTML = `<div class="rq-head"><div><b>${esc(targetLabel(t))}</b><div class="small muted">${isP ? 'Eingabe' : 'Ergebnis'}, aktuell <span id="rq-cur">${esc(cur)}</span></div></div><button type="button" class="rq-x" aria-label="Schließen">×</button></div>
    <div class="rq-sec"><div class="rq-modes" role="radiogroup" aria-label="Art der Anforderung">${modes.map(([v, l]) => `<label><input type="radio" name="rqmode" value="${v}"${v === mode ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <div class="rq-range" data-show="range"><label>${isP ? 'von' : 'mindestens'} <input type="number" id="rq-min" step="${step}" value="${r && r.min !== null ? r.min : ''}" inputmode="decimal"></label><label>${isP ? 'bis' : 'höchstens'} <input type="number" id="rq-max" step="${step}" value="${r && r.max !== null ? r.max : ''}" inputmode="decimal"></label><span class="u">${esc(unit)}</span></div>
      ${sel ? `<div class="rq-allow" data-show="allow">${opts.map(([v, l]) => `<label><input type="checkbox" value="${esc(v)}"${r && r.allow && r.allow.includes(String(v)) ? ' checked' : !r || !r.allow ? (String(S.params[key]) === String(v) ? ' checked' : '') : ''}> ${esc(l)}</label>`).join('')}</div>` : ''}
      <p class="rq-hint" data-show="fix">Der jetzige Wert bleibt: das Feld ist gesperrt, Vorlagen und Entwurfsvorschläge ändern ihn nicht.</p>
      <p class="rq-hint" data-show="range">${isP ? 'Die Eingabe soll in diesem Bereich bleiben; Entwurfsvorschläge suchen nur darin.' : 'Leer lassen, was nicht begrenzt ist. Entwurfsvorschläge halten die Grenzen ein.'} Knapp heißt: Abstand zur Grenze unter ${nf(S.meta.knapp || 5, 1)} %.</p>
      <div class="rq-acts"><button type="button" class="btn sm primary" id="rq-save">Übernehmen</button><span class="small muted" id="rq-state"></span></div>
      ${r && r.by ? `<p class="small muted">Gesetzt von ${esc(r.by)}${r.ts ? ', ' + esc(new Date(r.ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })) : ''}</p>` : ''}
    </div>
    <div class="rq-sec"><h4>Kommentare</h4><ul class="rq-notes" id="rq-notes">${notesHTML(t)}</ul>
      <textarea id="rq-note" rows="2" placeholder="Warum, Quelle, offene Fragen …" aria-label="Neuer Kommentar"></textarea>
      <div class="rq-acts">${ME.name ? `<span class="small muted">als ${esc(ME.name)}</span>` : '<input type="text" id="rq-name" placeholder="Dein Name" maxlength="60" aria-label="Dein Name" style="max-width:150px">'}<button type="button" class="btn sm" id="rq-add">Kommentar hinzufügen</button></div></div>`;
  p.hidden = false; reqPopMode(); reqPopStatus();
  // neben dem Anker, auf schmalen Bildschirmen als Blatt unten
  const narrow = window.innerWidth < 640; p.classList.toggle('sheet', narrow);
  if (!narrow && anchor) {
    const a = anchor.getBoundingClientRect(), w = Math.min(380, window.innerWidth - 24);
    let left = a.left + window.scrollX - w + a.width; left = Math.max(window.scrollX + 12, Math.min(left, window.scrollX + window.innerWidth - w - 12));
    p.style.width = w + 'px'; p.style.left = left + 'px'; p.style.top = (a.bottom + window.scrollY + 6) + 'px';
  } else { p.style.left = ''; p.style.top = ''; p.style.width = ''; }
  const first = p.querySelector('input[name=rqmode]:checked'); if (first) first.focus({ preventScroll: true });
}
function reqPopMode() {
  const p = RQ.pop, m = (p.querySelector('input[name=rqmode]:checked') || {}).value || 'none';
  p.querySelectorAll('[data-show]').forEach(el => { el.hidden = el.dataset.show !== m; });
}
function reqPopStatus() {
  const it = RQ.by[RQ.popFor], el = $('#rq-state'), cur = $('#rq-cur');
  if (cur && RQ.popFor.startsWith('m:') && it) cur.textContent = it.vText;
  if (el) el.innerHTML = it ? `<span class="rq-st ${it.st}">${esc(RQ_LABEL[it.st])}</span>${fin(it.margin) && it.st !== 'na' ? ` · Abstand ${nf(it.margin * 100, 0)} %` : ''}` : '';
}
function reqPopClose() { if (RQ.pop) RQ.pop.hidden = true; RQ.popFor = null; }
function reqSet(t, r) {
  if (r) S.req[t] = { ...r, by: myName(), ts: Date.now() }; else delete S.req[t];
  if (r && r.fix) enforceFixed();
  reqDecorate(); schedule();
}
function reqPopClick(e) {
  const t = RQ.popFor; if (!t) return;
  const [kind, key] = t.split(':');
  if (e.target.closest('.rq-x')) { reqPopClose(); return; }
  if (e.target.closest('#rq-save')) {
    const m = (RQ.pop.querySelector('input[name=rqmode]:checked') || {}).value || 'none';
    const num = id => { const v = $('#' + id).value.trim(); return v === '' || !fin(Number(v)) ? null : Number(v); };
    if (m === 'none') reqSet(t, null);
    else if (m === 'fix') reqSet(t, { fix: true, val: S.params[key], min: null, max: null, allow: null });
    else if (m === 'allow') { const allow = [...RQ.pop.querySelectorAll('.rq-allow input:checked')].map(i => i.value); if (!allow.length) { toast('Mindestens einen Wert auswählen.'); return; } reqSet(t, { fix: false, min: null, max: null, allow }); }
    else {
      const min = num('rq-min'), max = num('rq-max');
      if (min === null && max === null) { toast('Mindestens eine Grenze eingeben.'); return; }
      if (min !== null && max !== null && min > max) { toast('Untere Grenze liegt über der oberen.'); return; }
      reqSet(t, kind === 'p' ? { fix: false, min, max, allow: null } : { min, max });
    }
    reqPopClose(); return;
  }
  if (e.target.closest('#rq-add')) {
    const ta = $('#rq-note'), text = ta.value.trim(); if (!text) { ta.focus(); return; }
    const nm = $('#rq-name'); if (nm) { if (!nm.value.trim()) { nm.focus(); toast('Bitte deinen Namen eintragen.'); return; } setMyName(nm.value); }
    noteAdd(t, text); ta.value = ''; $('#rq-notes').innerHTML = notesHTML(t); if (nm) nm.closest('.rq-acts').innerHTML = `<span class="small muted">als ${esc(ME.name)}</span><button type="button" class="btn sm" id="rq-add">Kommentar hinzufügen</button>`;
    return;
  }
  const d = e.target.closest('[data-del]');
  if (d) { noteDel(t, d.dataset.del); $('#rq-notes').innerHTML = notesHTML(t); }
}
function noteAdd(t, text) {
  const l = S.notes[t] || (S.notes[t] = []);
  l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: text.slice(0, 2000), by: myName(), ts: Date.now() });
  reqDecorate(); schedule(); if (VIEW === 'anforderungen' && RQ.R) renderReqView(RQ.R);
}
function noteDel(t, id) {
  const l = S.notes[t]; if (!l) return;
  S.notes[t] = l.filter(n => n.id !== id); if (!S.notes[t].length) delete S.notes[t];
  reqDecorate(); schedule(); if (VIEW === 'anforderungen' && RQ.R) renderReqView(RQ.R);
}
// Fähnchen an den Feldern und Felder im Streifen öffnen den Editor
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.rq-btn');
  if (b) { e.preventDefault(); const t = 'p:' + b.dataset.rq; if (RQ.popFor === t && !RQ.pop.hidden) reqPopClose(); else reqOpen(t, b); return; }
  const s = e.target.closest && e.target.closest('#strip > [data-rq]');
  if (s) { reqOpen(s.dataset.rq, s); return; }
  const o = e.target.closest && e.target.closest('[data-rqopen]');
  if (o) { e.preventDefault(); reqOpen(o.dataset.rqopen, o); }
});
function reqRefresh() { reqDecorate(); if (RQ.R) reqUpdate(RQ.R); }

/* ---------- Ansicht Anforderungen ---------- */
function renderReqView(R) {
  const items = RQ.items, c = reqCounts();
  $('#rq-knapp').value = S.meta.knapp || 5; if (document.activeElement !== $('#rq-myname')) $('#rq-myname').value = ME.name;
  $('#rq-sum').innerHTML = items.length ? `<div class="rq-counts"><span class="rq-st ok">${c.ok} erfüllt</span><span class="rq-st near">${c.near} knapp</span><span class="rq-st bad">${c.bad} verletzt</span>${c.na ? `<span class="rq-st na">${c.na} offen</span>` : ''}</div>` : '<p class="note">Noch keine Anforderungen. Ergebnisse links hinzufügen, Eingaben über das Fähnchen am Feld.</p>';
  const row = it => {
    const marg = fin(it.margin) && it.st !== 'na' ? nf(it.margin * 100, 0) + ' %' : '–';
    const jump = it.kind === 'p' ? `<button type="button" class="linkbtn" data-jump="${esc(it.key)}">${esc(targetLabel(it.t))}</button>` : esc(targetLabel(it.t));
    const n = (S.notes[it.t] || []).length;
    return `<tr class="rq-row ${it.st}"><td class="c-n">${jump}${n ? ` <span class="muted small" title="Kommentare">${ICON_NOTE} ${n}</span>` : ''}</td><td class="c-r">${esc(reqText(it.t, it.r))}</td><td class="n c-v" data-l="aktuell">${esc(it.vText)}</td><td class="n c-m" data-l="Abstand">${marg}</td><td class="c-s"><span class="rq-st ${it.st}">${esc(RQ_LABEL[it.st])}</span></td><td class="small muted c-b">${esc(it.r.by || '')}</td><td class="n c-a"><button type="button" class="btn sm" data-rqopen="${esc(it.t)}">Bearbeiten</button> <button type="button" class="btn sm" data-rqdel="${esc(it.t)}" aria-label="Anforderung entfernen">×</button></td></tr>`;
  };
  const head = '<thead><tr><th>Größe</th><th>Anforderung</th><th class="n">Aktuell</th><th class="n">Abstand</th><th>Stand</th><th>Von</th><th></th></tr></thead>';
  const outs = items.filter(i => i.kind === 'm'), ins = items.filter(i => i.kind === 'p');
  $('#tbl-rq-out').innerHTML = head + `<tbody>${outs.length ? outs.map(row).join('') : '<tr><td colspan="7" class="muted">Keine Anforderungen an Ergebnisse.</td></tr>'}</tbody>`;
  $('#tbl-rq-in').innerHTML = head + `<tbody>${ins.length ? ins.map(row).join('') : '<tr><td colspan="7" class="muted">Keine festgehaltenen oder begrenzten Eingaben.</td></tr>'}</tbody>`;
  $('#rq-model-notes').innerHTML = notesHTML('model');
  const all = Object.entries(S.notes).filter(([t]) => t !== 'model');
  $('#rq-all-notes').innerHTML = all.length ? all.map(([t, l]) => `<div class="rq-ngroup"><div class="rq-ntitle">${t.startsWith('p:') ? `<button type="button" class="linkbtn" data-jump="${esc(t.slice(2))}">${esc(targetLabel(t))}</button>` : `<button type="button" class="linkbtn" data-rqopen="${esc(t)}">${esc(targetLabel(t))}</button>`}</div><ul class="rq-notes">${notesHTML(t)}</ul></div>`).join('') : '<p class="note">Kommentare an Eingaben und Ergebnissen erscheinen hier gesammelt.</p>';
  const sel = $('#rq-new-k');
  if (!sel.options.length) sel.innerHTML = KENN.map(k => `<option value="${k.key}">${esc(k.l)}${k.u ? ' (' + esc(k.u) + ')' : ''}${k.cost === 'high' ? ' – aufwendig' : ''}</option>`).join('');
  reqNewHint();
}
function reqNewHint() {
  const k = $('#rq-new-k').value, K = KENN_BY[k], v = RQ.R ? (K.cost === 'case' || K.cost === 'day' ? kennValue(RQ.R, k) : (UI.cache['kenn:' + k] || {}).v) : NaN;
  $('#rq-new-cur').textContent = `aktuell ${fin(v) ? kvText(k, v) : '–'}${K.note ? ' · ' + K.note : ''}`;
}
RENDER.anforderungen = R => renderReqView(R);
$('#rq-new-k').addEventListener('change', reqNewHint);
$('#rq-new-add').addEventListener('click', () => {
  const k = $('#rq-new-k').value, n = id => { const v = $('#' + id).value.trim(); return v === '' || !fin(Number(v)) ? null : Number(v); }, min = n('rq-new-min'), max = n('rq-new-max');
  if (min === null && max === null) { toast('Mindestens eine Grenze eingeben.'); return; }
  if (min !== null && max !== null && min > max) { toast('Untere Grenze liegt über der oberen.'); return; }
  reqSet('m:' + k, { min, max }); $('#rq-new-min').value = ''; $('#rq-new-max').value = '';
});
$('#rq-knapp').addEventListener('change', e => { const v = Number(e.target.value); if (fin(v)) { S.meta.knapp = clamp(v, 0.5, 50); schedule(); } });
$('#rq-model-add').addEventListener('click', () => {
  const ta = $('#rq-model-note'), text = ta.value.trim(), nm = $('#rq-myname'); if (!text) { ta.focus(); return; }
  if (nm.value.trim()) setMyName(nm.value);
  if (!ME.name) { toast('Bitte zuerst deinen Namen eintragen.'); nm.focus(); return; }
  noteAdd('model', text); ta.value = '';
});
$('#rq-myname').addEventListener('change', e => setMyName(e.target.value));
document.addEventListener('click', e => {
  const d = e.target.closest && e.target.closest('[data-rqdel]'); if (d) { reqSet(d.dataset.rqdel, null); return; }
  const n = e.target.closest && e.target.closest('#rq-model-notes [data-del], #rq-all-notes [data-del]');
  if (n) { const t = n.closest('#rq-model-notes') ? 'model' : Object.keys(S.notes).find(k => (S.notes[k] || []).some(x => x.id === n.dataset.del)); if (t) noteDel(t, n.dataset.del); }
});

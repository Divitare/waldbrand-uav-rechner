/* ===================================================================
   Oberfläche: Entwurf berechnen (Entwurfsvorschläge)
   - Ziel, freie Größen (Gruppen und einzeln), Bedingungen aus den
     Anforderungen und den Grundbedingungen, Rechenaufwand
   - mehrere Läufe parallel in Web Workern (gleicher Rechenkern wie die
     Seite), ein Lauf je Prozessorkern bis acht; die Seite reicht den
     besten Entwurf regelmäßig an die schwächeren Läufe weiter (Migration);
     ohne Worker rechnet die Seite selbst in kleinen Schritten
   - Weiterrechnen: neue Suche, die bei den besten Entwürfen der letzten ansetzt
   - Fortschritt mit Verlauf des besten zulässigen Entwurfs je Lauf; ohne
     zulässigen Entwurf je Anforderung, was die Suche erreicht hat
   - Vorschläge mit Grundriss, Änderungen, Kennwerten und Stand der
     Anforderungen; Übernehmen mit Rückgängig
   =================================================================== */
const OPT_STORE = 'waldbrand-uav-opt';
// Rechnungen je Lauf; Zeitschätzung aus der zuletzt gemessenen Rechenzeit je Entwurf auf diesem Rechner
const OPT_EFFORT = { quick: ['schnell', 800], normal: ['normal', 2000], deep: ['gründlich', 5000], max: ['sehr gründlich', 12000] };
const OPT_MS_EVAL = 9;
const OPT_GROUP_L = Object.fromEntries(OPT_GROUPS.map(g => [g[0], g[1]]).concat([['payload', 'Nutzlast'], ['extra', 'Weitere mit Bereich']]));
const OPT_INT = new Set(['sail', 'grc', 'nSol']);
const OPT = { cfg: null, run: null, res: null, undo: null, url: null, t: 0, last: null };
function optCfgLoad() {
  let c = {}; try { c = JSON.parse(localStorage.getItem(OPT_STORE) || '{}') || {}; } catch (e) { c = {}; }
  const objs = optObjectives().map(k => k.key);
  OPT.cfg = {
    obj: objs.includes(c.obj) ? c.obj : 'mass',
    groups: Array.isArray(c.groups) ? c.groups.filter(g => OPT_GROUP_L[g]) : OPT_GROUPS.filter(g => g[2]).map(g => g[0]),
    off: Array.isArray(c.off) ? c.off.filter(k => OPT_CAT_BY[k] || PM[k]) : [],
    checks: [...new Set([...(Array.isArray(c.checks) ? c.checks.filter(k => DESIGN_CHECKS.some(d => d.key === k)) : DESIGN_CHECKS.filter(d => d.on).map(d => d.key)), ...DESIGN_CHECKS.filter(d => d.fixed).map(d => d.key)])],
    reserve: !!c.reserve, effort: OPT_EFFORT[c.effort] ? c.effort : 'normal',
    msEval: fin(c.msEval) && c.msEval > 0.5 && c.msEval < 500 ? c.msEval : null
  };
}
function optCfgSave() { try { localStorage.setItem(OPT_STORE, JSON.stringify(OPT.cfg)); } catch (e) { /* ignorieren */ } }
// ein Lauf je Kern bis acht, einer bleibt für die Seite frei (mindestens zwei Läufe)
const optRuns = () => clamp(((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 1, 2, 8);
const optObjText = key => { const K = KENN_BY[key]; return `${K.l} ${K.dir > 0 ? 'möglichst groß' : 'möglichst klein'}`; };

/* ---------- Aufgabe aus Dokument und Einstellungen ---------- */
function optBuild() {
  const cfg = OPT.cfg, vs = optVarSet(S.params, S.req, cfg.groups, cfg.off, cfg.obj), extra = [];
  // weitere Eingaben mit eigenem Bereich oder erlaubten Werten, die nicht im Katalog stehen
  for (const [t, r] of Object.entries(S.req)) {
    if (!t.startsWith('p:') || r.fix) continue;
    const k = t.slice(2), m = PM[k], cur = S.params[k]; if (OPT_CAT_BY[k] || !m || cfg.off.includes(k)) continue;
    if (r.allow && r.allow.length && isSelParam(k)) extra.push({ k, g: 'extra', t: 'd', opts: r.allow.map(v => (typeof DEFAULT_PARAMS[k] === 'number' ? Number(v) : v)), src: 'req' });
    else if (isNumParam(k) && (r.min !== null || r.max !== null)) {
      const w = Math.max(Math.abs(cur) * 0.5, m.step * 10);
      const lo = r.min ?? Math.max(m.min, Math.min(cur, r.max) - w), hi = r.max ?? Math.min(m.max, Math.max(cur, r.min) + w);
      extra.push({ k, g: 'extra', t: m.step >= 1 && Number.isInteger(cur) ? 'i' : 'c', lo, hi, st: m.step, src: 'req', a: fin(cur) && cur >= lo && cur <= hi ? cur : undefined });
    }
  }
  const knapp = (S.meta.knapp || 5) / 100;
  const cons = Object.entries(S.req).filter(([t]) => t.startsWith('m:') && KENN_BY[t.slice(2)]).map(([t, r]) => {
    const key = t.slice(2); let min = r.min, max = r.max;
    if (cfg.reserve && !OPT_INT.has(key)) {
      if (min !== null && max !== null && max > min) { const w = (max - min) * knapp; min += w; max -= w; }
      else {
        if (min !== null) min += knapp * (Math.abs(min) > 1e-9 ? Math.abs(min) : 1);
        if (max !== null) max -= knapp * (Math.abs(max) > 1e-9 ? Math.abs(max) : 1);
      }
    }
    return { key, min, max, l: KENN_BY[key].l, txt: reqText(t, r) };
  });
  const K = KENN_BY[cfg.obj], vars = vs.vars.concat(extra);
  const spec = { base: { ...S.params }, comps: S.comps, vars, obj: { key: cfg.obj, dir: K.dir }, cons: cons.map(({ key, min, max }) => ({ key, min, max })), checks: cfg.checks.slice(), budget: OPT_EFFORT[cfg.effort][1] };
  return { spec, info: vs.info, extra, cons };
}

/* ---------- Seite: Einstellungen und Liste der Größen ---------- */
function optRenderSide() {
  const cfg = OPT.cfg, sel = $('#op-obj');
  if (!sel.options.length) {
    const ob = optObjectives(), grp = d => ob.filter(k => k.dir === d).map(k => `<option value="${k.key}">${esc(k.l)}${k.u ? ' (' + esc(k.u) + ')' : ''}</option>`).join('');
    sel.innerHTML = `<optgroup label="möglichst klein">${grp(-1)}</optgroup><optgroup label="möglichst groß">${grp(1)}</optgroup>`;
  }
  sel.value = cfg.obj;
  const K = KENN_BY[cfg.obj], v = R ? (K.cost === 'case' || K.cost === 'day' ? kennValue(R, cfg.obj) : (UI.cache['kenn:' + cfg.obj] || {}).v) : NaN;
  $('#op-obj-cur').textContent = `${K.dir > 0 ? 'Möglichst groß' : 'Möglichst klein'}; jetzt ${fin(v) ? kvText(cfg.obj, v) : '–'}${K.cost === 'mid' ? ' · aufwendigere Rechnung, die Suche dauert länger' : ''}`;
  const note = $('#op-obj-note'), pr = S.req['p:payloadExtra'];
  note.hidden = cfg.obj !== 'payload';
  if (cfg.obj === 'payload') note.textContent = pr && pr.fix ? 'Die zusätzliche Nutzlast ist festgehalten – so kann die Suche die Nutzlast nicht erhöhen.' : 'Die Suche erhöht die zusätzliche Nutzlast (Eingabe im Schwerpunkt der Sensorik), soweit Masse, Einsatz und die übrigen Bedingungen es erlauben.';
  // Bedingungen
  const b = optBuild();
  $('#op-cons').innerHTML = b.cons.length
    ? `<ul class="op-conlist">${b.cons.map(c => { const it = RQ.by['m:' + c.key]; return `<li><span>${esc(c.l)}</span><b>${esc(c.txt)}</b>${it ? `<span class="rq-st ${it.st}">${esc(RQ_LABEL[it.st])}</span>` : ''}</li>`; }).join('')}</ul>`
    : '<p class="note">Keine Anforderungen an Ergebnisse. Ohne sie findet die Suche oft sehr kleine oder sehr große Entwürfe – etwa Grenzen für Excess Time, Spannweite oder SAIL festlegen.</p>';
  $('#op-checks').innerHTML = DESIGN_CHECKS.map(d => `<label><input type="checkbox" data-opchk="${d.key}"${cfg.checks.includes(d.key) || d.fixed ? ' checked' : ''}${d.fixed ? ' disabled' : ''}> <span>${esc(d.l)}${d.key === 'exc' ? ` (${nf(S.params.tExcReq, 1)} h)` : ''}${d.fixed ? ' <span class="muted small">(immer)</span>' : ''}</span></label>`).join('');
  $('#op-reserve').checked = cfg.reserve; $('#op-knapp').textContent = nf(S.meta.knapp || 5, 1) + ' %';
  optRenderNow(b);
  const nR = optRuns(), ms = cfg.msEval || OPT_MS_EVAL, sec = n => { const s = n * ms / 1000 * 1.1; return s < 90 ? `${nf(Math.max(5, Math.round(s / 5) * 5), 0)} s` : `${nf(s / 60, 1)} min`; };
  $('#op-effort').innerHTML = Object.entries(OPT_EFFORT).map(([k, [l, n]]) => `<label><input type="radio" name="op-effort" value="${k}"${cfg.effort === k ? ' checked' : ''}> <span><b>${esc(l)}</b> <span class="muted">etwa ${sec(n)}</span></span></label>`).join('');
  $('#op-run-note').textContent = `${nR} Läufe parallel mit je ${nf(OPT_EFFORT[cfg.effort][1], 0)} Rechnungen; sie tauschen ihre besten Entwürfe aus. ${cfg.msEval ? 'Zeiten aus der letzten Suche auf diesem Rechner.' : 'Die Zeiten gelten für einen schnellen Rechner.'} Die Seite bleibt bedienbar. Reicht es nicht, setzt „Weiterrechnen“ bei den besten Entwürfen an.`;
  $('#op-more').hidden = !OPT.last || !!OPT.run;
  optRenderVars(b);
}
function optRangeText(v) {
  if (v.t === 'd') return v.opts.length <= 3 ? v.opts.map(o => pvText(v.k, o)).join(', ') : `${v.opts.length} zur Wahl`;
  const u = PM[v.k] && PM[v.k].u ? ' ' + PM[v.k].u : '', d = stepDec(v.st || 0.01);
  return `${nf(v.lo, d)} bis ${nf(v.hi, d)}${u}`;
}
function optRenderVars(b) {
  const cfg = OPT.cfg, vars = b.spec.vars, byK = Object.fromEntries(vars.map(v => [v.k, v])), info = Object.fromEntries(b.info.map(i => [i.k, i]));
  const groups = OPT_GROUPS.map(g => g[0]).concat(b.extra.length ? ['extra'] : []).concat(vars.some(v => v.g === 'payload') ? ['payload'] : []);
  $('#op-groups').innerHTML = OPT_GROUPS.map(([g, l]) => { const n = vars.filter(v => v.g === g).length, tot = OPT_CAT.filter(c => c.g === g).length; return `<label class="op-g${cfg.groups.includes(g) ? ' on' : ''}"><input type="checkbox" data-opgrp="${g}"${cfg.groups.includes(g) ? ' checked' : ''}> ${esc(l)} <span class="muted">${n}/${tot}</span></label>`; }).join('');
  const nFix = b.info.filter(i => i.why === 'fix').length, nReq = vars.filter(v => v.src === 'req').length;
  $('#op-vars-sub').textContent = `${vars.length} Größen frei${nReq ? `, davon ${nReq} mit Bereich aus den Anforderungen` : ''}${nFix ? `, ${nFix} festgehalten` : ''}. Suchbereiche nach üblicher Praxis für Solarflugzeuge dieser Größe; ein Bereich aus den Anforderungen ersetzt sie. Einzelne Größen lassen sich abwählen.`;
  const WHY = { fix: 'festgehalten', group: 'Gruppe aus', na: 'wirkt hier nicht', off: 'abgewählt' };
  let rows = '';
  for (const g of groups) {
    const keys = g === 'extra' ? b.extra.map(v => v.k) : OPT_CAT.filter(c => c.g === g).map(c => c.k);
    // frei, abgewählt, festgehalten, Gruppe aus; was im jetzigen Modell nicht wirkt, bleibt weg
    const list = keys.filter(k => byK[k] || (info[k] && info[k].why !== 'na'));
    if (g === 'payload' && !byK.payloadExtra && !(info.payloadExtra && info.payloadExtra.why === 'fix')) continue;
    if (!list.length) continue;
    rows += `<tr class="op-gh"><th colspan="5">${esc(OPT_GROUP_L[g])}</th></tr>`;
    for (const k of list) {
      const v = byK[k], why = v ? null : info[k] ? info[k].why : 'na', lab = PM[k] ? PM[k].l : k, fix = why === 'fix';
      const rng = v ? optRangeText(v) : fix ? `fest: ${pvText(k, S.params[k])}` : '–';
      const st = v ? (v.src === 'req' ? '<span class="rq-badge">Bereich</span>' : '') : `<span class="muted small">${esc(WHY[why] || '')}</span>`;
      rows += `<tr class="${v ? '' : 'op-off'}"><td><label class="op-vk"><input type="checkbox" data-opvar="${esc(k)}"${v ? ' checked' : ''}${fix || why === 'group' || why === 'na' ? ' disabled' : ''}> <span>${esc(lab)}</span></label></td><td class="n">${esc(pvText(k, S.params[k]))}</td><td>${esc(rng)}</td><td>${st}</td><td><button type="button" class="linkbtn small" data-jump="${esc(k)}">Feld</button></td></tr>`;
    }
  }
  $('#op-vsum').textContent = `Alle Größen einzeln mit Suchbereich (${vars.length} frei)`;
  $('#tbl-op-vars').innerHTML = `<thead><tr><th>Größe</th><th class="n">jetzt</th><th>Suchbereich</th><th></th><th></th></tr></thead><tbody>${rows}</tbody>`;
}

/* ---------- Jetziger Entwurf: welche Bedingungen er verletzt, welche freien Größen daran etwas ändern ---------- */
// Verletzung je Bedingung für den jetzigen Entwurf (Reihenfolge wie optConsList); teure Kenngrößen aus dem Zwischenspeicher
function optNowState(b) {
  const list = optConsList(b);
  return list.map(c => {
    if (!R) return { c, st: 'na' };
    if (c.kenn) {
      const K = KENN_BY[c.key]; let v;
      if (K.cost === 'high') { const ch = UI.cache['kenn:' + c.key]; if (!ch || ch.k !== keyOf()) return { c, st: 'na' }; v = ch.v; }
      else v = kennValue(R, c.key);
      const d = consViol(kennGraded(R, c.key, v), { min: c.min, max: c.max, sc: K.sc });
      return { c, st: d > OPT_EPS ? 'bad' : 'ok', v, d };
    }
    const D = DESIGN_CHECKS.find(x => x.key === c.key); let d;
    try { d = D.viol(R); } catch (e) { d = 1; }
    let detail = null; if (D.items && !(fin(d) && d <= OPT_EPS)) { try { const it = D.items(R); if (it.length) detail = it.map(i => i.txt); } catch (e) { /* ohne Einzelheiten */ } }
    return { c, st: fin(d) && d <= OPT_EPS ? 'ok' : 'bad', d, detail };
  });
}
function optRenderNow(b) {
  const st = optNowState(b), bad = st.filter(x => x.st === 'bad');
  const row = x => `<div class="op-nr ${x.st}"><span class="ic" aria-hidden="true">${x.st === 'ok' ? '✓' : x.st === 'bad' ? '✗' : '…'}</span><span>${esc(x.c.l)}${x.c.kenn ? ` <span class="muted">(${esc(x.c.txt)})</span>` : ''}${x.detail ? `<span class="op-det">${x.detail.map(esc).join('<br>')}</span>` : ''}</span><span class="v">${x.c.kenn && fin(x.v) ? esc(kvText(x.c.key, x.v)) : ''}</span></div>`;
  $('#op-now').innerHTML = (bad.length
    ? `<p class="note">Der jetzige Entwurf verletzt ${bad.length === 1 ? 'eine Bedingung' : bad.length + ' Bedingungen'}. Die Suche muss ${bad.length === 1 ? 'sie' : 'sie alle'} über die freien Größen erreichen; „Woran hängt es?“ prüft, welche freie Größe überhaupt etwas daran ändert.</p>`
    : '<p class="note">Der jetzige Entwurf erfüllt alle Bedingungen; die Suche verbessert von hier aus das Ziel.</p>') + st.map(row).join('');
  $('#op-why').hidden = !bad.length;
  const nLock = (b.info || []).filter(i => OPT_WHY_L[i.why]).length;
  if (nLock) $('#op-now').insertAdjacentHTML('beforeend', `<p class="note">${nLock} ${nLock === 1 ? 'Größe des Suchkatalogs ist' : 'Größen des Suchkatalogs sind'} nicht frei (festgehalten, Gruppe aus oder abgewählt); „Woran hängt es?“ zeigt auch, ob ${nLock === 1 ? 'sie' : 'sie'} helfen würden.</p>`);
  if (OPT.why && OPT.why.key !== optWhyKey(b)) { OPT.why = null; $('#op-why-res').innerHTML = ''; }
}
const optWhyKey = b => JSON.stringify([keyOf(), b.spec.vars.map(v => [v.k, v.lo, v.hi, v.opts && v.opts.length]), b.spec.cons, b.spec.checks]);
// Hilfstexte: welche Größe wohin, was es der Bedingung bringt
function optHelpText(c, h) {
  const v = OPT_CAT_BY[h.k] || {}, lab = PM[h.k] ? PM[h.k].l : h.k;
  return `${esc(lab)} → ${esc(pvText(h.k, h.x))}${c.kenn && fin(h.v) ? `: ${esc(KENN_BY[c.key].l)} ${esc(kvText(c.key, h.v))}` : h.d <= OPT_EPS ? ': erfüllt' : ''}`;
}
const OPT_WHY_L = { fix: 'festgehalten', group: 'Gruppe aus', off: 'abgewählt', probe: 'nicht im Suchkatalog, nur im Feld änderbar' };
function optWhyHTML(b, inf, title) {
  const list = optConsList(b), parts = [];
  list.forEach((c, j) => {
    const o = inf.cons[j]; if (!o || !(o.d0 > OPT_EPS)) return;
    const head = `<h5>${esc(c.l)}${c.kenn ? ` <span class="muted">(${esc(c.txt)}; jetzt ${esc(kvText(c.key, o.v0))})</span>` : ''}</h5>`;
    const free = o.help.filter(h => !h.locked), lock = o.help.filter(h => h.locked);
    const lockHTML = lock.length ? `<p class="note">Würde helfen, ist aber nicht frei:</p><ul>${lock.slice(0, 4).map(h => `<li>${optHelpText(c, h)} <span class="muted">(${esc(OPT_WHY_L[h.why] || 'nicht frei')})</span></li>`).join('')}</ul>` : '';
    if (free.length) parts.push(`${head}<ul>${free.slice(0, 4).map(h => `<li>${optHelpText(c, h)}${h.d <= OPT_EPS && c.kenn ? ' ✓' : ''}</li>`).join('')}</ul>${lockHTML}`);
    else if (lock.length) parts.push(`${head}<p class="note">Keine freie Größe hilft hier einzeln.</p>${lockHTML}<p class="note">Fähnchen lösen, die Gruppe einschalten oder die Größe wieder anwählen, dann kann die Suche sie verändern.</p>`);
    else if (!o.any) parts.push(`${head}<p class="note">Keine Größe im Suchkatalog ändert daran etwas – die Bedingung hängt an anderen Eingaben (z. B. Einsatzzeiten, Komponenten, SORA-Angaben) oder ist so nicht erreichbar.</p>`);
    else parts.push(`${head}<p class="note">Größen ändern etwas, aber keine einzeln in die richtige Richtung. Mehrere zusammen könnten helfen – das versucht die Suche.</p>`);
  });
  return parts.length ? `${title ? `<p class="note">${esc(title)}</p>` : ''}${parts.join('')}<p class="note">Geprüft: jede freie Größe einzeln an den Rand ihres Suchbereichs, alles andere bleibt. Steht die beste Größe dabei am Rand, kann ein weiterer Bereich (Fähnchen am Feld) mehr bringen.</p>` : '<p class="note">Keine verletzte Bedingung.</p>';
}
// Einflussrechnung im Worker (ohne Worker auf der Seite)
// nicht freie Größen des Katalogs (festgehalten, Gruppe aus, abgewählt) mit Katalogbereich, um zu sehen, ob sie helfen würden
function optLockedVars(b) {
  const all = optVarSet(b.spec.base, {}, OPT_GROUPS.map(g => g[0]), [], b.spec.obj.key).vars, why = Object.fromEntries((b.info || []).map(i => [i.k, i.why]));
  const out = all.filter(v => !b.spec.vars.some(f => f.k === v.k) && OPT_WHY_L[why[v.k]]).map(v => ({ ...v, why: why[v.k] }));
  for (const q of OPT_PROBE) {
    if (b.spec.vars.some(f => f.k === q.k) || out.some(f => f.k === q.k) || !PM[q.k]) continue;
    const cur = b.spec.base[q.k];
    if (q.opts) out.push({ k: q.k, g: 'probe', t: 'd', opts: q.opts.slice(), n: q.opts.length, why: S.req['p:' + q.k] && S.req['p:' + q.k].fix ? 'fix' : 'probe' });
    else out.push({ k: q.k, g: 'probe', t: 'c', lo: fin(cur) ? Math.min(q.lo, cur) : q.lo, hi: fin(cur) ? Math.max(q.hi, cur) : q.hi, st: q.st, why: S.req['p:' + q.k] && S.req['p:' + q.k].fix ? 'fix' : 'probe' });
  }
  return out;
}
function optInfluenceAsync(spec, vals, done, extra) {
  const opt = { extra: extra || [] };
  if (typeof Worker === 'undefined') { setTimeout(() => { try { done(optInfluence(spec, vals, opt)); } catch (e) { done(null, e); } }, 20); return null; }
  let w;
  try { w = new Worker(optWorkerURL()); } catch (e) { setTimeout(() => { try { done(optInfluence(spec, vals, opt)); } catch (er) { done(null, er); } }, 20); return null; }
  w.onmessage = e => { const m = e.data; if (m.type === 'influence') { w.terminate(); done(m.res); } else if (m.type === 'error') { w.terminate(); done(null, m.msg); } };
  w.onerror = e => { e.preventDefault(); w.terminate(); done(null, e.message); };
  w.postMessage({ type: 'init', airfoils: DATA.airfoils });
  w.postMessage({ type: 'influence', id: 0, spec, vals, opt });
  return w;
}
function optWhy() {
  const b = optBuild(), key = optWhyKey(b), box = $('#op-why-res'), btn = $('#op-why');
  if (OPT.why && OPT.why.key === key && OPT.why.res) { box.innerHTML = optWhyHTML(b, OPT.why.res); return; }
  btn.disabled = true; box.innerHTML = `<p class="note">Prüfe ${b.spec.vars.length} freie Größen einzeln …</p>`;
  optInfluenceAsync(b.spec, {}, (res, err) => {
    btn.disabled = false;
    if (!res) { box.innerHTML = pill('crit', `Rechenfehler: ${String(err)}`); return; }
    OPT.why = { key, res }; box.innerHTML = optWhyHTML(b, res);
  }, optLockedVars(b));
}

/* ---------- Rechnen: Worker, Fortschritt, Auswahl, Aufräumen ---------- */
function optWorkerURL() {
  if (OPT.url) return OPT.url;
  const src = $('#uav-model').textContent + '\n;optWorkerMain();\n';
  OPT.url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  return OPT.url;
}
function optStart(cont) {
  if (OPT.run) return;
  const b = optBuild();
  if (cont === true && OPT.last && OPT.last.init.length) { b.spec.init = OPT.last.init; b.cont = (OPT.last.cont || 0) + 1; }
  if (!b.spec.vars.length) { toast('Keine freien Größen: Gruppen einschalten oder Festhalten lösen.'); return; }
  if (b.spec.obj.key === 'payload' && !b.spec.vars.some(v => v.k === 'payloadExtra')) toast('Hinweis: die zusätzliche Nutzlast ist nicht frei – die Nutzlast kann kaum steigen.');
  const n = optRuns(), run = OPT.run = { t0: Date.now(), b, key: keyOf(), n, prog: [], hist: [], res: [], pol: [], workers: [], fallback: false, phase: 'search', K: KENN_BY[b.spec.obj.key], migT: 0, nMig: 0 };
  OPT.res = null; OPT.undo = null;
  for (let i = 0; i < n; i++) { run.prog.push(null); run.hist.push([]); }
  $('#op-prog-panel').hidden = false; $('#op-run').disabled = true; $('#op-more').hidden = true; $('#op-stop').hidden = false;
  $('#op-res').innerHTML = ''; $('#op-diag').hidden = true; $('#op-res-sub').textContent = 'Die Suche läuft …';
  $('#op-prog-sub').textContent = `${optObjText(b.spec.obj.key)} · ${b.spec.vars.length} freie Größen · ${b.cons.length} Anforderungen, ${b.spec.checks.length} Grundbedingungen · ${n} ${n > 1 ? 'Läufe' : 'Lauf'}${b.cont ? ` · weitergerechnet ab ${b.spec.init.length} Entwürfen der letzten Suche` : ''}`;
  let ok = typeof Worker !== 'undefined';
  if (ok) {
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(optWorkerURL());
        w.onmessage = e => optMsg(i, e.data); w.onerror = e => { e.preventDefault(); optFail(i, e.message || 'Fehler im Rechen-Worker'); };
        w.postMessage({ type: 'init', airfoils: DATA.airfoils });
        w.postMessage({ type: 'run', spec: { ...b.spec, seed: i + 1 } });
        run.workers.push(w);
      }
    } catch (e) { console.warn('Worker nicht verfügbar, rechne auf der Seite', e); run.workers.forEach(w => w.terminate()); run.workers = []; ok = false; }
  }
  if (!ok) optFallback();
  optProgress();
}
// ohne Worker: ein Lauf auf der Seite, je Generation eine Pause für die Bedienung
function optFallback() {
  const run = OPT.run; run.fallback = true; run.n = 1; run.prog = [null]; run.hist = [[]];
  const it = optIsland({ ...run.b.spec, seed: 1 });
  const step = () => {
    if (OPT.run !== run) return;
    let r; try { r = it.next(!!run.stopReq); } catch (e) { optFail(0, e.message); return; }
    if (r.done) optMsg(0, { type: 'done', res: r.value }); else { optMsg(0, { type: 'progress', p: r.value }); setTimeout(step, 15); }
  };
  setTimeout(step, 30);
}
function optMsg(i, m) {
  const run = OPT.run; if (!run) return;
  if (m.type === 'progress') {
    run.prog[i] = m.p;
    if (m.p.best.viol <= OPT_EPS && fin(m.p.best.f)) run.hist[i].push([m.p.evals, kvOf(run, m.p.best)]);
    optMigrate(run);
    optProgressSoon();
  } else if (m.type === 'done') {
    run.res[i] = m.res; run.prog[i] = { ...(run.prog[i] || {}), ...m.res, done: true };
    if (run.res.filter(Boolean).length === run.n) optPolishAll();
    else optProgressSoon();
  } else if (m.type === 'polished') {
    run.pol[m.id] = m.res;
    if (run.pol.filter(Boolean).length === run.picks.length) optFinish();
  } else if (m.type === 'error') optFail(i, m.msg);
}
// Migration: höchstens alle 1,5 s den besten Entwurf aller Läufe an die Läufe geben, deren bester schlechter ist
function optMigrate(run) {
  if (run.fallback || run.workers.length < 2 || Date.now() - run.migT < 1500) return;
  run.migT = Date.now();
  const live = run.prog.map((p, j) => (p && !p.done && run.workers[j] ? p : null)), gb = optGlobalBest(live);
  if (!gb) return;
  live.forEach((p, j) => { if (p && p.best && optBetter(gb, p.best) && !optBetter(p.best, gb)) { run.workers[j].postMessage({ type: 'migrate', imm: [gb] }); run.nMig++; } });
}
const kvOf = (run, best) => (best && best.kv && fin(best.kv[run.b.spec.obj.key]) ? best.kv[run.b.spec.obj.key] : -run.K.dir * best.f);
function optFail(i, msg) {
  const run = OPT.run; if (!run) return;
  console.error('Entwurfsrechnung', i, msg);
  run.workers.forEach(w => w.terminate());
  OPT.run = null; $('#op-run').disabled = false; $('#op-stop').hidden = true; $('#op-more').hidden = !OPT.last;
  $('#op-stat').innerHTML = pill('crit', `Rechenfehler: ${msg}`);
}
function optPolishAll() {
  const run = OPT.run; run.phase = 'polish';
  const res = run.res.filter(Boolean);
  run.picks = optPick(res, 4);
  if (!run.picks.length) { optFinish(); return; }
  if (run.fallback || !run.workers.length) {
    // auf der Seite nacheinander, mit Pausen
    let j = 0; const next = () => { if (OPT.run !== run) return; if (j >= run.picks.length) { optFinish(); return; } run.pol[j] = optPolish(run.b.spec, run.picks[j].vals); j++; optProgress(); setTimeout(next, 10); };
    setTimeout(next, 10);
  } else run.picks.forEach((p, j) => run.workers[j % run.workers.length].postMessage({ type: 'polish', id: j, spec: run.b.spec, vals: p.vals }));
  optProgress();
}
function optFinish() {
  const run = OPT.run; if (!run) return;
  run.workers.forEach(w => w.terminate());
  const sugs = run.pol.filter(Boolean).map((p, i) => ({ ...p, id: i + 1 }));
  sugs.sort((a, b) => (optBetter(a, b) ? (optBetter(b, a) ? 0 : -1) : 1));
  // nach dem Aufräumen können zwei Vorschläge gleich sein
  const seen = new Set(), uniq = sugs.filter(s => { const k = JSON.stringify(s.vals); if (seen.has(k)) return false; seen.add(k); return true; });
  const res = run.res.filter(Boolean), stats = { ms: Date.now() - run.t0, evals: run.prog.reduce((s, p) => s + (p ? p.evals : 0), 0), full: run.prog.reduce((s, p) => s + (p ? p.full : 0), 0), n: run.n, restarts: res.reduce((s, r) => s + (r.restarts || 0), 0), mig: run.nMig, cont: run.b.cont || 0 };
  OPT.res = { sugs: uniq, b: run.b, key: run.key, stats, K: run.K, at: Date.now(), hist: run.hist, diag: optDiagMerge(res.map(r => r.diag)), arch: res.flatMap(r => r.arch || []).concat(uniq.map(u => ({ vals: u.vals, kv: u.kv, cv: optConsList(run.b).map(c => (c.kenn ? u.cv[c.key] : u.chk[c.key])), viol: u.viol, f: u.f }))) };
  // Startpunkte fürs Weiterrechnen: die besten verschiedenen Entwürfe aller Läufe (nach dem Aufräumen zuerst)
  const all = [], seenK = new Set();
  for (const s of uniq) { const k = optKey(s.vals); if (!seenK.has(k)) { seenK.add(k); all.push({ vals: s.vals, viol: s.viol, f: s.f }); } }
  const arch = res.flatMap(r => r.arch || []).sort((a, b) => (optBetter(a, b) ? (optBetter(b, a) ? 0 : -1) : 1));
  for (const a of arch) { if (all.length >= 14) break; if (!seenK.has(a.key)) { seenK.add(a.key); all.push({ vals: a.vals, viol: a.viol, f: a.f }); } }
  OPT.last = { init: all.map(a => a.vals), cont: run.b.cont || 0 };
  // gemessene Rechenzeit je Entwurf (je Lauf) für die Zeitschätzung
  const evMax = Math.max(1, ...run.prog.map(p => (p ? p.evals : 0)));
  if (!run.stopReq && evMax > 100) { OPT.cfg.msEval = Math.round(10 * (Date.now() - run.t0) / evMax) / 10; optCfgSave(); }
  OPT.run = null; $('#op-run').disabled = false; $('#op-stop').hidden = true;
  optProgress(true); optRenderSide(); optRenderRes();
  // ohne zulässigen Entwurf: vom nächstbesten Entwurf aus prüfen, welche freie Größe noch hilft
  const r0 = OPT.res;
  if (uniq.length && !uniq.some(x => x.feasible)) optInfluenceAsync(r0.b.spec, uniq[0].vals, res2 => { if (OPT.res === r0 && res2) { r0.infl = res2; optRenderDiag(); } }, optLockedVars(r0.b));
}
function optStop() {
  const run = OPT.run; if (!run) return;
  run.stopReq = true; run.workers.forEach(w => w.postMessage({ type: 'stop' }));
  $('#op-stop').disabled = true; setTimeout(() => { $('#op-stop').disabled = false; }, 800);
}
function optProgressSoon() { if (OPT.t) return; OPT.t = setTimeout(() => { OPT.t = 0; optProgress(); }, 200); }
function optProgress(final) {
  const run = OPT.run, res = OPT.res, el = $('#op-stat');
  if (!run && !final) return;
  const K = run ? run.K : res.K, key = K.key, hist = run ? run.hist : res.hist;
  if (run) {
    const ev = run.prog.reduce((s, p) => s + (p ? Math.min(p.evals, p.budget) : 0), 0), tot = run.n * run.b.spec.budget;
    const frac = run.phase === 'polish' ? 1 : clamp(ev / tot, 0, 1), sec = (Date.now() - run.t0) / 1000;
    $('#op-bar').style.width = (run.phase === 'polish' ? 100 : frac * 100).toFixed(1) + '%';
    const bests = run.prog.filter(Boolean).map(p => p.best).filter(b => b && fin(b.f));
    const best = bests.length ? bests.reduce((a, b) => (optBetter(b, a) ? b : a)) : null;
    const left = frac > 0.05 && frac < 1 ? Math.max(1, sec / frac - sec) : null;
    el.innerHTML = run.phase === 'polish'
      ? `<span>Vorschläge aufräumen: jede Änderung einzeln prüfen …</span>`
      : `<span>${nf(ev, 0)} von ${nf(tot, 0)} Rechnungen · ${nf(sec, 0)} s${left ? ` · noch etwa ${nf(left, 0)} s` : ''}${run.nMig ? ` · ${nf(run.nMig, 0)}× Austausch` : ''}</span><span>${best ? (best.viol <= OPT_EPS ? `bester zulässiger Entwurf: <b>${esc(kvText(key, kvOf(run, best)))}</b>` : `noch keiner zulässig · am nächsten dran: ${optViolText(run.b, best)}`) : ''}</span>`;
  } else {
    $('#op-bar').style.width = '100%';
    const st = res.stats, extra = [st.restarts ? `${nf(st.restarts, 0)} Neustarts nach Stillstand` : '', st.mig ? `${nf(st.mig, 0)}× Austausch zwischen den Läufen` : '', st.cont ? `${st.cont}. Fortsetzung` : ''].filter(Boolean).join(', ');
    el.innerHTML = `<span>Fertig: ${nf(st.evals, 0)} Rechnungen in ${nf(st.ms / 1000, 0)} s (${st.n} ${st.n > 1 ? 'Läufe' : 'Lauf'}${extra ? '; ' + extra : ''})</span>`;
  }
  // Verlauf: bester zulässiger Wert je Lauf über den Rechnungen
  const series = hist.map((h, i) => ({ name: `Lauf ${i + 1}`, c: i + 1, pts: h.slice() })).filter(s => s.pts.length);
  const ch = $('#ch-op');
  if (!series.length) { ch.innerHTML = `<p class="note">${run ? 'Noch kein zulässiger Entwurf – die Suche verringert zuerst die Verletzung der Bedingungen.' : 'Kein zulässiger Entwurf gefunden. Woran es liegt, steht unter „Vorschläge“.'}</p>`; return; }
  const all = series.flatMap(s => s.pts.map(p => p[1])), cur = R ? kennValue(R, key) : NaN;
  let lo = Math.min(...all), hi = Math.max(...all); if (fin(cur) && run) { lo = Math.min(lo, cur); hi = Math.max(hi, cur); }
  if (!(hi > lo)) { hi = lo + Math.max(1e-3, Math.abs(lo) * 0.02); lo -= Math.max(1e-3, Math.abs(lo) * 0.02); }
  const pad = (hi - lo) * 0.08, xMax = Math.max(...series.flatMap(s => s.pts.map(p => p[0])), 10);
  lineChart(ch, { h: 200, ml: 56, title: `${K.l} des besten zulässigen Entwurfs`, x: { min: 0, max: xMax, title: 'Rechnungen je Lauf' }, y: { min: lo - pad, max: hi + pad, fmt: v => nf(v, K.d), title: K.u }, series, hlines: fin(cur) ? [{ y: cur, label: 'jetzt' }] : [] });
}

/* ---------- Was noch fehlt: verletzte Anforderungen des besten Entwurfs, Diagnose nach der Suche ---------- */
// Anforderungen in der Reihenfolge des Rechenkerns: erst Ergebnis-Anforderungen, dann Grundbedingungen
function optConsList(b) {
  return b.cons.map(c => ({ key: c.key, l: c.l, txt: c.txt, min: c.min, max: c.max, kenn: true }))
    .concat(DESIGN_CHECKS.filter(d => b.spec.checks.includes(d.key)).map(d => ({ key: d.key, l: d.l, kenn: false })));
}
function optViolText(b, best) {
  const list = optConsList(b), cv = best.cv || [], out = [];
  list.forEach((c, j) => { if (!(cv[j] > OPT_EPS)) return; out.push({ d: cv[j], t: c.kenn ? `${esc(c.l)} <b>${esc(kvText(c.key, best.kv[c.key]))}</b> (gefordert ${esc(c.txt)})` : best.sub && best.sub[c.key] && best.sub[c.key].length ? `${esc(c.l.split(':')[0])}: <b>${esc(best.sub[c.key].join(', '))}</b>` : esc(c.l) }); });
  if (!out.length) return '–';
  out.sort((a, b) => b.d - a.d);
  return out.slice(0, 3).map(o => o.t).join(' · ') + (out.length > 3 ? ` · und ${out.length - 3} weitere` : '');
}
function optRenderDiag() {
  const res = OPT.res, box = $('#op-diag');
  if (!res || !res.diag || res.sugs.some(s => s.feasible)) { box.hidden = true; box.innerHTML = ''; return; }
  const list = optConsList(res.b), D = res.diag, arch = (res.arch || []).filter(a => a.cv && a.cv.length === list.length), ok = d => d != null && d <= OPT_EPS;
  // nie erreichte Anforderungen; die übrigen gelten als „erfüllt“, wenn alle erreichbaren erfüllt sind
  const never = list.map((c, j) => !!(D[j] && D[j].n && D[j].best > OPT_EPS)), anyNever = never.some(Boolean);
  const restOk = anyNever && arch.some(a => list.every((c, i) => never[i] || ok(a.cv[i])));
  const rows = [];
  list.forEach((c, j) => {
    const Dj = D[j]; if (!Dj || !Dj.n) return;
    const alone = !never[j] && !anyNever && !arch.some(a => list.every((cc, i) => ok(a.cv[i])));
    if (!never[j] && !alone) return;
    // bester Wert unter Entwürfen, die alle übrigen erreichbaren Anforderungen erfüllen
    let bo = null; for (const a of arch) if (list.every((cc, i) => i === j || never[i] || ok(a.cv[i])) && (!bo || a.cv[j] < bo.cv[j])) bo = a;
    const flat = c.kenn ? (fin(Dj.lo) && fin(Dj.hi) && Math.abs(Dj.hi - Dj.lo) <= 1e-9 * Math.max(1, Math.abs(Dj.hi))) : Math.abs(Dj.dhi - Dj.dlo) <= 1e-9;
    const val = v => (c.kenn && fin(v) ? kvText(c.key, v) : '–');
    const sb = res.sugs[0] && res.sugs[0].sub && res.sugs[0].sub[c.key], bauTxt = sb && sb.length ? ` Beim nächstbesten Entwurf: ${sb.map(i => i.txt).join('; ')}.` : '';
    const why = (never[j]
      ? (flat ? 'hängt nicht von den freien Größen ab: die Eingaben dahinter sind festgehalten oder nicht frei' : `nie erreicht; ${c.kenn && fin(Dj.lo) ? `gefundener Bereich ${kvText(c.key, Dj.lo)} bis ${kvText(c.key, Dj.hi)}` : 'in keinem gerechneten Entwurf erfüllt'}.`)
      : 'einzeln erreichbar, aber nicht zusammen mit den übrigen Anforderungen.') + bauTxt;
    const c3 = bo ? (c.kenn ? val(bo.kv[c.key]) : ok(bo.cv[j]) ? 'erfüllt' : 'verletzt') : '–';
    const c4 = c.kenn ? val(Dj.bestV) : Dj.best <= OPT_EPS ? 'erfüllt' : 'nie erfüllt';
    rows.push({ d: never[j] ? 2 + Dj.best : 1, html: `<tr><td class="c-l">${esc(c.l)}</td><td class="n">${c.kenn ? esc(c.txt) : 'muss gelten'}</td><td class="n"><b>${esc(c3)}</b></td><td class="n">${esc(c4)}</td><td>${esc(why)}</td></tr>` });
  });
  if (!rows.length) { box.hidden = true; return; }
  rows.sort((a, b) => b.d - a.d);
  const lead = anyNever
    ? `${restOk ? 'Die übrigen Anforderungen lassen sich zusammen erfüllen; ' : ''}an ${rows.length === 1 ? 'dieser Anforderung' : 'diesen Anforderungen'} scheitert die Suche.`
    : 'Jede Anforderung ist für sich erreichbar, aber nicht alle zugleich.';
  box.hidden = false;
  box.innerHTML = `<h3 class="first">Warum kein zulässiger Entwurf?</h3>
    <p class="note">${esc(lead)} Ausgewertet sind alle ${nf(res.stats.full, 0)} vollständig gerechneten Entwürfe. Spalte „bester Wert, übrige erfüllt“: bester Entwurf, der alle anderen erreichbaren Anforderungen einhält. Liegt selbst der beste Wert überhaupt nicht im geforderten Bereich, ist die Anforderung mit den freien Größen und ihren Suchbereichen vermutlich nicht erreichbar: Anforderung lockern, mehr Größen freigeben oder Bereiche erweitern. Sonst hilft „Weiterrechnen“ oder eine gründlichere Stufe.</p>
    <div class="table-wrap"><table class="data op-diag-t"><thead><tr><th>Anforderung</th><th class="n">gefordert</th><th class="n">bester Wert, übrige erfüllt</th><th class="n">bester Wert überhaupt</th><th>Befund</th></tr></thead><tbody>${rows.map(r => r.html).join('')}</tbody></table></div>
    <h4 class="op-h4">Was vom nächstbesten Entwurf aus noch hilft</h4><div class="op-why">${res.infl ? optWhyHTML(res.b, res.infl) : '<p class="note">Prüfe die freien Größen einzeln …</p>'}</div>`;
}

/* ---------- Vorschläge anzeigen und übernehmen ---------- */
function optOutline(list, W) {
  // Flügel und Höhenleitwerk von oben, an der Flügelvorderkante der Wurzel ausgerichtet
  const geo = list.map(({ C }) => { const g = C.bal.g, x0 = g.xLE0; return { pf: C.pf, tg: C.tail, xht: g.xhLE - x0, nose: -x0, tail: (fin(g.xTail) ? g.xTail : g.xhLE + C.tail.ch) - x0 }; });
  const bmax = Math.max(...geo.map(o => o.pf.b)), xmin = Math.min(...geo.map(o => o.nose)) - 0.03;
  const xmax = Math.max(...geo.map(o => Math.max(o.xht + o.tg.ch, o.tail, o.pf.xLE(1) + o.pf.ct, o.pf.cr))) + 0.03;
  const sc = Math.min((W - 12) / bmax, 170 / (xmax - xmin)), H = Math.ceil((xmax - xmin) * sc + 10), cx = W / 2, X = y => (cx + y * sc).toFixed(1), Y = x => (5 + (x - xmin) * sc).toFixed(1);
  let s = `<svg class="viz op-outline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grundriss: jetzt gestrichelt, Vorschlag ausgezogen">`;
  geo.forEach((o, i) => {
    const cls = list[i].cls, pf = o.pf, N = 24, half = sg => { let d = ''; for (let k = 0; k <= N; k++) { const e = k / N; d += (k ? 'L' : 'M') + X(sg * e * pf.b / 2) + ' ' + Y(pf.xLE(e)); } for (let k = N; k >= 0; k--) { const e = k / N; d += 'L' + X(sg * e * pf.b / 2) + ' ' + Y(pf.xLE(e) + pf.chordAt(e)); } return d + 'Z'; };
    s += `<g class="${cls}"><line x1="${X(0)}" x2="${X(0)}" y1="${Y(o.nose)}" y2="${Y(o.tail)}"/><path d="${half(1)}"/><path d="${half(-1)}"/><rect x="${X(-o.tg.bh / 2)}" y="${Y(o.xht)}" width="${(o.tg.bh * sc).toFixed(1)}" height="${(o.tg.ch * sc).toFixed(1)}"/></g>`;
  });
  return s + '</svg>';
}
const OPT_SHOW = ['mass', 'pCruise', 'tExc', 'socMin', 'sail', 'vfWing'];
function optRenderRes() {
  const res = OPT.res, box = $('#op-res'); if (!res) return;
  const K = res.K, key = K.key, spec = res.b.spec, stale = keyOf() !== res.key && !(OPT.undo && OPT.undo.key === keyOf());
  const base = res.baseR || (res.baseR = lazyResult(spec.base, spec.comps));
  const cur = kennValue(base, key), curC = base.C;
  optRenderDiag();
  if (!res.sugs.length) { box.innerHTML = '<p class="note">Kein Vorschlag gefunden.</p>'; return; }
  const feas = res.sugs.filter(s => s.feasible).length;
  $('#op-res-sub').textContent = feas
    ? `${res.sugs.length} ${res.sugs.length > 1 ? 'verschiedene Entwürfe' : 'Entwurf'}, ${feas === res.sugs.length ? 'alle zulässig' : feas + ' zulässig'}. Gezeigt sind nur Änderungen, die zählen: jede andere Größe bleibt beim jetzigen Wert, wenn das kaum Ziel kostet. ${stale ? 'Seit der Rechnung wurde das Modell geändert – die Vorschläge beziehen sich auf den Stand davor.' : ''}`
    : 'Kein zulässiger Entwurf gefunden. Gezeigt ist der Entwurf, der den Anforderungen am nächsten kommt; die Tabelle darüber zeigt, woran es liegt.';
  const W = Math.min(300, Math.max(220, (box.clientWidth || 640) - 40));
  box.innerHTML = res.sugs.map((s, i) => {
    const C = s.C || (s.C = buildCase({ ...spec.base, ...s.vals }, spec.comps));
    const d = s.kv[key] - cur, better = fin(d) && K.dir * d > 0;
    const applied = OPT.undo && OPT.undo.id === s.id && OPT.undo.at === res.at;
    // Zahlen bleiben zusammen, lange Auswahltexte (Werkstoffe, Profile) dürfen umbrechen
    const cell = (k, v) => (isNumParam(k) ? `<span class="nw">${esc(pvText(k, v))}</span>` : esc(pvText(k, v)));
    const diff = s.diff.map(x => `<tr><td class="c-l"><button type="button" class="linkbtn" data-jump="${esc(x.k)}">${esc(PM[x.k] ? PM[x.k].l : x.k)}</button>${x.edge ? ` <span class="op-edge" title="Am Rand des Suchbereichs: ein weiterer Bereich könnte mehr bringen">${x.edge === 'lo' ? 'untere Grenze' : 'obere Grenze'}</span>` : ''}</td><td class="c-f">${cell(x.k, x.from)}</td><td class="c-t"><b>${cell(x.k, x.to)}</b></td></tr>`).join('');
    const showK = [...new Set([key, ...OPT_SHOW, ...spec.cons.map(c => c.key)])].filter(k => KENN_BY[k] && k in s.kv);
    const kv = showK.map(k => { const c = spec.cons.find(c => c.key === k), v = s.kv[k], b0 = kennValue(base, k), st = c ? rangeState(v, c.min, c.max, S.meta.knapp || 5, OPT_INT.has(k)).st : null; return `<div class="op-kv${st ? ' ' + st : ''}"><span class="k">${esc(KENN_BY[k].l)}</span><span class="v">${esc(kvText(k, v))}</span>${fin(b0) && Math.abs(b0 - v) > 1e-9 ? `<span class="s">jetzt ${esc(kvText(k, b0))}</span>` : ''}</div>`; }).join('');
    const failed = DESIGN_CHECKS.filter(c => spec.checks.includes(c.key) && s.chk[c.key] > OPT_EPS).map(c => pill('crit', s.sub && s.sub[c.key] && s.sub[c.key].length ? `${c.key === 'build' ? 'Nicht baubar' : c.l.split(':')[0]}: ${s.sub[c.key].map(i => i.l).join(', ')}` : c.l));
    const consBad = spec.cons.filter(c => s.cv[c.key] > OPT_EPS).map(c => pill('crit', `${KENN_BY[c.key].l}: ${kvText(c.key, s.kv[c.key])}`));
    return `<article class="op-card${s.feasible ? '' : ' bad'}${applied ? ' applied' : ''}">
      <header><div><h3>${i === 0 ? 'Bester Vorschlag' : `Alternative ${i}`}</h3>${s.feasible ? pill('good', 'erfüllt alle Bedingungen') : pill('crit', 'Bedingungen verletzt')}</div>
        <div class="op-obj"><span class="k">${esc(K.l)}</span><span class="v">${esc(kvText(key, s.kv[key]))}</span>${fin(d) && Math.abs(d) > 1e-12 ? `<span class="d ${better ? 'good' : 'bad'}">${esc(nfs(d, K.d))}${K.u ? ' ' + esc(K.u) : ''} gegenüber jetzt</span>` : '<span class="d">wie jetzt</span>'}</div></header>
      ${failed.length || consBad.length ? `<div class="op-fail">${consBad.join('')}${failed.join('')}</div>` : ''}
      <div class="op-body"><div class="op-pic">${optOutline([{ C: curC, cls: 'cur' }, { C, cls: 'sug' }], W)}<div class="op-leg"><span class="cur">jetzt</span><span class="sug">Vorschlag</span></div></div>
        <div class="op-chg"><div class="op-chg-h">${s.diff.length} ${s.diff.length === 1 ? 'Änderung' : 'Änderungen'}: jetzt → Vorschlag</div><div class="table-wrap"><table class="data op-diff"><thead><tr><th>${s.diff.length} ${s.diff.length === 1 ? 'Änderung' : 'Änderungen'}</th><th>jetzt</th><th>Vorschlag</th></tr></thead><tbody>${diff || '<tr><td colspan="3" class="muted">keine – der jetzige Entwurf ist schon der beste gefundene</td></tr>'}</tbody></table></div></div></div>
      <div class="op-kvs">${kv}</div>
      <footer>${applied ? `<span class="pill good"><span class="ic" aria-hidden="true">✓</span>übernommen</span><button type="button" class="btn sm" data-opundo="1">Rückgängig</button>` : `<button type="button" class="btn primary sm" data-opapply="${i}"${s.diff.length ? '' : ' disabled'}>Übernehmen</button>`}</footer>
    </article>`;
  }).join('') + `<p class="note op-foot">Die Suche rechnet mit dem Auslegungstag (klarer Himmel) wie die Übersicht. Flattern aller Fälle und Ruderflattern prüft sie nicht laufend – nach dem Übernehmen in Struktur und Robustheit nachsehen. Werte am Rand des Suchbereichs sind markiert.</p>`;
}
function optApply(i) {
  const res = OPT.res, s = res && res.sugs[i]; if (!s) return;
  const prev = {};
  for (const x of s.diff) { prev[x.k] = S.params[x.k]; S.params[x.k] = x.to; }
  fillForms(); markPreset(); schedule();
  OPT.undo = { id: s.id, at: res.at, prev, key: null };
  setTimeout(() => { if (OPT.undo) OPT.undo.key = keyOf(); optRenderRes(); }, 0);
  toast(`Vorschlag übernommen: ${s.diff.length} ${s.diff.length === 1 ? 'Eingabe' : 'Eingaben'} geändert.`);
}
function optUndo() {
  const u = OPT.undo; if (!u) return;
  for (const [k, v] of Object.entries(u.prev)) S.params[k] = v;
  OPT.undo = null; fillForms(); markPreset(); schedule();
  setTimeout(optRenderRes, 0); toast('Vorschlag zurückgenommen.');
}

/* ---------- Ereignisse ---------- */
RENDER.entwurf = () => { optRenderSide(); if (OPT.res && !OPT.run) optRenderRes(); };
$('#op-obj').addEventListener('change', e => { OPT.cfg.obj = e.target.value; optCfgSave(); optRenderSide(); });
$('#op-reserve').addEventListener('change', e => { OPT.cfg.reserve = e.target.checked; optCfgSave(); });
$('#op-run').addEventListener('click', () => optStart(false));
$('#op-more').addEventListener('click', () => optStart(true));
$('#op-why').addEventListener('click', optWhy);
$('#op-stop').addEventListener('click', optStop);
document.addEventListener('change', e => {
  const t = e.target; if (!t.closest || !t.closest('#v-entwurf')) return;
  if (t.dataset.opchk) { const k = t.dataset.opchk, l = OPT.cfg.checks.filter(x => x !== k); if (t.checked) l.push(k); OPT.cfg.checks = l; }
  else if (t.dataset.opgrp) { const g = t.dataset.opgrp, l = OPT.cfg.groups.filter(x => x !== g); if (t.checked) l.push(g); OPT.cfg.groups = l; }
  else if (t.dataset.opvar) { const k = t.dataset.opvar, l = OPT.cfg.off.filter(x => x !== k); if (!t.checked) l.push(k); OPT.cfg.off = l; }
  else if (t.name === 'op-effort') OPT.cfg.effort = t.value;
  else return;
  optCfgSave(); optRenderSide();
});
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('[data-opapply]'); if (a) { optApply(Number(a.dataset.opapply)); return; }
  const u = e.target.closest && e.target.closest('[data-opundo]'); if (u) optUndo();
});
optCfgLoad();

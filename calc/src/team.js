/* ===================================================================
   Teamarbeit (nur auf der Cloudflare-Seite)
   - Anmelden mit Name und gemeinsamem Team-Passwort (keine Konten)
   - Modelle des Teams: Liste, neu aus dem jetzigen Stand oder aus einer
     Datei, kopieren, umbenennen, Papierkorb
   - offenes Modell: WebSocket zum Durable Object des Modells. Jede Änderung
     geht als Pfad und Wert sofort an alle (gleiche Pfade wie worker/index.js):
       p/<Eingabe>  c/<Komponente>[/<Feld>]  co  r/<Ziel>  n/<Ziel>/<id>
       gen  wx  meta/<Schlüssel>  preset
     Verschiedene Stellen gelten beide; an derselben Stelle gilt, was der
     Server später erhält. Eine eigene, noch nicht bestätigte Änderung
     überdeckt fremde an derselben Stelle (sie kommt beim Server danach an).
   - wer wo arbeitet (Kopfleiste, Ansichten, Felder), Verlauf mit
     Rückgängig, gespeicherte Stände
   - ohne Verbindung geht die Arbeit weiter; Änderungen werden beim
     Wiederverbinden nachgereicht
   - PVGIS-Jahr über den Worker laden
   =================================================================== */
const TEAM_STORE = 'waldbrand-uav-team-v2', TEAM_BACKUP = 'waldbrand-uav-team-local';
const TM = { key: '', ok: false, models: null, err: '', room: null, sid: Math.random().toString(36).slice(2, 10), opId: 0, hist: [], histMore: false, vers: [], view: '', field: '', listTimer: 0, presTimer: 0, armed: null, renaming: null, compDirty: false };
const LEAD0 = (() => { const el = document.getElementById('lead'); return el ? el.textContent : ''; })();
function teamStore(o) { try { const cur = JSON.parse(localStorage.getItem(TEAM_STORE) || '{}') || {}; localStorage.setItem(TEAM_STORE, JSON.stringify({ ...cur, ...o })); } catch (e) { /* ignorieren */ } }
function teamStored() { try { return JSON.parse(localStorage.getItem(TEAM_STORE) || '{}') || {}; } catch (e) { return {}; } }
const tmSay = (t, id) => { const el = $(id || '#tm-msg'); if (el) el.textContent = t || ''; };
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const avatar = u => `<span class="tm-av" style="background:${esc(u.color || '#6b7c8a')}" title="${esc(u.name)}">${esc(initials(u.name))}</span>`;
function when(ms) {
  if (!ms) return '';
  const d = Date.now() - ms, t = new Date(ms);
  if (d < 60e3) return 'gerade eben';
  if (d < 3600e3) return `vor ${Math.round(d / 60e3)} min`;
  if (d < 6 * 3600e3) return `vor ${Math.round(d / 3600e3)} h`;
  return t.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
const viewName = v => { const a = document.querySelector(`#views a[data-v="${v}"]`); return a ? a.firstChild.textContent.trim() : v || '–'; };

/* ---------- Server-Schnittstelle ---------- */
async function api(path, opts = {}) {
  let res;
  try { res = await fetch('/api/team' + path, { method: opts.method || 'GET', headers: { 'content-type': 'application/json', 'x-team-key': opts.key ?? TM.key }, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
  catch (e) { const err = new Error('Server nicht erreichbar. Seid ihr online?'); err.status = 0; throw err; }
  let data = null; try { data = await res.json(); } catch (e) { data = null; }
  if (!data) { const err = new Error('Der Team-Speicher antwortet nicht. Die Teamarbeit gibt es nur auf der gehosteten Seite.'); err.status = res.status; throw err; }
  if (!res.ok) { const err = new Error(data.error || 'Fehler ' + res.status); err.status = res.status; if (res.status === 401) teamLoggedOut(err.message); throw err; }
  return data;
}
function teamLoggedOut(msg) { TM.ok = false; TM.key = ''; teamStore({ key: '' }); if (TM.room) teamCloseRoom(true); renderTeam(); tmSay(msg || '', '#tm-login-msg'); }

/* ---------- Dokument als Pfad-Wert-Paare ---------- */
const WXS = { ref: null, s: '' };
function teamKV(s) {
  const kv = new Map();
  for (const [k, v] of Object.entries(s.params)) kv.set('p/' + k, JSON.stringify(v));
  for (const c of s.comps) kv.set('c/' + c.id, JSON.stringify(c));
  kv.set('co', JSON.stringify(s.comps.map(c => c.id)));
  for (const [t, r] of Object.entries(s.req)) kv.set('r/' + t, JSON.stringify(r));
  for (const [t, l] of Object.entries(s.notes)) for (const n of l) kv.set(`n/${t}/${n.id}`, JSON.stringify(n));
  if (s.gen != null) kv.set('gen', JSON.stringify(s.gen));
  if (s.wx != null) { if (WXS.ref !== s.wx) { WXS.ref = s.wx; WXS.s = JSON.stringify(s.wx); } kv.set('wx', WXS.s); }
  for (const [k, v] of Object.entries(s.meta)) kv.set('meta/' + k, JSON.stringify(v));
  kv.set('preset', JSON.stringify(s.preset || ''));
  return kv;
}
// Unterschiede als Änderungen; bei Komponenten nur die geänderten Felder
function teamDiff(a, b) {
  const ops = [];
  for (const [p, s] of b) {
    const o = a.get(p); if (o === s) continue;
    if (o !== undefined && p.startsWith('c/')) {
      const x = JSON.parse(o), y = JSON.parse(s);
      for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) ops.push({ path: `${p}/${f}`, val: y[f] === undefined ? null : y[f] });
    } else ops.push({ path: p, val: JSON.parse(s) });
  }
  for (const p of a.keys()) if (!b.has(p)) ops.push({ path: p, val: null });
  return ops;
}
// Eine Änderung auf den Zustand anwenden (mit denselben Prüfungen wie beim Laden); Rückgabe: was neu zu zeichnen ist
function teamApply(path, val) {
  const i = path.indexOf('/'), a = i < 0 ? path : path.slice(0, i), rest = i < 0 ? '' : path.slice(i + 1);
  if (a === 'p') {
    if (!(rest in DEFAULT_PARAMS)) return null;
    const d = DEFAULT_PARAMS[rest]; let v;
    if (typeof d === 'number') { v = Number(val); if (!fin(v)) return null; } else if (typeof d === 'boolean') v = !!val; else v = String(val ?? '');
    const old = S.params[rest]; S.params[rest] = v;
    // Feld mit dem Fokus nachziehen, solange dort nichts Eigenes getippt steht (es zeigt noch den alten Wert)
    const el = document.activeElement;
    if (el && el.dataset && el.dataset.k === rest && el.type !== 'checkbox' && el.value === String(old)) el.value = String(v);
    return 'p';
  }
  if (a === 'c') {
    const j = rest.indexOf('/'), id = j < 0 ? rest : rest.slice(0, j), f = j < 0 ? null : rest.slice(j + 1), k = S.comps.findIndex(c => c.id === id);
    if (f) { if (k < 0) return null; const c = { ...S.comps[k] }; if (val === null) delete c[f]; else c[f] = val; S.comps[k] = sanitizeComp(c); return 'c'; }
    if (val === null) { if (k >= 0) S.comps.splice(k, 1); return 'c'; }
    if (!val || typeof val !== 'object') return null;
    const c = sanitizeComp({ ...val, id }); if (k >= 0) S.comps[k] = c; else S.comps.push(c); return 'c';
  }
  if (a === 'co') { const ord = Array.isArray(val) ? val.map(String) : [], pos = id => { const n = ord.indexOf(id); return n < 0 ? 1e9 : n; }; S.comps = S.comps.map((c, n) => [c, n]).sort((x, y) => pos(x[0].id) - pos(y[0].id) || x[1] - y[1]).map(x => x[0]); return 'c'; }
  if (a === 'r') { if (val === null) delete S.req[rest]; else { const s = sanitizeReq({ [rest]: val }); if (s[rest]) S.req[rest] = s[rest]; else delete S.req[rest]; } return 'r'; }
  if (a === 'n') {
    const j = rest.lastIndexOf('/'), t = rest.slice(0, j), id = rest.slice(j + 1);
    let l = (S.notes[t] || []).filter(n => n.id !== id);
    if (val !== null) { const s = sanitizeNotes({ [t]: [val] }); if (s[t]) l = l.concat(s[t]); }
    l.sort((x, y) => (x.ts || 0) - (y.ts || 0)); if (l.length) S.notes[t] = l; else delete S.notes[t]; return 'r';
  }
  if (a === 'gen') { S.gen = val === null ? null : sanitize({ params: S.params, gen: val }).gen; return 'w'; }
  if (a === 'wx') { S.wx = val === null ? null : sanitizeWx(val); return 'w'; }
  if (a === 'meta') { if (rest === 'knapp') S.meta.knapp = fin(Number(val)) ? clamp(Number(val), 0.5, 50) : 5; else if (rest === 'name') S.meta.name = TXT(val, 120); else return null; return 'm'; }
  if (a === 'preset') { S.preset = typeof val === 'string' ? val : ''; return 'm'; }
  return null;
}

/* ---------- Abgleich ---------- */
function teamSend(m) { const r = TM.room; if (r && r.ws && r.state === 'open' && r.ws.readyState === 1) { r.ws.send(JSON.stringify(m)); return true; } return false; }
// Eigene Änderungen seit dem letzten Abgleich verschicken (nach jeder Rechnung und vor fremden Änderungen)
function teamFlush() {
  const r = TM.room; if (!r || !r.kv) return;
  const kv = teamKV(S), ops = teamDiff(r.kv, kv);
  if (!ops.length) return;
  r.kv = kv;
  for (const o of ops) { o.id = ++TM.opId; r.pending.set(o.path, { id: o.id, val: o.val }); }
  teamSend({ t: 'ops', ops }); r.sumDirty = true;
  teamBar();
}
const UPDATERS = { p: () => { fillForms(); markPresetFromState(); }, c: () => teamComps(), r: () => reqRefresh(), w: () => onWeatherChange(), m: () => { markPresetFromState(); teamBar(); } };
function teamComps() { const tb = $('#tbl-comps'); if (tb && tb.contains(document.activeElement)) { TM.compDirty = true; return; } TM.compDirty = false; renderCompTable(); }
function teamOnOps(m) {
  const r = TM.room; if (!r || !r.kv) return;
  teamFlush();
  const mine = m.sid === TM.sid, kinds = new Set(), flash = [];
  for (const o of m.ops) {
    if (mine && o.id != null) { const p = r.pending.get(o.path); if (p && p.id === o.id) r.pending.delete(o.path); continue; }
    if (!mine && r.pending.has(o.path)) continue; // eigene Änderung ist noch unterwegs und gilt danach
    const cm = /^c\/([^/]+)$/.exec(o.path);
    if (cm && !mine) {
      // ganze Komponente: gelöscht schlägt meine offenen Feldänderungen (der Server verwirft sie), sonst kommen sie obendrauf
      const mineF = [...r.pending].filter(([p]) => p.startsWith(o.path + '/'));
      const k = teamApply(o.path, o.val); if (k) kinds.add(k);
      if (o.val === null) mineF.forEach(([p]) => r.pending.delete(p)); else mineF.forEach(([p, v]) => teamApply(p, v.val));
    } else { if (mine) r.pending.delete(o.path); const k = teamApply(o.path, o.val); if (k) kinds.add(k); }
    if (!mine && o.path.startsWith('p/')) flash.push(o.path.slice(2));
    if (!mine && o.path.startsWith('c/')) flash.push('c:' + o.path.split('/')[1]);
  }
  r.seq = Math.max(r.seq || 0, ...m.ops.map(o => o.seq || 0));
  if (kinds.size) {
    r.kv = teamKV(S); if (S.meta.name) r.name = S.meta.name;
    for (const k of kinds) { try { UPDATERS[k](); } catch (e) { console.error(e); } }
    invalidateAll(); schedule();
    const u = r.users.find(x => x.sid === m.sid) || { name: m.by, color: '#6b7c8a' };
    if (!mine) teamFlash(flash, u);
    if (m.restore) toast(`${m.by || 'Jemand'} hat den Stand „${m.restore}“ wiederhergestellt.`);
    else if (!mine && kinds.has('c') && !flash.some(f => f.startsWith('c:'))) toast(`${m.by || 'Jemand'} hat die Komponenten geändert.`);
  }
  if (VIEW === 'team') teamHistSoon();
  teamBar();
}
function teamFlash(keys, u) {
  for (const k of [...new Set(keys)].slice(0, 30)) {
    let els;
    if (k.startsWith('c:')) { const i = S.comps.findIndex(c => c.id === k.slice(2)); els = i < 0 ? [] : $$(`#tbl-comps [data-ci="${i}"][data-cf="on"]`).map(x => x.closest('tr')); }
    else els = $$(`.field[data-fk="${k}"]`);
    for (const el of els) {
      if (!el) continue;
      el.style.setProperty('--tp', u.color); el.dataset.tmName = u.name;
      el.classList.remove('tm-flash'); void el.offsetWidth; el.classList.add('tm-flash');
      clearTimeout(el._tmf); el._tmf = setTimeout(() => { el.classList.remove('tm-flash'); if (!el.classList.contains('tm-busy')) delete el.dataset.tmName; }, 2700);
    }
  }
}

/* ---------- Verbindung ---------- */
const b64url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function teamOpen(id, name) {
  if (TM.room && TM.room.id === id) { location.hash = 'team'; return; }
  if (TM.room) teamCloseRoom(true);
  else { try { localStorage.setItem(TEAM_BACKUP, JSON.stringify({ at: Date.now(), s: S })); } catch (e) { /* zu groß */ } }
  TM.room = { id, name: name || '', ws: null, state: 'connecting', kv: null, pending: new Map(), users: [], retry: 0, timer: 0, ping: 0, last: 0, first: true, seq: 0, sumDirty: false, sumAt: 0, sumSent: '' };
  TM.hist = []; TM.vers = []; teamStore({ model: id });
  const u = new URL(location.href); u.searchParams.set('m', id); history.replaceState(null, '', u.pathname + u.search + u.hash);
  teamConnect(); renderTeam();
}
function teamConnect() {
  const r = TM.room; if (!r) return;
  clearTimeout(r.timer); r.state = r.first ? 'connecting' : 'offline';
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/team/models/${encodeURIComponent(r.id)}/ws`;
  let ws;
  try { ws = new WebSocket(url, ['uav-team', 'k.' + b64url(TM.key)]); } catch (e) { teamRetry(); return; }
  r.ws = ws; r.welcomed = false;
  ws.onopen = () => { if (TM.room !== r || r.ws !== ws) return; ws.send(JSON.stringify({ t: 'hello', sid: TM.sid, name: myName(), color: teamStored().color || '', view: VIEW, field: TM.field })); };
  ws.onmessage = e => { if (TM.room !== r || r.ws !== ws) return; r.last = Date.now(); let m; try { m = JSON.parse(e.data); } catch (x) { return; } teamMsg(m); };
  ws.onclose = ev => {
    if (TM.room !== r || r.ws !== ws) return;
    r.ws = null; clearInterval(r.ping);
    if (ev.code === 4001) return; // gelöscht: Meldung kam schon
    if (!r.welcomed) teamCheckAccess(); else teamRetry();
  };
  ws.onerror = () => { /* onclose folgt */ };
}
function teamRetry() {
  const r = TM.room; if (!r) return;
  r.state = 'offline'; r.retry++; teamBar(); renderTeamNow();
  r.timer = setTimeout(teamConnect, [1, 2, 4, 8, 15, 30][Math.min(5, r.retry - 1)] * 1000);
}
// Verbindung kam nicht zustande: Passwort, gelöschtes Modell oder nur das Netz?
async function teamCheckAccess() {
  const r = TM.room;
  try {
    const d = await api('/models'); TM.models = d.models;
    const m = d.models.find(x => x.id === r.id);
    if (!m || m.deleted_at) { teamCloseRoom(true); tmSay(m ? `„${m.name}“ liegt im Papierkorb.` : 'Dieses Modell gibt es nicht (mehr).'); renderTeam(); return; }
  } catch (e) { if (e.status === 401) return; }
  teamRetry();
}
function teamMsg(m) {
  const r = TM.room;
  if (m.t === 'welcome') {
    const first = r.first;
    // eigene Änderungen, die noch nicht beim Server sind (ohne Verbindung oder unbestätigt)
    if (r.kv) { const kv = teamKV(S), more = teamDiff(r.kv, kv); for (const o of more) r.pending.set(o.path, { id: 0, val: o.val }); }
    const local = [...r.pending].map(([path, p]) => ({ path, val: p.val }));
    S = sanitize(m.doc); r.pending.clear();
    const keep = local.filter(o => teamApply(o.path, o.val));
    r.kv = teamKV(sanitize(m.doc)); // Server-Stand; die eigenen Änderungen gehen gleich als Änderungen hinterher
    r.state = 'open'; r.welcomed = true; r.first = false; r.retry = 0; r.seq = m.seq; r.users = m.users || []; TM.sid = m.sid || TM.sid;
    if (m.color) teamStore({ color: m.color });
    r.name = (S.meta && S.meta.name) || r.name;
    refreshAll(); markPresetFromState();
    if (keep.length) { r.kv = teamKV(sanitize(m.doc)); teamFlush(); }
    else r.kv = teamKV(S);
    clearInterval(r.ping); r.ping = setInterval(() => { if (r.ws && r.ws.readyState === 1) { r.ws.send('{"t":"ping"}'); if (Date.now() - r.last > 70e3) r.ws.close(); } }, 25e3);
    if (first) toast(`Teammodell „${r.name || 'ohne Namen'}“ geöffnet. Änderungen gehen sofort an alle, die es offen haben.`);
    else toast(keep.length ? `Wieder verbunden – ${keep.length} Änderung${keep.length > 1 ? 'en' : ''} nachgereicht.` : 'Wieder verbunden.');
    teamSend({ t: 'vlist' }); if (VIEW === 'team') teamSend({ t: 'hist', limit: 200 });
    renderTeam(); teamDecorate();
  } else if (m.t === 'ops') teamOnOps(m);
  else if (m.t === 'pres') { r.users = m.users || []; teamDecorate(); teamBar(); renderTeamNow(); }
  else if (m.t === 'hist') { TM.hist = TM.histReqBefore ? TM.histKeep.concat(m.items) : m.items; TM.histReqBefore = 0; TM.histMore = m.more; renderHist(); }
  else if (m.t === 'vers') { TM.vers = m.items || []; renderVers(); }
  else if (m.t === 'closed') { const n = r.name; teamCloseRoom(true); toast(m.reason || `„${n}“ wurde geschlossen.`); renderTeam(); }
  else if (m.t === 'err') { if (Array.isArray(m.ids)) for (const [p, v] of [...r.pending]) if (m.ids.includes(v.id)) r.pending.delete(p); toast(m.msg || 'Der Server hat eine Änderung abgelehnt.'); }
}
function teamCloseRoom(quiet) {
  const r = TM.room; if (!r) return;
  teamFlush();
  clearTimeout(r.timer); clearInterval(r.ping);
  if (r.ws) { try { r.ws.close(1000, 'bye'); } catch (e) { /* zu */ } }
  TM.room = null; teamStore({ model: '' });
  const u = new URL(location.href); u.searchParams.delete('m'); history.replaceState(null, '', u.pathname + u.search + u.hash);
  $$('.tm-busy').forEach(el => { el.classList.remove('tm-busy'); delete el.dataset.tmName; }); $$('.tm-navdot').forEach(el => el.remove());
  if (!quiet) toast('Modell geschlossen. Ihr arbeitet lokal mit dem letzten Stand weiter.');
  teamBar(); renderTeam();
}

/* ---------- Anwesenheit ---------- */
function teamPres() {
  clearTimeout(TM.presTimer);
  TM.presTimer = setTimeout(() => teamSend({ t: 'pres', view: VIEW, field: TM.field }), 120);
}
function teamDecorate() {
  const r = TM.room, others = r ? r.users.filter(u => u.sid !== TM.sid) : [];
  $$('.field.tm-busy').forEach(el => { el.classList.remove('tm-busy'); if (!el.classList.contains('tm-flash')) delete el.dataset.tmName; });
  $$('.tm-navdot').forEach(el => el.remove());
  for (const u of others) {
    if (u.field) for (const el of $$(`#v-${u.view} .field[data-fk="${u.field}"]`)) { el.classList.add('tm-busy'); el.style.setProperty('--tp', u.color); el.dataset.tmName = u.name; }
    const a = document.querySelector(`#views a[data-v="${u.view}"]`);
    if (a && a.querySelectorAll('.tm-navdot').length < 3) { const d = document.createElement('span'); d.className = 'tm-navdot'; d.style.background = u.color; d.title = `${u.name} ist hier`; a.appendChild(d); }
  }
}
function teamBar() {
  const bar = $('#tm-bar'), r = TM.room; if (!bar) return;
  const lead = $('#lead');
  if (!r) { bar.hidden = true; bar.innerHTML = ''; if (lead) lead.textContent = LEAD0; return; }
  const others = r.users.filter(u => u.sid !== TM.sid), st = r.state, nP = r.pending.size;
  const stTxt = st === 'open' ? (nP ? 'wird übertragen …' : 'verbunden') : st === 'connecting' ? 'verbinde …' : `getrennt${nP ? ` – ${nP} Änderung${nP > 1 ? 'en warten' : ' wartet'}` : ''}`;
  bar.hidden = false;
  bar.innerHTML = `<a class="tm-chip" href="#team" title="Teammodell: ${esc(stTxt)}"><span class="tm-dot ${st}"></span><span class="nm">${esc(r.name || 'Teammodell')}</span></a><span class="tm-avs">${others.slice(0, 4).map(avatar).join('')}${others.length > 4 ? `<span class="tm-av" style="background:var(--muted)">+${others.length - 4}</span>` : ''}</span>`;
  if (lead) lead.textContent = `Teammodell „${r.name || 'ohne Namen'}“: Änderungen gehen sofort an alle, die es offen haben (${stTxt}). Verlauf und gespeicherte Stände in der Ansicht Team.`;
}

/* ---------- Ansicht Team ---------- */
function renderTeam() {
  const ok = TM.ok, r = TM.room;
  $('#tm-login-panel').hidden = ok; $('#tm-me-panel').hidden = !ok;
  $('#tm-me-name').textContent = myName();
  if (!ok && !$('#tm-name').value) $('#tm-name').value = ME.name;
  $('#tm-new').hidden = !ok; $('#tm-new-note').hidden = !ok;
  $('#tm-now-panel').hidden = !r; $('#tm-vers-panel').hidden = !r; $('#tm-hist-panel').hidden = !r;
  renderModels(); renderTeamNow(); renderVers(); renderHist(); teamBar();
}
function sumText(s) {
  if (!s) return '';
  return [fin(s.mass_kg) ? nf(s.mass_kg, 2) + ' kg' : null, fin(s.power_w) ? nf(s.power_w, 0) + ' W' : null, s.sail ? 'SAIL ' + s.sail : null, fin(s.tExc_h) ? `Excess ${nfs(s.tExc_h, 1)} h` : null, s.req && (s.req.ok + s.req.near + s.req.bad) ? `Anforderungen ${s.req.ok} ✓${s.req.near ? ` · ${s.req.near} knapp` : ''}${s.req.bad ? ` · ${s.req.bad} ×` : ''}` : null].filter(Boolean).join(' · ');
}
function renderModels() {
  const box = $('#tm-models'), r = TM.room;
  if (!TM.ok) { box.innerHTML = '<p class="note">Zum Anmelden links Name und Team-Passwort eingeben.</p>'; $('#tm-trash-wrap').hidden = true; return; }
  if (!TM.models) { box.innerHTML = `<p class="note">${esc(TM.err || 'Lade Modelle …')}</p>`; return; }
  const live = TM.models.filter(m => !m.deleted_at), dead = TM.models.filter(m => m.deleted_at);
  const item = m => {
    const open = r && r.id === m.id, ren = TM.renaming === m.id;
    const meta = `geändert ${esc(when(m.updated_at))}${m.updated_by ? ' von ' + esc(m.updated_by) : ''} · angelegt ${esc(new Date(m.created_at).toLocaleDateString('de-DE'))}${m.created_by ? ' von ' + esc(m.created_by) : ''}`;
    const acts = m.deleted_at ? `<button type="button" class="btn sm" data-tm="restore">Wiederherstellen</button>`
      : `${open ? '<span class="pill good"><span class="ic" aria-hidden="true">✓</span>geöffnet</span>' : '<button type="button" class="btn sm primary" data-tm="open">Öffnen</button>'}<button type="button" class="btn sm" data-tm="copy">Kopieren</button><button type="button" class="btn sm" data-tm="rename">Umbenennen</button><button type="button" class="btn sm${TM.armed === m.id ? ' danger' : ''}" data-tm="del">${TM.armed === m.id ? 'Wirklich in den Papierkorb?' : 'Löschen'}</button>`;
    return `<div class="tm-model${open ? ' open' : ''}" data-mid="${esc(m.id)}">${ren ? `<div class="ren"><input type="text" maxlength="120" value="${esc(m.name)}" aria-label="Neuer Name" data-tm-ren><button type="button" class="btn sm primary" data-tm="rename-ok">Speichern</button><button type="button" class="btn sm" data-tm="rename-no">Abbrechen</button></div>` : `<div class="nm">${esc(m.name)}</div>`}<div class="meta">${meta}</div>${m.summary ? `<div class="sum">${esc(sumText(m.summary))}</div>` : ''}<div class="acts">${ren ? '' : acts}</div></div>`;
  };
  box.innerHTML = live.length ? `<div class="tm-mlist">${live.map(item).join('')}</div>` : '<p class="note">Noch keine Teammodelle. Unten den jetzigen Stand als erstes Modell anlegen.</p>';
  $('#tm-trash-wrap').hidden = !dead.length;
  $('#tm-trash').innerHTML = dead.length ? `<div class="tm-mlist">${dead.map(item).join('')}</div>` : '';
  const inp = box.querySelector('[data-tm-ren]'); if (inp && document.activeElement !== inp) { inp.focus(); inp.select(); }
}
function renderTeamNow() {
  const r = TM.room; if (!r || $('#tm-now-panel').hidden) return;
  const st = r.state, nP = r.pending.size;
  $('#tm-now-name').textContent = r.name || 'Teammodell';
  $('#tm-now-state').innerHTML = st === 'open' ? pill('good', 'verbunden') : st === 'connecting' ? pill('info', 'verbinde …') : pill('warn', 'getrennt – verbinde neu');
  const us = r.users.slice().sort((a, b) => (a.sid === TM.sid ? -1 : b.sid === TM.sid ? 1 : 0));
  $('#tm-users').innerHTML = us.length ? us.map(u => `<div class="tm-user">${avatar(u)}<b>${esc(u.name)}${u.sid === TM.sid ? ' (du)' : ''}</b><span class="w">${esc(viewName(u.view))}${u.field && PM[u.field] ? ' · ' + esc(PM[u.field].l) : ''}</span></div>`).join('') : '<p class="note">Niemand sonst ist gerade da.</p>';
  $('#tm-now-note').textContent = st !== 'open' && nP ? `${nP} eigene Änderung${nP > 1 ? 'en warten' : ' wartet'} auf die Verbindung und ${nP > 1 ? 'werden' : 'wird'} dann nachgereicht.` : 'Der Link öffnet dieses Modell direkt (nach dem Anmelden).';
}
function renderVers() {
  const ul = $('#tm-vlist'); if (!ul || !TM.room) return;
  ul.innerHTML = TM.vers.length ? TM.vers.map(v => `<li data-vid="${v.id}"><span>${esc(v.name)}</span><span class="meta">${esc(when(v.ts))}${v.by ? ' · ' + esc(v.by) : ''}${v.auto ? ' · automatisch' : ''}</span><button type="button" class="btn sm${TM.armed === 'v' + v.id ? ' danger' : ''}" data-tmv="${v.id}">${TM.armed === 'v' + v.id ? 'Wirklich?' : 'Wiederherstellen'}</button></li>`).join('') : '<li class="empty">Noch keine gespeicherten Stände.</li>';
}
// Verlauf: aufeinanderfolgende Änderungen derselben Person innerhalb von zwei Minuten bündeln
const CF_L = { m: 'Masse', p: 'Leistung', d: 'Einschaltdauer', on: 'an', sched: 'Zeitplan', cda: 'Widerstandsfläche', x: 'Lage x', y: 'Lage y', z: 'Lage z', name: 'Name', group: 'Gruppe', note: 'Notiz' };
const CF_U = { m: ' g', p: ' W', d: ' %', cda: ' cm²', x: ' m', y: ' m', z: ' m' };
function histLabel(path, val, prev) {
  const i = path.indexOf('/'), a = i < 0 ? path : path.slice(0, i), rest = i < 0 ? '' : path.slice(i + 1);
  if (a === 'p') return PM[rest] ? PM[rest].l : rest;
  if (a === 'c') { const [id, f] = rest.split('/'), c = S.comps.find(x => x.id === id) || val || prev || {}; return `${c.name || 'Komponente'}${f ? ' · ' + (CF_L[f] || f) : ''}`; }
  if (a === 'co') return 'Reihenfolge der Komponenten';
  if (a === 'r') return 'Anforderung · ' + targetLabel(rest);
  if (a === 'n') return 'Kommentar · ' + targetLabel(rest.slice(0, rest.lastIndexOf('/')));
  return { gen: 'Wettergenerator', wx: 'Eigene Wetterdatei', preset: 'Vorlage', 'meta/name': 'Name des Modells', 'meta/knapp': 'Knapp-Schwelle', 'meta/created': 'Modell' }[path] || path;
}
function histVal(path, v) {
  if (v === null || v === undefined) return '–';
  if (v && typeof v === 'object' && v._big) return 'Datei';
  const i = path.indexOf('/'), a = i < 0 ? path : path.slice(0, i), rest = i < 0 ? '' : path.slice(i + 1);
  if (a === 'p') return pvText(rest, v);
  if (a === 'c') { const f = rest.split('/')[1]; if (!f) return v.name ? `${v.name}, ${nf(v.m, 0)} g` : 'Komponente'; if (f === 'on') return v ? 'an' : 'aus'; return typeof v === 'number' ? nf(v, Math.abs(v) < 10 && v % 1 ? 2 : 0) + (CF_U[f] || '') : String(v); }
  if (a === 'r') return reqText(rest, v);
  if (a === 'n') return `„${String(v.text || '').slice(0, 80)}${String(v.text || '').length > 80 ? '…' : ''}“`;
  if (path === 'wx') return v.name || 'Datei';
  if (path === 'meta/knapp') return nf(v, 1) + ' %';
  if (path === 'preset') { const o = v && document.querySelector(`#preset-sel option[value="${v}"]`); return o ? o.textContent : v || 'keine'; }
  return typeof v === 'string' ? v : JSON.stringify(v).slice(0, 60);
}
function renderHist() {
  const ol = $('#tm-hist'); if (!ol || !TM.room) return;
  const groups = [];
  for (const it of TM.hist) {
    const g = groups[groups.length - 1];
    if (g && g.sid === it.sid && g.by === it.by && g.grp === (it.grp || '') && g.ts0 - it.ts < 120e3) { g.items.push(it); g.ts0 = it.ts; }
    else groups.push({ sid: it.sid, by: it.by, grp: it.grp || '', ts: it.ts, ts0: it.ts, items: [it] });
  }
  const col = by => { const u = TM.room.users.find(x => x.name === by); return u ? u.color : '#6b7c8a'; };
  ol.innerHTML = groups.length ? groups.map(g => {
    // je Pfad: neuester Wert, ältester Vorwert
    const per = new Map();
    for (const it of g.items) { const val = it.val == null ? null : JSON.parse(it.val), prev = it.prev == null ? null : JSON.parse(it.prev); if (!per.has(it.path)) per.set(it.path, { val, prev }); else per.get(it.path).prev = prev; }
    const rows = [...per].filter(([p]) => p !== 'co' || per.size === 1).map(([p, x]) => p === 'meta/created' ? `<li>${esc(histVal(p, x.val))}</li>` : `<li>${esc(histLabel(p, x.val, x.prev))}: <span class="old">${esc(histVal(p, x.prev))}</span> <span class="arr">→</span> <b>${esc(histVal(p, x.val))}</b></li>`);
    const what = g.grp === 'undo' ? ' · rückgängig gemacht' : g.grp === 'restore' ? ' · Stand wiederhergestellt' : g.grp === 'rename' ? ' · umbenannt' : '';
    const canUndo = g.grp !== 'init' && !g.items.every(it => it.path === 'meta/created');
    return `<li><span class="tm-av" style="background:${esc(col(g.by))}">${esc(initials(g.by))}</span><div><div class="who"><b>${esc(g.by || 'unbekannt')}</b> · ${esc(new Date(g.ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))}${what}</div><ul>${rows.slice(0, 8).join('')}${rows.length > 8 ? `<li class="more">und ${rows.length - 8} weitere</li>` : ''}</ul></div>${canUndo ? `<button type="button" class="btn sm" data-tmundo="${g.items.map(i => i.seq).join(',')}">Rückgängig</button>` : '<span></span>'}</li>`;
  }).join('') : '<li class="empty">Noch keine Änderungen.</li>';
  $('#tm-hist-more').hidden = !TM.histMore;
}
function teamHistSoon() { clearTimeout(TM.histTimer); TM.histTimer = setTimeout(() => teamSend({ t: 'hist', limit: Math.max(200, TM.hist.length) }), 600); }
async function teamList(quiet) {
  if (!TM.ok) return;
  try { const d = await api('/models'); TM.models = d.models; TM.err = ''; const r = TM.room; if (r) { const m = d.models.find(x => x.id === r.id); if (m && !r.name) r.name = m.name; } }
  catch (e) { if (!quiet) TM.err = e.message; }
  renderModels();
}

/* ---------- Bedienung ---------- */
async function teamLogin(e) {
  e.preventDefault();
  const name = $('#tm-name').value.trim(), key = $('#tm-key').value;
  if (!name) { tmSay('Bitte deinen Namen eintragen.', '#tm-login-msg'); $('#tm-name').focus(); return; }
  if (!key) { tmSay('Bitte das Team-Passwort eingeben.', '#tm-login-msg'); $('#tm-key').focus(); return; }
  $('#tm-login-btn').disabled = true; tmSay('Prüfe …', '#tm-login-msg');
  try {
    await api('/ping', { key }); const renamed = name !== ME.name; setMyName(name); TM.key = key; TM.ok = true; teamStore({ key }); $('#tm-key').value = ''; tmSay('', '#tm-login-msg'); renderTeam(); await teamList(); teamAuto();
    // offenes Modell: neu verbinden, damit die anderen den neuen Namen sehen
    if (renamed && TM.room && TM.room.ws) TM.room.ws.close(4000, 'rename');
  }
  catch (err) { tmSay(err.status === 401 ? 'Das Team-Passwort stimmt nicht.' : err.message, '#tm-login-msg'); }
  $('#tm-login-btn').disabled = false;
}
async function teamNew(name, doc, sum) {
  const d = await api('/models', { method: 'POST', body: { name, by: myName(), doc, summary: sum || null } });
  await teamList(true); teamOpen(d.id, d.name); return d;
}
function teamAuto() {
  const id = new URL(location.href).searchParams.get('m') || teamStored().model;
  if (id && TM.ok && !TM.room && /^[a-z0-9]{6,24}$/.test(id)) teamOpen(id, '');
}
function teamInit() {
  const st = teamStored();
  TM.key = st.key || ''; TM.ok = !!TM.key;
  $('#tm-name').value = ME.name;
  $('#tm-login').addEventListener('submit', teamLogin);
  $('#tm-logout').addEventListener('click', () => { if (TM.room) teamCloseRoom(true); TM.ok = false; TM.key = ''; TM.models = null; teamStore({ key: '', model: '' }); renderTeam(); });
  $('#tm-rename-me').addEventListener('click', () => { TM.ok = false; renderTeam(); $('#tm-name').value = ME.name; $('#tm-key').value = ''; $('#tm-name').focus(); tmSay('Neuen Namen eintragen und mit dem Team-Passwort bestätigen.', '#tm-login-msg'); });
  $('#tm-new-btn').addEventListener('click', async () => {
    const name = $('#tm-new-name').value.trim() || S.meta.name || 'Neues Modell';
    $('#tm-new-btn').disabled = true; tmSay('Lege an …');
    try { await teamNew(name, docOf(S), summaryOf(R)); $('#tm-new-name').value = ''; tmSay(`„${name}“ angelegt und geöffnet.`); } catch (e) { tmSay(e.message); }
    $('#tm-new-btn').disabled = false;
  });
  $('#tm-close').addEventListener('click', () => teamCloseRoom(false));
  $('#tm-copylink').addEventListener('click', () => {
    const r = TM.room; if (!r) return; const link = `${location.origin}/?m=${r.id}#uebersicht`;
    try { navigator.clipboard.writeText(link).then(() => toast('Link kopiert.'), () => toast(link)); } catch (e) { toast(link); }
  });
  $('#tm-vsave').addEventListener('click', () => { const n = $('#tm-vname').value.trim() || `Stand vom ${new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`; teamFlush(); if (teamSend({ t: 'vsave', name: n })) { $('#tm-vname').value = ''; toast(`Stand „${n}“ gespeichert.`); } else toast('Nicht verbunden – bitte gleich noch einmal.'); });
  $('#tm-hist-more').addEventListener('click', () => { const last = TM.hist[TM.hist.length - 1]; if (last) { TM.histKeep = TM.hist.slice(); TM.histReqBefore = last.seq; teamSend({ t: 'hist', before: last.seq, limit: 200 }); } });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-tm]');
    if (b) {
      const mid = b.closest('[data-mid]').dataset.mid, m = (TM.models || []).find(x => x.id === mid), act = b.dataset.tm; if (!m) return;
      if (act === 'open') teamOpen(mid, m.name);
      else if (act === 'copy') api(`/models/${mid}/copy`, { method: 'POST', body: { by: myName(), name: `${m.name} (Kopie)` } }).then(d => { tmSay(`Kopie „${d.name}“ angelegt.`); teamList(true); }, err => tmSay(err.message));
      else if (act === 'rename') { TM.renaming = mid; renderModels(); }
      else if (act === 'rename-no') { TM.renaming = null; renderModels(); }
      else if (act === 'rename-ok') {
        const name = b.closest('.tm-model').querySelector('[data-tm-ren]').value.trim(); if (!name) return;
        teamFlush();
        api(`/models/${mid}`, { method: 'PATCH', body: { name, by: myName() } }).then(() => { TM.renaming = null; m.name = name; if (TM.room && TM.room.id === mid) TM.room.name = name; renderTeam(); setTimeout(() => teamList(true), 800); }, err => tmSay(err.message));
      } else if (act === 'del') {
        if (TM.armed !== mid) { TM.armed = mid; renderModels(); setTimeout(() => { if (TM.armed === mid) { TM.armed = null; renderModels(); } }, 3500); return; }
        TM.armed = null;
        api(`/models/${mid}?by=${encodeURIComponent(myName())}`, { method: 'DELETE' }).then(() => { tmSay(`„${m.name}“ liegt im Papierkorb.`); if (TM.room && TM.room.id === mid) teamCloseRoom(true); teamList(true); }, err => tmSay(err.message));
      } else if (act === 'restore') api(`/models/${mid}/restore`, { method: 'POST' }).then(() => { tmSay(`„${m.name}“ wiederhergestellt.`); teamList(true); }, err => tmSay(err.message));
      return;
    }
    const v = e.target.closest && e.target.closest('[data-tmv]');
    if (v) {
      const id = Number(v.dataset.tmv);
      if (TM.armed !== 'v' + id) { TM.armed = 'v' + id; renderVers(); setTimeout(() => { if (TM.armed === 'v' + id) { TM.armed = null; renderVers(); } }, 3500); return; }
      TM.armed = null; teamFlush(); teamSend({ t: 'vrestore', id }); return;
    }
    const u = e.target.closest && e.target.closest('[data-tmundo]');
    if (u) { teamFlush(); teamSend({ t: 'undo', seqs: u.dataset.tmundo.split(',').map(Number) }); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-tm-ren]')) { e.preventDefault(); e.target.closest('.tm-model').querySelector('[data-tm="rename-ok"]').click(); } });
  // Anwesenheit: Ansicht und Feld mit dem Fokus
  window.addEventListener('hashchange', () => setTimeout(() => { teamPres(); teamDecorate(); if (VIEW === 'team') { teamList(true); if (TM.room) teamSend({ t: 'hist', limit: 200 }); } }, 30));
  document.addEventListener('focusin', e => { const k = e.target.dataset && e.target.dataset.k; if (k && k !== TM.field) { TM.field = k; teamPres(); } });
  document.addEventListener('focusout', e => {
    if (e.target.dataset && e.target.dataset.k) setTimeout(() => { if (!(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k)) { TM.field = ''; teamPres(); } }, 50);
    if (TM.compDirty && e.target.closest && e.target.closest('#tbl-comps')) setTimeout(() => { const tb = $('#tbl-comps'); if (!tb.contains(document.activeElement)) teamComps(); }, 50);
  });
  // nach jeder Rechnung: eigene Änderungen abgleichen, Kennwerte für die Modell-Liste, Markierungen
  SAVE_HOOKS.push(() => {
    teamFlush(); teamDecorate();
    const r = TM.room;
    if (r && r.state === 'open' && R && (r.sumDirty || !r.sumSent) && Date.now() - r.sumAt > 4000) {
      const sum = summaryOf(R), s = JSON.stringify(sum);
      if (s !== r.sumSent && teamSend({ t: 'sum', sum })) { r.sumSent = s; r.sumAt = Date.now(); r.sumDirty = false; }
    }
  });
  window.addEventListener('beforeunload', () => { teamFlush(); });
  IMPORT_HOOKS.push({
    label: 'Als neues Teammodell anlegen', show: () => TM.ok,
    run: async x => {
      const doc = docOf(sanitize(x.doc)), name = x.name || doc.meta.name || 'Importiertes Modell';
      $('#share-msg').textContent = 'Lege Teammodell an …';
      try { await teamNew(name, doc, x.summary || null); $('#share-msg').textContent = `„${name}“ als Teammodell angelegt und geöffnet.`; IMP.cur = null; $('#imp-text').value = ''; impPreview(); }
      catch (e) { $('#share-msg').textContent = e.message; }
    }
  });
  renderTeam();
  if (TM.ok) teamList(true).then(teamAuto);
  TM.listTimer = setInterval(() => { if (VIEW === 'team' && document.visibilityState === 'visible') teamList(true); }, 30e3);
}
RENDER.team = () => { renderTeam(); };

// PVGIS-TMY für den Auslegungsort über den Worker laden (der PVGIS-Server erlaubt keine Browser-Abrufe)
function wxExtra(box) {
  if (S.params.weather !== 'upload') return;
  const d = document.createElement('div'); d.className = 'table-actions';
  d.innerHTML = `<button class="btn primary sm" type="button">PVGIS-TMY für ${nf(S.params.lat, 2)}° N, ${nf(S.params.lon, 2)}° O laden</button><span class="status-msg"></span>`;
  box.prepend(d);
  const b = d.querySelector('button'), m = d.querySelector('.status-msg');
  b.addEventListener('click', async () => {
    b.disabled = true; m.textContent = 'Frage PVGIS an …';
    try {
      const res = await fetch(`/api/pvgis?lat=${encodeURIComponent(S.params.lat)}&lon=${encodeURIComponent(S.params.lon)}`);
      const txt = await res.text();
      if (!res.ok) { let e = 'PVGIS-Abruf fehlgeschlagen (' + res.status + ').'; try { e = JSON.parse(txt).error || e; } catch (x) { /* Text */ } throw new Error(e); }
      handleWeatherText(txt, 'PVGIS-TMY');
      m.textContent = 'Geladen.';
    } catch (err) { m.textContent = err.message; }
    b.disabled = false;
  });
}

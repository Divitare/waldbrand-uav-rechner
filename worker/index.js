// Worker für den Waldbrand-UAV-Rechner.
// - liefert die Rechnerseite aus ./public aus
// - /api/team/…: gemeinsame Modelle des Teams. Jedes Modell ist ein Durable Object (ModelRoom) mit
//   eigener SQLite-Datenbank: Dokument als Pfad-Wert-Paare, Änderungsprotokoll, gespeicherte Stände.
//   Alle, die ein Modell offen haben, sind per WebSocket verbunden und sehen Änderungen sofort.
//   Gleichzeitige Änderungen an verschiedenen Stellen gelten beide, an derselben Stelle gilt die spätere
//   (Reihenfolge, in der der Server sie erhält). Die Liste der Modelle steht in D1 (Tabelle models).
// - /api/pvgis: typische meteorologische Jahre von PVGIS (EU JRC), weil der PVGIS-Server keine
//   direkten Browser-Abrufe erlaubt
//
// Ein gemeinsames Team-Passwort (Secret TEAM_KEY, gesetzt mit: npx wrangler secret put TEAM_KEY) schützt
// Lesen und Schreiben. Es gibt keine Konten; der Name dient nur der Anzeige (wer arbeitet wo, wer hat was geändert).
import { DurableObject } from 'cloudflare:workers';

const ID_RE = /^[a-z0-9]{6,24}$/;
const MAX_MSG = 1_000_000; // Bytes je WebSocket-Nachricht
const MAX_VAL = 400_000; // Zeichen je Wert (eigene Wetterdatei bis 200 000 Zeichen)
const KEEP_OPS = 20_000; // Änderungsprotokoll
const KEEP_AUTO = 60; // automatische Stände
const IDLE_SNAPSHOT_MS = 2 * 3600 * 1000; // nach so langer Pause vor der nächsten Änderung einen Stand sichern
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#7a5cd6', '#0f9bb5', '#b0532c'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

// Passwortvergleich in konstanter Zeit
function keyOk(given, env) {
  const want = env.TEAM_KEY || '';
  if (!want) throw new HttpError(503, 'Auf dem Server ist noch kein Team-Passwort gesetzt (npx wrangler secret put TEAM_KEY).');
  const enc = new TextEncoder(), a = enc.encode(given || ''), b = enc.encode(want);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
function requireKey(request, env) {
  if (!keyOk(request.headers.get('x-team-key') || '', env)) throw new HttpError(401, 'Team-Passwort fehlt oder ist falsch.');
}
// Beim WebSocket steckt das Passwort als zweites Unterprotokoll im Kopf: k.<base64url(UTF-8)>
function keyFromProtocols(request) {
  const list = (request.headers.get('sec-websocket-protocol') || '').split(',').map(s => s.trim());
  const k = list.find(s => s.startsWith('k.'));
  if (!k) return '';
  try {
    const b64 = k.slice(2).replace(/-/g, '+').replace(/_/g, '/'), pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return new TextDecoder().decode(Uint8Array.from(atob(pad), c => c.charCodeAt(0)));
  } catch { return ''; }
}

/* ---------- Dokument als Pfad-Wert-Paare (gleich wie in calc/src/team.js) ----------
   p/<Eingabe>  c/<Komponente> (ganzes Objekt; Felder einzeln als c/<id>/<Feld>)  co (Reihenfolge)
   r/<Ziel> (Anforderung)  n/<Ziel>/<id> (Kommentar)  gen  wx  meta/<Schlüssel>  preset */
const PATH_RE = /^(p\/[A-Za-z0-9_]{1,40}|c\/[A-Za-z0-9_-]{1,60}(\/[A-Za-z0-9_]{1,30})?|co|r\/[a-z]:[A-Za-z0-9_]{1,40}|n\/(model|[a-z]:[A-Za-z0-9_-]{1,60})\/[A-Za-z0-9_-]{1,40}|gen|wx|meta\/[A-Za-z0-9_]{1,30}|preset)$/;
function docToKV(doc) {
  const kv = new Map(), d = doc && typeof doc === 'object' ? doc : {};
  for (const [k, v] of Object.entries(d.params || {})) kv.set('p/' + k, v);
  const comps = Array.isArray(d.comps) ? d.comps.filter(c => c && typeof c === 'object' && c.id) : [];
  for (const c of comps) kv.set('c/' + c.id, c);
  kv.set('co', comps.map(c => String(c.id)));
  for (const [t, r] of Object.entries(d.req || {})) kv.set('r/' + t, r);
  for (const [t, list] of Object.entries(d.notes || {})) for (const n of Array.isArray(list) ? list : []) if (n && n.id) kv.set(`n/${t}/${n.id}`, n);
  if (d.gen != null) kv.set('gen', d.gen);
  if (d.wx != null) kv.set('wx', d.wx);
  for (const [k, v] of Object.entries(d.meta || {})) kv.set('meta/' + k, v);
  if (d.preset != null) kv.set('preset', d.preset);
  for (const k of [...kv.keys()]) if (!PATH_RE.test(k)) kv.delete(k);
  return kv;
}
function kvToDoc(kv) {
  const d = { v: 8, params: {}, comps: [], gen: null, wx: null, req: {}, notes: {}, meta: {}, preset: '' }, comps = new Map();
  let order = [];
  for (const [path, v] of kv) {
    const i = path.indexOf('/'), a = i < 0 ? path : path.slice(0, i), rest = i < 0 ? '' : path.slice(i + 1);
    if (a === 'p') d.params[rest] = v;
    else if (a === 'c') comps.set(rest, v);
    else if (a === 'co') order = Array.isArray(v) ? v : [];
    else if (a === 'r') d.req[rest] = v;
    else if (a === 'n') { const j = rest.lastIndexOf('/'), t = rest.slice(0, j); (d.notes[t] = d.notes[t] || []).push(v); }
    else if (a === 'gen') d.gen = v;
    else if (a === 'wx') d.wx = v;
    else if (a === 'meta') d.meta[rest] = v;
    else if (a === 'preset') d.preset = v;
  }
  for (const id of order) if (comps.has(id)) { d.comps.push(comps.get(id)); comps.delete(id); }
  for (const c of comps.values()) d.comps.push(c); // ohne Platz in der Reihenfolge (gleichzeitig angelegt) hinten an
  for (const l of Object.values(d.notes)) l.sort((x, y) => (x.ts || 0) - (y.ts || 0));
  return d;
}

/* ---------- D1: Liste der Modelle ---------- */
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL DEFAULT \'\', updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL DEFAULT \'\', deleted_at INTEGER, summary TEXT)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_models_updated ON models (updated_at DESC)')
    ]).catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}
const roomOf = (env, id) => (env.ROOMS.getByName ? env.ROOMS.getByName(id) : env.ROOMS.get(env.ROOMS.idFromName(id)));
async function readJson(request, max = 2_000_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > max) throw new HttpError(413, 'Die Daten sind zu groß.');
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'Die Daten sind zu groß.');
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'Ungültiges JSON.'); }
}
async function modelRow(env, id) {
  const row = await env.DB.prepare('SELECT * FROM models WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Dieses Modell gibt es nicht.');
  return row;
}
const listRow = r => ({ id: r.id, name: r.name, created_at: r.created_at, created_by: r.created_by, updated_at: r.updated_at, updated_by: r.updated_by, deleted_at: r.deleted_at || null, summary: r.summary ? JSON.parse(r.summary) : null });

async function handleTeam(request, env, url) {
  const parts = url.pathname.replace(/^\/api\/team\/?/, '').split('/').filter(Boolean), method = request.method;
  // WebSocket: Passwort im Unterprotokoll (Browser können beim WebSocket keine eigenen Kopfzeilen setzen)
  if (parts[0] === 'models' && parts[2] === 'ws') {
    if (request.headers.get('upgrade') !== 'websocket') throw new HttpError(426, 'WebSocket erwartet.');
    if (!keyOk(keyFromProtocols(request), env)) return new Response('Team-Passwort fehlt oder ist falsch.', { status: 401 });
    const id = parts[1]; if (!ID_RE.test(id)) throw new HttpError(400, 'Ungültige Kennung.');
    await ensureSchema(env);
    const row = await modelRow(env, id);
    if (row.deleted_at) throw new HttpError(410, 'Dieses Modell liegt im Papierkorb.');
    return roomOf(env, id).fetch(request);
  }
  requireKey(request, env);
  await ensureSchema(env);
  if (parts[0] === 'ping' && method === 'GET') return json({ ok: true });
  if (parts[0] !== 'models') throw new HttpError(404, 'Unbekannter Pfad.');
  const id = parts[1];
  if (id !== undefined && !ID_RE.test(id)) throw new HttpError(400, 'Ungültige Kennung.');
  if (!id) {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM models ORDER BY updated_at DESC LIMIT 500').all();
      return json({ models: results.map(listRow) });
    }
    if (method === 'POST') {
      const body = await readJson(request), by = clean(body.by, 60), name = clean(body.name, 120) || 'Neues Modell';
      if (!body.doc || typeof body.doc !== 'object' || !body.doc.params) throw new HttpError(400, 'Das Modell fehlt.');
      const mid = newId(), now = Date.now(), doc = { ...body.doc, meta: { ...(body.doc.meta || {}), name } };
      await roomOf(env, mid).init(mid, doc, by, 'angelegt');
      await env.DB.prepare('INSERT INTO models (id, name, created_at, created_by, updated_at, updated_by, summary) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(mid, name, now, by, now, by, body.summary ? JSON.stringify(body.summary).slice(0, 4000) : null).run();
      return json({ id: mid, name }, 201);
    }
    throw new HttpError(405, 'Methode nicht erlaubt.');
  }
  const row = await modelRow(env, id), action = parts[2];
  if (!action && method === 'GET') return json({ model: listRow(row), doc: await roomOf(env, id).exportDoc() });
  if (!action && method === 'PATCH') {
    const body = await readJson(request), by = clean(body.by, 60), name = clean(body.name, 120);
    if (!name) throw new HttpError(400, 'Bitte einen Namen angeben.');
    await roomOf(env, id).rename(name, by);
    return json({ ok: true, name });
  }
  if (!action && method === 'DELETE') {
    const by = clean(url.searchParams.get('by'), 60);
    await env.DB.prepare('UPDATE models SET deleted_at = ?, updated_by = ? WHERE id = ?').bind(Date.now(), by, id).run();
    await roomOf(env, id).closeAll('Das Modell wurde in den Papierkorb gelegt.');
    return json({ ok: true });
  }
  if (action === 'restore' && method === 'POST') {
    await env.DB.prepare('UPDATE models SET deleted_at = NULL WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (action === 'copy' && method === 'POST') {
    const body = await readJson(request), by = clean(body.by, 60), name = clean(body.name, 120) || `${row.name} (Kopie)`;
    const doc = await roomOf(env, id).exportDoc(), mid = newId(), now = Date.now();
    doc.meta = { ...(doc.meta || {}), name };
    await roomOf(env, mid).init(mid, doc, by, `kopiert aus „${row.name}“`);
    await env.DB.prepare('INSERT INTO models (id, name, created_at, created_by, updated_at, updated_by, summary) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(mid, name, now, by, now, by, row.summary).run();
    return json({ id: mid, name }, 201);
  }
  throw new HttpError(405, 'Methode nicht erlaubt.');
}

/* ---------- Durable Object: ein Modell ---------- */
export class ModelRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS kv (path TEXT PRIMARY KEY, val TEXT NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS ops (seq INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, by TEXT NOT NULL, sid TEXT NOT NULL, path TEXT NOT NULL, val TEXT, prev TEXT, grp TEXT)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS versions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, by TEXT NOT NULL, name TEXT NOT NULL, auto INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL, doc TEXT NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
    });
    // Lebenszeichen ohne Aufwecken des Objekts beantworten
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }
  meta(k, v) {
    if (v === undefined) { const r = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0]; return r ? r.v : null; }
    this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, v);
  }
  kvMap() { const m = new Map(); for (const r of this.sql.exec('SELECT path, val FROM kv')) m.set(r.path, JSON.parse(r.val)); return m; }
  doc() { return kvToDoc(this.kvMap()); }
  seq() { const r = this.sql.exec('SELECT MAX(seq) AS s FROM ops').toArray()[0]; return (r && r.s) || 0; }
  // RPC: neues Modell anlegen (oder überschreiben)
  async init(id, doc, by, what) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM kv');
      for (const [p, v] of docToKV(doc)) this.sql.exec('INSERT INTO kv (path, val) VALUES (?, ?)', p, JSON.stringify(v));
      this.meta('id', id);
      this.sql.exec('INSERT INTO ops (ts, by, sid, path, val, prev, grp) VALUES (?, ?, ?, ?, ?, ?, ?)', Date.now(), clean(by, 60), 'server', 'meta/created', JSON.stringify(what || 'angelegt'), null, 'init');
      this.sql.exec('INSERT INTO versions (ts, by, name, auto, seq, doc) VALUES (?, ?, ?, 1, ?, ?)', Date.now(), clean(by, 60), what || 'Angelegt', this.seq(), JSON.stringify(this.doc()));
    });
    return true;
  }
  async exportDoc() { return this.doc(); }
  async rename(name, by) {
    const res = this.applyOps([{ path: 'meta/name', val: name }], by, 'server', 'rename');
    this.broadcast({ t: 'ops', by, sid: 'server', ts: Date.now(), ops: res });
    await this.flushIndex();
    return true;
  }
  async closeAll(reason) {
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(JSON.stringify({ t: 'closed', reason })); ws.close(4001, 'deleted'); } catch { /* schon zu */ } }
    return true;
  }

  // WebSocket annehmen (Ruhezustand erlaubt; Anwesenheit steckt in der Anhängung)
  async fetch(request) {
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    const id = new URL(request.url).pathname.split('/')[4];
    if (id && !this.meta('id')) this.meta('id', id);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ sid: '', name: '', color: COLORS[0], view: '', field: '', at: Date.now(), ok: false });
    return new Response(null, { status: 101, webSocket: client, headers: { 'sec-websocket-protocol': 'uav-team' } });
  }
  users(except) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== 1) continue;
      const a = ws.deserializeAttachment(); if (a && a.ok) out.push({ sid: a.sid, name: a.name, color: a.color, view: a.view, field: a.field, at: a.at });
    }
    return out;
  }
  broadcast(msg, except) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) { if (ws === except) continue; try { ws.send(s); } catch { /* geschlossen */ } }
  }
  sendTo(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* geschlossen */ } }
  pickColor() {
    const used = new Set(this.users().map(u => u.color));
    return COLORS.find(c => !used.has(c)) || COLORS[this.users().length % COLORS.length];
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) { this.sendTo(ws, { t: 'err', msg: 'Nachricht zu groß.' }); return; }
    let m; try { m = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment() || {};
    if (m.t === 'hello') {
      a.sid = clean(m.sid, 40) || newId(); a.name = clean(m.name, 60) || 'unbekannt'; a.view = clean(m.view, 40); a.field = clean(m.field, 60); a.at = Date.now(); a.ok = true;
      a.color = this.users(ws).some(u => u.color === m.color) || !COLORS.includes(m.color) ? this.pickColor() : m.color;
      ws.serializeAttachment(a);
      this.sendTo(ws, { t: 'welcome', sid: a.sid, color: a.color, seq: this.seq(), doc: this.doc(), users: this.users() });
      this.broadcast({ t: 'pres', users: this.users() }, ws);
      return;
    }
    if (!a.ok) { this.sendTo(ws, { t: 'err', msg: 'Zuerst anmelden (hello).' }); return; }
    if (m.t === 'pres') {
      a.view = clean(m.view, 40); a.field = clean(m.field, 60); ws.serializeAttachment(a);
      this.broadcast({ t: 'pres', users: this.users() });
    } else if (m.t === 'ops' && Array.isArray(m.ops)) {
      const res = this.applyOps(m.ops, a.name, a.sid, clean(m.grp, 40));
      if (res.length) this.broadcast({ t: 'ops', by: a.name, sid: a.sid, ts: Date.now(), ops: res });
      const bad = m.ops.length - res.length; if (bad > 0) this.sendTo(ws, { t: 'err', msg: `${bad} Änderung(en) abgelehnt (ungültiger Pfad oder zu groß).`, ids: m.ops.map(o => o.id).filter(id => !res.some(r => r.id === id)) });
      this.touch(a.name);
    } else if (m.t === 'sum' && m.sum && typeof m.sum === 'object') {
      this.meta('summary', JSON.stringify(m.sum).slice(0, 4000)); this.touch(null);
    } else if (m.t === 'hist') {
      const before = Number(m.before) || Number.MAX_SAFE_INTEGER, lim = Math.min(400, Math.max(20, Number(m.limit) || 200));
      const rows = this.sql.exec('SELECT seq, ts, by, sid, path, val, prev, grp FROM ops WHERE seq < ? ORDER BY seq DESC LIMIT ?', before, lim).toArray();
      const short = v => (v == null ? null : v.length > 3000 ? '{"_big":true}' : v);
      this.sendTo(ws, { t: 'hist', items: rows.map(r => ({ seq: r.seq, ts: r.ts, by: r.by, path: r.path, val: short(r.val), prev: short(r.prev), grp: r.grp })), more: rows.length === lim });
    } else if (m.t === 'undo' && Array.isArray(m.seqs)) {
      // Änderungen zurücknehmen: jeder Pfad zurück auf den Wert davor (als neue Änderung, also selbst wieder umkehrbar)
      const seqs = m.seqs.map(Number).filter(Number.isFinite).sort((x, y) => y - x).slice(0, 500), back = new Map();
      let skipped = 0;
      for (const s of seqs) {
        const r = this.sql.exec('SELECT path, prev FROM ops WHERE seq = ?', s).toArray()[0];
        if (!r || !PATH_RE.test(r.path) || r.path === 'meta/created') continue;
        if (r.prev && r.prev.startsWith('{"_big"')) { skipped++; continue; } // große Werte (Wetterdatei) stehen nur verkürzt im Protokoll
        back.set(r.path, r.prev == null ? null : JSON.parse(r.prev));
      }
      if (skipped) this.sendTo(ws, { t: 'err', msg: 'Die eigene Wetterdatei lässt sich nicht einzeln zurücknehmen – dafür einen gespeicherten Stand wiederherstellen.' });
      const res = this.applyOps([...back].map(([path, val]) => ({ path, val })), a.name, a.sid, 'undo');
      if (res.length) this.broadcast({ t: 'ops', by: a.name, sid: a.sid, ts: Date.now(), ops: res, undo: true });
      this.touch(a.name);
    } else if (m.t === 'vsave') {
      this.saveVersion(a.name, clean(m.name, 120) || 'Stand', false);
      this.sendVersions(ws);
    } else if (m.t === 'vlist') this.sendVersions(ws);
    else if (m.t === 'vrestore') {
      const v = this.sql.exec('SELECT * FROM versions WHERE id = ?', Number(m.id)).toArray()[0];
      if (!v) { this.sendTo(ws, { t: 'err', msg: 'Diesen Stand gibt es nicht mehr.' }); return; }
      this.saveVersion(a.name, `vor dem Wiederherstellen von „${v.name}“`, true);
      const want = docToKV(JSON.parse(v.doc)), cur = this.kvMap(), ops = [];
      for (const [p, val] of want) if (JSON.stringify(cur.get(p)) !== JSON.stringify(val)) ops.push({ path: p, val });
      for (const p of cur.keys()) if (!want.has(p)) ops.push({ path: p, val: null });
      const res = this.applyOps(ops, a.name, a.sid, 'restore');
      if (res.length) this.broadcast({ t: 'ops', by: a.name, sid: a.sid, ts: Date.now(), ops: res, restore: v.name });
      this.sendVersions(ws); this.touch(a.name);
    }
  }
  async webSocketClose(ws, code) {
    // Schließen bestätigen (ältere Laufzeit-Einstellungen tun das nicht von selbst); reservierte Codes nicht zurücksenden
    try { ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 && code !== 1015 ? code : 1000, 'bye'); } catch { /* schon zu */ }
    this.broadcast({ t: 'pres', users: this.users(ws) }, ws);
  }
  async webSocketError(ws) { this.broadcast({ t: 'pres', users: this.users(ws) }, ws); }

  // Änderungen anwenden: je Pfad der neue Wert; Felder einer Komponente einzeln. Ergebnis mit Folgenummer.
  applyOps(ops, by, sid, grp) {
    const out = [], now = Date.now();
    const last = Number(this.meta('lastOp') || 0);
    if (last && now - last > IDLE_SNAPSHOT_MS) this.saveVersion('', 'automatisch nach einer Pause', true);
    this.ctx.storage.transactionSync(() => {
      for (const o of ops.slice(0, 2000)) {
        if (!o || typeof o.path !== 'string' || !PATH_RE.test(o.path)) continue;
        const val = o.val === undefined ? null : o.val, s = val === null ? null : JSON.stringify(val);
        if (s && s.length > MAX_VAL) continue;
        let prev = null;
        const cf = /^c\/([^/]+)\/([^/]+)$/.exec(o.path);
        if (cf) {
          const row = this.sql.exec('SELECT val FROM kv WHERE path = ?', 'c/' + cf[1]).toArray()[0];
          if (!row) continue; // Komponente inzwischen gelöscht
          const obj = JSON.parse(row.val); prev = obj[cf[2]] === undefined ? null : JSON.stringify(obj[cf[2]]);
          if (val === null) delete obj[cf[2]]; else obj[cf[2]] = val;
          this.sql.exec('UPDATE kv SET val = ? WHERE path = ?', JSON.stringify(obj), 'c/' + cf[1]);
        } else {
          const row = this.sql.exec('SELECT val FROM kv WHERE path = ?', o.path).toArray()[0];
          prev = row ? row.val : null;
          if (val === null) this.sql.exec('DELETE FROM kv WHERE path = ?', o.path);
          else this.sql.exec('INSERT INTO kv (path, val) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET val = excluded.val', o.path, s);
        }
        // große Werte (Wetterdatei) nur verkürzt ins Protokoll
        const big = v => (v && v.length > 3000 ? JSON.stringify({ _big: true, n: v.length }) : v);
        this.sql.exec('INSERT INTO ops (ts, by, sid, path, val, prev, grp) VALUES (?, ?, ?, ?, ?, ?, ?)', now, clean(by, 60), clean(sid, 40), o.path, big(s), big(prev), grp || null);
        const seq = this.sql.exec('SELECT last_insert_rowid() AS s').toArray()[0].s;
        out.push({ seq, id: o.id ?? null, path: o.path, val });
      }
      this.meta('lastOp', String(now));
      const maxSeq = this.seq();
      if (maxSeq % 500 === 0 || out.length > 200) this.sql.exec('DELETE FROM ops WHERE seq < ?', maxSeq - KEEP_OPS);
    });
    return out;
  }
  saveVersion(by, name, auto) {
    this.sql.exec('INSERT INTO versions (ts, by, name, auto, seq, doc) VALUES (?, ?, ?, ?, ?, ?)', Date.now(), clean(by, 60), clean(name, 120), auto ? 1 : 0, this.seq(), JSON.stringify(this.doc()));
    const old = this.sql.exec('SELECT id FROM versions WHERE auto = 1 ORDER BY id DESC LIMIT -1 OFFSET ?', KEEP_AUTO).toArray();
    for (const r of old) this.sql.exec('DELETE FROM versions WHERE id = ?', r.id);
  }
  sendVersions(ws) {
    const rows = this.sql.exec('SELECT id, ts, by, name, auto, seq FROM versions ORDER BY id DESC LIMIT 200').toArray();
    this.sendTo(ws, { t: 'vers', items: rows });
  }
  // Liste der Modelle (D1) gesammelt nachziehen: Name, wann und von wem zuletzt geändert, Kennwerte
  touch(by) {
    if (by) this.meta('lastBy', by);
    this.ctx.storage.getAlarm().then(t => { if (!t) this.ctx.storage.setAlarm(Date.now() + 4000); });
  }
  async alarm() { await this.flushIndex(); }
  async flushIndex() {
    const id = this.meta('id'); if (!id) return;
    const nameRow = this.sql.exec('SELECT val FROM kv WHERE path = ?', 'meta/name').toArray()[0];
    const name = nameRow ? clean(JSON.parse(nameRow.val), 120) : '';
    const last = Number(this.meta('lastOp') || Date.now());
    await this.env.DB.prepare('UPDATE models SET name = COALESCE(NULLIF(?, \'\'), name), updated_at = ?, updated_by = COALESCE(?, updated_by), summary = COALESCE(?, summary) WHERE id = ?')
      .bind(name, last, this.meta('lastBy'), this.meta('summary'), id).run();
  }
}

// PVGIS-TMY für einen Ort, 30 Tage im Cloudflare-Cache
async function handlePvgis(request, url, ctx) {
  if (request.method !== 'GET') throw new HttpError(405, 'Methode nicht erlaubt.');
  const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
  if (!(lat >= -60 && lat <= 72) || !(lon >= -180 && lon <= 180)) throw new HttpError(400, 'Ungültige Koordinaten.');
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  const cache = caches.default, key = new Request(`https://pvgis-cache.invalid/tmy/${la}/${lo}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  let res = null, text = '';
  for (const v of ['v5_3', 'v5_2']) {
    try {
      res = await fetch(`https://re.jrc.ec.europa.eu/api/${v}/tmy?lat=${la}&lon=${lo}&outputformat=json`, { headers: { 'user-agent': 'uav-budget-worker' } });
      text = await res.text();
    } catch (e) {
      throw new HttpError(502, 'PVGIS ist gerade nicht erreichbar. Später erneut versuchen oder die Datei auf der PVGIS-Seite herunterladen.');
    }
    if (res.ok) break;
  }
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).message || msg; } catch { /* Text */ }
    throw new HttpError(502, 'PVGIS meldet: ' + msg);
  }
  const out = new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=2592000' } });
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/pvgis') return await handlePvgis(request, url, ctx);
      if (url.pathname.startsWith('/api/team/') || url.pathname === '/api/team') return await handleTeam(request, env, url);
      throw new HttpError(404, 'Unbekannter Pfad.');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Serverfehler. Details stehen im Worker-Log.' }, 500);
    }
  }
};

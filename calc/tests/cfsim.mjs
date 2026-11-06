// Nachbildung der Cloudflare-Laufzeit für Tests ohne wrangler und ohne Cloudflare-Konto:
// führt worker/index.js unverändert aus – mit Durable Objects (SQLite über node:sqlite, WebSockets mit der
// Ruhezustand-Schnittstelle, Alarme, RPC), D1 (SQLite im Speicher) und den Seiten aus public/.
// Aufruf: node calc/tests/cfsim.mjs [Port]   Team-Passwort: TEAM_KEY (Standard „test“).
// Braucht das Paket ws (kommt mit wrangler; sonst WS_MODULE=/pfad/zu/ws setzen).
// Steuerung für Tests: POST /__sim/pause?ms=3000 trennt alle WebSockets und nimmt so lange keine neuen an.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

process.removeAllListeners('warning'); // node:sqlite meldet sich als experimentell
const { DatabaseSync } = await import('node:sqlite');
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let wsMod = null;
for (const m of [process.env.WS_MODULE, 'ws', '/opt/npm-tools/node_modules/ws'].filter(Boolean)) { try { wsMod = require(m); break; } catch (e) { /* weiter */ } }
if (!wsMod) { console.error('Paket „ws“ nicht gefunden (npm install oder WS_MODULE setzen).'); process.exit(1); }
const { WebSocketServer } = wsMod;

/* ---------- Laufzeit-Bausteine ---------- */
const BaseResponse = globalThis.Response;
class CFResponse extends BaseResponse {
  constructor(body, init = {}) {
    if (init && init.status === 101) { super(null, { ...init, status: 200 }); this._ws = init.webSocket || null; this._101 = true; return; }
    super(body, init);
  }
  get status() { return this._101 ? 101 : super.status; }
  get webSocket() { return this._ws || null; }
}
globalThis.Response = CFResponse;
if (!globalThis.crypto.subtle.timingSafeEqual) Object.defineProperty(globalThis.crypto.subtle, 'timingSafeEqual', { value: (a, b) => nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)) });
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
globalThis.WebSocketRequestResponsePair = class { constructor(request, response) { this.request = request; this.response = response; } };
// Ein Ende eines WebSocket-Paars; das Server-Ende gehört dem Durable Object, das andere hängt am echten Browser-Socket
class SimSocket {
  constructor() { this.readyState = 0; this.peer = null; this.real = null; this.att = null; this.onClose = null; }
  send(data) { if (this.readyState !== 1) throw new Error('WebSocket ist nicht offen'); const r = this.peer && this.peer.real; if (r && r.readyState === 1) r.send(String(data)); }
  close(code = 1000, reason = '') { if (this.readyState >= 2) return; this.readyState = 2; const r = this.peer && this.peer.real; if (r) { try { r.close(code, reason); } catch (e) { /* zu */ } } }
  serializeAttachment(v) { this.att = structuredClone(v); }
  deserializeAttachment() { return this.att == null ? null : structuredClone(this.att); }
  accept() { this.readyState = 1; }
}
globalThis.WebSocketPair = class { constructor() { const a = new SimSocket(), b = new SimSocket(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; } };
class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
globalThis.__cfsim = { DurableObject };

// SQL-Schnittstelle der Durable Objects über node:sqlite
function sqlStorage(db) {
  return {
    exec(query, ...binds) {
      const rows = db.prepare(query).all(...binds.map(v => (v === undefined ? null : v)));
      return { toArray: () => rows, one: () => { if (rows.length !== 1) throw new Error('Erwartet genau eine Zeile'); return rows[0]; }, [Symbol.iterator]: () => rows[Symbol.iterator](), rowsRead: rows.length, rowsWritten: 0 };
    }
  };
}
function makeCtx(name, getInstance) {
  const db = new DatabaseSync(':memory:'), sockets = new Set();
  let alarmAt = null, alarmTimer = null, auto = null;
  const ctx = {
    id: { name, toString: () => name },
    storage: {
      sql: sqlStorage(db),
      transactionSync(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
      async getAlarm() { return alarmAt; },
      async setAlarm(t) { clearTimeout(alarmTimer); alarmAt = Number(t); alarmTimer = setTimeout(async () => { alarmAt = null; try { await getInstance().alarm(); } catch (e) { console.error('Alarm', e); } }, Math.max(0, alarmAt - Date.now())); },
      async deleteAlarm() { clearTimeout(alarmTimer); alarmAt = null; }
    },
    blockConcurrencyWhile: fn => fn(),
    acceptWebSocket(ws) { ws.accept(); sockets.add(ws); },
    getWebSockets: () => [...sockets],
    setWebSocketAutoResponse(pair) { auto = pair; },
    _sockets: sockets, _auto: () => auto, _db: db
  };
  return ctx;
}
// Namensraum der Durable Objects mit Stummel (fetch und RPC mit kopierten Argumenten)
function namespace(Cls, env) {
  const objs = new Map();
  const inst = name => {
    if (!objs.has(name)) { let o = null; const ctx = makeCtx(name, () => o); o = new Cls(ctx, env); objs.set(name, { o, ctx }); }
    return objs.get(name);
  };
  const stub = name => new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'fetch') return req => inst(name).o.fetch(req);
      return async (...args) => structuredClone(await inst(name).o[prop](...args.map(a => structuredClone(a))));
    }
  });
  return { getByName: stub, idFromName: n => ({ name: n }), get: id => stub(id.name), _objs: objs, _inst: inst };
}
// D1 über node:sqlite im Speicher
function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    async all() { return { success: true, results: db.prepare(sql).all(...args) }; },
    async first(col) { const r = db.prepare(sql).get(...args); return r ? (col ? r[col] : r) : null; }
  });
  return { prepare: sql => stmt(sql, []), batch: async list => { const out = []; for (const s of list) out.push(await s.run()); return out; }, exec: async sql => db.exec(sql) };
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const assets = {
  async fetch(request) {
    const u = new URL(request.url); let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('Nicht gefunden', { status: 404 });
    return new Response(fs.readFileSync(f), { headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } });
  }
};

/* ---------- Worker laden ---------- */
const src = fs.readFileSync(path.join(ROOT, 'worker', 'index.js'), 'utf8').replace("import { DurableObject } from 'cloudflare:workers';", 'const { DurableObject } = globalThis.__cfsim;');
const tmp = path.join(ROOT, 'calc', 'tests', `_worker.${process.pid}.mjs`);
fs.writeFileSync(tmp, src);
const mod = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);
const env = { TEAM_KEY: process.env.TEAM_KEY ?? 'test', DB: d1(), ASSETS: assets };
env.ROOMS = namespace(mod.ModelRoom, env);
const execCtx = { waitUntil: p => { Promise.resolve(p).catch(e => console.error(e)); }, passThroughOnException() {} };

/* ---------- HTTP- und WebSocket-Server ---------- */
const PORT = Number(process.argv[2] || process.env.PORT || 8787);
let pausedUntil = 0;
const wss = new WebSocketServer({ noServer: true, handleProtocols: p => (p.has('uav-team') ? 'uav-team' : false) });
const toRequest = (req, body) => {
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  return new Request(`http://${req.headers.host || 'localhost'}${req.url}`, { method: req.method, headers, body: body && body.length && !['GET', 'HEAD'].includes(req.method) ? body : undefined, duplex: 'half' });
};
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    if (req.url.startsWith('/__sim/pause')) { // alle trennen und eine Weile keine neuen Verbindungen
      const ms = Number(new URL(req.url, 'http://x').searchParams.get('ms') || 3000); pausedUntil = Date.now() + ms;
      for (const { ctx } of env.ROOMS._objs.values()) for (const ws of ctx._sockets) { const r = ws.peer && ws.peer.real; if (r) r.terminate(); }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return;
    }
    const out = await mod.default.fetch(toRequest(req, Buffer.concat(chunks)), env, execCtx);
    const h = {}; out.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(out.status, h); res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) { console.error(e); res.writeHead(500); res.end('Simulationsfehler: ' + e.message); }
});
server.on('upgrade', async (req, socket, head) => {
  try {
    if (Date.now() < pausedUntil) { socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return; }
    const out = await mod.default.fetch(toRequest(req), env, execCtx);
    if (out.status !== 101 || !out.webSocket) { socket.end(`HTTP/1.1 ${out.status} Fehler\r\ncontent-type: text/plain\r\n\r\n${await out.text()}`); return; }
    const client = out.webSocket, serverEnd = client.peer, room = [...env.ROOMS._objs.values()].find(x => x.ctx._sockets.has(serverEnd));
    wss.handleUpgrade(req, socket, head, real => {
      client.real = real; client.readyState = 1;
      real.on('message', data => {
        const s = data.toString(), auto = room.ctx._auto();
        if (auto && s === auto.request) { real.send(auto.response); return; }
        Promise.resolve(room.o.webSocketMessage(serverEnd, s)).catch(e => console.error('webSocketMessage', e));
      });
      real.on('close', (code, reason) => {
        serverEnd.readyState = 3; client.readyState = 3;
        Promise.resolve(room.o.webSocketClose(serverEnd, code, String(reason), true)).catch(e => console.error('webSocketClose', e)).finally(() => room.ctx._sockets.delete(serverEnd));
      });
      real.on('error', () => {});
    });
  } catch (e) { console.error(e); socket.destroy(); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`cfsim bereit: http://127.0.0.1:${PORT}/ (Team-Passwort „${env.TEAM_KEY}“)`));

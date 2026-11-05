// Worker für den Waldbrand-UAV-Rechner.
// Liefert die Rechnerseite aus ./public aus, stellt unter /api/variants
// einen gemeinsamen Speicher für Team-Varianten (Cloudflare D1) bereit und
// holt unter /api/pvgis typische meteorologische Jahre von PVGIS (EU JRC),
// weil der PVGIS-Server keine direkten Browser-Abrufe erlaubt.
//
// Lesen ist für alle mit dem Link möglich, Schreiben und Löschen nur mit
// dem Team-Passwort (Secret TEAM_KEY, gesetzt mit: npx wrangler secret put TEAM_KEY).

const MAX_BODY = 256 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function requireKey(request, env) {
  const want = env.TEAM_KEY || '';
  if (!want) throw new HttpError(503, 'Auf dem Server ist noch kein Team-Passwort gesetzt (npx wrangler secret put TEAM_KEY).');
  const enc = new TextEncoder();
  const a = enc.encode(request.headers.get('x-team-key') || '');
  const b = enc.encode(want);
  const ok = a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
  if (!ok) throw new HttpError(401, 'Team-Passwort fehlt oder ist falsch.');
}

const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const num = x => (Number.isFinite(Number(x)) ? Number(x) : null);

async function readVariant(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'Die Konfiguration ist zu groß.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Die Konfiguration ist zu groß.');
  let body;
  try { body = JSON.parse(text); } catch { throw new HttpError(400, 'Ungültiges JSON.'); }
  const name = clean(body.name, 80);
  if (!name) throw new HttpError(400, 'Bitte einen Namen für die Variante angeben.');
  const data = body.data;
  if (!data || typeof data !== 'object' || !data.params || !Array.isArray(data.comps)) {
    throw new HttpError(400, 'Die Konfiguration ist unvollständig.');
  }
  const s = body.summary || {};
  return {
    name,
    author: clean(body.author, 60),
    data: JSON.stringify({ params: data.params, comps: data.comps, gen: data.gen ?? null }),
    mass: num(s.mass_kg),
    power: num(s.power_w),
    verdict: clean(s.verdict, 160),
    expected: num(body.expected_updated_at)
  };
}

async function handleApi(request, env, url) {
  const m = url.pathname.match(/^\/api\/variants(?:\/([^/]+))?\/?$/);
  if (!m) throw new HttpError(404, 'Unbekannter Pfad.');
  const id = m[1];
  if (id !== undefined && !ID_RE.test(id)) throw new HttpError(400, 'Ungültige ID.');
  const method = request.method;

  if (!id) {
    if (method === 'GET') {
      const { results } = await env.DB
        .prepare('SELECT id, name, author, mass_kg, power_w, verdict, updated_at FROM variants ORDER BY updated_at DESC LIMIT 200')
        .all();
      return json({ variants: results });
    }
    if (method === 'POST') {
      requireKey(request, env);
      const v = await readVariant(request);
      const newId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const now = Date.now();
      await env.DB
        .prepare('INSERT INTO variants (id, name, author, data, mass_kg, power_w, verdict, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(newId, v.name, v.author, v.data, v.mass, v.power, v.verdict, now)
        .run();
      return json({ id: newId, name: v.name, updated_at: now }, 201);
    }
    throw new HttpError(405, 'Methode nicht erlaubt.');
  }

  if (method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM variants WHERE id = ?').bind(id).first();
    if (!row) throw new HttpError(404, 'Diese Variante gibt es nicht mehr.');
    return json({ ...row, data: JSON.parse(row.data) });
  }

  if (method === 'PUT') {
    requireKey(request, env);
    const v = await readVariant(request);
    const now = Date.now();
    let res;
    if (v.expected !== null) {
      res = await env.DB
        .prepare('UPDATE variants SET name = ?, author = ?, data = ?, mass_kg = ?, power_w = ?, verdict = ?, updated_at = ? WHERE id = ? AND updated_at = ?')
        .bind(v.name, v.author, v.data, v.mass, v.power, v.verdict, now, id, v.expected)
        .run();
    } else {
      res = await env.DB
        .prepare('UPDATE variants SET name = ?, author = ?, data = ?, mass_kg = ?, power_w = ?, verdict = ?, updated_at = ? WHERE id = ?')
        .bind(v.name, v.author, v.data, v.mass, v.power, v.verdict, now, id)
        .run();
    }
    if (!res.meta.changes) {
      const cur = await env.DB.prepare('SELECT author, updated_at FROM variants WHERE id = ?').bind(id).first();
      if (!cur) throw new HttpError(404, 'Diese Variante gibt es nicht mehr.');
      return json({ error: 'Die Variante wurde inzwischen geändert.', author: cur.author, updated_at: cur.updated_at }, 409);
    }
    return json({ id, name: v.name, updated_at: now });
  }

  if (method === 'DELETE') {
    requireKey(request, env);
    const res = await env.DB.prepare('DELETE FROM variants WHERE id = ?').bind(id).run();
    if (!res.meta.changes) throw new HttpError(404, 'Diese Variante gibt es nicht mehr.');
    return json({ ok: true });
  }

  throw new HttpError(405, 'Methode nicht erlaubt.');
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
      return await handleApi(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Serverfehler. Details stehen im Worker-Log.' }, 500);
    }
  }
};

/* ---------- Team-Varianten (Cloudflare D1 über /api/variants) und PVGIS über /api/pvgis ---------- */
const TEAM_STORE = 'waldbrand-uav-team-v1';
const T = { variants: [], loaded: null, online: false, busy: false };
function teamPersist() {
  try { localStorage.setItem(TEAM_STORE, JSON.stringify({ loaded: T.loaded, author: $('#t-author').value })); } catch (e) { /* ignorieren */ }
  try { sessionStorage.setItem(TEAM_STORE + '-key', $('#t-key').value); } catch (e) { /* ignorieren */ }
}
function say(text) { $('#t-msg').textContent = text; }
const fmtDate = ms => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json' };
  if (opts.auth) headers['x-team-key'] = $('#t-key').value;
  let res;
  try { res = await fetch('/api/variants' + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
  catch (e) { const err = new Error('Server nicht erreichbar. Seid ihr online?'); err.status = 0; throw err; }
  let data = null;
  try { data = await res.json(); } catch (e) { const err = new Error('Der Team-Speicher antwortet nicht. Läuft die Seite auf dem Cloudflare-Worker?'); err.status = res.status; throw err; }
  if (!res.ok) { const err = new Error((data && data.error) || ('Fehler ' + res.status)); err.status = res.status; err.data = data; throw err; }
  return data;
}
function teamSummary() {
  if (!R) return {};
  const [, txt] = verdictOf(R);
  return { mass_kg: Math.round(R.C.m * 100) / 100, power_w: Math.round(pCons(R.C) * 10) / 10, verdict: txt };
}
function renderTeam() {
  $('#team-state').innerHTML = T.online ? pill('good', 'Team-Speicher verbunden') : pill('warn', 'Team-Speicher nicht erreichbar');
  const list = $('#t-list');
  if (!T.online) list.innerHTML = '<li class="empty">Die Team-Funktionen gibt es nur auf der gehosteten Seite. Lokal geöffnet funktioniert der Rechner ohne sie.</li>';
  else if (!T.variants.length) list.innerHTML = '<li class="empty">Noch keine Varianten gespeichert. Gebt unten einen Namen ein und speichert den aktuellen Stand.</li>';
  else list.innerHTML = T.variants.map(v => {
    const meta = [v.author ? esc(v.author) : null, fin(v.mass_kg) ? nf(v.mass_kg, 2) + ' kg' : null, fin(v.power_w) ? nf(v.power_w, 0) + ' W' : null, v.verdict ? esc(v.verdict) : null, fmtDate(v.updated_at)].filter(Boolean).join(' · ');
    const active = T.loaded && T.loaded.id === v.id;
    return `<li class="${active ? 'active' : ''}" data-vid="${esc(v.id)}"><div class="vinfo"><div class="vname">${esc(v.name)}${active ? ' <span class="muted small">(geladen)</span>' : ''}</div><div class="vmeta">${meta}</div></div><div class="vacts"><button type="button" class="btn sm" data-act="load">Laden</button><button type="button" class="btn sm" data-act="del">Löschen</button></div></li>`;
  }).join('');
  const ll = $('#t-loaded');
  if (T.loaded) { ll.hidden = false; ll.textContent = `Zuletzt geladen oder gespeichert: „${T.loaded.name}“ (Stand ${fmtDate(T.loaded.updated_at)})`; } else ll.hidden = true;
  $('#t-save-new').disabled = !T.online || T.busy;
  $('#t-save-over').disabled = !T.online || T.busy || !T.loaded || !T.variants.some(v => v.id === T.loaded.id);
  $('#t-refresh').disabled = T.busy;
}
async function teamRefresh(quiet) {
  try { const d = await api(''); T.online = true; T.variants = d.variants || []; if (!quiet) say('Liste aktualisiert.'); }
  catch (e) { T.online = false; T.variants = []; if (!quiet) say(e.message); }
  renderTeam();
}
async function busy(fn) { T.busy = true; renderTeam(); try { await fn(); } finally { T.busy = false; renderTeam(); } }
const teamData = () => ({ params: S.params, comps: S.comps, gen: S.gen });
function teamInit() {
  try { const t = JSON.parse(localStorage.getItem(TEAM_STORE) || '{}'); T.loaded = t.loaded || null; $('#t-author').value = t.author || ''; } catch (e) { /* ignorieren */ }
  try { $('#t-key').value = sessionStorage.getItem(TEAM_STORE + '-key') || ''; } catch (e) { /* ignorieren */ }
  $('#t-form').addEventListener('submit', e => e.preventDefault());
  ['t-author', 't-key'].forEach(id => document.getElementById(id).addEventListener('input', teamPersist));
  $('#t-refresh').addEventListener('click', () => busy(() => teamRefresh(false)));
  $('#t-save-new').addEventListener('click', () => busy(async () => {
    const name = $('#t-name').value.trim();
    if (!name) { say('Bitte einen Namen für die Variante eingeben.'); $('#t-name').focus(); return; }
    try {
      const r = await api('', { method: 'POST', auth: true, body: { name, author: $('#t-author').value.trim(), data: teamData(), summary: teamSummary() } });
      T.loaded = { id: r.id, name: r.name, updated_at: r.updated_at }; teamPersist(); say(`„${r.name}“ gespeichert.`); await teamRefresh(true);
    } catch (e) { say(e.message); }
  }));
  $('#t-save-over').addEventListener('click', () => busy(async () => {
    if (!T.loaded) return;
    const name = $('#t-name').value.trim() || T.loaded.name;
    try {
      const r = await api('/' + encodeURIComponent(T.loaded.id), { method: 'PUT', auth: true, body: { name, author: $('#t-author').value.trim(), data: teamData(), summary: teamSummary(), expected_updated_at: T.loaded.updated_at } });
      T.loaded = { id: r.id, name: r.name, updated_at: r.updated_at }; teamPersist(); say(`„${r.name}“ überschrieben.`);
    } catch (e) {
      if (e.status === 409) say(`„${T.loaded.name}“ wurde inzwischen${e.data && e.data.author ? ' von ' + e.data.author : ''} geändert. Speichert euren Stand als neue Variante oder ladet die aktuelle Fassung.`);
      else say(e.message);
    }
    await teamRefresh(true);
  }));
  let delArmed = null;
  $('#t-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]'); if (!btn || T.busy) return;
    const id = btn.closest('[data-vid]').dataset.vid, v = T.variants.find(x => x.id === id); if (!v) return;
    if (btn.dataset.act === 'load') busy(async () => {
      try {
        const full = await api('/' + encodeURIComponent(id));
        S = sanitize(full.data); T.loaded = { id: full.id, name: full.name, updated_at: full.updated_at }; teamPersist();
        $('#t-name').value = full.name;
        buildForms(); renderCompTable(); onWeatherChange(); invalidateAll(); schedule(true);
        say(`„${full.name}“ geladen.`);
      } catch (err) { say(err.message); await teamRefresh(true); }
    });
    if (btn.dataset.act === 'del') {
      if (delArmed !== id) { delArmed = id; btn.textContent = 'Wirklich löschen?'; btn.classList.add('danger'); setTimeout(() => { if (delArmed === id) { delArmed = null; renderTeam(); } }, 3500); return; }
      delArmed = null;
      busy(async () => {
        try { await api('/' + encodeURIComponent(id), { method: 'DELETE', auth: true }); if (T.loaded && T.loaded.id === id) { T.loaded = null; teamPersist(); } say(`„${v.name}“ gelöscht.`); }
        catch (err) { say(err.message); }
        await teamRefresh(true);
      });
    }
  });
  renderTeam(); teamRefresh(true);
}
RENDER.team = () => renderTeam();
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

/* ===================================================================
   Oberfläche Teil 4: Komponenten, Energie, Wetter, Einsatz,
   Robustheit, SORA, Validierung, Start
   =================================================================== */

/* ---------- Komponenten ---------- */
let INFO = {}, CFG = [], RATE = {};
const COMP_PRESETS = [['wb', 'Waldbrand', 0, []], ['ka', 'Kartierung', 1, []], ['ma', 'Maritim', 2, []], ['wbg', 'Waldbrand + Gimbal', 0, ['gimbal']]];
function presetIds(p) { return [...Object.keys(INFO).filter(id => INFO[id].r && INFO[id].r[p[2]] === 'k'), ...p[3]]; }
function markCompPreset() {
  const on = new Set(S.comps.filter(c => c.on && c.group !== 'own').map(c => c.id));
  $$('#comp-presets [data-cp]').forEach(b => {
    const p = COMP_PRESETS.find(x => x[0] === b.dataset.cp), ids = new Set(presetIds(p).filter(id => S.comps.some(c => c.id === id)));
    b.setAttribute('aria-pressed', String(ids.size === on.size && [...ids].every(i => on.has(i))));
  });
}
const openInfo = new Set();
function renderCompTable() {
  const G = GROUPS, tb = $('#tbl-comps');
  const sel = (c, i) => `<select data-ci="${i}" data-cf="sched" aria-label="Zeitplan">${SCHED.map(([v, l]) => `<option value="${v}"${c.sched === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  let h = `<thead><tr><th>An</th><th>Komponente</th><th class="r">Masse g</th><th class="r" title="Lage des Schwerpunkts ab Bugspitze">x m</th><th class="r">Leistung W</th><th class="r">Dauer %</th><th>Zeitplan</th><th class="r">cW·A cm²</th><th class="r">Mittel W</th><th></th></tr></thead>`;
  for (const [g, gl] of G) {
    const list = S.comps.map((c, i) => [c, i]).filter(([c]) => c.group === g); if (!list.length) continue;
    const gm = list.reduce((s, [c]) => s + (c.on ? c.m : 0), 0), gp = list.reduce((s, [c]) => s + (c.on ? c.p * c.d / 100 : 0), 0);
    h += `<tbody><tr class="grp"><th colspan="10">${esc(gl)}<span class="gsum">${nf(gm, 0)} g · ${nf(gp, 1)} W</span></th></tr>`;
    for (const [c, i] of list) {
      const inf = INFO[c.id], open = openInfo.has(c.id);
      h += `<tr class="row${c.on ? '' : ' off'}"><td><input type="checkbox" data-ci="${i}" data-cf="on" ${c.on ? 'checked' : ''} aria-label="${esc(c.name)} an"></td>` +
        `<td><div class="namecell">${inf ? `<button class="info-btn" type="button" data-info="${esc(c.id)}" aria-expanded="${open}" aria-label="Info zu ${esc(c.name)}">i</button>` : ''}<input class="name" type="text" data-ci="${i}" data-cf="name" value="${esc(c.name)}" aria-label="Name"></div></td>` +
        `<td class="r"><input type="number" data-ci="${i}" data-cf="m" value="${c.m}" step="5" min="0" aria-label="Masse"></td><td class="r"><input type="number" data-ci="${i}" data-cf="x" value="${c.x ?? 0.5}" step="0.01" min="-0.5" max="6" aria-label="Lage ab Bug in m"></td><td class="r"><input type="number" data-ci="${i}" data-cf="p" value="${c.p}" step="0.1" min="0" aria-label="Leistung"></td>` +
        `<td class="r"><input type="number" data-ci="${i}" data-cf="d" value="${c.d}" step="5" min="0" max="100" aria-label="Einschaltdauer"></td><td>${sel(c, i)}</td>` +
        `<td class="r"><input type="number" data-ci="${i}" data-cf="cda" value="${c.cda || 0}" step="1" min="0" aria-label="Widerstandsfläche"></td><td class="r calc">${nf(c.on ? c.p * c.d / 100 : 0, 2)}</td>` +
        `<td>${c.group === 'own' ? `<button class="del" type="button" data-del="${i}" aria-label="${esc(c.name)} entfernen">×</button>` : ''}</td></tr>`;
      if (inf && open) {
        const rates = CFG.map(([k, l], j) => { const r = inf.r[j]; return `<li class="rate-${r}"><span class="dot"></span><span>${esc(l)}: <b>${esc(RATE[r])}</b></span></li>`; }).join('');
        h += `<tr class="info-row"><td></td><td colspan="9"><div class="info"><div class="info-text"><p><b>Was:</b> ${esc(inf.what)}</p><p><b>Wofür:</b> ${esc(inf.why)}</p><p><b>Tipp:</b> ${esc(inf.tip)}</p></div><div><ul class="rates">${rates}</ul><textarea class="note" rows="2" data-ci="${i}" data-cf="note" placeholder="Eigene Notiz" aria-label="Notiz" style="margin-top:8px">${esc(c.note || '')}</textarea></div></div></td></tr>`;
      }
    }
    h += '</tbody>';
  }
  const on = S.comps.filter(c => c.on), M = on.reduce((s, c) => s + c.m, 0), cda = on.reduce((s, c) => s + (c.cda || 0), 0);
  const pw = k => on.filter(c => c.sched === k).reduce((s, c) => s + c.p * c.d / 100, 0);
  h += `<tfoot><tr><td></td><td class="lbl">Summe eingeschaltet</td><td class="r">${nf(M, 0)}</td><td class="r">${M > 0 ? nf(on.reduce((a, c) => a + c.m * (c.x ?? 0.5), 0) / M, 2) : '–'}</td><td></td><td></td><td></td><td class="r">${nf(cda, 0)}</td><td class="r">${nf(pw('always') + pw('mission') + pw('day'), 1)}</td><td></td></tr></tfoot>`;
  tb.innerHTML = h;
  $('#comp-presets').innerHTML = COMP_PRESETS.map(([k, l]) => `<button class="chip" type="button" data-cp="${k}" aria-pressed="false">${esc(l)}</button>`).join('');
  markCompPreset();
  $('#kpis-sched').innerHTML = [kpi('Immer', nf(pw('always'), 1), 'W', 'Avionik, Funk, Sicherheit'), kpi('Im Einsatzfenster', nf(pw('mission'), 1), 'W', `${S.params.tStart}–${S.params.tEnd}`), kpi('Nur bei Tag', nf(pw('day'), 1), 'W', 'z. B. RGB- und Multispektralkamera'), kpi('Nur bei Nacht', nf(pw('night'), 1), 'W', 'z. B. Akkuheizung')].join('');
}
const tblC = $('#tbl-comps');
tblC.addEventListener('input', e => {
  const el = e.target, i = Number(el.dataset.ci), f = el.dataset.cf; if (!fin(i) || !f || !S.comps[i]) return;
  if (f === 'name' || f === 'note') { S.comps[i][f] = el.value; save(); return; }
  if (f === 'on' || f === 'sched') return;
  const x = Number(el.value); if (el.value === '' || !fin(x)) return;
  S.comps[i][f] = f === 'd' ? clamp(x, 0, 100) : f === 'x' ? clamp(x, -0.5, 6) : Math.max(0, x);
  const row = el.closest('tr'), c = S.comps[i]; if (row) row.querySelector('.calc').textContent = nf(c.on ? c.p * c.d / 100 : 0, 2);
  schedule();
});
tblC.addEventListener('change', e => {
  const el = e.target, i = Number(el.dataset.ci), f = el.dataset.cf; if (!fin(i) || !S.comps[i]) return;
  if (f === 'on') { S.comps[i].on = el.checked; renderCompTable(); schedule(); }
  else if (f === 'sched') { S.comps[i].sched = el.value; renderCompTable(); schedule(); }
  else if (f === 'm' || f === 'p' || f === 'd' || f === 'cda') renderCompTable();
});
tblC.addEventListener('click', e => {
  const ib = e.target.closest('[data-info]'); if (ib) { const id = ib.dataset.info; if (openInfo.has(id)) openInfo.delete(id); else openInfo.add(id); renderCompTable(); return; }
  const d = e.target.closest('[data-del]'); if (d) { S.comps.splice(Number(d.dataset.del), 1); renderCompTable(); schedule(); }
});
$('#comp-presets').addEventListener('click', e => {
  const b = e.target.closest('[data-cp]'); if (!b) return;
  const ids = new Set(presetIds(COMP_PRESETS.find(x => x[0] === b.dataset.cp)));
  S.comps.forEach(c => { if (c.group !== 'own') c.on = ids.has(c.id); });
  renderCompTable(); schedule();
  $('#comp-msg').textContent = `Konfiguration „${b.textContent}“: Kernkomponenten eingeschaltet, alles andere aus. Eigene Komponenten bleiben unverändert.`;
});
$('#comp-add').addEventListener('click', () => { S.comps.push({ id: 'own-' + Date.now().toString(36), name: 'Neue Komponente', group: 'own', m: 50, p: 1, d: 100, on: true, sched: 'always', cda: 0, x: 0.5, y: 0 }); renderCompTable(); schedule(); });
RENDER.komponenten = () => { if (!document.activeElement || !document.activeElement.closest || !document.activeElement.closest('#tbl-comps')) renderCompTable(); };

/* ---------- Energie ---------- */
RENDER.energie = (R) => {
  const { C, P, per, mis } = R;
  const night = R.e.rise != null ? (R.e.rise + 24 - R.e.set) % 24 : NaN;
  const flat = cached('flat', () => { const Q = { ...P, solarGeom: 'flach', camberEta: 100, laminateLoss: P.laminateLoss }; const C2 = buildCase(Q, S.comps); const s2 = daySeries(C2, envClear(Q, R.n, R.y)); let e = 0; for (let i = 0; i < NSTEP; i++) e += s2.ps[i] * DT; return e; });
  let tc = 0, tw = 0; for (let i = 0; i < NSTEP; i++) if (R.ser.ps[i] > 0) { const g = R.ser.ps[i] / C.solK; tc += (R.e.T[i] + P.cellHeat * g) * R.ser.ps[i]; tw += R.ser.ps[i]; }
  $('#kpis-energy').innerHTML = [
    kpi('Solarertrag', nf(R.eSol, 0), 'Wh', `Spitze ${nf(R.peak, 0)} W · ${nf(R.eSol / Math.max(0.01, P.solarArea), 0)} Wh/m² Zellen`),
    kpi('Verbrauch 24 h', nf(R.eCons, 0), 'Wh', `Mittel ${nf(R.eCons / 24, 1)} W`),
    kpi('Defizit aus dem Akku', nf(R.eNight, 0), 'Wh', `Nacht ${fin(night) ? fmtDur(night) : '–'} · Akku ${nf(C.cap, 0)} Wh`, R.eNight > C.cap ? 'bad' : ''),
    kpi('Akku voll', per.reason === 'ok' && per.tCm > 0 ? fmtT(per.tFc) : '–', '', per.reason === 'ok' ? `Charge Margin ${nf(per.tCm, 1)} h` : 'im Dauerflug nicht erreicht'),
    kpi('Wölbung und Einfallswinkel', P.solarGeom === 'flach' ? nf(P.camberEta, 1) : nf(R.eSol / Math.max(1e-6, flat) * 100, 1), '%', P.solarGeom === 'flach' ? 'Pauschalwert' : 'Tagesertrag relativ zu waagerechten Zellen'),
    kpi('Zelltemperatur', tw ? nf(tc / tw, 0) : '–', '°C', `ertragsgewichtet · ${nf(P.tempCoef, 2)} %/K`),
    kpi('Akkutemperatur min.', nf(C.tBattMin, 0), '°C', `Kapazität ${nf(C.fBattT * 100, 0)} % · Alterung ${nf(P.battHealth, 0)} %`, C.tBattMin < 0 ? 'bad' : ''),
    kpi('Wirkungsgradkette Solar', nf(C.solK / Math.max(1e-9, P.solarArea) * 100, 1), '%', 'Zelle × MPPT × Laminat × Leitung × Schmutz')
  ].join('');
  $('#eb-sub').textContent = `${fmtDoy(R.n, R.y)} bei ${nf(P.lat, 1)}° N, ${nf(P.lon, 1)}° O, klarer Himmel × ${nf(P.sky, 0)} %, Luft ${nf(P.tMin, 0)}–${nf(P.tMax, 0)} °C am Boden.`;
  renderBattV(R);
  // Jahresverlauf
  const sw = cached('season', () => seasonSweep(C, 5)), win = seasonWindow(sw, P.tExcReq);
  const tx = sw.map(([n, r]) => [n, fin(r.tExc) ? r.tExc : r.tExc === Infinity ? 24 : NaN]), en = sw.map(([n, , m]) => [n, m ? (m.endur ?? 48) : NaN]);
  const mt = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const xr = { min: 1, max: 365, ticks: mt, fmt: v => MONTHS[mt.indexOf(v)] || '', tipFmt: v => fmtDoy(Math.round(v), R.y) };
  lineChart($('#ch-season'), { h: 200, title: 'Excess Time', x: xr, y: { min: Math.max(-24, Math.min(-12, ...tx.map(p => p[1]).filter(fin))), max: Math.max(12, ...tx.map(p => p[1]).filter(fin)), fmt: v => nf(v, 0) + ' h' }, series: [{ name: 'Excess Time', c: 1, pts: tx, fmt: v => nfs(v, 1) + ' h' }], hlines: [{ y: P.tExcReq, label: `gefordert ${nf(P.tExcReq, 1)} h` }], vlines: [{ x: R.n, label: 'Auslegungstag' }] });
  lineChart($('#ch-season2'), { h: 170, title: `Ausdauer ab ${P.tStart} mit vollem Akku`, x: xr, y: { min: 0, max: 48, ticks: [0, 12, 24, 36, 48], fmt: v => nf(v, 0) + ' h' }, series: [{ name: 'Ausdauer bis Reserve', c: 3, pts: en, fmt: v => (v >= 48 ? '≥ 48' : nf(v, 1)) + ' h' }], hlines: [{ y: ((hm(P.tEnd) - hm(P.tStart) + 24) % 24) || 24, label: 'Einsatzfenster' }] });
  $('#season-sub').textContent = win.ok ? (win.ok[2] ? 'Dauerflug ganzjährig möglich.' : `Dauerflug möglich von ${fmtDoy(win.ok[0], R.y)} bis ${fmtDoy(win.ok[1], R.y)}${win.rob ? `, mit geforderter Reserve von ${fmtDoy(win.rob[0], R.y)} bis ${fmtDoy(win.rob[1], R.y)}` : ', die geforderte Reserve wird nie erreicht'}.`) : 'Dauerflug an keinem Tag des Jahres möglich. Die untere Kurve zeigt, wie lange ein Einsatz mit vollem Akku dauern kann.';
  renderStudy(R);
  // Einstrahlungsgeometrie
  const sg = C.sol, ex = []; for (let k = 0; k <= 90; k += 2) ex.push(k);
  const ser = [{ name: 'Waagerecht, ohne Verluste', c: 4, pts: ex.map(k => [k, Math.sin(k * DEG)]), dash: true, fmt: v => nf(v, 3) }];
  if (sg.flat) ser.push({ name: 'Pauschal (ETH)', c: 1, pts: ex.map(k => [k, Math.sin(k * DEG) * P.camberEta / 100]), fmt: v => nf(v, 3) });
  else { ser.push({ name: 'Gewölbt, Geradeausflug', c: 1, pts: ex.map(k => [k, sg.lvl.Fb[k]]), fmt: v => nf(v, 3) }); if (P.turnFrac > 0) ser.push({ name: `Gewölbt, Kurve ${nf(P.bank, 0)}°`, c: 2, pts: ex.map(k => [k, sg.turn.Fb[k]]), fmt: v => nf(v, 3) }); }
  lineChart($('#ch-solgeo'), { h: 200, title: 'Direktstrahlung auf die Zellen je W/m² senkrechter Einstrahlung', x: { min: 0, max: 90, fmt: v => nf(v, 0) + '°', title: 'Sonnenhöhe' }, y: { min: 0, max: 1, fmt: v => nf(v, 1) }, series: ser });
  $('#sol-sub').textContent = sg.flat ? 'Pauschaler Wölbungsfaktor wie im ETH-Werkzeug.' : `Mittel über alle Kurse zur Sonne. Anstellwinkel ${nf(sg.pitch, 1)}°, Zellen ${nf(P.cellX0, 0)}–${nf(P.cellX1, 0)} % der Tiefe auf ${C.foil.name}. Diffus ${nf(sg.Fd * 100, 1)} %, Bodenreflexion ${nf(sg.Fg * 100, 1)} % der jeweiligen Strahlung.`;
};
function renderStudy(R) {
  const P = S.params, tabs = $('#study-tabs');
  if (!tabs.children.length) tabs.innerHTML = Object.entries(SWEEPS).map(([k, s]) => `<button class="tab" role="tab" type="button" data-st="${k}">${esc(s.label.replace(/ \(.*\)/, k === 'spanAR' ? ' (Streckung fest)' : ''))}</button>`).join('');
  $$('#study-tabs .tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.st === UI.studyTab)));
  const sw = SWEEPS[UI.studyTab], res = cached('study-' + UI.studyTab, () => sweep(P, S.comps, sw.vals(P), sw.map));
  const x0 = res[0].x, x1 = res[res.length - 1].x, cur = UI.studyTab === 'chord' ? P.area / P.span : P[UI.studyTab === 'spanAR' ? 'span' : UI.studyTab];
  const tx = res.map(r => [r.x, fin(r.tExc) ? r.tExc : NaN]), en = res.map(r => [r.x, r.endur ?? 48]), pt = res.map(r => [r.x, r.pTot]), ms = res.map(r => [r.x, r.m]);
  const bestT = res.filter(r => fin(r.tExc)).reduce((a, b) => (b.tExc > (a ? a.tExc : -1e9) ? b : a), null);
  lineChart($('#ch-study'), { h: 210, title: `Excess Time über ${sw.label}`, x: { min: x0, max: x1, fmt: v => nf(v, x1 - x0 < 3 ? 2 : 1), tipFmt: v => nf(v, 2) + ' ' + sw.unit, title: `${sw.label} (${sw.unit})` }, y: { min: Math.min(-12, ...tx.map(p => p[1]).filter(fin)), max: Math.max(8, ...tx.map(p => p[1]).filter(fin)), fmt: v => nf(v, 0) + ' h' }, series: [{ name: 'Excess Time', c: 1, pts: tx, fmt: v => nfs(v, 1) + ' h' }], hlines: [{ y: P.tExcReq, label: 'gefordert' }], vlines: [{ x: cur, label: 'aktuell' }], marks: bestT ? [{ x: bestT.x, y: bestT.tExc, c: 1, label: 'Optimum' }] : [], tipExtra: x => { const r = res.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)); return `<div class="row"><span>Abflugmasse</span><b>${nf(r.m, 2)} kg</b></div><div class="row"><span>Leistung Tag</span><b>${nf(r.pTot, 1)} W</b></div><div class="row"><span>Struktur</span><b>${nf(r.mStruct, 2)} kg</b></div>`; } });
  lineChart($('#ch-study2'), { h: 180, title: `Ausdauer ab ${P.tStart} mit vollem Akku`, x: { min: x0, max: x1, fmt: v => nf(v, x1 - x0 < 3 ? 2 : 1), tipFmt: v => nf(v, 2) + ' ' + sw.unit }, y: { min: 0, max: 48, ticks: [0, 12, 24, 36, 48], fmt: v => nf(v, 0) + ' h' }, series: [{ name: 'Ausdauer', c: 3, pts: en, fmt: v => (v >= 48 ? '≥ 48' : nf(v, 1)) + ' h' }], vlines: [{ x: cur, label: 'aktuell' }] });
  $('#study-sub').textContent = `Eine Größe verändert, alles andere fest. Strukturmasse, Zellfläche und Polaren werden jeweils neu gerechnet${UI.studyTab === 'span' || UI.studyTab === 'spanAR' || UI.studyTab === 'chord' ? ' (Zellfläche wächst mit der Flügelfläche)' : ''}. Auslegungstag ${fmtDoy(R.n, R.y)}.`;
}
$('#study-tabs').addEventListener('click', e => { const t = e.target.closest('[data-st]'); if (!t) return; UI.studyTab = t.dataset.st; saveUI(); renderStudy(R); });

/* ---------- Wetter ---------- */
const WX = { sites: {}, upload: null, result: null, resultKey: null, running: false };
const UPLOAD_KEY = 'waldbrand-uav-v5-upload';
try { const u = localStorage.getItem(UPLOAD_KEY); if (u) WX.uploadRaw = JSON.parse(u); } catch (e) { /* ignorieren */ }
function siteData(key) { if (!WX.sites[key]) { const s = DATA.weather.sites.find(x => x.key === key); if (s) WX.sites[key] = decodeSite(s); } return WX.sites[key] || null; }
function uploadData() { if (!WX.upload && WX.uploadRaw) { try { WX.upload = decodeSite(WX.uploadRaw); } catch (e) { WX.uploadRaw = null; } } return WX.upload; }
function genMonths() {
  if (!S.gen) { const W = siteData('piemont'); S.gen = { src: 'Piemont (PVGIS-TMY)', months: monthlyStats(W).map(m => ({ kt: m.kt, T: m.T, amp: m.amp, ws: m.ws })) }; }
  return S.gen.months;
}
let genCache = null;
function currentWeather() {
  const P = S.params;
  if (P.weather === 'piemont' || P.weather === 'amsterdam') return siteData(P.weather);
  if (P.weather === 'upload') return uploadData();
  if (P.weather === 'gen') {
    const k = JSON.stringify([genMonths(), P.genYears, P.genSeed, P.lat, P.lon, P.alt]);
    if (!genCache || genCache.k !== k) genCache = { k, W: genWeather({ name: 'Wettergenerator', lat: P.lat, lon: P.lon, elev: P.alt, utc: Math.round(P.lon / 15), tc: 0.5 }, genMonths(), clamp(Math.round(P.genYears), 1, 50), P.genSeed) };
    return genCache.W;
  }
  return null;
}
function encodeSite(site, g, d, T, w) {
  const b = new Uint8Array(g.length * 4);
  for (let i = 0; i < g.length; i++) { b[4 * i] = clamp(Math.round(g[i] / 5), 0, 255); b[4 * i + 1] = clamp(Math.round(Math.min(d[i], g[i]) / 5), 0, 255); b[4 * i + 2] = clamp(Math.round((T[i] + 40) * 2), 0, 255); b[4 * i + 3] = clamp(Math.round(w[i] * 5), 0, 255); }
  let bin = ''; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return { ...site, data: btoa(bin) };
}
// PVGIS-TMY (JSON/CSV) oder EPW einlesen
function parseWeatherFile(text, name) {
  const t = text.trim();
  if (t[0] === '{') {
    const j = JSON.parse(t), loc = (j.inputs && j.inputs.location) || {}, rows = j.outputs && (j.outputs.tmy_hourly || j.outputs.hourly);
    if (!rows || !rows.length) throw new Error('Keine stündlichen Werte gefunden (PVGIS-TMY als JSON erwartet).');
    const gk = rows[0]['G(h)'] !== undefined ? 'G(h)' : null; if (!gk) throw new Error('Spalte G(h) fehlt. Bitte das PVGIS-Werkzeug „TMY“ verwenden.');
    if (rows.length < 8760) throw new Error(`Nur ${rows.length} Stunden – ein ganzes Jahr (8760 h) wird gebraucht.`);
    const R8 = rows.slice(0, Math.floor(rows.length / 8760) * 8760);
    return { site: { key: 'upload', name: `${name} (${nf(loc.latitude, 2)}° N, ${nf(loc.longitude, 2)}° O)`, lat: loc.latitude, lon: loc.longitude, elev: loc.elevation || 0, utc: 0, tc: fin(loc.irradiance_time_offset) ? loc.irradiance_time_offset : 0.5, src: 'PVGIS-TMY (eigene Datei)' }, g: R8.map(r => r['G(h)']), d: R8.map(r => r['Gd(h)'] ?? 0), T: R8.map(r => r.T2m ?? 15), w: R8.map(r => r.WS10m ?? 2) };
  }
  const lines = t.split(/\r?\n/);
  if (/^LOCATION,/.test(lines[0])) {
    const h = lines[0].split(','), lat = Number(h[6]), lon = Number(h[7]), tz = Number(h[8]), elev = Number(h[9]);
    const g = [], d = [], T = [], w = [];
    for (const ln of lines.slice(8)) { const p = ln.split(','); if (p.length < 22) continue; T.push(Number(p[6])); g.push(Number(p[13])); d.push(Number(p[15])); w.push(Number(p[21])); }
    if (g.length < 8760) throw new Error(`EPW mit nur ${g.length} Stunden.`);
    return { site: { key: 'upload', name: `${name} (${nf(lat, 2)}° N, ${nf(lon, 2)}° O)`, lat, lon, elev, utc: tz, tc: 0.5, src: 'EPW (eigene Datei)' }, g: g.slice(0, 8760), d: d.slice(0, 8760), T: T.slice(0, 8760), w: w.slice(0, 8760) };
  }
  // PVGIS-TMY als CSV
  let lat = NaN, lon = NaN, elev = 0, hi = -1;
  lines.forEach((ln, i) => { const m = /^Latitude[^:]*:\s*([-\d.]+)/i.exec(ln); if (m) lat = Number(m[1]); const n = /^Longitude[^:]*:\s*([-\d.]+)/i.exec(ln); if (n) lon = Number(n[1]); const e = /^Elevation[^:]*:\s*([-\d.]+)/i.exec(ln); if (e) elev = Number(e[1]); if (hi < 0 && /^time\(UTC\)/i.test(ln)) hi = i; });
  if (hi < 0) throw new Error('Format nicht erkannt. Unterstützt: PVGIS-TMY (JSON oder CSV) und EPW.');
  const cols = lines[hi].split(','), ix = k => cols.indexOf(k), g = [], d = [], T = [], w = [];
  for (const ln of lines.slice(hi + 1)) { const p = ln.split(','); if (!/^\d{8}:\d{4}/.test(p[0])) break; g.push(Number(p[ix('G(h)')])); d.push(Number(p[ix('Gd(h)')])); T.push(Number(p[ix('T2m')])); w.push(Number(p[ix('WS10m')])); }
  if (g.length < 8760) throw new Error(`Nur ${g.length} Stunden gefunden.`);
  return { site: { key: 'upload', name: `${name} (${nf(lat, 2)}° N, ${nf(lon, 2)}° O)`, lat, lon, elev, utc: 0, tc: 0.5, src: 'PVGIS-TMY CSV (eigene Datei)' }, g: g.slice(0, 8760), d: d.slice(0, 8760), T: T.slice(0, 8760), w: w.slice(0, 8760) };
}
function handleWeatherText(text, name) {
  const r = parseWeatherFile(text, name);
  WX.uploadRaw = encodeSite(r.site, r.g, r.d, r.T, r.w); WX.upload = null;
  try { localStorage.setItem(UPLOAD_KEY, JSON.stringify(WX.uploadRaw)); } catch (e) { /* zu groß oder gesperrt */ }
  S.params.weather = 'upload'; fillForms(); WX.result = null; renderWxSide(); if (VIEW === 'wetter') runWeather();
  const msg = $('#wx-up-msg'); if (msg) msg.textContent = `Geladen: ${r.site.name}.`;
  return r;
}
function handleWeatherFile(file) {
  const rd = new FileReader();
  rd.onload = () => { try { handleWeatherText(String(rd.result), file.name.replace(/\.[^.]+$/, '')); } catch (err) { const msg = $('#wx-up-msg'); if (msg) msg.textContent = err.message; } };
  rd.onerror = () => { const msg = $('#wx-up-msg'); if (msg) msg.textContent = 'Datei konnte nicht gelesen werden.'; };
  rd.readAsText(file);
}
function renderWxSide() {
  const P = S.params, W = currentWeather();
  const up = $('#wx-upload');
  let h = '';
  if (P.weather === 'upload') h += `<div class="drop" id="wx-drop">PVGIS-TMY (JSON/CSV) oder EPW hier ablegen oder <label class="linkbtn" for="wx-file" style="cursor:pointer">Datei wählen</label><input type="file" id="wx-file" accept=".json,.csv,.epw,.txt" hidden></div><p class="note" style="margin-top:8px">Download: <a href="https://re.jrc.ec.europa.eu/pvg_tools/de/" target="_blank" rel="noopener">PVGIS</a> › „Typisches meteorologisches Jahr“ › Ort wählen › JSON. Die Datei bleibt in eurem Browser.</p><p class="status-msg" id="wx-up-msg" role="status">${uploadData() ? 'Geladen: ' + esc(uploadData().name) : 'Noch keine Datei geladen.'}</p>`;
  if (W && P.weather !== 'gen') {
    const far = Math.abs(W.lat - P.lat) > 0.75 || Math.abs(W.lon - P.lon) > 1.5;
    h += `<div class="hint" style="margin-top:10px"><span><b>${esc(W.name)}</b></span><span>${esc(W.src)}</span>${far ? `<span>Der Auslegungsort (${nf(P.lat, 1)}° N, ${nf(P.lon, 1)}° O) liegt woanders. Die Bewölkung wird übertragen, Sonnenstand und Tageslänge gelten für euren Ort.</span><span><button class="btn sm" type="button" id="wx-adopt">Ort des Datensatzes übernehmen</button></span>` : ''}</div>`;
  }
  if (P.weather === 'clear') h += `<p class="note">Bei klarem Himmel gibt es keine Wetterstatistik. Den Jahresverlauf zeigt die Ansicht Energie. Für Wahrscheinlichkeiten echte Wetterdaten oder den Generator wählen.</p>`;
  up.innerHTML = h;
  if (typeof wxExtra === 'function') wxExtra(up);
  const drop = $('#wx-drop'), fi = $('#wx-file');
  if (fi) fi.addEventListener('change', () => { if (fi.files[0]) handleWeatherFile(fi.files[0]); });
  if (drop) { drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over')); drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) handleWeatherFile(e.dataTransfer.files[0]); }); }
  const ad = $('#wx-adopt'); if (ad) ad.addEventListener('click', () => { S.params.lat = Math.round(W.lat * 100) / 100; S.params.lon = Math.round(W.lon * 100) / 100; S.params.alt = Math.round(W.elev || 0); fillForms(); markPreset(); renderWxSide(); schedule(true); });
  // Generator-Tabelle
  const gp = $('#gen-panel'); gp.hidden = P.weather !== 'gen';
  if (P.weather === 'gen') {
    const ms = genMonths(), mid = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
    $('#gen-table').innerHTML = `<p class="note" style="margin-bottom:8px">Grundlage: ${esc(S.gen.src || 'eigene Werte')}. Globalstrahlung als Monatsmittel der Tagessumme auf die Horizontale, umgerechnet auf euren Breitengrad. Werte für euren Ort liefert PVGIS › „Monatliche Strahlungsdaten“.</p>` +
      `<div class="chips" style="margin-bottom:8px"><span class="small muted">Vorlage:</span><button class="chip" type="button" data-gsrc="piemont">Piemont</button><button class="chip" type="button" data-gsrc="amsterdam">Amsterdam</button>${uploadData() ? '<button class="chip" type="button" data-gsrc="upload">Eigene Datei</button>' : ''}</div>` +
      `<div class="table-wrap"><table class="data"><thead><tr><th>Monat</th><th class="n">H kWh/m²·d</th><th class="n">T °C</th><th class="n">Tagesgang K</th><th class="n">Wind m/s</th></tr></thead><tbody>` +
      ms.map((m, i) => { const H = m.kt * dailyH0(mid[i], P.lat).h0; return `<tr><td>${MONTHS[i]}</td><td class="n"><input type="number" step="0.1" min="0" data-gm="${i}" data-gf="H" value="${H.toFixed(2)}" style="width:72px"></td><td class="n"><input type="number" step="0.5" data-gm="${i}" data-gf="T" value="${m.T.toFixed(1)}" style="width:64px"></td><td class="n"><input type="number" step="0.5" min="0" data-gm="${i}" data-gf="amp" value="${m.amp.toFixed(1)}" style="width:60px"></td><td class="n"><input type="number" step="0.1" min="0" data-gm="${i}" data-gf="ws" value="${m.ws.toFixed(1)}" style="width:60px"></td></tr>`; }).join('') + '</tbody></table></div>';
  }
}
$('#gen-panel').addEventListener('input', e => {
  const el = e.target, i = Number(el.dataset.gm), f = el.dataset.gf; if (!fin(i) || !f) return;
  const x = Number(el.value); if (el.value === '' || !fin(x)) return;
  const mid = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349], m = genMonths()[i];
  if (f === 'H') m.kt = clamp(x / Math.max(0.05, dailyH0(mid[i], S.params.lat).h0), 0.05, 0.8); else m[f] = x;
  S.gen.src = 'eigene Werte'; WX.result = null; save(); schedWx();
});
$('#gen-panel').addEventListener('click', e => {
  const b = e.target.closest('[data-gsrc]'); if (!b) return;
  const W = b.dataset.gsrc === 'upload' ? uploadData() : siteData(b.dataset.gsrc); if (!W) return;
  S.gen = { src: W.name, months: monthlyStats(W).map(m => ({ kt: m.kt, T: m.T, amp: m.amp, ws: m.ws })) };
  save(); renderWxSide(); WX.result = null; schedWx();
});
function onWeatherChange() { WX.result = null; renderWxSide(); }
let wxTimer = null;
function schedWx() { clearTimeout(wxTimer); wxTimer = setTimeout(() => { if (VIEW === 'wetter') runWeather(); }, 400); }
async function runWeather() {
  const P = S.params, W = currentWeather(), key = keyOf(P.weather, S.gen, WX.uploadRaw ? WX.uploadRaw.name : '');
  if (!W) { WX.result = null; drawWeather(); return; }
  if (WX.running) { WX.pending = true; return; }
  if (WX.result && WX.resultKey === key) { drawWeather(); return; }
  WX.running = true; const prog = $('#wx-prog'), bar = prog.firstElementChild; prog.hidden = false; bar.style.width = '0%';
  $('#wx-sub').textContent = 'Rechne …';
  try {
    const C = buildCase(P, S.comps), it = yearSimIter(C, W, { daily: true });
    let r = it.next(), t0 = performance.now();
    while (!r.done) { if (performance.now() - t0 > 40) { bar.style.width = (r.value * 100).toFixed(0) + '%'; await new Promise(res => setTimeout(res, 0)); t0 = performance.now(); } r = it.next(); }
    WX.result = { ys: r.value, W, ms: P.weather === 'gen' ? genMonths().map((m, i) => ({ ...m, H: m.kt * dailyH0([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][i], P.lat).h0 })) : monthlyStats(W) };
    WX.resultKey = key;
  } catch (err) { console.error(err); $('#wx-sub').textContent = 'Fehler: ' + err.message; }
  WX.running = false; prog.hidden = true;
  drawWeather();
  if (WX.pending) { WX.pending = false; runWeather(); }
}
function drawWeather() {
  const P = S.params, X = WX.result;
  const clr = () => { ['#ch-wx-month', '#ch-wx-end', '#ch-wx-h', '#ch-wx-days'].forEach(s => { $(s).innerHTML = ''; }); $('#kpis-wx').innerHTML = ''; };
  if (!X) { clr(); $('#wx-sub').textContent = P.weather === 'clear' ? 'Klarer Himmel gewählt: keine Statistik.' : 'Noch nicht berechnet.'; return; }
  const { ys, W, ms } = X, y = ys.year;
  $('#wx-sub').textContent = `${W.name}, ${ys.years} ${ys.years === 1 ? 'Jahr' : 'Jahre'} Stundenwerte, Ort ${nf(P.lat, 1)}° N. Je Tag drei Kriterien: Einsatz ${P.tStart}–${P.tEnd} mit vollem Akku, Dauerflug-Kriterium der ETH mit dem Tageswetter, und durchgehender Flug mit Landung bei Reserve und Neustart am nächsten Morgen.`;
  $('#kpis-wx').innerHTML = [
    kpi('Einsatztage erfolgreich', nf(y.mission * 100, 0), '%', `Start ${P.tStart} voll, Landung ${P.tEnd} über Reserve`),
    kpi('Tage mit Dauerflug-Wetter', nf(y.perpetual * 100, 0), '%', `davon robust (≥ ${nf(P.tExcReq, 1)} h): ${nf(y.robust * 100, 0)} %`),
    kpi('Ganze Tage in der Luft', nf(y.noLand * 100, 0), '%', 'durchgehender Flug ohne Landung'),
    kpi('Längster Flug', nf(ys.longest / 24, 1), 'Tage', `Anteil in der Luft ${nf(y.airborne * 100, 0)} %`)
  ].join('');
  const months = ys.months;
  groupBars($('#ch-wx-month'), { h: 220, title: 'Anteil der Tage je Monat', cats: MONTHS, y: { min: 0, max: 1, fmt: v => nf(v * 100, 0) + ' %' }, series: [{ name: 'Einsatz gelingt', c: 1, vals: months.map(m => m.mission), fmt: v => pct(v) }, { name: 'Dauerflug-Wetter', c: 2, vals: months.map(m => m.perpetual), fmt: v => pct(v) }, { name: 'Ganzer Tag in der Luft', c: 3, vals: months.map(m => m.noLand), fmt: v => pct(v) }] });
  groupBars($('#ch-wx-end'), { h: 200, title: `Ausdauer ab ${P.tStart} mit vollem Akku`, cats: MONTHS, y: { min: 0, max: Math.max(24, Math.ceil(Math.max(...months.map(m => m.endurMed).filter(fin)) / 6) * 6), fmt: v => nf(v, 0) + ' h' }, series: [{ name: 'Median', c: 1, vals: months.map(m => m.endurMed), fmt: v => (v >= 48 ? '≥ 48' : nf(v, 1)) + ' h' }, { name: 'Schlechteste 10 %', c: 2, vals: months.map(m => m.endurP10), fmt: v => (v >= 48 ? '≥ 48' : nf(v, 1)) + ' h' }], hlines: [{ y: ((hm(P.tEnd) - hm(P.tStart) + 24) % 24) || 24 }] });
  groupBars($('#ch-wx-h'), { h: 180, title: 'Globalstrahlung (Tagessumme, Monatsmittel)', cats: MONTHS, y: { min: 0, max: Math.max(2, Math.ceil(Math.max(...ms.map(m => m.H)))), fmt: v => nf(v, 0) }, series: [{ name: 'kWh/m² · Tag', c: 2, vals: ms.map(m => m.H), fmt: v => nf(v, 2) + ' kWh/m²' }] });
  const days = (ys.daily || []).slice(0, 365);
  const mt = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  lineChart($('#ch-wx-days'), { h: 200, x: { min: 1, max: 365, ticks: mt, fmt: v => MONTHS[mt.indexOf(v)] || '', tipFmt: v => fmtDoy(Math.round(v), 2026) }, y: { min: -24, max: 24, ticks: [-24, -12, 0, 12, 24], fmt: v => nf(v, 0) + ' h' }, series: [{ name: 'Excess Time des Tages', c: 1, pts: days.map(d => [d.n, fin(d.tExc) ? clamp(d.tExc, -24, 24) : -24]), fmt: v => nfs(v, 1) + ' h' }], hlines: [{ y: P.tExcReq, label: 'gefordert' }] });
}
$('#wx-run').addEventListener('click', () => { WX.resultKey = null; runWeather(); });
RENDER.wetter = (R, force) => { renderWxSide(); runWeather(); };

/* ---------- Einsatz ---------- */
RENDER.einsatz = (R) => {
  const { mp, P, C } = R, ws = mp.ws;
  $('#kpis-mis').innerHTML = [
    kpi('Wärmebild-Streifen', nf(mp.ir.swath, 0), 'm', `Bodenauflösung ${nf(mp.ir.gsd * 100, 1)} cm aus ${nf(P.hAGL, 0)} m`),
    kpi('Flächenleistung', nf(mp.rateIr, 1), 'km²/h', `mit Wärmebild · RGB ${nf(mp.rateRgb, 1)} km²/h`),
    kpi('Wiederkehr', fmtDur(mp.revisitIr), '', `für ${nf(P.areaKm2, 0)} km² mit Wärmebild`),
    kpi('Kleinster Brand', nf(mp.fire.Amin * 1e4, 1), 'cm²', `${nf(P.fireT, 0)} K · Schwelbrand 600 K: ${nf(mp.smoulder.Amin * 1e4, 1)} cm²`),
    kpi(`Höchste Flughöhe für ${nf(P.fireRef, 1)} m²`, nf(mp.fire.hMax / 1000, 1), 'km', 'Brand füllt das Pixel genug, klare Luft'),
    kpi('Wind in Flughöhe', nf(ws.u, 1), 'm/s', `Position halten in ${nf(ws.pHold * 100, 0)} % der Zeit`, ws.pHold < 0.9 ? 'bad' : ''),
    kpi('Flächenfaktor im Wind', nf(ws.coverage * 100, 0), '%', `Kurvenradius ${nf(mp.turnR, 0)} m · Bahnnutzung ${nf(mp.legEff * 100, 0)} %`),
    kpi('Funkhorizont', nf(mp.radioKm, 0), 'km', 'Bodenantenne 2 m, ohne Gelände')
  ].join('');
  // Windverteilung
  const xs = [], xm = Math.max(2 * P.v, 3 * ws.c); for (let i = 0; i <= 80; i++) xs.push(xm * i / 80);
  const pdf = u => (ws.k / ws.c) * Math.pow(u / ws.c, ws.k - 1) * Math.exp(-Math.pow(u / ws.c, ws.k));
  lineChart($('#ch-wind'), { h: 200, legend: false, x: { min: 0, max: xm, fmt: v => nf(v, 0), tipFmt: v => nf(v, 1) + ' m/s', title: 'Windgeschwindigkeit in Flughöhe (m/s)' }, y: { min: 0, max: niceRange(xs.map(pdf), 0.1, true)[1], fmt: v => nf(v * 100, 0) + ' %' }, series: [{ name: 'Häufigkeit je m/s', c: 1, pts: xs.map(u => [u, pdf(u)]), area: true, fmt: v => nf(v * 100, 1) + ' %' }], vlines: [{ x: P.v, label: 'Reise' }, { x: P.v * 0.5, label: '½ Reise' }], tipExtra: x => `<div class="row"><span>Überschreitung</span><b>${nf(ws.exceed(x) * 100, 0)} %</b></div>` });
  $('#wind-sub').textContent = `Weibull-Verteilung, Mittel ${nf(ws.u, 1)} m/s in ${nf(P.hAGL, 0)} m (aus ${nf(P.wind10, 1)} m/s in 10 m, Hellmann ${nf(P.hellmann, 2)}). Über der Reisegeschwindigkeit treibt das Flugzeug ab: ${nf(ws.pOver * 100, 1)} % der Zeit.`;
  // Brand-Erkennung über der Höhe
  const hs = []; for (let h = 30; h <= 1000; h += 10) hs.push(h);
  const fa = T => hs.map(h => { const g = footprint(h, P.irHFOV, P.irRes, P.irResV).gsd; return [h, fireDetection(P, g, T).Amin * 1e4]; });
  lineChart($('#ch-fire'), { h: 200, x: { min: 30, max: 1000, fmt: v => nf(v, 0), tipFmt: v => nf(v, 0) + ' m', title: 'Flughöhe über Grund (m)' }, y: { min: 0, max: niceRange(fa(600).map(p => p[1]), 0.05, true)[1], fmt: v => nf(v, 0) + ' cm²' }, series: [{ name: 'Schwelbrand 600 K', c: 2, pts: fa(600), fmt: v => nf(v, 1) + ' cm²' }, { name: `${nf(P.fireT, 0)} K`, c: 1, pts: fa(P.fireT), fmt: v => nf(v, 1) + ' cm²' }, { name: 'Flamme 1000 K', c: 3, pts: fa(1000), fmt: v => nf(v, 1) + ' cm²' }], vlines: [{ x: P.hAGL, label: 'aktuell' }] });
  renderImg(R);
  $('#fire-sub').textContent = `Mischpixel-Ansatz im Band 8–14 µm: das Pixel muss ${nf(P.clutterDT, 0)} K über dem Hintergrund von ${nf(P.bgT - 273.15, 0)} °C liegen. Das Sensorrauschen (5 × NETD) wäre erst bei ${nf(mp.fire.AminNoise * 1e4, 2)} cm² die Grenze, die Störquellen am Boden begrenzen.`;
  // Flughöhen-Tabelle
  const alts = [60, 90, 120, 150, 200, 300, 500, 1000];
  const rows = cached('alt', () => alts.map(h => { const Q = { ...P, hAGL: h }, C2 = buildCase(Q, S.comps), m2 = missionPerf(C2); return { h, ir: m2.ir, rgb: m2.rgb, rate: m2.rateIr, amin: m2.fire.Amin, p: C2.pProp, u: m2.ws.u }; }));
  $('#tbl-alt').innerHTML = `<thead><tr><th class="n">Höhe</th><th class="n">Streifen IR</th><th class="n">GSD IR</th><th class="n">GSD RGB</th><th class="n">Fläche/h</th><th class="n">Brand min.</th><th class="n">Wind</th><th class="n">Antrieb</th><th>Luftraum</th></tr></thead><tbody>` +
    rows.map(r => `<tr${Math.abs(r.h - P.hAGL) < 1 ? ' class="sel"' : ''}><td class="n">${nf(r.h, 0)} m</td><td class="n">${nf(r.ir.swath, 0)} m</td><td class="n">${nf(r.ir.gsd * 100, 1)} cm</td><td class="n">${nf(r.rgb.gsd * 100, 1)} cm</td><td class="n">${nf(r.rate, 1)} km²</td><td class="n">${nf(r.amin * 1e4, 1)} cm²</td><td class="n">${nf(r.u, 1)} m/s</td><td class="n">${nf(r.p, 1)} W</td><td>${r.h > 152 ? 'über 500 ft: höheres ARC' : 'unter 500 ft'}</td></tr>`).join('') + '</tbody>';
};

/* ---------- Robustheit ---------- */
RENDER.robustheit = (R) => {
  const P = S.params, tor = cached('torn', () => tornado(P, S.comps));
  $('#torn').innerHTML = tornadoHTML(tor.rows, 'h');
  $('#torn-sub').textContent = `Änderung der Excess Time am ${fmtDoy(R.n, R.y)}, wenn eine Größe um eine Standardabweichung schlechter (rot) oder besser (blau) ausfällt. Basis ${fin(tor.base.tExc) ? nfs(tor.base.tExc, 1) + ' h' : '–'}. Ganz oben stehen die Größen, die ihr am genauesten kennen oder messen solltet.` + (tor.base.per && !(tor.base.per.tCm > 0) ? ' Die Akkuenergie wirkt hier nicht, weil der Akku im Dauerflug tagsüber nie voll wird – die Solarleistung ist der Engpass.' : '');
  runMC();
  $('#tbl-unc').innerHTML = '<thead><tr><th>Größe</th><th class="n">Standardabweichung</th></tr></thead><tbody>' + UNC.map(u => `<tr><td>${esc(u.label)}</td><td class="n">${u.param ? '±' + nf(u.sd, 0) + (u.key === 'sky' ? ' %-Punkte' : ' K') : '±' + nf(u.sd * 100, 0) + ' %'}</td></tr>`).join('') + '</tbody><caption>Normalverteilt, auf ±2,5 σ begrenzt, unabhängig. Die Werte sind Erfahrungswerte für ein Konzept vor dem Erstflug.</caption>';
};
function runMC() {
  const P = S.params, N = Number($('#mc-n').value) || 300, mc = cached('mc', () => monteCarlo(P, S.comps, N, UI.mcSeed || 11), N, UI.mcSeed || 11);
  $('#kpis-mc').innerHTML = [
    kpi('Dauerflug möglich', nf(mc.pPerp * 100, 0), '%', 'Anteil der Läufe mit Excess Time ≥ 0'),
    kpi('Mit geforderter Reserve', nf(mc.pReq * 100, 0), '%', `Excess Time ≥ ${nf(P.tExcReq, 1)} h`),
    kpi('Einsatz gelingt', nf(mc.pMission * 100, 0), '%', `${P.tStart}–${P.tEnd} über Reserve`),
    kpi('Excess Time', nfs(mc.p50, 1), 'h', `90 % zwischen ${nfs(mc.p5, 1)} und ${nfs(mc.p95, 1)} h`)
  ].join('');
  histogram($('#ch-mc'), { h: 200, title: `Verteilung der Excess Time (${mc.N} Läufe)`, vals: mc.res.map(r => r.tExc), min: Math.floor(Math.min(-12, mc.p5 - 1)), max: Math.ceil(Math.max(8, mc.p95 + 1)), bins: 32, cls: x => (x < 0 ? 'neg' : x >= P.tExcReq ? 'pos' : 'alt'), fmt: v => nf(v, 0) + ' h', xTitle: 'Excess Time (h)', vlines: [{ x: mc.p50, label: 'Median' }, { x: P.tExcReq, label: 'gefordert', dy: 14 }] });
  $('#mc-sub').textContent = `Alle unsicheren Größen gleichzeitig zufällig gezogen, jeweils komplettes Flugzeug neu gerechnet. Rot: Akku leer vor Sonnenaufgang, hell: Dauerflug ohne geforderte Reserve, dunkel: mit Reserve.`;
}
$('#mc-run').addEventListener('click', () => { UI.mcSeed = Math.floor(Math.random() * 1e6); runMC(); });
$('#mc-n').addEventListener('change', () => runMC());

/* ---------- SORA ---------- */
RENDER.sora = (R) => {
  const { so, P, C } = R, out = $('#sora-out');
  if (so.col == null) { out.innerHTML = pill('crit', 'Spannweite oder Geschwindigkeit außerhalb der SORA-Tabelle'); return; }
  const colTxt = `${COLS[so.col][0]} m / ${COLS[so.col][1]} m/s`;
  if (so.igrc == null) out.innerHTML = pill('crit', 'Nicht Teil der SORA – Kategorie „certified“');
  else {
    const ok = so.sail && ROMAN[so.sail] <= 3;
    out.innerHTML = `<div class="chain"><span>Spalte <b>${esc(colTxt)}</b></span><span class="arr">→</span><span>iGRC <b>${so.igrc}</b></span><span class="arr">→</span><span>Minderungen <b>${nfs(so.red, 0)}</b></span><span class="arr">→</span><span>GRC <b>${so.fgrc}</b></span><span class="arr">·</span><span>ARC <b>${so.arc0}${so.arc !== so.arc0 ? ' → ' + so.arc : ''}</b></span><span class="arr">→</span><span>SAIL <b>${so.sail || '–'}</b></span></div>` +
      `<div class="flags" style="margin-top:12px">${so.sail ? pill(ok ? 'good' : 'warn', ok ? 'im Ziel SAIL ≤ III' : 'über dem Ziel SAIL III') : pill('crit', 'GRC über 7: außerhalb „specific“')}${pill('info', 'Taktische Minderung (TMPR): ' + so.tmpr)}${pill('info', `Aufprallenergie bei Vmax ${nf(so.ke / 1000, 1)} kJ`)}</div>` +
      `<p class="note" style="margin-top:10px">Spalte bestimmt durch ${so.colByDim >= so.colBySpeed ? `die Spannweite (${nf(P.span, 2)} m > ${so.col ? COLS[so.col - 1][0] : 0} m)` : `die Höchstgeschwindigkeit (${nf(P.vmax, 0)} m/s)`}. Mit mehr als 3 m Spannweite landet ihr in der 8-m-Spalte; der Fallschirm (M2) und Gebiete mit wenig Bevölkerung sind die wirksamsten Hebel. ${AEC.find(a => a[0] === Number(P.aec))[1]} ergibt ARC-${so.arc0}.</p>`;
  }
  const head = `<thead><tr><th class="rowh">Bevölkerungsdichte</th>${COLS.map((c, i) => `<th>${c[0]} m / ${c[1]} m/s</th>`).join('')}</tr></thead>`;
  $('#tbl-igrc').innerHTML = head + '<tbody>' + DENS.map(([v, l], r) => `<tr><th class="rowh">${esc(l)}</th>${IGRC[r].map((x, i) => `<td class="${i === so.col && r === so.row ? 'cell' : i === so.col ? 'colsel' : ''}">${x == null ? '–' : x}</td>`).join('')}</tr>`).join('') + '</tbody>';
  const fg = so.fgrc, ai = 'abcd'.indexOf(so.arc);
  $('#tbl-sail').innerHTML = `<thead><tr><th class="rowh">Finaler GRC</th>${'abcd'.split('').map(a => `<th>ARC-${a}</th>`).join('')}</tr></thead><tbody>` + [2, 3, 4, 5, 6, 7].map(g => `<tr><th class="rowh">${g === 2 ? '≤ 2' : g}</th>${SAILT[g].map((s, j) => `<td class="${(fg <= 2 ? 2 : fg) === g && j === ai ? 'cell' : j === ai ? 'colsel' : ''}">${s}</td>`).join('')}</tr>`).join('') + '<tr><th class="rowh">> 7</th><td colspan="4">Kategorie „certified“</td></tr></tbody>';
  $('#sora-adj').innerHTML = `<table class="data"><tbody><tr><th>Breite des angrenzenden Gebiets</th><td class="n">${nf(so.adjR, 1)} km</td></tr><tr><th>Herleitung</th><td class="n">3 min × ${nf(P.vmax, 0)} m/s, 5–35 km</td></tr><tr><th>Betriebsgebiet (Radius ${nf(P.opsRadius, 1)} km)</th><td class="n">${nf(so.opsArea, 0)} km²</td></tr><tr><th>Angrenzendes Gebiet</th><td class="n">${nf(so.adjArea, 0)} km²</td></tr></tbody></table>` +
    `<p class="note" style="margin-top:10px">Die nötige Robustheit des Containments (Schritt 8, SORA 2.5) hängt von der mittleren Bevölkerungsdichte im angrenzenden Gebiet und von Menschenansammlungen im Umkreis ab (Schwellen 40 000 und 400 000 Personen). Die Tabellen dazu stehen im <a href="https://jarus-rpas.org/publications/" target="_blank" rel="noopener">JARUS SORA 2.5 Main Body</a>; der Rechner übernimmt sie nicht. Die unabhängige Fallschirmauslösung zählt hier mit.</p>`;
};

/* ---------- Validierung ---------- */
RENDER.validierung = (R) => {
  const v = UI.valid || (UI.valid = validationData());
  $('#tbl-ref').innerHTML = `<thead><tr><th>Flugzeug</th><th>Größe</th><th class="n">Veröffentlicht</th><th class="n">Modell</th><th class="n">Abweichung</th></tr></thead><tbody>` +
    v.refs.map(r => r.rows.map((x, i) => `<tr>${i === 0 ? `<td rowspan="${r.rows.length}">${esc(r.name)}<br><span class="muted small">${esc(r.src)}</span></td>` : ''}<td>${esc(x[0])}</td><td class="n">${esc(x[1])}</td><td class="n">${esc(x[2])}</td><td class="n ${Math.abs(x[3]) <= 0.06 ? 'good' : Math.abs(x[3]) <= 0.2 ? 'warn' : 'crit'}">${fin(x[3]) ? nfs(x[3] * 100, 0) + ' %' : '–'}</td></tr>`).join('')).join('') + '</tbody><caption>AtlantikSolar: Gesamtmasse und Excess Time am 21. Juni bei 47,6° N aus dem ETH-Werkzeug und Oettershagen et al. (2017); nachgerechnet mit denselben XFoil-Polaren des MH 139F wie im ETH-Werkzeug und Akkus im Flügel. Sky-Sailor: Auslegungswerte von Noth et al. (2006); die gemessene Flugleistung lag laut späteren Arbeiten höher.</caption>';
  $('#tbl-nfxf').innerHTML = `<thead><tr><th class="n">Re</th>${v.cls.map(c => `<th class="n">c_a ${nf(c, 1)}</th>`).join('')}</tr></thead><tbody>` + v.nfxf.map(r => `<tr><td class="n">${nf(r.Re / 1000, 0)} Tsd.</td>${r.vals.map(([a, b]) => `<td class="n">${nf(a, 0)} / ${nf(b, 0)}<br><span class="small ${Math.abs(a / b - 1) <= 0.06 ? 'muted' : 'warn'}">${nfs((a / b - 1) * 100, 0)} %</span></td>`).join('')}</tr>`).join('') + '</tbody><caption>NeuralFoil / XFoil. Unter etwa 200 000 sagt NeuralFoil für dieses Profil weniger Widerstand voraus als XFoil; die Monte-Carlo-Rechnung setzt deshalb ±8 % auf den Profilwiderstand an. Die AtlantikSolar-Vorlage nutzt deshalb das Profil „MH 139F (ETH-XFoil)“.</caption>';
  $('#tbl-camber').innerHTML = `<thead><tr><th>Profil</th><th class="n">21. Juni</th><th class="n">21. Dez.</th><th class="n">Strings in Tiefe</th><th class="n">30 % Kurve 20°</th></tr></thead><tbody>` + v.camber.map(r => `<tr><td>${esc(r.name)}</td>${r.vals.map(x => `<td class="n">${nf(x, 3)}</td>`).join('')}</tr>`).join('') + '</tbody><caption>AtlantikSolar-Geometrie, Zellen 8–85 % der Tiefe, Einfallswinkel-Modifikator nach ASHRAE (b₀ = 0,05). Für das MH 139F trifft das Modell den ETH-Pauschalwert 0,95 sehr gut.</caption>';
  renderFit();
  later(renderKern);
  $('#limits').innerHTML = LIMITS.map(t => `<li>${t}</li>`).join('');
  $('#sources').innerHTML = SOURCES.map(([t, u]) => `<li>${u ? `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}</li>`).join('');
};
function validationData() {
  const refs = Object.entries(REFS).map(([k, r]) => {
    const P = { ...DEFAULT_PARAMS, ...r.params }, C = buildCase(P, r.comps), n = dayOfYear(P.date), y = yearOf(P.date);
    const ser = daySeries(C, envClear(P, n, y)), per = periodic(C, ser), rows = [];
    const add = (l, ref, mod, d, u) => { if (ref != null) rows.push([l, nf(ref, d) + ' ' + u, nf(mod, d) + ' ' + u, mod / ref - 1]); };
    add('Abflugmasse', r.ref.mTotal, C.m, 2, 'kg'); add('Strukturmasse (ohne Kabel)', r.ref.mStruct, C.mass.struct, 2, 'kg');
    if (r.ref.mWire != null) rows.push(['Kabel und Beschläge', nf(r.ref.mWire, 3) + ' kg', nf(C.mass.wire, 3) + ' kg (gemessen eingesetzt)', NaN]);
    add('Antriebsleistung Reiseflug', r.ref.pProp, C.pProp, 1, 'W'); add('Leistung gesamt', r.ref.pTotal, C.pProp + C.comp.always, 1, 'W');
    if (r.ref.tExc != null) rows.push(['Excess Time 21. Juni', nf(r.ref.tExc, 1) + ' h', nf(per.tExc, 1) + ' h', per.tExc / r.ref.tExc - 1]);
    return { name: r.name, src: r.src, rows };
  });
  const mh = foilByKey('mh139f'), mx = foilByKey('mh139f_xf'), cls = [0.4, 0.7, 1.0];
  const nfxf = [100e3, 150e3, 200e3, 300e3, 500e3].map(Re => ({ Re, vals: cls.map(cl => [profileCd(mh, 'free', Re, cl) * 1e4, profileCd(mx, 'free', Re, cl) * 1e4]) }));
  const base = { ...DEFAULT_PARAMS, ...REFS.atlantik.params };
  const E = P => { const C = buildCase(P, REFS.atlantik.comps), s = daySeries(C, envClear(P, dayOfYear(P.date), 2015)); let e = 0; for (let i = 0; i < NSTEP; i++) e += s.ps[i] * DT; return e; };
  const camber = ['mh139f', 'sd7032', 'sd7037', 'e387', 'fx63137', 's1223'].map(k => {
    const B = { ...base, airfoil: k }, fJ = E({ ...B, solarGeom: 'flach', camberEta: 100 }), fD = E({ ...B, solarGeom: 'flach', camberEta: 100, date: '2015-12-21' });
    return { name: foilByKey(k).name, vals: [E({ ...B, solarGeom: 'profil' }) / fJ, E({ ...B, solarGeom: 'profil', date: '2015-12-21' }) / fD, E({ ...B, solarGeom: 'profil', stringLayout: 'chord' }) / fJ, E({ ...B, solarGeom: 'profil', turnFrac: 30, bank: 20 }) / fJ] };
  });
  return { refs, nfxf, cls, camber };
}
$('#val-gen-run').addEventListener('click', async () => {
  const btn = $('#val-gen-run'); btn.disabled = true; btn.textContent = 'Rechne …';
  await new Promise(r => setTimeout(r, 30));
  try {
    const W = siteData('piemont'), ms = monthlyStats(W), P = { ...S.params, lat: W.lat, lon: W.lon, alt: W.elev, tz: 'auto' }, C = buildCase(P, S.comps);
    const a = yearSim(C, W); await new Promise(r => setTimeout(r, 0));
    const Wg = genWeather({ name: 'Generator', lat: W.lat, lon: W.lon, elev: W.elev, utc: 1, tc: 0.5 }, ms, 20, 7), b = yearSim(C, Wg);
    groupBars($('#ch-valgen'), { h: 220, title: 'Einsatz gelingt (Anteil der Tage) – Piemont, euer Entwurf', cats: MONTHS, y: { min: 0, max: 1, fmt: v => nf(v * 100, 0) + ' %' }, series: [{ name: 'Echtes typisches Jahr (PVGIS)', c: 1, vals: a.months.map(m => m.mission), fmt: v => pct(v) }, { name: 'Generator, 20 Jahre', c: 2, vals: b.months.map(m => m.mission), fmt: v => pct(v) }] });
  } catch (err) { console.error(err); $('#ch-valgen').textContent = 'Fehler: ' + err.message; }
  btn.disabled = false; btn.textContent = 'Vergleich neu rechnen';
});
function renderFit() {
  const rows = parseFlightData($('#fit-text').value), f = fitPower(rows), C = R.C, P = S.params, out = $('#fit-out');
  if (!f) { out.textContent = 'Mindestens drei Messpunkte mit Geschwindigkeit und Leistung eingeben.'; $('#ch-fit').innerHTML = ''; return null; }
  const vmin = Math.min(...rows.map(r => r.V)) * 0.9, vmax = Math.max(...rows.map(r => r.V)) * 1.1, vs = []; for (let i = 0; i <= 50; i++) vs.push(vmin + (vmax - vmin) * i / 50);
  const C2 = { ...C, m: P.fitM }, model = vs.map(V => { const r = flightPower(C2, V, 1, P.fitRho, C.nu); return [V, r.stall ? NaN : r.pel]; });
  const pts = rows.map(r => [r.V, r.P]).sort((a, b) => a[0] - b[0]), pmx = Math.max(...pts.map(p => p[1]));
  lineChart($('#ch-fit'), { h: 230, x: { min: vmin, max: vmax, fmt: v => nf(v, 0), tipFmt: v => nf(v, 1) + ' m/s', title: 'Fluggeschwindigkeit (m/s)' }, y: { min: 0, max: niceRange([...pts.map(p => p[1]), ...model.map(p => p[1]).filter(v => v < 1.6 * pmx)], 0.1, true)[1], fmt: v => nf(v, 0) + ' W' }, series: [{ name: 'Messpunkte', c: 2, pts, dots: true, fmt: v => nf(v, 1) + ' W' }, { name: 'Ausgleichskurve', c: 1, pts: vs.map(V => [V, f.A * V ** 3 + f.B / V]), fmt: v => nf(v, 1) + ' W' }, { name: 'Modell', c: 3, pts: model, dash: true, fmt: v => nf(v, 1) + ' W' }] });
  const vm = Math.pow(f.B / (3 * f.A), 0.25), pm = f.A * vm ** 3 + f.B / vm;
  const devs = rows.map(r => { const x = flightPower(C2, r.V, 1, P.fitRho, C.nu); return x.stall ? NaN : x.pel / r.P - 1; }).filter(fin), md = devs.length ? devs.reduce((a, b) => a + b, 0) / devs.length : NaN;
  out.innerHTML = `a = ${nf(f.A, 5)} W·s³/m³, b = ${nf(f.B, 1)} W·m/s, Streuung ${nf(f.rms, 2)} W, R² ${nf(f.r2, 3)}. Geringste Leistung ${nf(pm, 1)} W bei ${nf(vm, 1)} m/s${vm < Math.min(...rows.map(r => r.V)) ? ' (außerhalb der Messpunkte, extrapoliert)' : ''}. ` +
    (fin(md) ? `Über ${devs.length} Messpunkte liegt das Modell im Mittel ${nf(Math.abs(md) * 100, 0)} % ${md < 0 ? 'unter' : 'über'} den Messwerten${devs.length < rows.length ? '; bei den übrigen ist es schon im Abriss – Masse und Luftdichte prüfen' : ''}. ` : 'Das Modell ist bei allen Messpunkten im Abriss – Masse und Luftdichte der Messung prüfen. ') +
    'Übernommen wird die Kurve mit Skalierung auf Masse und Luftdichte.';
  return f;
}
$('#fit-text').addEventListener('input', () => { if (VIEW === 'validierung' && R) renderFit(); });
$('#fit-apply').addEventListener('click', () => {
  const f = renderFit(); if (!f) return;
  Object.assign(S.params, { powerModel: 'fit', fitA: f.A, fitB: f.B });
  fillForms(); markPreset(); schedule(true);
  $('#fit-msg').textContent = 'Übernommen. Leistungsmodell steht jetzt auf „Ausgleichskurve“ (Ansicht Flugzeug › Flugzustand).';
});
const LIMITS = [
  'Profilpolaren aus NeuralFoil (neuronales Ersatzmodell von XFoil, Ncrit 9). Laminare Ablöseblasen unter Re 100 000 und Stufen an Zellkanten sind unsicher – dafür gibt es die Variante mit erzwungenem Umschlag und die Monte-Carlo-Streuung.',
  'Flügel als Wirbelgitter (Weissinger, 40 Streifen) mit Pfeilung, ohne Rumpfeinfluss auf die Auftriebsverteilung und ohne Dickeneffekte. Profilwiderstand gepfeilter Flügel konservativ ohne Pfeilungsgewinn. Neutralpunkt mit Leitwerk nach Helmbold und DATCOM-Abwind, Gondel nach Raymer; Propellereinfluss auf die Längsstabilität ist nicht enthalten.',
  'Strukturmodell für Holm-Rippen-Bauweise, kalibriert an der AtlantikSolar-Zelle (1,54 kg). Steifigkeiten aus Gurtquerschnitt und Torsionsnase (Bredt), Werkstoffkennwerte als typische Handlaminat- bis Prepreg-Werte. Für den Nachweis zählen Standversuch (Biege- und Torsionsfrequenz) und Bodenschwingversuch.',
  'Flattern und Divergenz am eingespannten Halbflügel: symmetrische Formen, Streifentheorie nach Theodorsen mit Wagner-Funktion (keine Spitzenumströmung, kein Rumpf, keine antisymmetrischen Formen, kein Ruderflattern). Am Goland-Flügel geprüft. Ergebnis ist eine Auslegungshilfe, kein Flatternachweis.',
  'Flugeigenschaften aus linearisierten Bewegungsgleichungen um den Reiseflug (Etkin). Die Flügelbiegung geht als zusätzliche V-Form ein, nicht als gekoppelte elastische Bewegung; bei sehr weichen Flügeln (Spitzendurchbiegung über 15 % der Halbspannweite) ist das nicht mehr ausreichend.',
  'Propeller nach Blattelement-Impulstheorie mit APC-ähnlicher Blattform und generischem Profil nach QPROP; Motor als Ersatzschaltbild erster Ordnung. Wirbelablösung an der Nabe, Kompressibilität und Gondelinterferenz fehlen; der Einbauverlust je Anordnung ist ein Pauschalwert.',
  'Einstrahlung über alle Kurse zur Sonne gemittelt. Gerade Transitflüge nach Süden oder Norden weichen ab. Abschattung der Flügelzellen durch Rumpf und Leitwerk ist nicht berücksichtigt; Zellen auf dem Höhenleitwerk mit gemitteltem Schatten des Seitenleitwerks.',
  'Wettergenerator: Tageswerte nach Bendt et al. mit Tag-zu-Tag-Korrelation 0,3; innerhalb des Tages gleichmäßige Bewölkung. Gewitterlagen, Nebel in Tälern und Rauch über Bränden sind nicht abgebildet.',
  'Akku: Kapazität in der kältesten Nachtstunde, Ladebegrenzung wie im ETH-Werkzeug. Innenwiderstand, Spannungslage und Alterung über Zyklen sind vereinfacht.',
  'SORA: nur iGRC, Minderungen, ARC aus der Luftraumklasse und SAIL. OSO-Nachweise, Containment-Tabellen und nationale Regeln bitte im Original prüfen.'
];
const SOURCES = [
  ['Leutenegger, Jabas, Siegwart (2011): Solar Airplane Conceptual Design and Performance Estimation, J. Intell. Robot. Syst. 61', 'https://doi.org/10.1007/s10846-010-9484-x'],
  ['Oettershagen et al. (2017): Design of small hand-launched solar-powered UAVs: From concept study to a multi-day world endurance record flight, J. Field Robotics 34', 'https://doi.org/10.1002/rob.21717'],
  ['ETH Zürich ASL: fw_conceptual_design (MATLAB, GPL-3.0) – Methodik Excess Time, Charge Margin, Ladebegrenzung, Klarhimmelmodell', 'https://github.com/ethz-asl/fw_conceptual_design'],
  ['Noth, Engel, Siegwart (2006): Design of an Ultra-Lightweight Autonomous Solar Airplane for Continuous Flight (Sky-Sailor)', 'https://infoscience.epfl.ch/record/97562'],
  ['Sharpe, Hansman: NeuralFoil – physikinformiertes Ersatzmodell für XFoil (MIT, MIT-Lizenz)', 'https://github.com/peterdsharpe/NeuralFoil'],
  ['Profilkoordinaten: UIUC Airfoil Coordinates Database über AeroSandbox', 'https://github.com/peterdsharpe/AeroSandbox'],
  ['Glauert (1926): The Elements of Aerofoil and Airscrew Theory – Traglinie; Schrenk (1940): Näherung der Auftriebsverteilung', ''],
  ['Raymer: Aircraft Design – A Conceptual Approach (Formfaktoren, Reibungsbeiwerte); Pratt-Böenformel nach CS-23', ''],
  ['ASHRAE Handbook Fundamentals: Klarhimmelmodell und Einfallswinkel-Modifikator; Erbs, Klein, Duffie (1982): Diffusanteil', ''],
  ['Bendt, Collares-Pereira, Rabl (1981): The frequency distribution of daily insolation values, Solar Energy 27', 'https://doi.org/10.1016/0038-092X(81)90225-1'],
  ['PVGIS, Joint Research Centre der EU-Kommission: typisches meteorologisches Jahr (SARAH3, ERA5)', 'https://re.jrc.ec.europa.eu/pvg_tools/de/'],
  ['Dozier (1981): A method for satellite identification of surface temperature fields of subpixel resolution – Mischpixel-Ansatz', 'https://doi.org/10.1016/0034-4257(81)90021-3'],
  ['JARUS SORA 2.5 Main Body (2024): iGRC, Minderungen, SAIL, angrenzendes Gebiet', 'https://jarus-rpas.org/publications/'],
  ['Machine Design (2005): Solar-powered UAV flies two days straight (SoLong)', 'https://www.machinedesign.com/news/solar-powered-uav-flies-two-days-straight'],
  ['Weissinger (1947): Wirbelgitter-Verfahren für gepfeilte Flügel; Katz, Plotkin: Low-Speed Aerodynamics (Hufeisenwirbel, Trefftz-Ebene)', ''],
  ['USAF Stability and Control DATCOM: Abwind am Höhenleitwerk; Helmbold-Formel für den Auftriebsanstieg kleiner Streckungen', ''],
  ['Etkin, Reid: Dynamics of Flight – Stability and Control; Nelson: Flight Stability and Automatic Control (Navion-Beispieldaten)', ''],
  ['MIL-F-8785C (1980): Flying Qualities of Piloted Airplanes – Grenzen für Dämpfung und Zeitkonstanten', ''],
  ['Noll et al. (2004): Investigation of the Helios Prototype Aircraft Mishap, NASA – elastische V-Form und Nickschwingung', 'https://www.nasa.gov/pdf/64317main_helios.pdf'],
  ['Patil, Hodges, Cesnik: Nonlinear Aeroelasticity and Flight Dynamics of High-Altitude Long-Endurance Aircraft (J. Aircraft 38, 2001)', 'https://dhodges.gatech.edu/wp-content/uploads/PatilHodgesCesnik2000.pdf'],
  ['Goland (1945): The Flutter of a Uniform Cantilever Wing, J. Applied Mechanics 12 – Prüffall (Nachrechnung z. B. im SHARPy-Beispiel)', 'https://ic-sharpy.readthedocs.io/en/main/content/example_notebooks/linear_goland_flutter.html'],
  ['Theodorsen (1935): General Theory of Aerodynamic Instability and the Mechanism of Flutter, NACA Report 496; R. T. Jones (1940): NACA Report 681 (Wagner-Näherung)', ''],
  ['Diederich, Budiansky (1948): Divergence of Swept Wings, NACA TN 1680; Weisshaar (1980): Divergence of Forward Swept Composite Wings, J. Aircraft 17', 'https://www.abbottaerospace.com/downloads/naca-tn-1680-divergence-of-swept-wings'],
  ['EASA CS-23 / CS-22: Flatterfreiheit bis 1,2 × V_D (sinngemäß übernommen)', ''],
  ['Drela: QPROP – Propeller- und Motoranalyse, generisches Profil und Motormodell erster Ordnung', 'https://web.mit.edu/drela/Public/web/qprop'],
  ['McCrink, Gregory (2017): Blade Element Momentum Modeling of Low-Reynolds Electric Propulsion Systems, J. Aircraft 54 – APC-10x7E-Messung', 'https://typeset.io/pdf/blade-element-momentum-modeling-of-low-re-small-uas-electric-5apq3vvgli.pdf']
];

/* ---------- Teilen, Zurücksetzen, Vorlagen ---------- */
const dlg = $('#share-dlg');
$('#btn-share').addEventListener('click', () => { $('#share-text').value = JSON.stringify({ v: 5, params: S.params, comps: S.comps, gen: S.gen }); $('#share-msg').textContent = ''; try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } });
$('#share-close').addEventListener('click', () => { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } });
$('#share-copy').addEventListener('click', () => {
  const t = $('#share-text');
  const fall = () => { t.focus(); t.select(); $('#share-msg').textContent = 'Markiert – mit Strg+C kopieren.'; };
  try { navigator.clipboard.writeText(t.value).then(() => { $('#share-msg').textContent = 'Kopiert.'; }, fall); } catch (e) { fall(); }
});
$('#share-load').addEventListener('click', () => {
  try { const o = JSON.parse($('#share-text').value); S = sanitize(o); buildForms(); renderCompTable(); onWeatherChange(); schedule(true); $('#share-msg').textContent = 'Übernommen.'; }
  catch (e) { $('#share-msg').textContent = 'Kein gültiger Konfigurationstext.'; }
});
let resetArmed = false;
$('#btn-reset').addEventListener('click', e => {
  const b = e.currentTarget;
  if (!resetArmed) { resetArmed = true; b.textContent = 'Wirklich zurücksetzen?'; b.classList.add('danger'); setTimeout(() => { resetArmed = false; b.textContent = 'Zurücksetzen'; b.classList.remove('danger'); }, 3500); return; }
  resetArmed = false; b.textContent = 'Zurücksetzen'; b.classList.remove('danger'); applyPreset('design');
});
$('#preset-sel').addEventListener('change', e => { const v = e.target.value; if (v) applyPreset(v); e.target.value = v; });

/* ---------- Start ---------- */
function init() {
  DATA.airfoils = readData('d-airfoils'); setAirfoils(DATA.airfoils);
  DATA.weather = readData('d-weather');
  DATA.info = readData('d-info'); INFO = DATA.info.INFO; CFG = DATA.info.CFG; RATE = DATA.info.RATE;
  S = loadState();
  buildForms(); renderCompTable();
  let v = location.hash.replace('#', '');
  if (!v) { try { v = localStorage.getItem(VIEW_KEY) || ''; } catch (e) { v = ''; } }
  showView(v || 'uebersicht');
  if (S.preset) $('#preset-sel').value = S.preset;
  recompute();
  ro.observe(document.querySelector('.wrap'));
}

/* ---------- Akkuspannung über dem Ladezustand ---------- */
function renderBattV(R) {
  const { C, P, mis, per } = R, b = cached('battv', () => battReport(C)), pk = b.pk, cut = pk.uCut, nS = pk.nS;
  $('#bv-sub').textContent = `${nS} Zellen in Reihe, ${nf(pk.Q, 1)} Ah (${pk.crv.name}, Ruhespannung nach ${pk.crv.src}; Innenwiderstand über dem Ladezustand nach Chen & Rincón-Mora 2006). Pack ${nf(pk.R50 * 1000, 0)} mΩ bei 50 % Ladung.`;
  const cr = b.climbRes, cf = b.climbFull;
  $('#kpis-bv').innerHTML = [
    kpi('Packspannung', nf(b.U100, 1), 'V', `voll · bei Reserve ${nf(b.Ures, 1)} V · leer ${nf(b.U0, 1)} V (Ruhespannung)`),
    kpi('Reiseflug', nf(b.cruise.I, 1), 'A', `${nf(b.cruise.Ucell, 2)} V je Zelle bei 50 % · Verlust im Akku ${nf(b.cruise.loss, 2)} W`),
    kpi('Vollgas bei Reserve', nf(cr.Ucell, 2), 'V/Zelle', `${nf(cr.I, 1)} A · Abschaltung ${nf(cut, 1)} V · voll ${nf(cf.Ucell, 2)} V`, cr.Ucell < cut ? 'bad' : ''),
    kpi('Steigen bei Reserve', nf(cr.roc, 1), 'm/s', `voll ${nf(cf.roc, 1)} m/s · Schub ${nf(cr.T, 1)} statt ${nf(cf.T, 1)} N bei ${nf(b.Vc, 1)} m/s`, cr.roc < 1 ? 'bad' : '')
  ].join('');
  const msg = [];
  if (cr.Ucell < cut) msg.push(pillF('crit', `Bei ${nf(b.zRes * 100, 0)} % Ladung bricht die Zellspannung unter Vollgas auf ${nf(cr.Ucell, 2)} V ein (Abschaltung ${nf(cut, 1)} V): Reserve erhöhen oder mehr Zellen parallel`, 'bat-u', 'ucell'));
  else msg.push(pillF('good', `Zellspannung bleibt auch bei Reserveladung und Vollgas über ${nf(cut, 1)} V`, 'bat-u', 'ucell'));
  if (cr.roc < 0.5 * cf.roc) msg.push(pillF('warn', `Steigleistung bei Reserveladung nur ${nf(cr.roc / Math.max(1e-6, cf.roc) * 100, 0)} % des vollen Akkus`, 'bat-u', 'roc'));
  if (P.hStore > 0) {
    const hm0 = mis ? mis.hMax : 0, eH = hEnergy(C, P.hStore);
    msg.push(pillF('info', `Höhenspeicher bis ${nf(P.hStore, 0)} m: ${nf(eH, 1)} Wh Akku-Gegenwert, im Einsatz erreicht ${nf(hm0, 0)} m${mis && mis.tTop > 0 ? `, ${fmtDur(mis.tTop)} ganz oben` : ''}`, 'bat-alt', 'tExc'));
    if (P.hAGL + P.hStore > 150) msg.push(pill('warn', `Größte Flughöhe ${nf(P.hAGL + P.hStore, 0)} m über Grund: Betriebsgenehmigung und Luftraum prüfen; Bodenauflösung der Kameras wird gröber`));
  }
  $('#bv-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  lineChart($('#ch-bv-soc'), { h: 210, title: 'Zellspannung über dem Ladezustand', x: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: v => nf(v * 100, 0) + ' %', title: 'Ladezustand' }, y: { min: Math.min(cut - 0.2, 2.8), max: 4.3, fmt: v => nf(v, 1) + ' V' },
    series: [{ name: 'Ruhespannung', c: 1, pts: b.curve.map(p => [p.z, p.U0]), fmt: v => nf(v, 3) + ' V' }, { name: `Reiseflug ${nf(b.cruise.I, 1)} A`, c: 2, pts: b.curve.map(p => [p.z, p.Uc]), fmt: v => nf(v, 3) + ' V' }, { name: `Vollgas ${nf(cr.I, 0)} A`, c: 3, pts: b.curve.map(p => [p.z, p.Ufull]), fmt: v => nf(v, 3) + ' V' }],
    hlines: [{ y: cut, label: `Abschaltung ${nf(cut, 1)} V` }], vlines: P.reserve > 0 ? [{ x: b.zRes, label: 'Reserve' }] : [] });
  const pts = (UI.dayTab === 'periodic' && per.pts ? per.pts : mis ? mis.pts : []).filter(p => fin(p[1]));
  if (pts.length) {
    // Leistung an den Klemmen aus der Änderung des Ladezustands (erfasst Ladebegrenzung, Höhenspeicher und Gleiten):
    // Entladen P = −dE/dt·η_E, Laden P = −dE/dt (gespeicherte Leistung)
    const vv = pts.map((p, i) => {
      const q = pts[i + 1] || p, o = pts[i + 1] ? p : pts[i - 1] || p, dt = q[0] - o[0], dE = dt > 0 && fin(q[3]) && fin(o[3]) ? (q[3] - o[3]) / 100 * C.cap / dt : NaN;
      const Pw = fin(dE) ? (dE < 0 ? -dE * P.etaDischarge / 100 : -dE) : p[2] - p[1], a = battAt(C, p[3] / 100, Pw, pk); return [p[0], a.Ucell, a.Ucell0];
    });
    const x0 = pts[0][0], x1 = pts[pts.length - 1][0], step = x1 - x0 > 30 ? 6 : x1 - x0 > 14 ? 3 : 2, xt = []; for (let t = Math.ceil(x0 / step) * step; t <= x1 + 1e-9; t += step) xt.push(t);
    lineChart($('#ch-bv-day'), { h: 210, title: UI.dayTab === 'periodic' ? 'Zellspannung im Dauerflug' : 'Zellspannung im Einsatz', x: { min: x0, max: x1, ticks: xt, fmt: fmtT }, y: { min: Math.min(cut - 0.2, 2.8), max: 4.3, fmt: v => nf(v, 1) + ' V' },
      series: [{ name: 'an den Klemmen', c: 2, pts: vv.map(p => [p[0], p[1]]), fmt: v => nf(v, 3) + ' V' }, { name: 'Ruhespannung', c: 1, pts: vv.map(p => [p[0], p[2]]), dash: true, fmt: v => nf(v, 3) + ' V' }], hlines: [{ y: cut, label: `Abschaltung ${nf(cut, 1)} V` }] });
  } else $('#ch-bv-day').innerHTML = '';
}

/* ---------- Bildruhe in Turbulenz ---------- */
function renderImg(R) {
  const { C, P } = R, im = cached('img', () => imageStability(C, { fd: dynData(C).flex })), tr = im.tr, r = tr.rms, tp = tr.tp, D = RAD;
  const lvl = (SEL.turbLevel.find(s => s[0] === P.turbLevel) || ['', ''])[1];
  $('#img-sub').textContent = `Dryden-Turbulenz nach MIL-F-8785C, ${lvl}: σ_w ${nf(tp.sw, 2)} m/s, σ_u = σ_v ${nf(tp.su, 2)} m/s, Maßstäbe ${nf(tp.Lw, 0)} m bzw. ${nf(tp.Lu, 0)} m${tp.capped ? ' (Modell bis 300 m über Grund)' : ''}. Starres Flugzeug mit den Ableitungen der Flugdynamik; der Autopilot glättet alles unter ${nf(tr.wAP, 1)} rad/s. Kamera ${nf(tr.xb * 100, 0)} cm ${tr.xb >= 0 ? 'vor' : 'hinter'} dem Schwerpunkt.`;
  const ir = im.ir, rgb = im.rgb, tot = c => 3 * c.blurE + c.blurV;
  $('#kpis-img').innerHTML = [
    kpi('Drehraten', nf(r.p * D, 1), '°/s', `Rollen (Effektivwert) · Nicken ${nf(r.q * D, 1)} °/s · Gieren ${nf(r.r * D, 1)} °/s`),
    kpi('Unschärfe Wärmebild', nf(3 * ir.blurE, 2), 'px', `3σ aus Turbulenz bei ${nf(ir.t * 1000, 0)} ms · Vorwärtsflug ${nf(ir.blurV, 2)} px`, tot(ir) > 1 ? 'bad' : ''),
    kpi('Unschärfe RGB', nf(3 * rgb.blurE, 2), 'px', `3σ bei ${nf(rgb.t * 1000, 2)} ms · Vorwärtsflug ${nf(rgb.blurV, 2)} px`, tot(rgb) > 1 ? 'bad' : ''),
    kpi('Bildversatz', nf(ir.footprint, 1), 'm', `Effektivwert am Boden aus ${nf(im.h, 0)} m · Roll- ${nf(r.phi * D, 2)}°, Nickwinkel ${nf(r.theta * D, 2)}° · Kamera ${nf(r.az / G, 2)} g senkrecht`)
  ].join('');
  const msg = [];
  for (const c of [ir, rgb]) {
    const t3 = tot(c);
    if (t3 > 1) msg.push(pillF('warn', `${c.name}: bis ${nf(t3, 1)} px Bewegungsunschärfe (3σ Turbulenz plus Vorwärtsflug). Abhilfe: stabilisierte Aufhängung, ${c.name === 'Wärmebild' ? 'Kamera mit kürzerer Zeitkonstante' : 'kürzere Belichtung'}, höher oder langsamer fliegen`, 'turb-blur', c.name === 'Wärmebild' ? 'blur' : null));
    else msg.push(pillF('good', `${c.name}: Unschärfe unter einem Pixel (${nf(t3, 2)} px mit 3σ Turbulenz)`, 'turb-blur', c.name === 'Wärmebild' ? 'blur' : null));
  }
  const ovl = ir.gsd * P.irRes * P.overlap / 100;
  msg.push(pillF(3 * ir.footprint > ovl / 2 ? 'warn' : 'info', 3 * ir.footprint > ovl / 2 ? `Bildversatz 3σ ${nf(3 * ir.footprint, 1)} m größer als die halbe Überlappung der Suchbahnen (${nf(ovl / 2, 1)} m): Lücken möglich, Überlappung erhöhen` : `Bildversatz 3σ ${nf(3 * ir.footprint, 1)} m bleibt innerhalb der halben Überlappung (${nf(ovl / 2, 1)} m)`, 'turb-resp'));
  $('#img-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  // kumulierter Effektivwert der Drehraten über der Frequenz
  const fmax = 6, cum = k => { const out = []; let s2 = 0; for (let i = 1; i < tr.ws.length; i++) { const w = tr.ws[i]; if (w <= tr.wAP) continue; const a = Math.max(tr.ws[i - 1], tr.wAP); s2 += 0.5 * (tr.S[k][i] + tr.S[k][i - 1]) * (w - a); const f = w / (2 * Math.PI); if (f > fmax) break; out.push([f, Math.sqrt(s2) * D]); } return out; };
  lineChart($('#ch-img-rate'), { h: 220, title: 'Drehraten bis zur Frequenz (kumulierter Effektivwert)', x: { min: 0, max: fmax, fmt: v => nf(v, 0) + ' Hz', tipFmt: v => nf(v, 2) + ' Hz' }, y: { min: 0, max: niceRange([r.p, r.q, r.r].map(v => v * D), 0.08, true)[1], fmt: v => nf(v, 1) + ' °/s' },
    series: [{ name: 'Rollen', c: 1, pts: cum('p'), fmt: v => nf(v, 2) + ' °/s' }, { name: 'Nicken', c: 2, pts: cum('q'), fmt: v => nf(v, 2) + ' °/s' }, { name: 'Gieren', c: 3, pts: cum('r'), fmt: v => nf(v, 2) + ' °/s' }] });
  const row = c => `<tr><td>${esc(c.name)}<div class="small muted">IFOV ${nf(c.ifov * 1000, 2)} mrad · GSD ${nf(c.gsd * 100, 1)} cm</div></td><td class="n">${nf(c.t * 1000, c.t < 0.005 ? 2 : 0)} ms</td><td class="n">${nf(c.blurC, 2)} px</td><td class="n">${nf(c.blurE, 2)} px</td><td class="n">${nf(c.blurV, 2)} px</td><td class="n ${tot(c) > 1 ? 'warn' : ''}">${nf(tot(c), 2)} px</td></tr>`;
  $('#tbl-img').innerHTML = `<thead><tr><th>Kamera</th><th class="n">Zeit</th><th class="n">Mitte 1σ</th><th class="n">Ecke 1σ</th><th class="n">Vorwärts</th><th class="n">3σ + vorwärts</th></tr></thead><tbody>${row(ir)}${row(rgb)}</tbody>` +
    `<caption>Unschärfe = Drehrate × Zeit / IFOV; in der Bildecke kommt das Gieren dazu (Drehung um die Bildmitte). Vorwärtsflug: V × Zeit / GSD bei senkrechtem Blick. Fest eingebaute Kamera; Flügelschwingungen nicht enthalten.</caption>`;
}

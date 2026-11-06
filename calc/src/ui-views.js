/* ===================================================================
   Oberfläche Teil 3: Ansichten
   =================================================================== */
const RENDER = {};
const UI = { dayTab: 'mission', studyTab: 'v', afCat: 'alle', afSort: ['pCruise', 1], afSel: null, cache: {} };
try { const u = JSON.parse(localStorage.getItem('waldbrand-uav-v5-ui') || '{}'); if (u.dayTab) UI.dayTab = u.dayTab; if (u.studyTab && SWEEPS[u.studyTab]) UI.studyTab = u.studyTab; if (Array.isArray(u.afSel)) UI.afSel = u.afSel; } catch (e) { /* ignorieren */ }
function saveUI() { try { localStorage.setItem('waldbrand-uav-v5-ui', JSON.stringify({ dayTab: UI.dayTab, studyTab: UI.studyTab, afSel: UI.afSel })); } catch (e) { /* ignorieren */ } }
const keyOf = (...a) => JSON.stringify([S.params, S.comps.map(c => [c.on, c.m, c.p, c.d, c.sched, c.cda, c.x, c.y, c.z]), ...a]);
function cached(name, fn, ...extra) { const k = keyOf(...extra); const c = UI.cache[name]; if (c && c.k === k) return c.v; const v = fn(); UI.cache[name] = { k, v }; return v; }
const kpi = (k, v, u, s, cls = '') => `<div class="kpi ${cls}"><div class="k">${esc(k)}</div><div class="v">${v}${u ? `<span class="u">${esc(u)}</span>` : ''}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const pCons = C => C.pProp + C.comp.always + C.comp.mission + C.comp.day;

/* ---------- Kennwert-Streifen ---------- */
function renderStrip(R) {
  const { C, mis, per, so, P } = R;
  const items = [
    ['Abflugmasse', nf(C.m, 2) + ' kg', C.m > P.mtomLimit ? 'crit' : ''],
    ['Leistung Reiseflug', nf(pCons(C), 0) + ' W', ''],
    [`Einsatz ${P.tStart}–${P.tEnd}`, mis ? (mis.ok ? `✓ min. ${nf(mis.minE / mis.cap * 100, 0)} %` : `× Reserve ${fmtT(mis.tRes)}`) : '–', mis && mis.ok ? 'good' : 'crit'],
    ['Ausdauer ab Start', mis ? (mis.endur != null ? fmtDur(mis.endur) : '> 48 h') : '–', ''],
    ['Excess Time', fin(per.tExc) ? nfs(per.tExc, 1) + ' h' : per.tExc === Infinity ? '∞' : 'kein Gleichgewicht', per.tExc >= P.tExcReq ? 'good' : per.tExc >= 0 ? 'warn' : 'crit'],
    ['SAIL', so.sail || (so.igrc == null ? '–' : '> VI'), so.sail && ROMAN[so.sail] <= 3 ? 'good' : 'warn']
  ];
  $('#strip').innerHTML = items.map(([k, v, c]) => `<div><div class="k">${esc(k)}</div><div class="v ${c}">${esc(v)}</div></div>`).join('');
}

/* ---------- Übersicht ---------- */
function verdictOf(R) {
  const { P, mis, per, C } = R, date = fmtDoy(R.n, R.y);
  if (!mis) return ['crit', 'Keine Berechnung möglich', 'Start- und Landezeit und Akku prüfen.'];
  const endur = mis.endur != null ? fmtDur(mis.endur) : 'über 48 h';
  if (per.reason === 'ok' && per.tExc >= P.tExcReq) return ['good', `Dauerflug am ${date} mit Reserve möglich`, `Excess Time ${nf(per.tExc, 1)} h (gefordert ${nf(P.tExcReq, 1)} h), Akku ${fmtDur(per.tCm)} lang voll. Einsatz ${P.tStart}–${P.tEnd}: mindestens ${nf(mis.minE / mis.cap * 100, 0)} % Akku.`];
  if (per.reason === 'ok' && per.tExc >= 0) return ['warn', `Dauerflug am ${date} knapp möglich`, `Excess Time ${nf(per.tExc, 1)} h, gefordert ${nf(P.tExcReq, 1)} h. Für trübe Tage fehlt Reserve. Der Tageseinsatz gelingt${mis.ok ? '' : ' nicht'}.`];
  if (mis.ok) {
    const why = per.reason === 'empty' ? `Dauerflug noch nicht: nach der Nacht fehlen ${fmtDur(-per.tExc)} bis zum Sonnenaufgang-Gleichgewicht.` : per.reason === 'nosolar' ? 'Dauerflug nicht: die Solarleistung erreicht den Verbrauch an diesem Tag nie.' : '';
    return ['good', `Einsatz ${P.tStart}–${P.tEnd} gelingt, mindestens ${nf(mis.minE / mis.cap * 100, 0)} % Akku`, `${why} Ausdauer ab ${P.tStart} mit vollem Akku: ${endur}. Leistungsreserve ${nf(R.margin.w, 1)} W.`];
  }
  return ['crit', `Einsatz scheitert: Reserve um ${fmtT(mis.tRes)} erreicht`, R.margin.w != null ? `Es fehlen rund ${nf(-R.margin.w, 1)} W Dauerleistung. Größerer Akku, weniger Bordlast oder langsamer fliegen.` : 'Auch ohne Bordsysteme reicht die Energie nicht.'];
}
function flagsOf(R) {
  const { P, C, mis, so, mp } = R, f = [];
  if (C.m > P.mtomLimit) f.push(pillF('crit', `Abflugmasse ${nf(C.m, 2)} kg über ${nf(P.mtomLimit, 1)} kg`, 'mass-loop', 'mass'));
  else f.push(pillF('good', `Abflugmasse ${nf(C.m / P.mtomLimit * 100, 0)} % der zulässigen`, 'mass-loop', 'mass'));
  const vr = P.v / C.vs, vrt = P.v / C.vsTurn;
  if (vr < 1.25) f.push(pillF('crit', `Reise nur ${nf(vr, 2)} × Mindestfahrt`, 'drag-stall', 'vs')); else if (vrt < 1.15) f.push(pillF('warn', `Kurvenflug nur ${nf(vrt, 2)} × Mindestfahrt`, 'drag-stall', 'vs'));
  if (C.turn.clPeak > 0.92) f.push(pillF('warn', `Im Kurvenflug örtlich ${nf(C.turn.clPeak * 100, 0)} % von c_a,max`, 'aero-clmax'));
  const conf = foilMeta(C.foil, C.mode, P.v * C.pf.mac / C.nu).conf; if (conf < 0.8) f.push(pillF('warn', `Polaren unsicher (Konfidenz ${nf(conf, 2)})`, 'aero-polar'));
  if (C.lvl.ext) f.push(pill('warn', 'Reynoldszahl außerhalb der Tabellen'));
  if (R.cold > 0) f.push(pillF('warn', `${nf(R.cold, 1)} h ohne Laden (Akku unter 0 °C)`, 'bat-step'));
  if (mp.ws.pHold < 0.9) f.push(pillF('warn', `Wind übersteigt 90 % der Fahrt an ${nf((1 - mp.ws.pHold) * 100, 0)} % der Zeit`, 'mis-wind'));
  if (P.v > P.vmax) f.push(pill('warn', 'Reise schneller als SORA-Höchstgeschwindigkeit'));
  if (so.sail) f.push(pill(ROMAN[so.sail] <= 3 ? 'good' : 'warn', `SAIL ${so.sail}`));
  if (C.bal) {
    if (C.bal.sm < 0.03) f.push(pillF('crit', `Stabilitätsmaß nur ${nf(C.bal.sm * 100, 1)} %`, 'mass-np', 'sm'));
    if (C.bal.ballast > 0.02) f.push(pillF('warn', `${nf(C.bal.ballast * 1000, 0)} g Trimmballast`, 'mass-trim', 'mass'));
  }
  const kk = keyOf(), ae = UI.cache.ae && UI.cache.ae.k === kk ? UI.cache.ae.v : null, dy = UI.cache.dyn && UI.cache.dyn.k === kk ? UI.cache.dyn.v : null;
  if (ae) {
    const A = ae.A;
    f.push(A.okF ? pillF('good', A.flutter.vf ? `Flattern erst bei ${nf(A.flutter.vf, 0)} m/s` : 'Kein Flattern im Rechenbereich', 'ae-flutter', 'vfWing') : pillF('crit', `Flattern bei ${nf(A.flutter.vf, 0)} m/s`, 'ae-flutter', 'vfWing'));
    if (!A.okD) f.push(pillF('crit', `Divergenz bei ${nf(A.VD, 0)} m/s`, 'ae-div'));
    if (ae.res.hits.length) f.push(pillF('warn', `Eigenfrequenz im Propeller-Drehzahlbereich`, 'vib-res'));
  } else if (C.struct) f.push(pill('info', 'Schwingungsrechnung läuft …'));
  if (dy) { const w = dy.flex.crit.reduce((a, c) => (c.level > a.level ? c : a), { level: 1 }); f.push(w.level === 1 ? pillF('good', 'Flugeigenschaften Level 1', 'dyn-crit') : pillF(w.level === 2 ? 'info' : 'warn', `${w.name}: Level ${w.level}`, 'dyn-crit')); }
  if (C.struct && C.struct.stiffF > 1.01) f.push(pill('info', 'Holm steifigkeitsbestimmt'));
  if (P.structMode === 'fix') { const est = structureMass(C, C.m); f.push(pill('info', `Strukturmodell schätzt ${nf(est, 2)} kg`)); }
  return f.join('');
}
RENDER.uebersicht = (R) => {
  const [cls, txt, sub] = verdictOf(R), { C, P, mis, per } = R;
  const v = $('#verdict'); v.className = 'verdict ' + cls;
  v.innerHTML = `<div class="vtext">${esc(txt)}<div class="vsub">${esc(sub)}</div></div><div class="flags">${flagsOf(R)}</div>`;
  const used = C.cap * (1 - P.reserve / 100);
  $('#kpis').innerHTML = [
    kpi('Abflugmasse', nf(C.m, 2), 'kg', `Struktur ${nf(C.mass.struct, 2)} kg (${nf(C.mass.struct / C.m * 100, 0)} %) · Kabel ${nf(C.mass.wire * 1000, 0)} g`, C.m > P.mtomLimit ? 'bad' : ''),
    kpi('Leistung Reiseflug', nf(pCons(C), 1), 'W', `Antrieb ${nf(C.pProp, 1)} W · Bord ${nf(pCons(C) - C.pProp, 1)} W`),
    kpi('Gleitzahl', nf(C.lvl.LD, 1), '', `c_A ${nf(C.lvl.CL, 2)} · α ${nf(C.lvl.alpha, 1)}° bei ${nf(P.v, 1)} m/s`),
    kpi('Akku', nf(C.cap, 0), 'Wh', `bis Reserve ${nf(used, 0)} Wh · ${nf(C.tBattMin, 0)} °C kälteste Stunde`),
    kpi('Solarertrag', nf(R.eSol, 0), 'Wh', `Spitze ${nf(R.peak, 0)} W am ${fmtDoy(R.n, R.y)}`),
    kpi('Leistungsreserve', R.margin.w == null ? '–' : (R.margin.capped ? '> ' : '') + nf(R.margin.w, 1), 'W', 'zusätzliche Dauerlast, bis die Reserve beim Landen erreicht ist', R.margin.w != null && R.margin.w < 0 ? 'bad' : ''),
    kpi('Ausdauer ab Start', mis && mis.endur != null ? nf(mis.endur, 1) : '> 48', 'h', `Start ${P.tStart} mit vollem Akku bis zur Reserve`),
    kpi('Excess Time', fin(per.tExc) ? nfs(per.tExc, 1) : per.tExc === Infinity ? '∞' : '–', 'h', per.reason === 'ok' ? `Akku ${nf(per.tCm, 1)} h voll · ETH-Kriterium` : per.reason === 'empty' ? 'Akku läuft in der Nacht leer' : 'kein Leistungsgleichgewicht', per.tExc >= P.tExcReq ? 'ok' : per.tExc < 0 || !fin(per.tExc) ? 'bad' : '')
  ].join('');
  renderDay(R);
  renderCmp(R);
  const kk = keyOf();
  if (C.struct && !(UI.cache.ae && UI.cache.ae.k === kk && UI.cache.dyn && UI.cache.dyn.k === kk)) later(() => { if (R !== currentR()) return; aeData(R.C); dynData(R.C); if (VIEW === 'uebersicht') $('#verdict .flags').innerHTML = flagsOf(R); });
  // Masse
  const G = Object.fromEntries(GROUPS), rows = [
    { l: 'Struktur', v: C.mass.struct, t: nf(C.mass.struct, 2) + ' kg' }, { l: 'Akku', v: C.mass.batt, t: nf(C.mass.batt, 2) + ' kg' },
    { l: 'Solarmodule Flügel', v: C.mass.solar, t: nf(C.mass.solar, 2) + ' kg' }, ...(C.mass.solarHT > 0 ? [{ l: 'Solarmodule Höhenleitwerk', v: C.mass.solarHT, t: nf(C.mass.solarHT, 3) + ' kg' }] : []),
    { l: 'Antrieb', v: C.mass.prop, t: nf(C.mass.prop, 2) + ' kg' }, { l: 'Verkabelung und Stecker', v: C.mass.wire, t: nf(C.mass.wire, 3) + ' kg' }, ...(C.mass.ballast > 0.001 ? [{ l: 'Trimmballast', v: C.mass.ballast, t: nf(C.mass.ballast, 3) + ' kg' }] : []),
    ...Object.entries(C.mass.byGroup).map(([g, m]) => ({ l: G[g] || g, v: m, t: nf(m, 2) + ' kg' })),
    { l: 'Gesamt', v: C.m, t: nf(C.m, 2) + ' kg', total: true }
  ];
  $('#bars-mass').innerHTML = barsHTML(rows);
  $('#mass-sub').textContent = `${nf(C.m, 2)} kg von ${nf(P.mtomLimit, 1)} kg zulässig · Flächenbelastung ${nf(C.m * G_ / C.pf.S, 0)} N/m²`;
  const f = clamp(P.turnFrac / 100, 0, 1), z = 1 + P.zuschlag / 100, phys = P.powerModel === 'physik', pT = phys ? f * (C.turn.pel - C.lvl.pel) * z : 0;
  const prow = [
    phys ? { l: 'Antrieb Geradeausflug', v: C.lvl.pel * z, t: nf(C.lvl.pel * z, 1) + ' W' } : { l: P.powerModel === 'mess' ? 'Antrieb (Messpunkt skaliert)' : 'Antrieb (Ausgleichskurve)', v: C.pProp, t: nf(C.pProp, 1) + ' W' },
    ...(phys && f > 0 ? [{ l: `Mehrleistung Kurven (${nf(P.turnFrac, 0)} %, ${nf(P.bank, 0)}°)`, v: pT, t: nf(pT, 1) + ' W' }] : []),
    { l: 'Bord immer', v: C.comp.always, t: nf(C.comp.always, 1) + ' W' }, { l: 'Bord im Einsatzfenster', v: C.comp.mission, t: nf(C.comp.mission, 1) + ' W' },
    { l: 'Bord nur bei Tag', v: C.comp.day, t: nf(C.comp.day, 1) + ' W' }, { l: 'Bord nur bei Nacht', v: C.comp.night, t: nf(C.comp.night, 1) + ' W' },
    { l: 'Einsatz am Tag gesamt', v: pCons(C), t: nf(pCons(C), 1) + ' W', total: true }
  ];
  $('#bars-power').innerHTML = barsHTML(prow);
  $('#pow-sub').textContent = `Antrieb bei ${nf(P.v, 1)} m/s in ${nf(P.alt + P.hAGL, 0)} m Höhe, Luftdichte ${nf(C.rho, 3)} kg/m³`;
};
const G_ = 9.80665;
function renderDay(R) {
  const { P, mis, per, C } = R;
  $$('#day-tabs .tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.t === UI.dayTab)));
  let pts, sub, x0, x1;
  if (UI.dayTab === 'periodic' && per.pts) {
    pts = per.pts; x0 = pts[0][0]; x1 = pts[pts.length - 1][0];
    sub = per.reason === 'ok' ? `Start im Leistungsgleichgewicht um ${fmtT(per.tEq)} mit leerem Akku, zwei Tage. Excess Time ${nf(per.tExc, 1)} h, Akku voll ab ${fmtT(per.tFc)}.` : `Start im Leistungsgleichgewicht um ${fmtT(per.tEq)} mit leerem Akku. Der Akku ist um ${fmtT(per.tEmpty)} leer.`;
  } else {
    if (!mis) { $('#ch-day-p').innerHTML = ''; $('#ch-day-s').innerHTML = ''; return; }
    pts = mis.pts.filter(p => fin(p[1])); x0 = mis.t0; x1 = mis.t0 + mis.dur;
    sub = `${fmtDoy(R.n, R.y)}, ${nf(P.lat, 1)}° N, klarer Himmel × ${nf(P.sky, 0)} %. Sonne ${fmtT(R.e.rise)}–${fmtT(R.e.set)}. Start mit vollem Akku${mis.eClimb > 0.5 ? `, Steigflug ${nf(mis.eClimb, 0)} Wh` : ''}.`;
    if (UI.dayTab === 'periodic') sub = 'Kein Leistungsgleichgewicht an diesem Tag – Dauerflugsimulation nicht möglich. ' + sub;
  }
  $('#day-sub').textContent = sub;
  const span = x1 - x0, step = span > 30 ? 6 : span > 14 ? 3 : 2, xt = [];
  for (let t = Math.ceil(x0 / step) * step; t <= x1 + 1e-9; t += step) xt.push(t);
  const pmax = niceRange(pts.flatMap(p => [p[1], p[2]]), 0.08, true);
  lineChart($('#ch-day-p'), {
    h: 210, title: 'Leistung', x: { min: x0, max: x1, ticks: xt, fmt: fmtT }, y: { min: 0, max: pmax[1], fmt: v => nf(v, 0) + ' W' },
    series: [{ name: 'Solar', c: 'solar', pts: pts.map(p => [p[0], p[1]]), area: true, fmt: v => nf(v, 1) + ' W' }, { name: 'Verbrauch', c: 'cons', pts: pts.map(p => [p[0], p[2]]), fmt: v => nf(v, 1) + ' W' }]
  });
  lineChart($('#ch-day-s'), {
    h: 170, title: 'Ladezustand', x: { min: x0, max: x1, ticks: xt, fmt: fmtT }, y: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], fmt: v => nf(v, 0) + ' %' },
    series: [{ name: 'Akku', c: 'batt', pts: pts.map(p => [p[0], p[3]]), fmt: v => nf(v, 1) + ' %' }],
    hlines: P.reserve > 0 ? [{ y: P.reserve, label: `Reserve ${nf(P.reserve, 0)} %` }] : []
  });
  // Energie in der Höhe: Höhe über der Einsatzhöhe
  if (P.hStore > 0) lineChart($('#ch-day-h'), {
    h: 150, title: `Höhe über der Einsatzhöhe (${nf(P.hAGL, 0)} m über Grund)`, x: { min: x0, max: x1, ticks: xt, fmt: fmtT }, y: { min: 0, max: niceRange([P.hStore], 0.05, true)[1], fmt: v => nf(v, 0) + ' m' },
    series: [{ name: 'Höhenspeicher', c: 4, pts: pts.map(p => [p[0], p[4] ?? NaN]), fmt: v => nf(v, 0) + ' m' }]
  });
  else $('#ch-day-h').innerHTML = '';
}
$('#day-tabs').addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (!t) return; UI.dayTab = t.dataset.t; saveUI(); renderDay(R); });

/* ---------- Flugzeug ---------- */
function spanStations(C, a) {
  return C.ll.st.map(s => { const cl = llAt(C.ll, a.CL).am * s.fa + s.fb, cm = foilMeta(C.foil, C.mode, a.V * s.c / C.nu).clmax; return [s.eta * C.pf.b / 2, cl / cm, cl]; });
}
RENDER.flugzeug = (R) => {
  const { C, P, pc } = R, pf = C.pf;
  const pl = planformSVG($('#svg-planform'), C);
  $('#pf-sub').textContent = `Wurzeltiefe ${nf(pf.cr * 100, 1)} cm, Spitze ${nf(pf.ct * 100, 1)} cm, mittlere aerodynamische Tiefe ${nf(pf.mac * 100, 1)} cm. Reynoldszahl ${nf(P.v * pf.cr / C.nu / 1000, 0)}–${nf(P.v * pf.ct / C.nu / 1000, 0)} Tsd.` + (C.solar.mode === 'count' && !C.solar.fits ? ` Achtung: es passen nur ${nf(C.solar.n, 0)} von ${nf(C.solar.want, 0)} Zellen.` : pl.full ? ' Achtung: die Zellfläche passt nicht zwischen die gewählten Tiefen.' : '');
  const a = spanStations(C, C.lvl), t = spanStations(C, C.turn), sv = flightPower(C, C.vs * 1.2, 1, C.rho, C.nu), s12 = spanStations(C, sv);
  lineChart($('#ch-span'), {
    h: 190, title: 'Ausnutzung des Profil-Höchstauftriebs entlang der Halbspannweite', x: { min: 0, max: pf.b / 2, fmt: v => nf(v, 1) + ' m', title: 'Abstand von der Rumpfmitte' }, y: { min: 0, max: 1.1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: v => nf(v * 100, 0) + ' %' },
    series: [{ name: `Reiseflug ${nf(P.v, 1)} m/s`, c: 1, pts: a.map(p => [p[0], p[1]]) }, { name: `Kurvenflug ${nf(P.bank, 0)}°`, c: 2, pts: t.map(p => [p[0], p[1]]) }, { name: `1,2 × Mindestfahrt (${nf(C.vs * 1.2, 1)} m/s)`, c: 3, pts: s12.map(p => [p[0], p[1]]), dash: true }],
    hlines: [{ y: 1, label: 'Abriss' }]
  });
  // Leistungskurve
  const pcT = powerCurve(C, pc.pts[0].V, pc.pts[pc.pts.length - 1].V, C.nTurn);
  const lv = pc.pts.map(r => [r.V, r.stall ? NaN : r.pel]), tv = pcT.pts.map(r => [r.V, r.stall ? NaN : r.pel]);
  const ymax = niceRange([...lv.map(p => p[1]), ...tv.map(p => p[1])].filter(v => v < 4 * pc.minP.pel), 0.05, true)[1];
  lineChart($('#ch-power'), {
    h: 240, x: { min: pc.pts[0].V, max: pc.pts[pc.pts.length - 1].V, fmt: v => nf(v, 0), tipFmt: v => nf(v, 1) + ' m/s', title: 'Fluggeschwindigkeit (m/s)' }, y: { min: 0, max: ymax, fmt: v => nf(v, 0) + ' W' },
    series: [{ name: 'Geradeausflug', c: 1, pts: lv, fmt: v => nf(v, 1) + ' W' }, { name: `Kurve ${nf(P.bank, 0)}° (n = ${nf(C.nTurn, 2)})`, c: 2, pts: tv, fmt: v => nf(v, 1) + ' W', dash: true }],
    marks: [{ x: pc.minP.V, y: pc.minP.pel, c: 1, label: 'P min' }, { x: pc.maxLD.V, y: pc.maxLD.pel, c: 1, label: 'beste Gleitzahl', dy: 16 }, { x: P.v, y: C.lvl.pel, c: 3, label: 'Reise' }],
    vlines: [{ x: C.vs, label: 'V_min' }],
    tipExtra: x => { const r = flightPower(C, x, 1, C.rho, C.nu); return `<div class="row"><span>Gleitzahl</span><b>${nf(r.LD, 1)}</b></div><div class="row"><span>c_A</span><b>${nf(r.CL, 2)}</b></div>`; }
  });
  $('#pc-sub').textContent = `Elektrische Antriebsleistung über der wahren Fluggeschwindigkeit, ${nf(C.m, 2)} kg, Luftdichte ${nf(C.rho, 3)} kg/m³.` + (P.powerModel !== 'physik' ? ' Hinweis: der Tageslauf nutzt das gewählte Mess- oder Ausgleichsmodell, die Kurve zeigt das physikalische Modell.' : '');
  $('#kpis-speed').innerHTML = [
    kpi('Mindestfahrt', nf(C.vs, 1), 'm/s', `c_A,max Flügel ${nf(C.CLmaxW, 2)} · Kurve ${nf(C.vsTurn, 1)} m/s`),
    kpi('Geringste Leistung', nf(pc.minP.V, 1), 'm/s', `${nf(pc.minP.pel, 1)} W · Gleitzahl ${nf(pc.minP.LD, 1)}`),
    kpi('Beste Gleitzahl', nf(pc.maxLD.V, 1), 'm/s', `Gleitzahl ${nf(pc.maxLD.LD, 1)} · ${nf(pc.maxLD.pel, 1)} W`),
    kpi('Reiseflug', nf(P.v, 1), 'm/s', `${nf(C.lvl.pel, 1)} W · ${nf(P.v / C.vs, 2)} × Mindestfahrt`, P.v / C.vs < 1.25 ? 'bad' : '')
  ].join('');
  // Widerstand
  const D = C.lvl.D, Dt = C.lvl.Dtot, names = { profile: 'Profilwiderstand Flügel', induced: 'Induzierter Widerstand', tail: 'Leitwerk', fus: C.cfg.fus === 'glider' ? 'Rumpf (Schale)' : 'Rumpfgondel', boom: C.cfg.nBoom > 1 ? 'Leitwerksträger (2)' : 'Leitwerksträger', comps: 'Anbauten, Motorgondel, Pylon', gear: 'Landekufe', reserve: 'Reserve' };
  $('#bars-drag').innerHTML = barsHTML([...Object.entries(D).filter(([, v]) => v > 1e-6).map(([k, v]) => ({ l: names[k] || k, v, t: `${nf(v, 2)} N · ${nf(v / Dt * 100, 0)} %` })), { l: 'Gesamt', v: Dt, t: nf(Dt, 2) + ' N', total: true }]);
  $('#drag-sub').textContent = `Geradeausflug ${nf(P.v, 1)} m/s, Staudruck ${nf(C.lvl.q, 0)} Pa. Profil ${C.foil.name}${C.mode === 'trip' ? ' mit Umschlag an der Zellkante' : ''}.`;
  const tr = (k, v) => `<tr><th>${k}</th><td class="n">${v}</td></tr>`;
  $('#tbl-aero').innerHTML = '<tbody>' + [
    tr('Auftriebsbeiwert c_A', nf(C.lvl.CL, 3)), tr('Profilwiderstand c_W,p (Flügel)', nf(C.lvl.cdp, 4)), tr('Induzierter Widerstand c_W,i', nf(C.lvl.CDi, 4)),
    tr('Spannweitenwirkungsgrad e (Traglinie)', nf(C.lvl.e, 3)), tr('Anstellwinkel Wurzel', nf(C.lvl.alpha, 1) + '°'), tr('Reynoldszahl mittlere Tiefe', nf(P.v * pf.mac / C.nu / 1000, 0) + ' Tsd.'),
    tr('Nullmoment Profil c_m', nf(C.lvl.cm, 3)), tr('Höhenleitwerk c_A (Trimmung)', nf(C.lvl.CLh, 3))
  ].join('') + '</tbody>';
  // Struktur
  const st = C.struct || structureMass(C, C.m, true), stN = { spar: 'Holmgurte', web: 'Holmsteg', le: 'Nasenbeplankung', ribs: 'Rippen', skin: 'Bespannung', te: 'Endleiste und Ruder', joints: 'Steckungen', ht: 'Höhenleitwerk', fin: C.tail.nFin > 1 ? 'Seitenleitwerke' : 'Seitenleitwerk', boom: C.cfg.nBoom > 1 ? 'Leitwerksträger (2)' : 'Leitwerksträger', fus: C.cfg.fus === 'glider' ? 'Rumpf vorn mit Einbauten' : 'Rumpfgondel mit Einbauten', cone: 'Rumpfröhre', land: P.landGear === 'skid' ? 'Landekufe, Katapulthaken' : 'Rumpfboden, Katapulthaken', pylon: 'Motorpylon' };
  $('#bars-struct').innerHTML = barsHTML([...Object.entries(st.parts).filter(([, v]) => v > 1e-6).map(([k, v]) => ({ l: stN[k] || k, v, t: nf(v * 1000, 0) + ' g' })), { l: 'Zuschlag Robustheit', v: st.rugged, t: nf(st.rugged * 1000, 0) + ' g' }, { l: P.structMode === 'fix' ? 'Modell (nicht verwendet)' : 'Gesamt', v: st.total, t: nf(st.total, 2) + ' kg', total: true }]);
  $('#struct-sub').textContent = P.structMode === 'fix' ? `Feste Strukturmasse ${nf(P.mZelle, 2)} kg eingestellt. Das Bauweisen-Modell käme auf ${nf(st.total, 2)} kg.` : `Holm-Rippen-Bauweise, geprüft an AtlantikSolar (gemessen 1,52 kg ohne Kabel). Verkabelung als eigene Gruppe (${nf(C.mass.wire * 1000, 0)} g). Werkstoffe, Steifigkeiten, Schwingungen und Transportteilung in der Ansicht Struktur.`;
  $('#tbl-struct').innerHTML = '<tbody>' + [
    tr('Grenzlastvielfaches', nf(st.nLim, 2) + ' g'), tr('Bruchlastvielfaches', nf(st.nUlt, 2) + ' g'), tr(`Böe ${nf(P.gustU, 1)} m/s bei ${nf(P.vGust, 0)} m/s`, '+' + nf(st.gust.dn, 2) + ' g'),
    tr(`Abrissgrenze bei ${nf(P.vGust, 0)} m/s`, nf(st.gust.nStall, 2) + ' g'), tr('Biegemoment Wurzel (Bruchlast)', nf(st.Mroot, 0) + ' N·m'), tr('Holmhöhe Wurzel', nf(st.hRoot * 1000, 0) + ' mm'),
    tr('Durchbiegung Spitze bei 1 g', `${nf(st.dTip * 100, 1)} cm (zul. ${nf(st.dMax * 100, 0)} cm)`), tr('Holm', st.stiffF > 1.01 ? `steifigkeitsbestimmt (× ${nf(st.stiffF, 2)})` : 'festigkeitsbestimmt')
  ].join('') + '</tbody>';
  // Antrieb
  const L = C.lvl;
  if (P.propModel === 'bemt' && L.op && L.op.n) {
    const o = L.op;
    $('#bars-prop').innerHTML = barsHTML([
      { l: 'Propeller (Blattelemente)', v: o.etaP, t: pct(o.etaP) }, { l: 'Motor im Betriebspunkt', v: o.etaM, t: pct(o.etaM) }, { l: 'Regler', v: P.etaEsc / 100, t: nf(P.etaEsc, 0) + ' %' },
      { l: 'Getriebe', v: P.etaGear / 100, t: nf(P.etaGear, 0) + ' %' }, { l: 'Einbau (' + C.motor.name + ')', v: C.motor.eta, t: pct(C.motor.eta) }, { l: 'Gesamt', v: L.eta, t: pct(L.eta), total: true }
    ], { max: 1 });
    $('#prop-sub').textContent = `Kennfeld: ${nf(o.rpm, 0)} U/min, J ${nf(o.J, 2)}, ${nf(o.I, 1)} A bei ${nf(o.U, 1)} V. Details in der Ansicht Antrieb.`;
  } else if (P.propModel === 'eta') { $('#bars-prop').innerHTML = barsHTML([{ l: 'Gesamtwirkungsgrad (fest)', v: L.eta, t: pct(L.eta) }], { max: 1 }); $('#prop-sub').textContent = `Schub ${nf(L.Dtot, 2)} N, Schubleistung ${nf(L.Dtot * P.v, 1)} W, elektrisch ${nf(L.pel, 1)} W.`; }
  else {
    const A = Math.PI * P.propD ** 2 / 4 * P.nProp;
    $('#bars-prop').innerHTML = barsHTML([
      { l: 'Strahl (Impulstheorie)', v: L.etaI, t: pct(L.etaI) }, { l: 'Propeller-Profil', v: P.etaProfile / 100, t: nf(P.etaProfile, 0) + ' %' }, { l: 'Motor', v: P.etaMotor / 100, t: nf(P.etaMotor, 0) + ' %' },
      { l: 'Regler', v: P.etaEsc / 100, t: nf(P.etaEsc, 0) + ' %' }, { l: 'Getriebe', v: P.etaGear / 100, t: nf(P.etaGear, 0) + ' %' }, ...(C.motor.eta < 1 ? [{ l: 'Einbau (' + C.motor.name + ')', v: C.motor.eta, t: pct(C.motor.eta) }] : []), { l: 'Gesamt', v: L.eta, t: pct(L.eta), total: true }
    ], { max: 1 });
    $('#prop-sub').textContent = `Schub ${nf(L.Dtot, 2)} N, Kreisflächenbelastung ${nf(L.Dtot / A, 1)} N/m², induzierte Geschwindigkeit ${nf(P.v * (1 / L.etaI - 1), 2)} m/s. Größerer Propeller senkt die Strahlverluste.`;
  }
};

/* ---------- Profile ---------- */
RENDER.profile = (R, force) => {
  const P = S.params, list = cached('af', () => compareAirfoils(P, S.comps));
  const cats = ['alle', ...new Set(list.map(r => r.cat))];
  $('#af-cats').innerHTML = cats.map(c => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${UI.afCat === c}">${esc(c === 'alle' ? 'Alle' : c)}</button>`).join('');
  const cur = list.find(r => r.key === P.airfoil && r.mode === (P.transition === 'trip' ? 'trip' : 'free')) || list[0];
  if (!UI.afSel || !UI.afSel.length) UI.afSel = [P.airfoil, 'sd7037', 'fx63137'].filter((k, i, a) => a.indexOf(k) === i);
  const [sk, sd] = UI.afSort, rows = list.filter(r => UI.afCat === 'alle' || r.cat === UI.afCat).slice().sort((a, b) => ((fin(a[sk]) ? a[sk] : 1e9) - (fin(b[sk]) ? b[sk] : 1e9)) * sd || String(a.name).localeCompare(b.name));
  const best = list.reduce((m, r) => (r.pCruise < m.pCruise ? r : m), list[0]);
  $('#af-sub').textContent = `Jedes Profil im kompletten Flugzeug gerechnet: gleiche Geometrie, Masse und Bordlast, Reise ${nf(P.v, 1)} m/s. Bestes Profil bei dieser Geschwindigkeit: ${best.name} (${nf(best.pCruise, 1)} W). Spaltenkopf anklicken zum Sortieren.`;
  const th = (k, l, n = true) => `<th class="sort${n ? ' n' : ''}" data-sort="${k}"${sk === k ? ` aria-sort="${sd > 0 ? 'ascending' : 'descending'}"` : ''}>${l}${sk === k ? (sd > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  $('#tbl-af').innerHTML = `<thead><tr><th>Wahl</th><th>Vgl.</th>${th('name', 'Profil', false)}${th('cat', 'Art', false)}${th('t', 'Dicke')}${th('f', 'Wölbung')}${th('pCruise', 'P Reise')}<th class="n">Δ</th>${th('cdp', 'c_W,p')}${th('vMinP', 'V P_min')}${th('pMinP', 'P_min')}${th('vs', 'V_min')}${th('tExc', 'Excess')}${th('conf', 'Konf.')}</tr></thead><tbody>` +
    rows.map(r => {
      const sel = r.key === P.airfoil && r.mode === (P.transition === 'trip' ? 'trip' : 'free'), cmp = UI.afSel.includes(r.key);
      return `<tr class="${sel ? 'sel' : ''}"><td><input type="radio" name="af-pick" data-pick="${esc(r.key)}" data-mode="${r.mode}" ${sel ? 'checked' : ''} aria-label="${esc(r.name)} als Auslegungsprofil"></td><td><input type="checkbox" data-cmp="${esc(r.key)}" ${cmp ? 'checked' : ''} aria-label="${esc(r.name)} vergleichen"></td>` +
        `<td>${esc(r.name)}${r.src !== 'NeuralFoil' ? ` <span class="muted small">${esc(r.src)}</span>` : ''}${r.mode === 'trip' ? ' <span class="muted small">Umschlag</span>' : ''}</td><td>${esc(r.cat)}</td><td class="n">${nf(r.t * 100, 1)} %</td><td class="n">${nf(r.f * 100, 1)} %</td>` +
        `<td class="n">${nf(r.pCruise, 1)} W</td><td class="n ${r.pCruise - cur.pCruise < -0.05 ? 'good' : r.pCruise - cur.pCruise > 0.05 ? 'crit' : ''}">${nfs(r.pCruise - cur.pCruise, 1)}</td><td class="n">${nf(r.cdp * 1e4, 0)}</td><td class="n">${nf(r.vMinP, 1)}</td><td class="n">${nf(r.pMinP, 1)} W</td><td class="n">${nf(r.vs, 1)}</td>` +
        `<td class="n ${r.tExc >= 0 ? 'good' : ''}">${fin(r.tExc) ? nfs(r.tExc, 1) + ' h' : '–'}</td><td class="n ${r.conf < 0.8 ? 'warn' : ''}">${nf(r.conf, 2)}</td></tr>`;
    }).join('') + `</tbody><caption>P Reise: elektrische Antriebsleistung bei ${nf(P.v, 1)} m/s. c_W,p: Profilwiderstand des Flügels in 10⁻⁴. V P_min: Geschwindigkeit geringster Leistung. Excess Time am Auslegungstag. Konf.: Vertrauen von NeuralFoil in die Vorhersage (unter 0,8 vorsichtig).</caption>`;
  renderPolars(list);
};
function renderPolars(list) {
  const P = S.params, C = R.C, Re = P.v * C.pf.mac / C.nu, mode = P.transition === 'trip' ? 'trip' : 'free', keys = UI.afSel.slice(0, 4);
  $('#polar-sub').textContent = `Re = ${nf(Re / 1000, 0)} Tsd. (mittlere Tiefe bei ${nf(P.v, 1)} m/s), Ncrit 9${mode === 'trip' ? ', Umschlag bei 10 %' : ''}. Kreis: c_A des Flügels im Reiseflug.`;
  const ser = [], ser2 = [];
  keys.forEach((k, i) => {
    const f = foilByKey(k), pts = [], pts2 = [];
    for (let cl = -0.2; cl <= 1.8; cl += 0.02) { const o = { flag: 0 }, cd = profileCd(f, mode, Re, cl, o); if (o.flag) continue; pts.push([cd * 1e4, cl]); pts2.push([cl, cl / cd]); }
    ser.push({ name: f.name, c: i + 1, pts: pts.map(p => p), fmt: v => 'c_A ' + nf(v, 2), noTip: true }); ser2.push({ name: f.name, c: i + 1, pts: pts2, fmt: v => nf(v, 1) });
  });
  const allcd = ser.flatMap(s => s.pts.map(p => p[0]));
  const clW = C.lvl.CL, f0 = foilByKey(keys[0]);
  lineChart($('#ch-polar'), { h: 240, title: 'Widerstandspolare', x: { min: 0, max: Math.min(400, niceRange(allcd, 0.02)[1]), fmt: v => nf(v, 0), title: 'Profilwiderstand c_w in 10⁻⁴' }, y: { min: -0.2, max: 1.8, fmt: v => nf(v, 1) }, series: ser.map(s => ({ ...s, pts: s.pts.filter(p => p[0] < 400) })), marks: f0 ? [{ x: profileCd(f0, mode, Re, clW) * 1e4, y: clW, c: 1, label: 'Reise' }] : [], legend: true });
  lineChart($('#ch-polar2'), { h: 200, title: 'Gleitzahl des Profils', x: { min: -0.2, max: 1.8, fmt: v => nf(v, 1), title: 'Auftriebsbeiwert c_a' }, y: { min: 0, max: niceRange(ser2.flatMap(s => s.pts.map(p => p[1])), 0.05, true)[1], fmt: v => nf(v, 0) }, series: ser2, vlines: [{ x: clW, label: 'Reise' }] });
  shapesSVG($('#svg-shapes'), keys, P);
  $('#tbl-afsel').innerHTML = `<thead><tr><th>Profil</th><th class="n">Dicke</th><th class="n">bei</th><th class="n">Wölbung</th><th class="n">bei</th><th class="n">c_a,max</th><th class="n">c_m</th><th class="n">α₀</th></tr></thead><tbody>` + keys.map(k => { const f = foilByKey(k), m = foilMeta(f, mode, Re); return `<tr><td>${esc(f.name)}</td><td class="n">${nf(f.t * 100, 1)} %</td><td class="n">${nf(f.xt * 100, 0)} %</td><td class="n">${nf(f.f * 100, 1)} %</td><td class="n">${nf(f.xf * 100, 0)} %</td><td class="n">${nf(m.clmax, 2)}</td><td class="n">${nf(m.cm, 3)}</td><td class="n">${nf(m.a0, 1)}°</td></tr>`; }).join('') + `</tbody><caption>${keys.map(k => { const f = foilByKey(k); return `${f.name}: ${f.desc || ''}`; }).map(esc).join(' · ')}</caption>`;
}
$('#v-profile').addEventListener('click', e => {
  const c = e.target.closest('[data-cat]'); if (c) { UI.afCat = c.dataset.cat; RENDER.profile(R); return; }
  const s = e.target.closest('[data-sort]'); if (s) { const k = s.dataset.sort; UI.afSort = [k, UI.afSort[0] === k ? -UI.afSort[1] : (k === 'tExc' || k === 'conf' ? -1 : 1)]; RENDER.profile(R); }
});
$('#v-profile').addEventListener('change', e => {
  const p = e.target.closest('[data-pick]');
  if (p) { S.params.airfoil = p.dataset.pick; S.params.transition = p.dataset.mode; if (!UI.afSel.includes(p.dataset.pick)) UI.afSel = [p.dataset.pick, ...UI.afSel].slice(0, 4); fillForms(); markPreset(); saveUI(); schedule(true); return; }
  const c = e.target.closest('[data-cmp]');
  if (c) { const k = c.dataset.cmp; UI.afSel = c.checked ? [...UI.afSel.filter(x => x !== k), k].slice(-4) : UI.afSel.filter(x => x !== k); saveUI(); RENDER.profile(R); }
});

/* ---------- Vergleichsstand ---------- */
const CMP_KEY = 'waldbrand-uav-v5-cmp';
let CMP = null;
try { CMP = JSON.parse(localStorage.getItem(CMP_KEY) || 'null'); } catch (e) { CMP = null; }
const CMP_ROWS = [
  ['m', 'Abflugmasse', 'kg', 2, -1], ['ms', 'Strukturmasse', 'kg', 2, -1], ['p', 'Leistung Reiseflug', 'W', 1, -1], ['ld', 'Gleitzahl', '', 1, 1],
  ['cap', 'Akku', 'Wh', 0, 1], ['sol', 'Solarertrag Auslegungstag', 'Wh', 0, 1], ['mar', 'Leistungsreserve', 'W', 1, 1], ['end', 'Ausdauer ab Start', 'h', 1, 1],
  ['tex', 'Excess Time', 'h', 1, 1], ['soc', 'Einsatz: min. Ladezustand', '%', 0, 1], ['vs', 'Mindestfahrt', 'm/s', 1, -1], ['sail', 'SAIL', '', 0, -1]
];
function cmpVals(R) {
  const { C, mis, per, so } = R;
  return { m: C.m, ms: C.mass.struct, p: pCons(C), ld: C.lvl.LD, cap: C.cap, sol: R.eSol, mar: R.margin.w, end: mis && mis.endur != null ? mis.endur : 48, tex: fin(per.tExc) ? per.tExc : NaN, soc: mis ? mis.minE / mis.cap * 100 : NaN, vs: C.vs, sail: so.sail ? ROMAN[so.sail] : NaN };
}
function fmtParam(k, v) {
  if (k === 'airfoil' || k === 'tailAirfoil') { const f = foilByKey(v); return f ? f.name : v; }
  const m = PM[k]; if (m && m.sel && SEL[m.sel]) { const o = SEL[m.sel].find(x => String(x[0]) === String(v)); if (o) return o[1]; }
  if (typeof v === 'number') return nf(v, Math.abs(v) < 10 && v % 1 ? 2 : v % 1 ? 1 : 0) + (m && m.u ? ' ' + m.u : '');
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  return String(v);
}
function renderCmp(R) {
  const panel = $('#cmp-panel'); $('#cmp-clear').hidden = !CMP;
  if (!CMP) { panel.hidden = true; $('#cmp-note').textContent = 'Merkt sich den aktuellen Stand. Danach zeigt die Übersicht bei jeder Änderung, was besser oder schlechter wird.'; return; }
  panel.hidden = false;
  $('#cmp-note').textContent = `Gemerkt am ${new Date(CMP.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`;
  const now = cmpVals(R), RN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  $('#tbl-cmp').innerHTML = '<thead><tr><th>Größe</th><th class="n">Gemerkt</th><th class="n">Jetzt</th><th class="n">Änderung</th></tr></thead><tbody>' + CMP_ROWS.map(([k, l, u, d, dir]) => {
    const a = CMP.vals[k], b = now[k], dv = b - a, good = fin(dv) && Math.abs(dv) > Math.pow(10, -d) / 2 ? (dv * dir > 0 ? 'good' : 'crit') : '';
    const f = v => (k === 'sail' ? (RN[v] || '–') : (k === 'end' && v >= 48 ? '≥ 48' : nf(v, d)) + (u ? ' ' + u : ''));
    return `<tr><th>${esc(l)}</th><td class="n">${f(a)}</td><td class="n">${f(b)}</td><td class="n ${good}">${fin(dv) ? (k === 'sail' ? (dv ? nfs(dv, 0) + ' Stufen' : '±0') : nfs(dv, d)) : '–'}</td></tr>`;
  }).join('') + '</tbody>';
  const ch = Object.keys(S.params).filter(k => JSON.stringify(S.params[k]) !== JSON.stringify(CMP.params[k]) && PM[k]);
  const cOn = S.comps.filter(c => { const o = (CMP.comps || []).find(x => x.id === c.id); return !o || o.on !== c.on || o.m !== c.m || o.p !== c.p || o.d !== c.d || o.sched !== c.sched; }).length + Math.max(0, (CMP.comps || []).length - S.comps.length);
  $('#cmp-sub').textContent = ch.length || cOn ? 'Geändert: ' + [...ch.slice(0, 8).map(k => `${PM[k].l} ${fmtParam(k, CMP.params[k])} → ${fmtParam(k, S.params[k])}`), ...(ch.length > 8 ? [`und ${ch.length - 8} weitere`] : []), ...(cOn ? [`${cOn} Komponente${cOn > 1 ? 'n' : ''}`] : [])].join(' · ') : 'Keine Eingabe geändert.';
}
$('#cmp-set').addEventListener('click', () => { if (!R) return; CMP = { at: Date.now(), params: { ...S.params }, comps: S.comps.map(c => ({ ...c })), vals: cmpVals(R) }; try { localStorage.setItem(CMP_KEY, JSON.stringify(CMP)); } catch (e) { /* ignorieren */ } renderCmp(R); });
$('#cmp-clear').addEventListener('click', () => { CMP = null; try { localStorage.removeItem(CMP_KEY); } catch (e) { /* ignorieren */ } renderCmp(R); });

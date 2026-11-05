/* ===================================================================
   Oberfläche Teil 4: Schwerpunkt, Struktur, Antrieb, Flugdynamik
   =================================================================== */
const CATS = { comp: ['Bordsysteme', 'var(--c1)'], solar: ['Solarmodule', 'var(--c2)'], batt: ['Akku', 'var(--c3)'], prop: ['Antrieb', 'var(--c4)'], wire: ['Verkabelung', 'var(--c5)'], struct: ['Struktur', 'var(--bar)'], ballast: ['Ballast', 'var(--ink-2)'] };
const catOf = it => it.cat && CATS[it.cat] ? it.cat : it.key === 'batt' ? 'batt' : (it.key === 'solar' || it.key === 'solarht') ? 'solar' : it.key === 'motor' ? 'prop' : it.key === 'ballast' ? 'ballast' : it.key.startsWith('comp:') ? 'comp' : 'struct';
const pctMac = (C, x) => (x - C.bal.g.xmac) / C.pf.mac * 100;
const fmtV = (v, d = 1) => (v === Infinity || v == null ? 'keine' : nf(v, d));
const LVL_TXT = { 1: 'Level 1', 2: 'Level 2', 3: 'Level 3', 4: 'unzureichend' };
const lvlPill = l => pill(l === 1 ? 'good' : l === 2 ? 'warn' : 'crit', LVL_TXT[l]);
const fmtKg = m => (m >= 1 ? nf(m, 2) + ' kg' : nf(m * 1000, 0) + ' g');
const later = fn => setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, 30);

// Leitwerkslast, Abwind, Einstellwinkeldifferenz und Trimmwiderstand im Reiseflug
function trimInfo(C) {
  const np = C.np, L = C.lvl, P = C.P, tg = C.tail, q = 0.5 * C.rho * P.v * P.v;
  const CLh = fin(L.CLh) ? L.CLh : 0, eps = np.deda * L.CL / np.aw, ewd = L.alpha * DEG - eps - CLh / np.at;
  return { CLh, Lt: CLh * q * tg.Sh, eps, ewd, Dtrim: q * tg.Sh * CLh * CLh / (Math.PI * 0.9 * P.arH), q };
}

/* ---------- Seitenansicht mit Wägediagramm (Massen verschiebbar) ---------- */
function sideViewSVG(el, C) {
  el._fn = e => sideViewSVG(e, R.C); el._cfg = C;
  const P = C.P, pf = C.pf, tg = C.tail, bal = C.bal, g = bal.g, mi = bal.mi, W = cw(el), cf = C.cfg;
  const zw = g.zw, Rp = g.R, zTip = zWingAt(g, pf.b / 2);
  const xs0 = Math.min(-0.08, g.xProp - 0.06), xs1 = Math.max(g.xTail, g.xhTE, g.xvTE, g.xProp, P.fusL) + 0.08;
  const zTop = Math.max(g.zV1 + 0.04, g.zH + 0.05, g.zP + Rp + 0.03, zTip + 0.06, zw + 0.1), zBot = Math.min(g.zLow - 0.03, g.zP - Rp - 0.03);
  const sc = (W - 20) / (xs1 - xs0), H1 = Math.round((zTop - zBot) * sc) + 12, H2 = Math.max(130, Math.min(190, W * 0.2)), base = H1 + H2, H = base + 30;
  const X = x => 10 + (x - xs0) * sc, Z = z => 6 + (zTop - z) * sc, f1 = v => v.toFixed(1);
  const parts = aircraftSide(C, X, Z, sc);
  let s = `<svg class="viz sv" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Seitenansicht mit Massenlagen, Schwerpunkt, Schublinie und Neutralpunkt">`;
  s += `<g class="sv-wing">${parts.back}</g>` + parts.body + `<g class="sv-wing">${parts.wing}</g>`;
  // Komponenten als kleine Kästchen an ihrer Lage (x, z)
  for (const it of mi.items) if ((it.key.startsWith('comp:') && it.key !== 'comp:servo' && it.y < 0.3) || (it.key === 'batt' && !P.battInWing)) {
    const w = Math.max(4, Math.min(0.14, 0.02 + it.m * 0.04) * sc), col = CATS[catOf(it)][1], hh = Math.min(P.fusD * sc * 0.6, w * 1.1);
    s += `<rect class="sv-box" data-for="${esc(it.key)}" x="${f1(X(it.x) - w / 2)}" y="${f1(Z(it.z) - hh / 2)}" width="${f1(w)}" height="${f1(hh)}" rx="2" fill="${col}" fill-opacity="0.55"/>`;
  }
  // Schublinie
  const xa = Math.min(g.xProp, bal.xcg) - 0.05, xb = Math.max(g.xProp, bal.xcg) + 0.15;
  s += `<line x1="${f1(X(xa))}" x2="${f1(X(xb))}" y1="${f1(Z(g.zP))}" y2="${f1(Z(g.zP))}" stroke="var(--c4)" stroke-width="1.2" stroke-dasharray="6 4"/>`;
  s += `<text class="tick" x="${f1(X(xb) + 4)}" y="${f1(Z(g.zP) + 4)}">Schublinie ${nfs((g.zP - bal.zcg) * 100, 0)} cm</text>`;
  // Wägediagramm
  const items = mi.items.map(it => ({ ...it, cat: catOf(it) })), mmax = Math.max(...items.map(i => i.m)), hh = H2 - 40;
  const yTop = m => base - 6 - Math.sqrt(m / mmax) * hh;
  s += `<line class="grid" x1="10" x2="${W - 10}" y1="${H1 + 2}" y2="${H1 + 2}"/>`;
  const xt = niceTicks(xs0, xs1, Math.max(3, Math.floor(W / 90)));
  for (const v of xt) if (v >= xs0 && v <= xs1) s += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${base}" y2="${base + 4}"/><text class="tick" x="${X(v)}" y="${base + 16}" text-anchor="middle">${nf(v, 2)}</text>`;
  s += `<line class="axis" x1="10" x2="${W - 10}" y1="${base}" y2="${base}"/><text class="axis-label" x="${W - 10}" y="${base + 28}" text-anchor="end">Lage ab Bugspitze (m)</text>`;
  const dragKey = it => it.key.startsWith('comp:') ? it.key : it.key === 'batt' && !P.battInWing && P.trimMode !== 'battery' ? 'batt' : it.key === 'wingstruct' && P.trimMode !== 'wing' ? 'wing' : '';
  // Beschriftung der größten Massen, versetzt gegen Überdeckung
  const lab = items.slice().sort((a, b) => b.m - a.m).slice(0, W < 520 ? 3 : 6), placed = [];
  const short = n => n.replace(/ \(.*\)/, '').replace('Solarmodule ', 'Solar ').replace('Flügelstruktur', 'Flügel').replace('Höhenleitwerk', 'HLW');
  items.sort((a, b) => b.m - a.m).forEach(it => {
    const dk = dragKey(it), x = X(it.x), y = yTop(it.m), col = CATS[it.cat][1];
    s += `<g class="lolli${dk ? ' drag' : ''}" data-key="${esc(it.key)}"${dk ? ` data-drag="${esc(dk)}" tabindex="0" role="slider" aria-valuemin="-0.5" aria-valuemax="6" aria-valuenow="${it.x.toFixed(3)}" aria-valuetext="${nf(it.x, 3)} m"` : ''} data-x="${it.x}" data-m="${it.m}" data-grp="${it.grp}" aria-label="${esc(it.name)}: ${nf(it.m * 1000, 0)} g bei ${nf(it.x, 3)} m${dk ? ', mit Pfeiltasten verschieben' : ''}">` +
      `<line x1="${x}" x2="${x}" y1="${base}" y2="${y}" stroke="${col}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${dk ? 6 : 4.5}" fill="${col}" stroke="var(--panel)" stroke-width="2"/>` +
      (dk ? `<circle class="hit" cx="${x}" cy="${y}" r="15" fill="transparent"/>` : `<circle cx="${x}" cy="${y}" r="9" fill="transparent"/>`) + '</g>';
  });
  for (const it of lab) {
    const x = X(it.x), t = `${short(it.name)} ${fmtKg(it.m)}`, w = t.length * 6.6 + 6, anc = x > W - w / 2 - 8 ? 'end' : x < w / 2 + 8 ? 'start' : 'middle';
    const x0 = anc === 'end' ? x - w : anc === 'start' ? x : x - w / 2;
    let y = yTop(it.m) - 10;
    for (let k = 0; k < 8 && placed.some(p => x0 < p.x1 && x0 + w > p.x0 && Math.abs(p.y - y) < 13); k++) y -= 13;
    if (y < H1 + 10 || placed.some(p => x0 < p.x1 && x0 + w > p.x0 && Math.abs(p.y - y) < 13)) continue;
    placed.push({ x0, x1: x0 + w, y });
    s += `<text class="mark-label sv-lab" data-for="${esc(it.key)}" x="${x}" y="${y}" text-anchor="${anc}">${esc(t)}</text>`;
  }
  // Schwerpunkt, Neutralpunkt, Ziel
  const xcg = bal.xcg, xnp = C.np.xnp, xT = bal.target;
  const cg = (cx, cy, rr) => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><path d="M${cx} ${cy}L${cx + rr} ${cy}A${rr} ${rr} 0 0 0 ${cx} ${cy - rr}ZM${cx} ${cy}L${cx - rr} ${cy}A${rr} ${rr} 0 0 0 ${cx} ${cy + rr}Z" fill="var(--ink)"/>`;
  s += `<line class="sv-np" x1="${X(xnp)}" x2="${X(xnp)}" y1="${Z(zw + C.foil.t * pf.cr) - 6}" y2="${base}" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  if (P.trimMode === 'none' || Math.abs(xT - xcg) > 0.003) s += `<line x1="${X(xT)}" x2="${X(xT)}" y1="${H1 + 4}" y2="${base}" stroke="var(--muted)" stroke-dasharray="2 3"/><text class="tick" x="${X(xT)}" y="${H1 + 14}" text-anchor="middle">Ziel</text>`;
  s += `<g class="sv-cg"><line x1="${X(xcg)}" x2="${X(xcg)}" y1="${Z(bal.zcg) + 7}" y2="${base}" stroke="var(--ink)" stroke-width="1.5"/>${cg(X(xcg), Z(bal.zcg), 7)}</g>`;
  s += `<path class="sv-np" d="M${X(xnp) - 6} ${Z(zw + C.foil.t * pf.cr) - 14}L${X(xnp) + 6} ${Z(zw + C.foil.t * pf.cr) - 14}L${X(xnp)} ${Z(zw + C.foil.t * pf.cr) - 4}Z" fill="var(--accent)"/>`;
  s += `<text class="hline-label sv-npl" x="${X(xnp) + 8}" y="${Z(zw + C.foil.t * pf.cr) - 6}">N</text>`;
  s += '</svg>';
  el.innerHTML = s + '<div class="tip" hidden></div>';
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip');
  // Hinweis beim Überfahren
  svg.addEventListener('pointerover', ev => {
    const gEl = ev.target.closest('.lolli'); if (!gEl || drag) return;
    const it = items.find(i => i.key === gEl.dataset.key); if (!it) return;
    tip.innerHTML = `<div class="th">${esc(it.name)}</div><div class="row"><span>Masse</span><b>${nf(it.m * 1000, 0)} g</b></div><div class="row"><span>Lage x</span><b>${nf(it.x, 3)} m</b></div><div class="row"><span>Hebel zum Schwerpunkt</span><b>${nfs((it.x - xcg) * 100, 1)} cm</b></div>${dragKey(it) ? `<div class="row"><span>${dragKey(it) === 'wing' ? 'zieht Flügel, Leitwerk und Träger' : 'verschiebbar'}</span><b>↔</b></div>` : ''}`;
    tip.hidden = false; const bx = Number(gEl.querySelector('circle').getAttribute('cx')), tw = tip.offsetWidth;
    tip.style.left = (bx + 14 + tw > W ? Math.max(0, bx - 14 - tw) : bx + 14) + 'px'; tip.style.top = (H1 + 8) + 'px';
  });
  svg.addEventListener('pointerout', ev => { if (!ev.relatedTarget || !ev.relatedTarget.closest || !ev.relatedTarget.closest('.lolli')) tip.hidden = true; });
  // Ziehen
  let drag = null;
  const M = mi.M, Mx = mi.M * mi.xcg, mWing = items.filter(i => i.grp === 'wing').reduce((a, i) => a + i.m, 0);
  const moved = (key, dx) => {
    const sel = key === 'wing' ? $$('.lolli[data-grp="wing"]', svg) : $$(`.lolli[data-key="${CSS.escape(key)}"]`, svg);
    sel.forEach(e => e.setAttribute('transform', `translate(${dx * sc},0)`));
    $$(`[data-for="${CSS.escape(key)}"]`, svg).forEach(e => e.setAttribute('transform', `translate(${dx * sc},0)`));
    if (key === 'wing') { $$('.sv-wing', svg).forEach(e => e.setAttribute('transform', `translate(${dx * sc},0)`)); $$('.sv-np, .sv-npl', svg).forEach(e => e.setAttribute('transform', `translate(${dx * sc},0)`)); }
    const m = key === 'wing' ? mWing : Number(svg.querySelector(`.lolli[data-key="${CSS.escape(key)}"]`).dataset.m);
    const xc = (Mx + m * dx) / M; svg.querySelector('.sv-cg').setAttribute('transform', `translate(${(xc - xcg) * sc},0)`);
    const npx = xnp + (key === 'wing' ? dx : 0), sm = (npx - xc) / pf.mac * 100;
    const lbl = $('#cg-live'); if (lbl) lbl.textContent = `Schwerpunkt ${nf(xc, 3)} m · Stabilitätsmaß ${nf(sm, 1)} %`;
  };
  const commit = (key, x0, dx) => {
    if (Math.abs(dx) < 1e-4) return;
    if (key === 'wing') S.params.xWingLE = Math.round(clamp(P.xWingLE + dx, 0, 3) * 1000) / 1000;
    else if (key === 'batt') S.params.xBatt = Math.round(clamp(x0 + dx, 0.1, Math.max(0.15, P.fusL - 0.12)) * 1000) / 1000;
    else { const c = S.comps.find(c => 'comp:' + c.id === key); if (c) c.x = Math.round(clamp(x0 + dx, -0.5, 6) * 1000) / 1000; renderCompTable(); }
    markPreset(); fillForms(); schedule(true);
  };
  svg.addEventListener('pointerdown', ev => {
    const gEl = ev.target.closest('.lolli.drag'); if (!gEl) return;
    ev.preventDefault(); tip.hidden = true;
    drag = { key: gEl.dataset.drag, x0: Number(gEl.dataset.x), px0: ev.clientX, dx: 0, id: ev.pointerId };
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignorieren */ }
    gEl.classList.add('active');
  });
  svg.addEventListener('pointermove', ev => { if (!drag || ev.pointerId !== drag.id) return; drag.dx = (ev.clientX - drag.px0) / sc; moved(drag.key, drag.dx); });
  const end = ev => { if (!drag || (ev && ev.pointerId !== drag.id)) return; const d = drag; drag = null; commit(d.key, d.x0, d.dx); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', () => { if (drag) { moved(drag.key, 0); drag = null; } });
  svg.addEventListener('keydown', ev => {
    const gEl = ev.target.closest('.lolli.drag'); if (!gEl || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault(); const step = (ev.shiftKey ? 0.05 : 0.01) * (ev.key === 'ArrowLeft' ? -1 : 1);
    UI.svFocus = gEl.dataset.key; commit(gEl.dataset.drag, Number(gEl.dataset.x), step);
  });
  if (UI.svFocus) { const f = svg.querySelector(`.lolli[data-key="${CSS.escape(UI.svFocus)}"]`); if (f && el.closest('.view:not([hidden])')) f.focus({ preventScroll: true }); UI.svFocus = null; }
}

/* ---------- Ansicht Schwerpunkt ---------- */
function motorStudy(P, comps) {
  return Object.keys(MOTOR_POS).map(k => {
    const P2 = { ...P, motorPos: k };
    const C = buildCase(P2, comps), n = dayOfYear(P2.date), y = yearOf(P2.date), ser = daySeries(C, envClear(P2, n, y)), mis = mission(C, ser, ser, false);
    return { k, C, mis, ok: C.cfg.mot === k && !(C.bal.g.boomClear < 0) };
  });
}
function sweepStudy(P, comps) {
  const list = [-15, -10, -5, 0, 5, 10, 15]; if (!list.includes(P.sweep)) list.push(P.sweep); list.sort((a, b) => a - b);
  const C0 = buildCase({ ...P, sweep: 0 }, comps);
  return list.map(sw => {
    const C = buildCase({ ...P, sweep: sw }, comps), Cw = buildCase({ ...P, sweep: sw, trimMode: 'wing' }, comps);
    let A = null; try { A = aeroelastic(C, { noFlutter: true, nEl: 10 }); } catch (e) { /* ohne Strukturmodell */ }
    const fd = flightDynamics(C), sp = fd.crit.find(c => c.k === 'spiral');
    return { sw, dNP: C.np.xnp - C0.np.xnp, xac: C.ll.xac, ballast: C.bal.ballast, xBatt: C.bal.xBatt, m: C.m, p: C.pProp, xRoot: P.xWingLE + Cw.bal.s, mW: Cw.m, pW: Cw.pProp, eta: C.stallEta, clb: fd.d.Clb, t2: sp ? sp.val : Infinity, VD: A ? A.VD : NaN, le: A ? A.liftEff : NaN, CLa: C.ll.CLa };
  });
}
function htStudy(P, comps) {
  const cs = [[0, 'ohne Zellen']]; if (P.htSolar > 0 && Math.abs(P.htSolar - 80) > 0.5) cs.push([P.htSolar, `aktuell ${nf(P.htSolar, 0)} %`]); cs.push([80, '80 % belegt']);
  let e0 = null;
  return cs.map(([h, lab]) => {
    const P2 = { ...P, htSolar: h }, C = buildCase(P2, comps), n = dayOfYear(P2.date), y = yearOf(P2.date), e = envClear(P2, n, y), ser = daySeries(C, e), per = periodic(C, ser), mis = mission(C, ser, ser, false);
    let eS = 0, g0 = 0, g1 = 0; for (let i = 0; i < NSTEP; i++) { eS += ser.ps[i] * DT; if (C.sol.FbH && e.sinE[i] > 0) { g0 += e.dni[i] * e.sinE[i] + e.dhi[i]; g1 += e.dni[i] * fbAt(C.sol.FbH, e.sinE[i]) + e.dhi[i] * 0.97; } }
    if (e0 == null) e0 = eS;
    return { h, lab, C, area: C.htSolarArea, mSol: C.mass.solarHT, eS, dE: eS - e0, shade: g0 > 0 ? 1 - g1 / g0 : 0, ballast: C.bal.ballast, xBatt: C.bal.xBatt, m: C.m, per, mis };
  });
}
RENDER.schwerpunkt = (R) => {
  const { C, P } = R, bal = C.bal, ti = trimInfo(C), pf = C.pf, mac = pf.mac, mi = bal.mi;
  sideViewSVG($('#svg-side'), C);
  const drg = [P.trimMode !== 'wing' ? 'Flügel samt Leitwerk' : null, 'Bordsysteme', !P.battInWing && P.trimMode !== 'battery' ? 'Akku' : null].filter(Boolean).join(', ');
  $('#cg-sub').innerHTML = `Oben maßstäblich von der Seite, unten jede Masse an ihrer Längslage (Höhe ∝ √Masse). Ziehbar (oder Pfeiltasten): ${esc(drg)}.${P.trimMode === 'battery' && !P.battInWing ? ' Der Akku wird automatisch so gesetzt, dass das Ziel-Stabilitätsmaß erreicht wird.' : P.trimMode === 'wing' ? ' Der Flügel wird automatisch so gesetzt, dass das Ziel-Stabilitätsmaß erreicht wird.' : ''} <span id="cg-live" class="mono"></span>`;
  const sm = bal.sm * 100, msg = [];
  if (bal.msg) msg.push(pill(bal.ballast > 0.05 ? 'crit' : 'warn', bal.msg + ` ${nf(bal.ballast * 1000, 0)} g Ballast.`));
  if (sm < 3) msg.push(pill('crit', `Stabilitätsmaß nur ${nf(sm, 1)} %: kaum noch längsstabil`)); else if (sm > 25) msg.push(pill('warn', `Stabilitätsmaß ${nf(sm, 1)} %: sehr kopflastig, hoher Trimmaufwand`));
  if (!msg.length) msg.push(pill('good', `Schwerpunkt ${nf(sm, 1)} % MAC vor dem Neutralpunkt${bal.ballast > 0 ? '' : ', ohne Ballast'}`));
  for (const n of C.cfg.notes) msg.push(pill('warn', n.t));
  if (bal.g.boomClear < 0) msg.push(pill('crit', `Rohrträger läuft ${nf(-bal.g.boomClear * 100, 0)} cm tief durch den Propellerkreis: so nicht baubar. Zwei Träger oder Seglerrumpf mit Pylon wählen.`));
  if (C.cfg.mot !== 'nose') msg.push(pill('info', `Motor ${nf(bal.g.xMot - bal.xcg, 2)} m hinter und ${nf((bal.g.zP - bal.zcg) * 100, 0)} cm über dem Schwerpunkt · Antriebsleitung ${nf((C.harness.byKey.wmot || 0) * 1000, 0)} g`));
  $('#cg-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  $('#kpis-cg').innerHTML = [
    kpi('Schwerpunkt', nf(bal.xcg, 3), 'm', `${nf(pctMac(C, bal.xcg), 1)} % MAC · Ziel ${nf(bal.target, 3)} m`),
    kpi('Neutralpunkt', nf(C.np.xnp, 3), 'm', `${nf(pctMac(C, C.np.xnp), 1)} % MAC · Flügel allein ${nf(pctMac(C, C.np.xacw), 1)} %`),
    kpi('Stabilitätsmaß', nf(sm, 1), '%', `${nf(sm / 100 * mac * 100, 1)} cm · Ziel ${nf(P.smTarget, 0)} %`, sm < 3 ? 'bad' : ''),
    kpi('Trimmung', P.trimMode === 'wing' ? nfs(bal.s * 100, 1) : P.trimMode === 'battery' && !P.battInWing ? nf(bal.xBatt, 3) : nf(bal.ballast * 1000, 0), P.trimMode === 'wing' ? 'cm' : P.trimMode === 'battery' && !P.battInWing ? 'm' : 'g',
      P.trimMode === 'wing' ? `Flügelwurzel bei ${nf(bal.g.xLE0, 3)} m` : P.trimMode === 'battery' && !P.battInWing ? `Akku-Schwerpunkt ab Bug · Ballast ${nf(bal.ballast * 1000, 0)} g` : `Ballast ${bal.xBal < bal.g.xLE0 ? 'in der Nase' : 'im Heck'}`, bal.ballast > 0.05 ? 'bad' : ''),
    kpi('Einstellwinkeldifferenz', nf(ti.ewd * RAD, 2), '°', `Abwind ${nf(ti.eps * RAD, 2)}° · dε/dα ${nf(C.np.deda, 2)}`),
    kpi('Leitwerkslast Reiseflug', nfs(ti.Lt, 2), 'N', `c_A,H ${nf(ti.CLh, 3)} · Trimmwiderstand ${nf(ti.Dtrim * P.v * 1000, 0)} mW`),
    kpi('Schwerpunkt Höhe', nfs(bal.zcg * 100, 1), 'cm', `über der Rumpfachse · Schublinie ${nfs((bal.g.zP - bal.zcg) * 100, 0)} cm darüber`),
    kpi('Trägheitsmomente', nf(mi.Ixx, 2), 'kg·m²', `Rollen I_x · Nicken I_y ${nf(mi.Iyy, 2)} · Gieren I_z ${nf(mi.Izz, 2)} · I_xz ${nfs(mi.Ixz, 3)}`),
    kpi('Ballast · Verkabelung', nf(bal.ballast * 1000, 0), 'g', `Verkabelung ${nf(C.mass.wire * 1000, 0)} g (eigene Massengruppe)`, bal.ballast > 0.05 ? 'bad' : '')
  ].join('');
  // Massenliste
  const items = mi.items.slice().sort((a, b) => a.x - b.x), M = mi.M;
  $('#cgt-sub').textContent = `${items.length} Massen, zusammen ${nf(M, 3)} kg. Lage x ab Bugspitze, Höhe z über der Rumpfachse. Hebel: Abstand zum Schwerpunkt (x positiv dahinter, z positiv darüber). Lagen der Bordsysteme direkt hier oder in der Komponentenliste ändern; die Servos sitzen an den Rudern.`;
  const byCat = {}; for (const it of items) { const c = catOf(it); byCat[c] = (byCat[c] || 0) + it.m; }
  $('#tbl-cg').innerHTML = `<thead><tr><th>Masse</th><th>Gruppe</th><th class="n">g</th><th class="n">x ab Bug (m)</th><th class="n">z (m)</th><th class="n">Hebel x (cm)</th><th class="n">Hebel z (cm)</th><th class="n">Anteil</th></tr></thead><tbody>` +
    items.map(it => {
      const cat = catOf(it), ci = it.key.startsWith('comp:') && it.key !== 'comp:servo' ? S.comps.findIndex(c => 'comp:' + c.id === it.key) : -1;
      const xc = ci >= 0 ? `<input type="number" class="xin" data-cx="${ci}" value="${S.comps[ci].x ?? 0.5}" step="0.01" min="-0.5" max="6" aria-label="Lage von ${esc(it.name)} in m">` : nf(it.x, 3);
      const zc = ci >= 0 ? `<input type="number" class="xin" data-cz="${ci}" value="${S.comps[ci].z ?? 0}" step="0.01" min="-0.5" max="1" aria-label="Höhe von ${esc(it.name)} in m">` : nf(it.z, 3);
      return `<tr><td><span class="sw" style="background:${CATS[cat][1]}"></span>${esc(it.name)}</td><td class="muted">${esc(CATS[cat][0])}</td><td class="n">${nf(it.m * 1000, 0)}</td><td class="n">${xc}</td><td class="n">${zc}</td><td class="n">${nfs((it.x - bal.xcg) * 100, 1)}</td><td class="n">${nfs((it.z - bal.zcg) * 100, 1)}</td><td class="n">${nf(it.m / M * 100, 1)} %</td></tr>`;
    }).join('') + `</tbody><tfoot><tr><td class="lbl">Summe</td><td class="muted small">${Object.entries(byCat).map(([c, m]) => `${CATS[c][0]} ${nf(m, 2)}`).join(' · ')}</td><td class="n">${nf(M * 1000, 0)}</td><td class="n">${nf(bal.xcg, 3)}</td><td class="n">${nf(bal.zcg, 3)}</td><td></td><td></td><td></td></tr></tfoot>`;
  // Motoranordnungen, Pfeilung und Leitwerkszellen etwas später (rechenintensiv)
  later(() => renderMotorStudy(R));
  later(() => renderSweepStudy(R));
  later(() => renderHtStudy(R));
};
$('#tbl-cg').addEventListener('change', e => {
  const el = e.target, isZ = el.dataset.cz !== undefined, i = Number(isZ ? el.dataset.cz : el.dataset.cx); if (!fin(i) || !S.comps[i]) return;
  const x = Number(el.value); if (el.value === '' || !fin(x)) { el.value = isZ ? S.comps[i].z ?? 0 : S.comps[i].x; return; }
  if (isZ) S.comps[i].z = clamp(x, -0.5, 1); else S.comps[i].x = clamp(x, -0.5, 6);
  renderCompTable(); markPreset(); schedule(true);
});
function renderMotorStudy(R) {
  const P = S.params, list = cached('motors', () => motorStudy(P, S.comps));
  const cur = list.find(r => r.k === P.motorPos) || list[0];
  $('#mot-sub').textContent = `Gleiche Auslegung (${FUS_TYPES[R.C.cfg.fus].name}, ${TAIL_TYPES[R.C.cfg.tail].short}), nur die Motoranordnung getauscht; Trimmung wie eingestellt (${(SEL.trimMode.find(t => t[0] === P.trimMode) || ['', ''])[1]}). Alle Rumpfformen im Vergleich in der Ansicht Konfiguration. Zeile anklicken zum Übernehmen.`;
  $('#tbl-mot').innerHTML = `<thead><tr><th>Anordnung</th><th class="n">Abflugmasse</th><th class="n">Ballast</th><th class="n">Akku x</th><th class="n">Verkabelung</th><th class="n">Schublinie</th><th class="n">Einbau</th><th class="n">Leistung Reise</th><th class="n">Einsatz min. SoC</th></tr></thead><tbody>` +
    list.map(r => {
      const C = r.C, d = C.pProp - cur.C.pProp, sel = r.k === P.motorPos, soc = r.mis ? r.mis.minE / r.mis.cap * 100 : NaN;
      return `<tr class="${sel ? 'sel' : ''} pick" data-mot="${r.k}" tabindex="0"><td class="wide-cell"><b>${esc(MOTOR_POS[r.k].name)}</b>${r.ok ? '' : ` <span class="crit small">${C.cfg.mot !== r.k ? 'hier nicht möglich' : 'so nicht baubar'}</span>`}<div class="small muted">${esc(MOTOR_POS[r.k].note)}</div></td><td class="n">${nf(C.m, 2)} kg</td><td class="n ${C.bal.ballast > 0.05 ? 'crit' : ''}">${fmtKg(C.bal.ballast)}</td><td class="n">${P.battInWing ? 'Flügel' : nf(C.bal.xBatt, 2) + ' m'}</td><td class="n">${nf(C.mass.wire * 1000, 0)} g</td><td class="n">${nfs((C.bal.g.zP - C.bal.zcg) * 100, 0)} cm</td><td class="n">${nf(C.motor.eta * 100, 0)} %</td>` +
        `<td class="n">${nf(C.pProp, 1)} W${sel ? '' : ` <span class="${d < -0.05 ? 'good' : d > 0.05 ? 'crit' : 'muted'}">${nfs(d, 1)}</span>`}</td><td class="n ${r.mis && !r.mis.ok ? 'crit' : ''}">${fin(soc) ? nf(soc, 0) + ' %' : '–'}</td></tr>`;
    }).join('') + '</tbody><caption>Schublinie: Höhe der Propellerachse über dem Schwerpunkt. Darüber drückt Gas die Nase nach unten, darunter hebt es sie.</caption>';
}
$('#tbl-mot').addEventListener('click', e => { const tr = e.target.closest('tr[data-mot]'); if (!tr || tr.dataset.mot === S.params.motorPos) return; S.params.motorPos = tr.dataset.mot; markPreset(); fillForms(); schedule(true); });
$('#tbl-mot').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr[data-mot]'); if (tr) { e.preventDefault(); tr.click(); } } });
function renderSweepStudy(R) {
  const P = S.params, list = cached('sweep', () => sweepStudy(P, S.comps)), vReq = 1.2 * P.vmax;
  const cur = list.find(r => r.sw === P.sweep) || list[0];
  $('#sw-sub').textContent = `Pfeilung der t/4-Linie von −15° (vorwärts) bis +15° (rückwärts). Flügelwurzel fest an der Gondel und alternativ der Flügel samt Leitwerk so verschoben, dass das Ziel-Stabilitätsmaß ohne Ballast erreicht wird.`;
  const xs = list.map(r => r.sw), x = { min: Math.min(...xs), max: Math.max(...xs), fmt: v => nf(v, 0) + '°', title: 'Pfeilung (°)' };
  const y1 = niceRange([...list.map(r => r.dNP * 100), ...list.map(r => (r.xRoot - P.xWingLE) * 100), 0], 0.08);
  lineChart($('#ch-sw1'), { h: 210, title: 'Wanderung des Neutralpunkts', x, y: { min: y1[0], max: y1[1], fmt: v => nf(v, 0) + ' cm' },
    series: [{ name: 'Neutralpunkt bei fester Wurzel', c: 1, pts: list.map(r => [r.sw, r.dNP * 100]), dots: true, fmt: v => nfs(v, 1) + ' cm' }, { name: 'nötige Verschiebung der Flügelwurzel', c: 2, pts: list.map(r => [r.sw, (r.xRoot - P.xWingLE) * 100]), dots: true, fmt: v => nfs(v, 1) + ' cm' }],
    vlines: [{ x: P.sweep, label: 'aktuell' }] });
  const vd = list.map(r => fin(r.VD) ? Math.min(r.VD, 4 * vReq) : NaN), ymax = Math.max(vReq * 1.6, ...vd.filter(fin)) * 1.05;
  lineChart($('#ch-sw2'), { h: 210, title: 'Divergenzgeschwindigkeit', x, y: { min: 0, max: ymax, fmt: v => nf(v, 0) + ' m/s' },
    series: [{ name: 'Divergenz (darüber: keine)', c: 3, pts: list.map((r, i) => [r.sw, vd[i]]), dots: true, fmt: v => nf(v, 1) + ' m/s' }],
    hlines: [{ y: vReq, label: `Nachweis 1,2 × V_max = ${nf(vReq, 0)} m/s` }, { y: P.vmax, label: 'V_max' }], vlines: [{ x: P.sweep, label: 'aktuell' }] });
  $('#tbl-sw').innerHTML = `<thead><tr><th class="n">Pfeilung</th><th class="n">ΔN</th><th class="n">Ballast</th><th class="n">Masse</th><th class="n">Leistung</th><th class="n">Wurzel nötig bei</th><th class="n">c_A,<span class="nc">α</span></th><th class="n">Abriss beginnt</th><th class="n">Cl_<span class="nc">β</span></th><th class="n">Spirale T₂</th><th class="n">Divergenz</th><th class="n">Auftrieb bei V_max</th></tr></thead><tbody>` +
    list.map(r => `<tr class="${r.sw === P.sweep ? 'sel' : ''}"><td class="n">${nfs(r.sw, 0)}°</td><td class="n">${nfs(r.dNP * 100, 1)} cm</td><td class="n ${r.ballast > 0.05 ? 'crit' : ''}">${fmtKg(r.ballast)}</td><td class="n">${nf(r.m, 2)} kg</td><td class="n">${nf(r.p, 1)} W</td><td class="n">${nf(r.xRoot, 2)} m</td><td class="n">${nf(r.CLa, 2)}</td>` +
      `<td class="n">${nf(r.eta * 100, 0)} % b/2</td><td class="n">${nf(r.clb, 3)}</td><td class="n">${r.t2 === Infinity ? 'stabil' : nf(r.t2, 0) + ' s'}</td><td class="n ${fin(r.VD) && r.VD < vReq ? 'crit' : ''}">${fmtV(r.VD, 0)}${fin(r.VD) ? ' m/s' : ''}</td><td class="n ${r.le > 1.15 || r.le < 0.8 ? 'warn' : ''}">${nf(r.le * 100, 0)} %</td></tr>`).join('') +
    `</tbody><caption>ΔN: Verschiebung des Neutralpunkts gegenüber 0° bei fester Flügelwurzel. Ballast, Masse und Leistung mit der eingestellten Trimmung. „Wurzel nötig bei“: Flügelvorderkante an der Wurzel, wenn stattdessen der Flügel verschoben wird. Abriss: Ort des ersten örtlichen Abrisses (0 % = Wurzel). Cl_β: Rollmoment je Schiebewinkel (negativer = stabiler). Auftrieb bei V_max: elastischer gegen starren Flügel.</caption>`;
  const fw = list.filter(r => r.sw < 0 && fin(r.VD)).sort((a, b) => b.sw - a.sw), crit = fw.find(r => r.VD < vReq);
  $('#sw-note').innerHTML = `<b>Was Pfeilung hier bewirkt</b>` +
    `<span>Momente: Pfeilung schiebt den Neutralpunkt wie ein Verschieben des Flügels – je 5° um rund ${nf(Math.abs((list.find(r => r.sw === 5) || cur).dNP) * 100, 0)} cm. Für den Momentenausgleich bringt sie also nichts, was eine andere Flügellage an der Gondel nicht auch leistet; sie verlegt nur den Anschlusspunkt. Rückwärtspfeilung passt zu Massen weit hinten (Heckmotor), Vorwärtspfeilung zu schweren Lasten in der Nase.</span>` +
    `<span>Aerodynamik: Der Auftriebsanstieg sinkt (Normalströmung ∝ cos Λ), rückwärts gepfeilte Flügel reißen weiter außen ab (Querruder), vorwärts gepfeilte an der Wurzel. Rückwärtspfeilung erhöht die Rollstabilität Cl_β, Vorwärtspfeilung senkt sie.</span>` +
    `<span>Aeroelastik: Bei Vorwärtspfeilung dreht die Biegung des Flügels die Profilnase nach oben – mehr Auftrieb, mehr Biegung. ${crit ? `Mit dieser Steifigkeit tritt ab ${nfs(crit.sw, 0)}° Divergenz unterhalb von 1,2 × V_max auf (${nf(crit.VD, 0)} m/s).` : fw.length ? `Mit dieser Steifigkeit bleibt die Divergenz bis ${nfs(fw[fw.length - 1].sw, 0)}° oberhalb von 1,2 × V_max, aber der Abstand schrumpft schnell.` : ''} Rückwärtspfeilung nimmt bei Böen Auftrieb weg (Auftriebswirksamkeit unter 100 %) und entlastet die Struktur. Vorwärtspfeilung bei diesem schlanken Flügel nur mit sehr torsionssteifer, gezielt gekoppelter Bauweise (vgl. X-29).</span>`;
}
function renderHtStudy(R) {
  const P = S.params, list = cached('htsol', () => htStudy(P, S.comps)), b0 = list[0];
  $('#hts-sub').textContent = `Waagerechte Zellen auf dem Höhenleitwerk (${nf(R.C.tail.Sh, 3)} m²) am Auslegungstag ${fmtDoy(R.n, R.y)}. Gleiche Wirkungsgradkette wie am Flügel, Schatten des Seitenleitwerks über alle Kurse gemittelt. Die Zusatzmasse sitzt weit hinten und muss ausgetrimmt werden.`;
  $('#tbl-hts').innerHTML = `<thead><tr><th>Belegung</th><th class="n">Zellfläche</th><th class="n">Masse Zellen</th><th class="n">Solarertrag</th><th class="n">Mehrertrag</th><th class="n">Schattenverlust</th><th class="n">Ballast</th><th class="n">Akku x</th><th class="n">Abflugmasse</th><th class="n">Excess Time</th><th class="n">Einsatz min. SoC</th></tr></thead><tbody>` +
    list.map(r => `<tr class="${Math.abs(r.h - P.htSolar) < 0.5 ? 'sel' : ''}"><td>${esc(r.lab)}</td><td class="n">${nf(r.area, 3)} m²</td><td class="n">${nf(r.mSol * 1000, 0)} g</td><td class="n">${nf(r.eS, 0)} Wh</td><td class="n ${r.dE > 0 ? 'good' : ''}">${r.h ? nfs(r.dE, 0) + ' Wh (' + nfs(r.dE / Math.max(1, b0.eS) * 100, 1) + ' %)' : '–'}</td><td class="n">${r.h ? nf(r.shade * 100, 0) + ' %' : '–'}</td>` +
      `<td class="n">${nf(r.ballast * 1000, 0)} g</td><td class="n">${P.battInWing ? 'Flügel' : nf(r.xBatt, 2) + ' m'}</td><td class="n">${nf(r.m, 2)} kg</td><td class="n">${fin(r.per.tExc) ? nfs(r.per.tExc, 1) + ' h' : '–'}</td><td class="n">${r.mis ? nf(r.mis.minE / r.mis.cap * 100, 0) + ' %' : '–'}</td></tr>`).join('') +
    `</tbody><caption>Schattenverlust: Anteil der Einstrahlung auf die Leitwerkszellen, die das Seitenleitwerk im Tagesmittel abschattet. Mehr Fläche am Leitwerk brächte auch mehr Leitwerkswiderstand; ein höher gesetztes Höhenleitwerk (T-Leitwerk) wäre schattenfrei, ist hier aber nicht vorgesehen.</caption>`;
}

/* ---------- Ansicht Struktur ---------- */
function aeData(C) {
  return cached('ae', () => {
    const A = aeroelastic(C, { nStep: 44 }), tb = tailBoomDyn(C);
    const fr = [...A.modes.slice(0, 4).map(m => ({ f: m.f, name: 'Flügel ' + m.label })), { f: tb.fb, name: 'Träger Biegung' }, { f: tb.ft, name: 'Träger Torsion' }];
    return { A, tb, fr, res: resonance(C, fr) };
  });
}
function transportPieces(C) {
  const P = C.P, pf = C.pf, h = pf.b / 2, st = C.struct, sd = st ? st.stations : null, out = [];
  const ys = P.splits === 'none' ? [] : P.splits === 'center' ? [0] : P.splits === 'outer' ? [P.splitEta * h] : [0, P.splitEta * h];
  const massOf = (a, b) => { // beide Grenzen in m ab Mitte, eine Flügelseite
    if (!sd) return NaN; let m = 0; const dy = h / sd.y.length;
    const wl = C.harness ? C.harness.wingLin : null;
    sd.y.forEach((y, k) => { if (y >= a && y < b) { let mm = wl ? wl(y) : 0; for (const f of ['mCap', 'mWeb', 'mLE', 'mRib', 'mSkin', 'mTE']) mm += sd[f][k] * (1 + P.rugged / 100); m += mm * dy; } });
    const eta = C.solarEta || 0, sa = Math.max(0, Math.min(b, eta * h) - a) / Math.max(1e-9, eta * h); m += C.mass.solar / 2 * Math.max(0, sa);
    if (P.battInWing) { const bb = Math.max(0, Math.min(b, 0.6 * h) - a) / (0.6 * h); m += C.mass.batt / 2 * Math.max(0, bb); }
    return m;
  };
  const cut = [...new Set(ys.filter(y => y > 1e-6))].sort((a, b) => a - b), bounds = [0, ...cut, h], center = !ys.includes(0);
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1], cA = pf.chordAt(a / h), cB = pf.chordAt(b / h), m = massOf(a, b);
    if (i === 0 && center) out.push({ name: bounds.length === 2 ? 'Flügel (ungeteilt)' : 'Mittelstück', n: 1, len: 2 * b, c: Math.max(cA, cB), m: 2 * m });
    else out.push({ name: i === 0 ? 'Halbflügel innen' : bounds.length > 3 || center ? 'Außenflügel' : 'Halbflügel', n: 2, len: b - a, c: Math.max(cA, cB), m });
    if (i === 0 && !center && bounds.length === 2) out[out.length - 1].name = 'Halbflügel';
  }
  const tg = C.tail, kR = 1 + P.rugged / 100, g = C.bal.g, cf = C.cfg, pp = st && st.parts ? st.parts : null;
  if (cf.fus === 'glider') out.push({ name: 'Rumpf mit Röhre und Einbauten', n: 1, len: g.fus.L, c: P.fusD, m: pp ? (pp.fus + pp.cone + pp.land + pp.pylon) * kR : NaN });
  else {
    out.push({ name: 'Rumpfgondel mit Einbauten', n: 1, len: P.fusL, c: P.fusD, m: pp ? (pp.fus + pp.land) * kR : NaN });
    out.push({ name: cf.nBoom > 1 ? 'Leitwerksträger' : 'Leitwerksträger (steckbar)', n: cf.nBoom, len: g.lBoom, c: P.boomD, m: pp ? pp.boom / cf.nBoom * kR : NaN });
  }
  out.push({ name: cf.tail === 'T' ? 'Höhenleitwerk (T)' : 'Höhenleitwerk', n: 1, len: tg.bh, c: tg.ch, m: P.wTail * tg.Sh * kR + (C.mass.solarHT || 0) });
  out.push({ name: tg.nFin > 1 ? 'Seitenleitwerk' : 'Seitenleitwerk', n: tg.nFin, len: tg.bv, c: tg.cv, m: pp ? pp.fin / tg.nFin * kR : NaN });
  return out;
}
RENDER.struktur = (R) => {
  const { C, P } = R, st = C.struct;
  if (!st) {
    $('#kpis-ae').innerHTML = ''; $('#tbl-matcmp').innerHTML = ''; $('#tr-joints').innerHTML = ''; $('#ae-msg').innerHTML = pill('info', 'Feste Strukturmasse eingestellt: Steifigkeiten und Eigenschwingungen brauchen das Bauweisen-Modell (Ansicht Flugzeug, Strukturmasse).');
    ['#ch-stiff', '#ch-axes', '#ch-modes', '#ch-vg', '#ch-vf', '#ch-camp'].forEach(s => { $(s).innerHTML = ''; }); $('#tbl-modes-s').innerHTML = ''; $('#camp-msg').innerHTML = ''; $('#tbl-transport').innerHTML = ''; $('#tbl-mat').innerHTML = ''; return;
  }
  $('#ae-sub').textContent = 'Halbflügel als Biege-Torsions-Balken an der Gondel eingespannt (symmetrische Formen), Luftkräfte nach Theodorsen mit instationärem Auftriebsaufbau. Wird nach jeder Änderung neu gerechnet …';
  later(() => renderStrukturMain(R));
};
function renderStrukturMain(RR) {
  if (RR !== R) return; // inzwischen neu gerechnet
  const { C, P } = RR, st = C.struct, d = aeData(C), A = d.A, tb = d.tb, vReq = A.vReq, fl = A.flutter, m1 = A.modes[0], mt = A.modes.find(m => m.tors > 0.5) || A.modes[1];
  const s0 = A.sec[0], ea = s0.xea, cgS = s0.xcg;
  $('#ae-sub').textContent = `Halbflügel als Biege-Torsions-Balken an der Gondel eingespannt (symmetrische Eigenformen), Luftkräfte nach Theodorsen mit instationärem Auftriebsaufbau (Wagner-Funktion), 2 % Strukturdämpfung. Nachweis sinngemäß CS-23.629: flatter- und divergenzfrei bis 1,2 × V_max = ${nf(vReq, 0)} m/s.`;
  $('#kpis-ae').innerHTML = [
    kpi('1. Biegung', nf(m1.f, 2), 'Hz', `${mt ? `Torsion ${nf(mt.f, 1)} Hz (${esc(mt.label)})` : ''}`),
    kpi('Flattern', fl.vf ? nf(fl.vf, 1) : '> ' + nf(Math.max(3 * P.vmax, 60), 0), 'm/s', fl.vf ? `bei ${nf(fl.wf / 2 / Math.PI, 1)} Hz · Nachweis ${nf(vReq, 0)} m/s` : `bis ${nf(Math.max(3 * P.vmax, 60), 0)} m/s nicht gefunden`, A.okF ? 'ok' : 'bad'),
    kpi('Divergenz', fmtV(A.VD, 1), fin(A.VD) ? 'm/s' : '', fin(A.VD) ? `Nachweis ${nf(vReq, 0)} m/s` : (P.sweep < 0 ? 'Vorwärtspfeilung gegen Torsionssteifigkeit' : 'elastische Achse vor der t/4-Linie'), A.okD ? 'ok' : 'bad'),
    kpi('Auftrieb bei V_max', nf(A.liftEff * 100, 0), '%', 'elastischer gegen starren Flügel, gleicher Anstellwinkel', A.liftEff > 1.2 ? 'bad' : ''),
    kpi('Steifigkeit Wurzel', nf(s0.EI / 1000, 2), 'kN·m²', `Biegung EI · Torsion GJ ${nf(s0.GJ, 0)} N·m²`),
    kpi('Durchbiegung 1 g', nf(st.dTip * 100, 1), 'cm', `elastische V-Form ${nf(1.2 * st.dTip / (C.pf.b / 2) * RAD, 1)}° · zul. ${nf(st.dMax * 100, 0)} cm`),
    kpi('Profilschwerpunkt', nf(cgS * 100, 0), '% t', `elastische Achse ${nf(ea * 100, 0)} % · Abstand ${nf((cgS - ea) * 100, 0)} % der Tiefe`, cgS - ea > 0.2 ? 'bad' : ''),
    kpi('Leitwerksträger', nf(tb.fb, 1), 'Hz', `Biegung · Torsion ${nf(tb.ft, 1)} Hz · Wand ${nf(tb.t * 1000, 2)} mm`)
  ].join('');
  const msg = [];
  msg.push(A.okF ? pill('good', fl.vf ? `Flatterfrei bis ${nf(fl.vf, 0)} m/s (${nf(fl.vf / P.vmax, 2)} × V_max)` : 'Kein Flattern im Rechenbereich') : pill('crit', `Flattern bei ${nf(fl.vf, 1)} m/s – unter 1,2 × V_max. Torsionssteifere Nase, Holm weiter hinten, Zellen weiter vorn oder V_max senken.`));
  msg.push(A.okD ? pill('good', fin(A.VD) ? `Divergenz erst bei ${nf(A.VD, 0)} m/s` : 'Keine Divergenz') : pill('crit', `Divergenz bei ${nf(A.VD, 1)} m/s – unter 1,2 × V_max`));
  const rc = d.res.hits.filter(h => h.cruise);
  if (rc.length) msg.push(pill('warn', `${rc.map(h => h.name).join(', ')} nahe der Reisedrehzahl angeregt (${rc.map(h => nf(h.rpm, 0)).join(', ')} U/min)`));
  else if (d.res.hits.length) msg.push(pill('info', `${d.res.hits.length} Eigenfrequenz${d.res.hits.length > 1 ? 'en' : ''} nur beim Steigen durchfahren`));
  else msg.push(pill('good', `Keine Eigenfrequenz im Drehzahlbereich ${nf(d.res.rpm0, 0)}–${nf(d.res.rpm1, 0)} U/min`));
  if (st.stiffF > 1.01) msg.push(pill('info', `Holm durch die Durchbiegungsgrenze bestimmt (× ${nf(st.stiffF, 2)})`));
  $('#ae-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  // Steifigkeiten
  const sec = A.sec, h = C.pf.b / 2;
  $('#stiff-sub').textContent = `${(MAT[P.matCap] || {}).name}-Gurte, Nase ${(MAT[P.matSkin] || {}).name}. Unten: Lagen in % der Profiltiefe – liegt der Profilschwerpunkt weit hinter der elastischen Achse, koppeln Biegung und Torsion zum Flattern.`;
  const ey = Math.max(...sec.map(s => s.EI)), gy = Math.max(...sec.map(s => s.GJ));
  lineChart($('#ch-stiff'), { h: 190, title: 'Biege- und Torsionssteifigkeit', x: { min: 0, max: h, fmt: v => nf(v, 1) + ' m', title: 'Abstand von der Rumpfmitte' }, y: { min: 0, max: niceRange([ey, gy], 0.05, true)[1], fmt: v => nf(v, 0) },
    series: [{ name: 'EI Biegung (N·m²)', c: 1, pts: sec.map(s => [s.y, s.EI]), fmt: v => nf(v, 0) + ' N·m²' }, { name: 'GJ Torsion (N·m²)', c: 2, pts: sec.map(s => [s.y, s.GJ]), fmt: v => nf(v, 0) + ' N·m²' }] });
  lineChart($('#ch-axes'), { h: 170, title: 'Lagen über der Profiltiefe', x: { min: 0, max: h, fmt: v => nf(v, 1) + ' m' }, y: { min: 0, max: 0.6, ticks: [0, 0.2, 0.4, 0.6], fmt: v => nf(v * 100, 0) + ' %' },
    series: [{ name: 'Profilschwerpunkt', c: 2, pts: sec.map(s => [s.y, s.xcg]), fmt: v => nf(v * 100, 1) + ' %' }, { name: 'elastische Achse', c: 1, pts: sec.map(s => [s.y, s.xea]), fmt: v => nf(v * 100, 1) + ' %' }, { name: 'Profil-Neutralpunkt (25 %)', c: 3, pts: [[0, 0.25], [h, 0.25]], dash: true, fmt: v => nf(v * 100, 0) + ' %' }] });
  // Eigenformen
  const nm = Math.min(4, A.modes.length); UI.modeSel = clamp(UI.modeSel || 0, 0, nm - 1);
  const md = A.modes[UI.modeSel], bm = A.bm, l = bm.l, cosL = bm.cosL;
  const at = y => { let k = 0; while (k < sec.length - 2 && sec[k + 1].y < y) k++; const a = sec[k], b = sec[k + 1], t = clamp((y - a.y) / ((b.y - a.y) || 1), 0, 1); return { c: a.c + (b.c - a.c) * t, xea: a.xea + (b.xea - a.xea) * t }; };
  const nodes = [{ y: 0, w: 0, th: 0 }]; for (let j = 1; j <= bm.nEl; j++) nodes.push({ y: j * l * cosL, w: md.phi[3 * j - 3], th: md.phi[3 * j - 1] });
  const disp = nodes.map(n => { const q = at(n.y); return { y: n.y, ea: n.w, le: n.w + n.th * q.xea * q.c, te: n.w - n.th * (1 - q.xea) * q.c }; });
  const mx = Math.max(1e-12, ...disp.map(p => Math.max(Math.abs(p.ea), Math.abs(p.le), Math.abs(p.te))));
  $('#modes-sub').innerHTML = `<span class="tabs" id="mode-tabs" role="group" aria-label="Eigenform wählen">${A.modes.slice(0, nm).map((m, i) => `<button class="tab" type="button" data-mi="${i}" aria-selected="${i === UI.modeSel}">${esc(m.label)} · ${nf(m.f, 1)} Hz</button>`).join('')}</span>`;
  lineChart($('#ch-modes'), { h: 200, title: `${md.label}: Auslenkung (normiert), ${nf(md.tors * 100, 0)} % Torsionsenergie`, x: { min: 0, max: h, fmt: v => nf(v, 1) + ' m' }, y: { min: -1.05, max: 1.05, ticks: [-1, -0.5, 0, 0.5, 1], fmt: v => nf(v, 1) },
    series: [{ name: 'Holm (elastische Achse)', c: 1, pts: disp.map(p => [p.y, p.ea / mx]), fmt: v => nf(v, 2) }, { name: 'Nasenleiste', c: 2, pts: disp.map(p => [p.y, p.le / mx]), fmt: v => nf(v, 2) }, { name: 'Endleiste', c: 3, pts: disp.map(p => [p.y, p.te / mx]), dash: true, fmt: v => nf(v, 2) }] });
  $('#tbl-modes-s').innerHTML = `<thead><tr><th>Eigenform</th><th class="n">im Vakuum</th><th class="n">Torsionsanteil</th><th class="n">bei ${nf(P.v, 0)} m/s</th><th class="n">Dämpfung</th></tr></thead><tbody>` +
    A.modes.slice(0, 4).map((m, i) => { const c = A.cruise[i]; return `<tr${i === UI.modeSel ? ' class="sel"' : ''}><td>${esc(m.label)}</td><td class="n">${nf(m.f, 2)} Hz</td><td class="n">${nf(m.tors * 100, 0)} %</td><td class="n">${c ? nf(c.f, 2) + ' Hz' : '–'}</td><td class="n ${c && c.zeta < 0.02 ? 'warn' : ''}">${c ? nf(c.zeta * 100, 1) + ' %' : '–'}</td></tr>`; }).join('') +
    `</tbody><caption>Dämpfung bei Reisefahrt: 2 % Struktur plus Luftkraft. Biegeformen sind stark aerodynamisch gedämpft, Torsionsformen kaum.</caption>`;
  // Flatterdiagramm
  const tr = fl.track || [], nR = Math.min(4, A.modes.length), ser = [], serF = [];
  const vmaxPlot = tr.length ? Math.min(tr[tr.length - 1].V, Math.max(1.7 * vReq, (fl.vf || 0) * 1.3)) : 3 * P.vmax;
  // Zweige über der Geschwindigkeit verfolgen: jeder Zweig nimmt die nächstliegende Wurzel
  const br = A.modes.slice(0, nR).map(m => ({ last: { re: -0.01, im: m.omega }, pts: [] }));
  for (const t of tr) {
    if (t.V > vmaxPlot * 1.001) break;
    const free = t.roots.slice();
    for (const b of br) {
      if (!free.length) { b.pts.push([t.V, null]); continue; }
      let bi = 0, bd = Infinity; free.forEach((z, i) => { const dd = Math.hypot(z.re - b.last.re, z.im - b.last.im) / Math.max(1, Math.abs(b.last.im)); if (dd < bd) { bd = dd; bi = i; } });
      const z = free.splice(bi, 1)[0]; b.last = z; b.pts.push([t.V, z]);
    }
  }
  br.forEach((b, k) => {
    const lab = A.modes[k].label;
    ser.push({ name: lab, c: k + 1, pts: b.pts.map(([V, z]) => [V, z ? -z.re / Math.hypot(z.re, z.im) : NaN]), fmt: v => nf(v * 100, 1) + ' %' });
    serF.push({ name: lab, c: k + 1, pts: b.pts.map(([V, z]) => [V, z ? z.im / 2 / Math.PI : NaN]), fmt: v => nf(v, 2) + ' Hz' });
  });
  const zmax = Math.min(0.5, Math.max(0.1, ...ser.flatMap(s => s.pts.map(p => p[1])).filter(fin)) * 1.05);
  const vl = [{ x: vReq, label: '1,2·V_max' }].concat(fl.vf && fl.vf <= vmaxPlot ? [{ x: fl.vf, label: fl.vf > vReq * 0.85 && fl.vf < vReq * 1.15 ? '' : 'Flattern' }] : []);
  $('#vg-sub').textContent = `Dämpfung und Frequenz der Strukturformen über der Fluggeschwindigkeit (Luftdichte ${nf(C.rho, 3)} kg/m³). Flattern beginnt, wo eine Dämpfung negativ wird.`;
  lineChart($('#ch-vg'), { h: 220, title: 'Dämpfungsgrad', x: { min: 0, max: vmaxPlot, fmt: v => nf(v, 0), tipFmt: v => nf(v, 1) + ' m/s', title: 'Fluggeschwindigkeit (m/s)' }, y: { min: -0.05, max: zmax, fmt: v => nf(v * 100, 0) + ' %' }, series: ser, vlines: vl, bands: fl.vf ? [{ x0: fl.vf, x1: vmaxPlot, label: '' }] : [] });
  const fmax = niceRange(serF.flatMap(s => s.pts.map(p => p[1])).filter(fin), 0.08, true)[1];
  lineChart($('#ch-vf'), { h: 220, title: 'Frequenz', x: { min: 0, max: vmaxPlot, fmt: v => nf(v, 0), tipFmt: v => nf(v, 1) + ' m/s', title: 'Fluggeschwindigkeit (m/s)' }, y: { min: 0, max: fmax, fmt: v => nf(v, 0) + ' Hz' }, series: serF, vlines: vl, legend: false });
  // Campbell-Diagramm
  const rs = d.res, rMax = Math.max(rs.rpm1 * 1.25, 600), fTop = Math.min(80, Math.max(...d.fr.map(f => f.f)) * 1.12);
  $('#camp-sub').textContent = `Anregung durch Unwucht (1 × Drehzahl) und Blattfolge (${rs.B} × Drehzahl) gegen die Eigenfrequenzen. Grau: Drehzahlbereich von der Reisedrehzahl (${nf(rs.rpm0, 0)} U/min, gestrichelt) bis Vollgas.`;
  lineChart($('#ch-camp'), { h: 230, x: { min: 0, max: rMax, fmt: v => nf(v, 0), tipFmt: v => nf(v, 0) + ' U/min', title: 'Propellerdrehzahl (U/min)' }, y: { min: 0, max: fTop, fmt: v => nf(v, 0) + ' Hz' },
    series: [{ name: '1. Ordnung (Unwucht)', c: 2, pts: [[0, 0], [rMax, rMax / 60]], fmt: v => nf(v, 1) + ' Hz' }, { name: `${rs.B}. Ordnung (Blattfolge)`, c: 4, pts: [[0, 0], [rMax, rs.B * rMax / 60]], fmt: v => nf(v, 1) + ' Hz' }],
    hlines: d.fr.filter(f => f.f < fTop).map(f => ({ y: f.f, label: `${f.name} ${nf(f.f, 1)} Hz` })), bands: [{ x0: rs.rpm0, x1: rs.rpm1, label: '' }], vlines: [{ x: rs.rpm0, label: '' }] });
  $('#camp-msg').innerHTML = rs.hits.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Eigenform</th><th>Anregung</th><th class="n">Drehzahl</th><th>Betrieb</th></tr></thead><tbody>${rs.hits.map(h => `<tr><td>${esc(h.name)} <span class="muted">${nf(h.f, 1)} Hz</span></td><td>${esc(h.lab)}</td><td class="n">${nf(h.rpm, 0)} U/min</td><td class="${h.cruise ? 'warn' : 'muted'}">${h.cruise ? '! Dauerbetrieb' : 'nur beim Steigen'}</td></tr>`).join('')}</tbody></table></div><p class="note" style="margin-top:8px">Abhilfe: Wuchten von Propeller und Spinner, Motorträger weich lagern, Blattzahl ändern oder die Reisedrehzahl über Steigung und Kv verschieben. Abstand mindestens 15 %.</p>` : `<p class="note">Kein Schnittpunkt im Betriebsbereich. Abstand halten: mindestens 15 % zwischen Anregung und Eigenfrequenz.</p>`;
  // Transport
  const pcs = transportPieces(C), long = pcs.reduce((a, p) => Math.max(a, p.len), 0);
  $('#tr-sub').textContent = `${(SEL.splits.find(s => s[0] === P.splits) || ['', ''])[1]}. Längstes Teil ${nf(long, 2)} m. Massen ohne Bordsysteme.`;
  const jt = st.joints || [];
  $('#tbl-transport').innerHTML = `<thead><tr><th>Teil</th><th class="n">Länge</th><th class="n">Tiefe</th><th class="n">Masse</th></tr></thead><tbody>` +
    pcs.map(p => `<tr><td>${p.n > 1 ? p.n + ' × ' : ''}${esc(p.name)}</td><td class="n">${nf(p.len, 2)} m</td><td class="n">${nf(p.c * 100, 0)} cm</td><td class="n">${fin(p.m) ? fmtKg(p.m) : '–'}</td></tr>`).join('') + '</tbody>';
  $('#tr-joints').innerHTML = jt.length ? jt.map(j => `<b>${j.y > 0.01 ? `Steckungen bei ±${nf(j.y, 2)} m` : 'Mittelsteckung'}:</b> Zunge ${nf(j.len * 100, 0)} cm, Biegemoment bei Bruchlast ${nf(j.M, 0)} N·m, ${fmtKg(j.m)} samt Beschlägen.`).join(' ') + ' Die Mittelteilung trägt das volle Wurzelmoment und ist deshalb die schwerste Stelle.' : 'Ungeteilter Flügel: keine Steckungsmasse, aber Transportlänge gleich der Spannweite.';
  // Werkstoffe
  const kn = P.matKnock / 100, cap = MAT[P.matCap], web = MAT[P.matWeb], skin = MAT[P.matSkin], boom = MAT[P.matBoom];
  const mrow = (l, m, k) => `<tr><td>${l}</td><td>${esc(m.name)}<div class="small muted">${k}</div></td></tr>`;
  $('#mat-sub').textContent = 'Gewählte Werkstoffe mit Kennwerten und der Vergleich der Alternativen an diesem Flugzeug. Die Nase bestimmt die Torsionssteifigkeit und damit Flattern und Divergenz, die Gurte Biegesteifigkeit und Masse.';
  $('#tbl-mat').innerHTML = `<thead><tr><th>Bauteil</th><th>Werkstoff und Kennwerte</th></tr></thead><tbody>` +
    mrow('Holmgurte', cap, `E ${nf(cap.E, 0)} GPa · ρ ${nf(cap.rho, 0)} kg/m³ · zul. ${nf(cap.sc * kn, 0)} MPa`) + mrow('Holmsteg', web, `G·t ${nf(web.gs * P.wWeb, 2)} MN/m bei ${nf(P.wWeb * 1000, 0)} g/m²`) +
    mrow('Nasenbeplankung', skin, `G·t ${nf(skin.gs * P.wLE, 2)} MN/m bei ${nf(P.wLE * 1000, 0)} g/m²`) + mrow('Leitwerksträger', boom, `E ${nf(boom.E, 0)} GPa · G ${nf(boom.G, 0)} GPa`) +
    `</tbody><caption>G·t: Schubsteifigkeit der Wand je Meter, maßgeblich für die Torsionssteifigkeit der Nase (Bredt). Zulässige Gurtspannung = Druckfestigkeit × ${nf(P.matKnock, 0)} %.</caption>`;
  later(() => renderSkinStudy(RR));
}
$('#modes-sub').addEventListener('click', e => { const b = e.target.closest('[data-mi]'); if (!b) return; UI.modeSel = Number(b.dataset.mi); renderStrukturMain(R); });
// Vergleich der Nasenwerkstoffe und Gurtwerkstoffe (Flattern, Masse)
function skinStudy(P, comps) {
  const rows = [];
  for (const k of MAT_SEL.matSkin) { const C = buildCase({ ...P, matSkin: k }, comps), A = aeroelastic(C, { nStep: 30 }); rows.push({ kind: 'Nase', k, m: C.m, ms: C.mass.struct, ft: (A.modes.find(m => m.tors > 0.5) || A.modes[1]).f, vf: A.flutter.vf, vd: A.VD }); }
  for (const k of MAT_SEL.matCap) { const C = buildCase({ ...P, matCap: k }, comps), A = aeroelastic(C, { nStep: 30 }); rows.push({ kind: 'Gurte', k, m: C.m, ms: C.mass.struct, fb: A.modes[0].f, d: C.struct.dTip, vf: A.flutter.vf, vd: A.VD }); }
  return rows;
}
function renderSkinStudy(RR) {
  if (RR !== R) return;
  const P = S.params, host = $('#tbl-matcmp'), rows = cached('skin', () => skinStudy(P, S.comps)), vReq = 1.2 * P.vmax, cur = { Nase: P.matSkin, Gurte: P.matCap };
  const grp = (kind, l, fl) => `<tr class="grp"><th colspan="4">${l}</th></tr>` + rows.filter(r => r.kind === kind).map(r => `<tr class="${cur[r.kind] === r.k ? 'sel' : ''} pick" data-mk="${kind === 'Nase' ? 'matSkin' : 'matCap'}" data-mv="${r.k}" tabindex="0"><td>${esc(MAT[r.k].name)}</td><td class="n">${nf(r.ms, 2)} kg</td><td class="n">${nf(kind === 'Nase' ? r.ft : r.fb, 1)} Hz</td><td class="n ${r.vf && r.vf < vReq ? 'crit' : 'good'}">${r.vf ? nf(r.vf, 0) + ' m/s' : 'keins'}</td></tr>`).join('');
  host.innerHTML = `<thead><tr><th>Alternative</th><th class="n">Struktur</th><th class="n">Frequenz</th><th class="n">Flattern</th></tr></thead><tbody>` +
    grp('Nase', 'Nasenbeplankung · Frequenz = 1. Torsion') + grp('Gurte', 'Holmgurte · Frequenz = 1. Biegung') +
    `</tbody><caption>Gleiche Flächengewichte, nur der Werkstoff getauscht; Zeile anklicken zum Übernehmen. Gurte werden auf Festigkeit und Durchbiegung neu bemessen, deshalb ändert sich dort die Masse.</caption>`;
}
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('tr[data-mk]')) { e.preventDefault(); e.target.closest('tr[data-mk]').click(); } });
document.addEventListener('click', e => { const tr = e.target.closest && e.target.closest('tr[data-mk]'); if (!tr) return; S.params[tr.dataset.mk] = tr.dataset.mv; markPreset(); fillForms(); schedule(true); });

/* ---------- Ansicht Antrieb ---------- */
function propData(C) {
  return cached('prop', () => {
    const P = C.P, op = propOperate(C, C.lvl.Dtot, P.v, C.rho), mx = propMaxThrust(C, P.v, C.rho), cg = climbGlide(C), map = propMap(C, 18, 14), tab = propTable(C);
    return { op, mx, cg, map, tab };
  });
}
function propHeatSVG(el, C, pd, pc) {
  el._fn = e => propHeatSVG(e, R.C, propData(R.C), R.pc); el._cfg = C;
  const W = cw(el), H = 300, m = { l: 50, r: 14, t: 12, b: 40 }, iw = W - m.l - m.r, ih = H - m.t - m.b, mp = pd.map;
  const v0 = mp.vs[0], v1 = mp.vs[mp.vs.length - 1], dv = (v1 - v0) / (mp.vs.length - 1), tMax = mp.tMax;
  const xs = v => m.l + (v - (v0 - dv / 2)) / (v1 - v0 + dv) * iw, ys = t => m.t + ih - t / tMax * ih;
  const etas = mp.cells.map(c => c.eta).filter(fin), e1 = Math.max(0.25, ...etas), e0 = Math.max(Math.min(...etas), e1 - 0.35);
  const cwid = iw / mp.vs.length, chgt = ih / mp.nt, showTxt = cwid > 30 && chgt > 14;
  let s = `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wirkungsgradkennfeld über Geschwindigkeit und Schub">`;
  for (const t of niceTicks(0, tMax, 5)) if (t <= tMax) s += `<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${ys(t)}" y2="${ys(t)}"/><text class="tick" x="${m.l - 6}" y="${ys(t) + 4}" text-anchor="end">${nf(t, 0)} N</text>`;
  mp.cells.forEach(c => {
    if (!fin(c.eta)) return;
    const a = clamp((c.eta - e0) / (e1 - e0), 0, 1), x = xs(c.V - dv / 2), y = ys(c.T + tMax / mp.nt / 2);
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(xs(c.V + dv / 2) - x - 1).toFixed(1)}" height="${(ih / mp.nt - 1).toFixed(1)}" fill="var(--c1)" fill-opacity="${(0.06 + 0.88 * a).toFixed(3)}" data-v="${c.V}" data-t="${c.T}" data-e="${c.eta}" data-i="${c.I}" data-n="${c.rpm}"/>`;
    if (showTxt) s += `<text class="cell-t" x="${(x + cwid / 2).toFixed(1)}" y="${(y + chgt / 2 + 4).toFixed(1)}" text-anchor="middle" fill="${a > 0.55 ? '#fff' : 'var(--ink-2)'}">${Math.round(c.eta * 100)}</text>`;
  });

  for (const v of niceTicks(v0, v1, Math.max(3, Math.floor(iw / 80)))) if (v >= v0 - dv / 2 && v <= v1 + dv / 2) s += `<text class="tick" x="${xs(v)}" y="${m.t + ih + 16}" text-anchor="middle">${nf(v, 0)}</text>`;
  s += `<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${m.t + ih}" y2="${m.t + ih}"/><text class="axis-label" x="${m.l + iw / 2}" y="${H - 4}" text-anchor="middle">Fluggeschwindigkeit (m/s)</text>`;
  const line = (pts, cls, extra = '') => { let d = '', pen = false; for (const [v, t] of pts) { if (!fin(t) || v < v0 - dv / 2 || v > v1 + dv / 2) { pen = false; continue; } d += (pen ? 'L' : 'M') + xs(v).toFixed(1) + ' ' + ys(Math.min(t, tMax)).toFixed(1); pen = true; } return `<path class="line ${cls}" d="${d}" ${extra}/>`; };
  s += line(mp.vs.map((v, i) => [v, mp.tm[i]]), 'sc4');
  s += line(pc.pts.filter(p => !p.stall).map(p => [p.V, p.Dtot]), 'sc2');
  const op = pd.op; if (op && op.ok) s += `<circle class="mark fc2" cx="${xs(C.P.v)}" cy="${ys(C.lvl.Dtot)}" r="5"/><text class="mark-label" x="${xs(C.P.v) + 8}" y="${ys(C.lvl.Dtot) - 8}">Reise ${nf(op.etaTot * 100, 0)} %</text>`;
  s += '</svg>';
  const leg = `<div class="chart-title"><span>Gesamtwirkungsgrad in % · ${nf(e0 * 100, 0)} <span class="ramp" aria-hidden="true"></span> ${nf(e1 * 100, 0)}</span><span class="legend"><span><i class="bc4"></i>Höchstschub</span><span><i class="bc2"></i>Widerstand im Geradeausflug</span></span></div>`;
  el.innerHTML = leg + s + '<div class="tip" hidden></div>';
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip');
  svg.addEventListener('pointermove', ev => {
    const c = ev.target.closest('rect[data-e]'); if (!c) { tip.hidden = true; return; }
    tip.innerHTML = `<div class="th">${nf(Number(c.dataset.v), 1)} m/s · ${nf(Number(c.dataset.t), 1)} N</div><div class="row"><span>Gesamt</span><b>${nf(Number(c.dataset.e) * 100, 1)} %</b></div><div class="row"><span>Drehzahl</span><b>${nf(Number(c.dataset.n), 0)} U/min</b></div><div class="row"><span>Strom</span><b>${nf(Number(c.dataset.i), 1)} A</b></div>`;
    tip.hidden = false; const x = Number(c.getAttribute('x')), tw = tip.offsetWidth; tip.style.left = (x + 30 + tw > W ? Math.max(0, x - 14 - tw) : x + 30) + 'px'; tip.style.top = Math.max(0, Number(c.getAttribute('y')) - 10) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}
RENDER.antrieb = (R) => {
  const { C, P } = R, pd = propData(C), op = pd.op, cg = pd.cg, g = propGeometry(P), D = 2 * g.R, Umax = battU(P);
  const tipM = Math.PI * D * pd.mx.n / 340;
  $('#op-sub').textContent = `${g.name}, ${g.B} Blätter, Profil ${g.foil.name}. Motor Kv ${nf(P.motKv, 0)} U/min/V, ${nf(P.motR * 1000, 0)} mΩ an ${nf(P.nCells, 0)} Zellen (${nf(Umax, 1)} V). Schub = Widerstand ${nf(C.lvl.Dtot, 2)} N bei ${nf(P.v, 1)} m/s.`;
  $('#op-act').innerHTML = P.propModel === 'bemt' ? `<button class="btn" type="button" data-pm="model">Wirkungsgradkette verwenden</button>` : `<button class="btn primary" type="button" data-pm="bemt">Kennfeld im Energiehaushalt verwenden</button>`;
  const etaModel = P.propModel === 'model' ? C.lvl.eta : NaN;
  $('#kpis-prop').innerHTML = op && op.n ? [
    kpi('Drehzahl', nf(op.rpm, 0), 'U/min', `Fortschrittsgrad J ${nf(op.J, 2)} · Spitze ${nf(Math.PI * D * op.n, 0)} m/s`),
    kpi('Propeller', nf(op.etaP * 100, 1), '%', `Wirkungsgrad mit Strahl- und Profilverlusten`),
    kpi('Motor', nf(op.etaM * 100, 1), '%', `${nf(op.I, 1)} A · ${nf(op.U, 1)} V · Gas ${nf(op.throttle * 100, 0)} %`, op.ok ? '' : 'bad'),
    kpi('Gesamt Akku → Schub', nf(op.etaTot * C.motor.eta * 100, 1), '%', `${nf(op.Pbat / C.motor.eta, 1)} W aus dem Akku${fin(etaModel) ? ` · Wirkungsgradkette ${nf(etaModel * 100, 1)} %` : ''}`),
    kpi('Höchstschub bei Reise', nf(pd.mx.T, 1), 'N', `${nf(pd.mx.rpm, 0)} U/min · Spitzen-Mach ${nf(tipM, 2)}`, pd.mx.T < 1.5 * C.lvl.Dtot ? 'bad' : ''),
    kpi('Steigen', nf(cg.bestC.roc, 2), 'm/s', `bei ${nf(cg.bestC.V, 1)} m/s · auf ${nf(P.hAGL, 0)} m in ${fin(cg.tClimb) ? nf(cg.tClimb / 60, 1) + ' min' : '–'}`, cg.bestC.roc < 1 ? 'bad' : ''),
    kpi('Sinken ohne Antrieb', nf(cg.minS.sink, 2), 'm/s', `bei ${nf(cg.minS.V, 1)} m/s · Gleitzahl ${nf(cg.bestG.LD, 1)} bei ${nf(cg.bestG.V, 1)} m/s`),
    kpi('Gleitstrecke', nf(cg.bestG.LD * P.hAGL / 1000, 2), 'km', `aus ${nf(P.hAGL, 0)} m über Grund, Propeller gefaltet`)
  ].join('') : '';
  const msg = [];
  if (!op || !op.ok) msg.push(pill('crit', 'Reiseflug-Schub mit diesem Motor nicht erreichbar (Spannung oder Strom am Limit)'));
  if (op && op.J > 0.9 * pd.tab.J0) msg.push(pill('warn', 'Propeller arbeitet nahe am Schubnullpunkt: Steigung zu klein oder Drehzahl zu niedrig'));
  if (tipM > 0.6) msg.push(pill('warn', `Blattspitze bei Vollgas Mach ${nf(tipM, 2)}: laut und verlustreich`));
  if (op && op.ok && op.etaTot < 0.5) msg.push(pill('warn', `Gesamtwirkungsgrad nur ${nf(op.etaTot * 100, 0)} %: Propeller größer und langsamer, Kv anpassen`));
  if (cg.bestC.roc < 1) msg.push(pill('warn', 'Weniger als 1 m/s Steigen: Startphase und Aufwinde-Ausgleich knapp'));
  if (!msg.length) msg.push(pill('good', `Motor im Reiseflug bei ${nf(op.throttle * 100, 0)} % Gas, Reserve bis ${nf(pd.mx.T, 1)} N Schub`));
  $('#op-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  $('#map-sub').textContent = `Akkuleistung bis Schubleistung: Propeller (Blattelementmethode mit Prandtl-Verlusten) × Motor (Ersatzschaltbild nach Drela) × Regler × Getriebe${C.motor.eta < 1 ? ' × Einbauverlust' : ''}. Leer: mit diesem Motor nicht erreichbar.`;
  propHeatSVG($('#svg-pmap'), C, pd, R.pc);
  const pts = cg.pts, yr = niceRange([...pts.map(p => p.roc), ...pts.map(p => -p.sink), 0], 0.08);
  $('#climb-sub').textContent = `Steigrate mit Höchstschub und Sinkrate mit gefaltetem Propeller über der Fluggeschwindigkeit, ${nf(C.m, 2)} kg.`;
  lineChart($('#ch-climb'), { h: 230, x: { min: pts[0].V, max: pts[pts.length - 1].V, fmt: v => nf(v, 0), tipFmt: v => nf(v, 1) + ' m/s', title: 'Fluggeschwindigkeit (m/s)' }, y: { min: yr[0], max: yr[1], fmt: v => nf(v, 1) + ' m/s' },
    series: [{ name: 'Steigen mit Vollgas', c: 3, pts: pts.map(p => [p.V, p.roc]), fmt: v => nfs(v, 2) + ' m/s' }, { name: 'Sinken ohne Antrieb', c: 2, pts: pts.map(p => [p.V, -p.sink]), fmt: v => nf(v, 2) + ' m/s' }],
    marks: [{ x: cg.bestC.V, y: cg.bestC.roc, c: 3, label: 'bestes Steigen' }, { x: cg.minS.V, y: -cg.minS.sink, c: 2, label: 'geringstes Sinken', dy: 18 }],
    tipExtra: x => { const p = pts.reduce((a, b) => Math.abs(b.V - x) < Math.abs(a.V - x) ? b : a); return `<div class="row"><span>Gleitzahl</span><b>${nf(p.LD, 1)}</b></div><div class="row"><span>Höchstschub</span><b>${nf(p.Tmax, 1)} N</b></div>`; } });
  const lvlMax = pts.filter(p => p.roc >= 0).reduce((a, p) => Math.max(a, p.V), NaN);
  $('#kpis-climb').innerHTML = [
    kpi('Bestes Steigen', nf(cg.bestC.roc, 2), 'm/s', `bei ${nf(cg.bestC.V, 1)} m/s`),
    kpi('Geringstes Sinken', nf(cg.minS.sink, 2), 'm/s', `bei ${nf(cg.minS.V, 1)} m/s`),
    kpi('Beste Gleitzahl', nf(cg.bestG.LD, 1), '', `bei ${nf(cg.bestG.V, 1)} m/s`),
    kpi('Schnellster Horizontalflug', fin(lvlMax) ? (lvlMax >= pts[pts.length - 1].V - 1e-6 ? '> ' : '') + nf(lvlMax, 1) : '–', 'm/s', 'Vollgas, Schub gleich Widerstand')
  ].join('');
  const tb = pd.tab.pts;
  $('#ct-sub').textContent = `${g.name} bei ${nf(P.v, 1)} m/s, Reynoldszahl der Blätter aus Drehzahl und Tiefe. Punkt: Reiseflug.`;
  lineChart($('#ch-eta'), { h: 180, title: 'Propellerwirkungsgrad', x: { min: 0, max: Math.max(...tb.map(p => p.J)), fmt: v => nf(v, 1), title: 'Fortschrittsgrad J = V/(n·D)' }, y: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: v => nf(v * 100, 0) + ' %' },
    series: [{ name: 'η Propeller', c: 1, pts: tb.filter(p => p.CT > 0).map(p => [p.J, p.eta]), fmt: v => nf(v * 100, 1) + ' %' }], marks: op && op.n ? [{ x: op.J, y: op.etaP, c: 2, label: 'Reise' }] : [], legend: false });
  const cmax = niceRange(tb.flatMap(p => [p.CT, p.CP]).filter(v => fin(v) && v > 0), 0.05, true)[1];
  lineChart($('#ch-ct'), { h: 180, title: 'Schub- und Leistungsbeiwert', x: { min: 0, max: Math.max(...tb.map(p => p.J)), fmt: v => nf(v, 1) }, y: { min: 0, max: cmax, fmt: v => nf(v, 2) },
    series: [{ name: 'C_T', c: 1, pts: tb.map(p => [p.J, Math.max(0, p.CT)]), fmt: v => nf(v, 4) }, { name: 'C_P', c: 2, pts: tb.map(p => [p.J, Math.max(0, p.CP)]), fmt: v => nf(v, 4) }] });
  // Betriebspunkte
  const rows = [['Reiseflug gerade', P.v, C.lvl.Dtot], [`Kurvenflug ${nf(P.bank, 0)}°`, P.v, C.turn.Dtot], ['Geringste Leistung', R.pc.minP.V, R.pc.minP.Dtot], ['Bestes Steigen (Vollgas)', cg.bestC.V, cg.bestC.Tmax * 0.995], ['Höchstgeschwindigkeit', P.vmax, aero(C, P.vmax, 1, C.rho, C.nu).Dtot]];
  $('#tbl-op').innerHTML = `<thead><tr><th>Zustand</th><th class="n">V</th><th class="n">Schub</th><th class="n">Drehzahl</th><th class="n">J</th><th class="n"><span class="nc">η</span> Prop.</th><th class="n"><span class="nc">η</span> Motor</th><th class="n">Strom</th><th class="n">Spannung</th><th class="n">Gas</th><th class="n">Akku</th></tr></thead><tbody>` +
    rows.map(([l, V, T]) => { const o = propOperate(C, T, V, C.rho); return `<tr><td>${esc(l)}</td><td class="n">${nf(V, 1)} m/s</td><td class="n">${nf(T, 2)} N</td><td class="n">${o.n ? nf(o.rpm, 0) : '–'}</td><td class="n">${o.n ? nf(o.J, 2) : '–'}</td><td class="n">${o.n ? nf(o.etaP * 100, 1) + ' %' : '–'}</td><td class="n">${o.n ? nf(o.etaM * 100, 1) + ' %' : '–'}</td><td class="n ${o.I > P.motImax ? 'crit' : ''}">${o.n ? nf(o.I, 1) + ' A' : '–'}</td><td class="n">${o.n ? nf(o.U, 1) + ' V' : '–'}</td><td class="n ${o.throttle > 1 ? 'crit' : ''}">${o.n ? nf(o.throttle * 100, 0) + ' %' : '–'}</td><td class="n">${o.n ? nf(o.Pbat / C.motor.eta, 1) + ' W' : '–'}</td></tr>`; }).join('') + '</tbody>';
};
$('#op-act').addEventListener('click', e => { const b = e.target.closest('[data-pm]'); if (!b) return; S.params.propModel = b.dataset.pm; markPreset(); fillForms(); schedule(true); });

/* ---------- Ansicht Flugdynamik ---------- */
UI.dynTab = 'flex';
function dynData(C) { return cached('dyn', () => ({ flex: flightDynamics(C), rigid: flightDynamics(C, { rigid: true }) })); }
function simLin(A, x0, T, dt, every) {
  const n = x0.length, f = v => A.map(r => { let s = 0; for (let j = 0; j < n; j++) s += r[j] * v[j]; return s; });
  let x = x0.slice(); const out = [[0, ...x]];
  for (let k = 1; k * dt <= T + 1e-9; k++) {
    const k1 = f(x), k2 = f(x.map((v, i) => v + dt / 2 * k1[i])), k3 = f(x.map((v, i) => v + dt / 2 * k2[i])), k4 = f(x.map((v, i) => v + dt * k3[i]));
    x = x.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    if (k % every === 0) out.push([k * dt, ...x]);
  }
  return out;
}
function splaneSVG(el, fd) {
  el._fn = e => splaneSVG(e, dynData(R.C)[UI.dynTab]); el._cfg = fd;
  const W = cw(el), H = 280, m = { l: 46, r: 14, t: 14, b: 36 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const pts = [...fd.evLon.map(z => ({ ...z, k: 'lon' })), ...fd.evLat.map(z => ({ ...z, k: 'lat' }))];
  const xmin = -12, xmax = Math.max(1, ...pts.map(p => p.re).filter(v => v < 5)) * 1.1, ymax = Math.max(4, ...pts.map(p => Math.abs(p.im)).filter(v => v < 20)) * 1.12;
  const xs = v => m.l + (clamp(v, xmin, xmax) - xmin) / (xmax - xmin) * iw, ys = v => m.t + ih / 2 - clamp(v, -ymax, ymax) / ymax * ih / 2;
  let s = `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Eigenwerte in der komplexen Ebene">`;
  s += `<rect x="${xs(0)}" y="${m.t}" width="${m.l + iw - xs(0)}" height="${ih}" fill="var(--crit-bg)" opacity="0.6"/><text class="band-label" x="${m.l + iw - 4}" y="${m.t + ih - 6}" text-anchor="end">instabil</text>`;
  for (const v of niceTicks(xmin, xmax, 6)) s += `<line class="grid" x1="${xs(v)}" x2="${xs(v)}" y1="${m.t}" y2="${m.t + ih}"/><text class="tick" x="${xs(v)}" y="${m.t + ih + 15}" text-anchor="middle">${nf(v, 0)}</text>`;
  for (const v of niceTicks(-ymax, ymax, 5)) s += `<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${ys(v)}" y2="${ys(v)}"/><text class="tick" x="${m.l - 6}" y="${ys(v) + 4}" text-anchor="end">${nf(v, 0)}</text>`;
  s += `<line class="zero" x1="${xs(0)}" x2="${xs(0)}" y1="${m.t}" y2="${m.t + ih}"/><line class="zero" x1="${m.l}" x2="${m.l + iw}" y1="${ys(0)}" y2="${ys(0)}"/>`;
  for (const z of [0.08, 0.3]) { const a = Math.acos(z), R0 = Math.hypot(xmin, ymax); for (const sg of [1, -1]) s += `<line x1="${xs(0)}" y1="${ys(0)}" x2="${xs(-R0 * Math.cos(a))}" y2="${ys(sg * R0 * Math.sin(a))}" stroke="var(--muted)" stroke-dasharray="3 4"/>`; s += `<text class="tick" x="${xs(-0.93 * ymax / Math.tan(a)) - 5}" y="${ys(-0.93 * ymax) + 4}" text-anchor="end">ζ ${nf(z, 2)}</text>`; }
  s += `<text class="axis-label" x="${m.l + iw / 2}" y="${H - 4}" text-anchor="middle">Realteil (1/s) – links gedämpft</text><text class="axis-label" x="${m.l}" y="${m.t - 3}">Imaginärteil (rad/s)</text>`;
  const name = (z, k) => { const lon = fd.lon, lat = fd.lat, near = (a) => a && Math.abs(a.re - z.re) < 1e-9 && Math.abs(Math.abs(a.im) - Math.abs(z.im)) < 1e-9; if (k === 'lon') return near(lon.sp) || (lon.sp && lon.sp.real && lon.sp.roots.some(near)) ? 'Anstellwinkel' : near(lon.ph) ? 'Phygoide' : ''; return near(lat.dr) ? 'Taumel' : near(lat.roll) ? 'Rollen' : near(lat.spiral) ? 'Spirale' : ''; };
  for (const p of pts) {
    const off = p.re < xmin, X = xs(p.re), Y = ys(p.im), lab = name(p, p.k);
    s += p.k === 'lon' ? `<circle cx="${X}" cy="${Y}" r="5.5" fill="var(--c1)" stroke="var(--panel)" stroke-width="1.5"/>` : `<rect x="${X - 5}" y="${Y - 5}" width="10" height="10" transform="rotate(45 ${X} ${Y})" fill="var(--c2)" stroke="var(--panel)" stroke-width="1.5"/>`;
    if (lab && p.im >= 0) s += `<text class="mark-label" x="${X + (off ? 9 : 8)}" y="${Y - 8}">${off ? '← ' : ''}${esc(lab)}${off ? ' ' + nf(p.re, 0) : ''}</text>`;
  }
  s += '</svg>';
  el.innerHTML = `<div class="chart-title"><span class="legend"><span><i class="bc1"></i>Längsbewegung</span><span><i class="bc2"></i>Seitenbewegung</span></span></div>` + s;
}
RENDER.flugdynamik = (R) => {
  const { C, P } = R, dd = dynData(C), fd = dd[UI.dynTab], dO = UI.dynTab === 'flex' ? dd.rigid : dd.flex, d = fd.d;
  $$('#dyn-tabs .tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.dt === UI.dynTab)));
  $('#dyn-sub').textContent = `Lineare Bewegungsgleichungen um den Reiseflug (${nf(P.v, 1)} m/s, ${nf(C.m, 2)} kg), Derivative aus Wirbelgitter, Leitwerk und Rumpf. Bewertung nach MIL-F-8785C, kleine Flugzeuge, Reiseflug. ${UI.dynTab === 'flex' ? `Elastisch: die Flügelbiegung bei 1 g wirkt als zusätzliche V-Form von ${nf(d.gFlex * RAD, 1)}° (Lehre aus dem Helios-Absturz).` : 'Starr: Flügel ohne Biegung.'}`;
  const crit = k => fd.crit.find(c => c.k === k), sp = crit('spiral');
  $('#kpis-dyn').innerHTML = [
    kpi('Stabilitätsmaß', nf(d.sm * 100, 1), '%', `Cm_α ${nf(d.Cma, 3)} je rad`, d.sm < 0.03 ? 'bad' : ''),
    kpi('Richtungsstabilität', nf(d.Cnb, 3), 'Cn_β', `Seitenleitwerksvolumen ${nf(d.VV, 3)}`, d.Cnb <= 0 ? 'bad' : ''),
    kpi('Rollstabilität', nf(d.Clb, 3), 'Cl_β', `V-Form ${nf(d.ClbDih, 3)} · elastisch ${nf(d.ClbFlex, 3)} · Pfeilung ${nf(d.ClbSweep, 3)}`, d.Clb >= 0 ? 'bad' : ''),
    kpi('V-Form für Spirale Level 1', fd.dih1.ok ? 'erfüllt' : fin(fd.dih1.deg) ? nf(fd.dih1.deg, 1) : '> 30', fd.dih1.ok ? '' : '°', `Außenflügel, eingestellt ${nf(P.dihedral, 1)}° · Level 2 ${fd.dih2.ok ? 'erfüllt' : 'ab ' + nf(fd.dih2.deg, 1) + '°'} · neutral ab ${fin(fd.dihNeutral) ? nf(Math.max(0, fd.dihNeutral), 1) + '°' : '–'}`, sp && sp.level > 2 ? 'bad' : '')
  ].join('');
  const rows = [['sp', 'Anstellwinkelschwingung', fd.lon.sp], ['ph', 'Phygoide', fd.lon.ph], ['dr', 'Taumelschwingung', fd.lat.dr], ['roll', 'Rollbewegung', fd.lat.roll], ['spiral', 'Spiralbewegung', fd.lat.spiral]];
  $('#tbl-dmodes').innerHTML = `<thead><tr><th>Eigenbewegung</th><th class="n">Eigenkreisfrequenz</th><th class="n">Dämpfung <span class="nc">ζ</span></th><th class="n">Halbierung / Verdopplung</th><th>MIL-F-8785C</th><th class="n">${UI.dynTab === 'flex' ? 'starr' : 'elastisch'}</th></tr></thead><tbody>` +
    rows.map(([k, l, md]) => {
      const c = crit(k), o = dO.crit.find(x => x.k === k);
      const lp = c ? `<span title="${esc(c.req)}">${lvlPill(c.level)}</span>` : '';
      if (!md) return `<tr><td>${esc(l)}</td><td class="n" colspan="3">aperiodisch zerfallen</td><td>${lp}</td><td></td></tr>`;
      const osc = Math.abs(md.im) > 1e-9 || md.real, tt = md.re < 0 ? md.th : md.t2, hv = md.re < 0 ? `½ in ${nf(tt, tt < 1 ? 2 : 1)} s` : md.re > 0 ? `×2 in ${nf(tt, 1)} s` : '–';
      return `<tr><td>${esc(l)}<div class="small muted">${c ? esc(c.req.split(' (L1)')[0]) + ' für Level 1' : ''}</div></td><td class="n">${nf(md.wn, 2)} 1/s<div class="small muted">${md.real ? 'aperiodisch (Ersatzwerte)' : osc ? 'Periode ' + nf(md.T, 1) + ' s' : 'aperiodisch'}</div></td><td class="n">${osc ? nf(md.zeta, 3) : '–'}</td><td class="n ${md.re > 0 ? 'warn' : ''}">${hv}</td><td>${lp}</td><td class="n">${o ? `${o.unit === 'ζ' ? 'ζ ' + nf(o.val, 3) : o.val === Infinity ? 'stabil' : nf(o.val, o.unit === 's' && o.val < 1 ? 2 : 1) + ' s'} · L${o.level}` : '–'}</td></tr>`;
    }).join('') + `</tbody><caption>Taumelschwingung = Dutch Roll. Level 1: gute Flugeigenschaften, Level 2: Mehraufwand für Pilot oder Regler, Level 3: gerade noch beherrschbar. Ein Autopilot gleicht eine langsame Spiraldivergenz aus; Level 2 ist für ein UAV mit Flugregler üblich.</caption>`;
  splaneSVG($('#svg-splane'), fd);
  $('#sp-sub').textContent = 'Jeder Punkt ist eine Eigenbewegung. Je weiter links, desto schneller klingt sie ab; je höher, desto schneller schwingt sie. Rechts der Achse: instabil.';
  // Böenantworten
  const V = P.v, lon = simLin(lonMatrix(fd.x), [0, 1, 0, 0], 40, 0.01, 10), lat = simLin(latMatrix(fd.x), [V * Math.sin(2 * DEG), 0, 0, 0], 20, 0.005, 10);
  let psi = 0; const latP = lat.map((p, i) => { if (i) psi += (lat[i][3] + lat[i - 1][3]) / 2 * (p[0] - lat[i - 1][0]); return [p[0], p[1] / V * RAD, p[4] * RAD, psi * RAD]; });
  $('#resp-sub').textContent = `Oben: Vertikalbö 1 m/s (Anstellwinkel springt um ${nf(1 / V * RAD, 1)}°). Unten: Seitenbö mit 2° Schiebewinkel. Ohne Regler, Ruder fest.`;
  const lr = niceRange(lon.flatMap(p => [p[2] / V * RAD, p[4] * RAD, (p[4] - p[2] / V) * RAD]), 0.08);
  lineChart($('#ch-resp-lon'), { h: 190, title: 'Längsbewegung', x: { min: 0, max: 40, fmt: v => nf(v, 0) + ' s' }, y: { min: lr[0], max: lr[1], fmt: v => nf(v, 1) + '°' },
    series: [{ name: 'Anstellwinkel α', c: 1, pts: lon.map(p => [p[0], p[2] / V * RAD]), fmt: v => nfs(v, 2) + '°' }, { name: 'Längsneigung θ', c: 2, pts: lon.map(p => [p[0], p[4] * RAD]), fmt: v => nfs(v, 2) + '°' }, { name: 'Bahnwinkel γ', c: 3, pts: lon.map(p => [p[0], (p[4] - p[2] / V) * RAD]), fmt: v => nfs(v, 2) + '°', dash: true }] });
  const yr2 = niceRange(latP.flatMap(p => [p[1], p[2], p[3]]).map(v => clamp(v, -60, 60)), 0.08);
  lineChart($('#ch-resp-lat'), { h: 190, title: 'Seitenbewegung', x: { min: 0, max: 20, fmt: v => nf(v, 0) + ' s' }, y: { min: yr2[0], max: yr2[1], fmt: v => nf(v, 0) + '°' },
    series: [{ name: 'Schiebewinkel β', c: 1, pts: latP.map(p => [p[0], p[1]]), fmt: v => nfs(v, 2) + '°' }, { name: 'Hängewinkel φ', c: 2, pts: latP.map(p => [p[0], p[2]]), fmt: v => nfs(v, 1) + '°' }, { name: 'Kurswinkel ψ', c: 3, pts: latP.map(p => [p[0], p[3]]), fmt: v => nfs(v, 1) + '°', dash: true }] });
  // Derivative
  const tr = (l, v, d2, note) => `<tr><td>${l}</td><td class="n">${nf(v, d2)}</td><td class="small muted">${note}</td></tr>`;
  $('#der-sub').textContent = 'Beiwerte je Radiant; Drehgeschwindigkeiten dimensionslos mit c/(2V) bzw. b/(2V).';
  $('#tbl-deriv').innerHTML = `<thead><tr><th>Derivativ</th><th class="n">Wert</th><th>Bedeutung und Quelle</th></tr></thead><tbody>` +
    tr('C_L,α', d.CLa, 3, 'Auftriebsanstieg Flugzeug: Flügel aus Wirbelgitter, Leitwerk mit Abwind (DATCOM)') + tr('C_m,α', d.Cma, 3, '= −C_L,α · Stabilitätsmaß; negativ heißt längsstabil') +
    tr('C_m,q', d.Cmq, 2, `Nickdämpfung: Leitwerk ${nf(d.Cmq - d.CmqW, 2)}, Flügel ${nf(d.CmqW, 2)} (Wirbelgitter)`) + tr('C_m,α̇', d.Cmad, 2, 'Abwindverzug am Leitwerk') + tr('C_L,q', d.CLq, 2, 'Auftrieb durch Nickdrehung') +
    tr('C_Y,β', d.CYb, 3, 'Seitenkraft: Seitenleitwerk (Helmbold, Endscheibe Höhenleitwerk) und Gondel') +
    tr('Cl_β', d.Clb, 4, `Rollmoment: V-Form ${nf(d.ClbDih, 4)}, Biegung ${nf(d.ClbFlex, 4)}, Pfeilung ${nf(d.ClbSweep, 4)}, Seitenleitwerk ${nf(d.Clb - d.ClbDih - d.ClbFlex - d.ClbSweep, 4)}`) +
    tr('Cn_β', d.Cnb, 4, 'Windfahnenstabilität: Seitenleitwerk minus Gondel (Raymer)') + tr('Cl_p', d.Clp, 3, 'Rolldämpfung (Wirbelgitter, antimetrische Lösung)') + tr('Cn_p', d.Cnp, 4, 'negatives Wendemoment beim Rollen') +
    tr('Cl_r', d.Clr, 3, 'Rollmoment beim Gieren (Außenflügel schneller)') + tr('Cn_r', d.Cnr, 4, 'Gierdämpfung: Seitenleitwerk, Profilwiderstand') + '</tbody>';
};
$('#dyn-tabs').addEventListener('click', e => { const b = e.target.closest('[data-dt]'); if (!b) return; UI.dynTab = b.dataset.dt; renderView(true); });
/* ---------- Validierung der Rechenkerne ---------- */
function kernData() {
  if (UI.kern) return UI.kern;
  const gl = golandCheck(), nv = navionCheck(), apc = apcCheck('qprop'), apcC = apcCheck('clarky');
  const vlm = (P2, a0 = 2 * Math.PI) => vlmWing(planform({ ...DEFAULT_PARAMS, ...P2 }), a0);
  const e10 = vlm({ span: 10, area: 10, planform: 'ellip', washout: 0, sweep: 0 }), r0 = vlm({ span: 6, area: 6, planform: 'taper', taper: 1, washout: 0, sweep: 0 }), r6 = vlm({ span: 6, area: 6, planform: 'taper', taper: 1, washout: 0, sweep: 30 });
  const helm = (A, cosL = 1) => 2 * Math.PI * A / (2 + Math.sqrt(A * A / (cosL * cosL) + 4));
  return (UI.kern = { gl, nv, apc, apcC, e10, r0, r6, h10: helm(10), h6: helm(6, Math.cos(30 * DEG)) / helm(6) });
}
function renderKern() {
  const k = kernData(), z = m => m ? `${nf(m.re, m.re > -0.1 ? 4 : 2)}${m.im ? ' ± ' + nf(Math.abs(m.im), m.re > -0.1 ? 3 : 2) + 'i' : ''}` : '–';
  const dev = (a, b) => { const d = a / b - 1; return `<td class="n ${Math.abs(d) < 0.03 ? 'good' : Math.abs(d) < 0.1 ? '' : 'warn'}">${nfs(d * 100, 1)} %</td>`; };
  const row = (g, l, ref, mod, a, b) => `<tr><td>${g}</td><td>${l}</td><td class="n">${ref}</td><td class="n">${mod}</td>${a != null ? dev(a, b) : '<td></td>'}</tr>`;
  const n = k.nv;
  $('#tbl-kern').innerHTML = `<thead><tr><th>Prüffall</th><th>Größe</th><th class="n">Literatur</th><th class="n">Rechner</th><th class="n">Abweichung</th></tr></thead><tbody>` +
    row('Goland-Flügel (1945)', 'Flattergeschwindigkeit', '137 m/s', nf(k.gl.VF, 1) + ' m/s', k.gl.VF, 137.2) +
    row('', 'Flatterfrequenz', '70,7 rad/s', nf(k.gl.wF, 1) + ' rad/s', k.gl.wF, 70.7) +
    row('', 'Divergenzgeschwindigkeit', '252,8 m/s', nf(k.gl.VD, 1) + ' m/s', k.gl.VD, 252.8) +
    row('', '1. Biegung / 1. Torsion', '49,6 / 97,0 rad/s', nf(k.gl.w1, 1) + ' / ' + nf(k.gl.w2, 1) + ' rad/s', k.gl.w1, 49.6) +
    row('Navion (Nelson)', 'Anstellwinkelschwingung', '−2,51 ± 2,59i', z(n.lon.sp), n.lon.sp.re, -2.51) +
    row('', 'Phygoide', '−0,017 ± 0,213i', z(n.lon.ph), n.lon.ph.im, 0.213) +
    row('', 'Taumelschwingung', '−0,49 ± 2,33i', z(n.lat.dr), n.lat.dr.im, 2.33) +
    row('', 'Rollbewegung', '−8,43', z(n.lat.roll), n.lat.roll.re, -8.43) +
    row('', 'Spiralbewegung', '−0,0088', z(n.lat.spiral), n.lat.spiral.re, -0.0088) +
    row('Wirbelgitter', 'Ellipse A = 10: Auftriebsanstieg', nf(k.h10, 3) + ' (Helmbold)', nf(k.e10.CLa, 3), k.e10.CLa, k.h10) +
    row('', 'Ellipse A = 10: Spannweitenwirkungsgrad', '1,000', nf(k.e10.CLa * k.e10.CLa / (Math.PI * 10 * k.e10.kaa), 3), k.e10.CLa * k.e10.CLa / (Math.PI * 10 * k.e10.kaa), 1) +
    row('', 'Rechteck A = 6: Anstieg 30° gepfeilt / ungepfeilt', nf(k.h6, 3) + ' (DATCOM)', nf(k.r6.CLa / k.r0.CLa, 3), k.r6.CLa / k.r0.CLa, k.h6) +
    `</tbody><caption>Goland: gleichmäßiger Kragflügel 6,1 m × 1,83 m auf Meereshöhe, Literaturwerte nach Goland (1945) und Patil, Hodges, Cesnik. Navion: Derivative aus Nelson eingesetzt, geprüft werden die Bewegungsgleichungen und die Eigenwertlösung (1/s). Der Spannweitenwirkungsgrad wird aus der Trefftz-Ebene mit Korrektur der Diskretisierung bestimmt.</caption>`;
  const ip = (T, x) => { let i = 0; while (i < T.length - 2 && T[i + 1][0] < x) i++; const [a, fa] = T[i], [b, fb] = T[i + 1]; return fa + (fb - fa) * (x - a) / (b - a); };
  lineChart($('#ch-apc1'), { h: 200, title: 'APC 10x7E: Wirkungsgrad', x: { min: 0.1, max: 0.8, fmt: v => nf(v, 1), title: 'Fortschrittsgrad J' }, y: { min: 0, max: 0.9, fmt: v => nf(v * 100, 0) + ' %' },
    series: [{ name: 'Messung', c: 3, pts: APC_MEAS.eta, dots: true, dash: true, fmt: v => nf(v * 100, 1) + ' %' }, { name: 'Rechner (QPROP-Profil)', c: 1, pts: k.apc.map(r => [r.J, r.eta]), fmt: v => nf(v * 100, 1) + ' %' }, { name: 'Clark Y aus der Datenbank', c: 2, pts: k.apcC.map(r => [r.J, r.eta]), dash: true, fmt: v => nf(v * 100, 1) + ' %' }] });
  lineChart($('#ch-apc2'), { h: 200, title: 'APC 10x7E: Schubbeiwert', x: { min: 0.1, max: 0.8, fmt: v => nf(v, 1), title: 'Fortschrittsgrad J' }, y: { min: 0, max: 0.14, fmt: v => nf(v, 2) },
    series: [{ name: 'Messung', c: 3, pts: APC_MEAS.CT, dots: true, dash: true, fmt: v => nf(v, 4) }, { name: 'Rechner (QPROP-Profil)', c: 1, pts: k.apc.map(r => [r.J, r.CT]), fmt: v => nf(v, 4) }, { name: 'Clark Y aus der Datenbank', c: 2, pts: k.apcC.map(r => [r.J, r.CT]), dash: true, fmt: v => nf(v, 4) }],
    tipExtra: x => `<div class="row"><span>Abweichung QPROP</span><b>${nfs((ip(k.apc.map(r => [r.J, r.CT]), x) / ip(APC_MEAS.CT, x) - 1) * 100, 0)} %</b></div>` });
}

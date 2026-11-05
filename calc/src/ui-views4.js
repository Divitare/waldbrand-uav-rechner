/* ===================================================================
   Oberfläche Teil 5: Konfiguration – Rumpfform, Leitwerk, Motor,
   Verkabelung, Leitwerk und Träger als tragende Bauteile, Start und Landung
   =================================================================== */
const fmtA = w => (w ? `${w.awg}` : '–');
function configMatrix(P, comps) {
  const out = [];
  for (const fus of Object.keys(FUS_TYPES)) for (const mot of Object.keys(MOTOR_POS)) {
    const P2 = { ...P, fusType: fus, motorPos: mot }, C = buildCase(P2, comps);
    const n = dayOfYear(P2.date), y = yearOf(P2.date), ser = daySeries(C, envClear(P2, n, y)), mis = mission(C, ser, ser, false), per = periodic(C, ser);
    let clh = NaN; try { clh = powerStates(C).rows.find(r => r.k === 'climb').CLh; } catch (e) { /* ohne Kennfeld */ }
    out.push({ fus, mot, C, mis, per, clh, ok: C.cfg.mot === mot && !(C.bal.g.boomClear < 0) });
  }
  return out;
}
RENDER.konfiguration = (R) => {
  const { C, P } = R, g = C.bal.g, bal = C.bal, cf = C.cfg, ts = C.struct ? C.struct.tail : null, hn = C.harness;
  $('#cf-sub').textContent = `${FUS_TYPES[cf.fus].name}, ${TAIL_TYPES[cf.tail].name.toLowerCase()}, ${MOTOR_POS[cf.mot].name.toLowerCase()}. Maßstäblich von der Seite; gestrichelt die Schublinie, Kreis der Schwerpunkt.`;
  const el = $('#svg-cf-side'); el._cfg = C; el._fn = e => { e.innerHTML = sideThumbSVG(currentR().C, cw(e), 300); }; el._fn(el);
  // Hinweise
  const msg = [];
  for (const n of cf.notes) msg.push(pill('warn', n.t));
  if (g.boomClear < 0) msg.push(pill('crit', `Rohrträger läuft ${nf(-g.boomClear * 100, 0)} cm tief durch den Propellerkreis: so nicht baubar`));
  const pc = propClearance(C), pc0 = propClearance(C, 0);
  if (pc.need === 'free') msg.push(pill('good', `Propeller bei der Landung frei (${nf(pc.open * 100, 0)} cm über Grund bei ${nf(pc.th, 0)}°)`));
  else msg.push(pill(pc.need === 'fold' ? 'info' : 'crit', pc.need === 'fold' ? `Propeller ragt ${nf(-Math.min(pc.open, pc0.open) * 100, 0)} cm unter die Bodenlinie: Klapppropeller, Motor vor dem Aufsetzen stoppen` : 'Auch der gefaltete Propeller berührt den Boden'));
  if (ts && ts.boom && ts.boom.util > 1.001) msg.push(pill('info', `Leitwerksträger verstärkt: ${nf(ts.boom.linReq * 1000, 0)} g/m statt ${nf(P.boomLin * 1000, 0)} g/m (${esc(ts.boom.worst.name)})`));
  if (ts && ts.cone && ts.cone.util > 1.001) msg.push(pill('info', `Rumpfröhre örtlich verstärkt (bis ${nf(ts.cone.util * 100, 0)} % des Mindest-Flächengewichts)`));
  if (C.np.kFlex < 0.9) msg.push(pillF('warn', `Weicher Träger: Höhenleitwerk wirkt bei Reisefahrt nur zu ${nf(C.np.kFlex * 100, 0)} %, Neutralpunkt wandert nach vorn`, 'tail-flex', 'sm'));
  $('#cf-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  $('#kpis-cf').innerHTML = [
    kpi('Schublinie', nfs((g.zP - bal.zcg) * 100, 0), 'cm', `über dem Schwerpunkt · Propeller ${nf(g.xProp, 2)} m ab Bug`),
    kpi('Schwerpunkt', nf(bal.xcg, 3), 'm', `Höhe ${nfs(bal.zcg * 100, 1)} cm · Stabilitätsmaß ${nf(bal.sm * 100, 1)} %`),
    kpi('Verkabelung', nf(C.mass.wire * 1000, 0), 'g', `${nf(C.mass.wire / C.m * 100, 1)} % der Abflugmasse${hn && hn.motor ? ` · Antriebsleitung ${hn.motor.awg}` : ''}`),
    kpi('Leitwerk wirkt', nf(C.np.kFlex * 100, 0), '%', `bei ${nf(P.v, 0)} m/s · bei V_max ${ts ? nf((ts.boom || ts.cone || { etaH: 1 }).etaH * 100, 0) : '–'} %`, C.np.kFlex < 0.9 ? 'bad' : '')
  ].join('');
  later(() => renderConfigMatrix(R));
  renderWire(R); renderTailStruct(R); later(() => renderGround(R));
};
function renderConfigMatrix(RR) {
  if (RR !== currentR()) return;
  const P = S.params, list = cached('cfmat', () => configMatrix(P, S.comps)), cur = RR.C;
  $('#cfm-sub').textContent = `Gleiche Auslegung, nur Rumpfform und Motor getauscht (${TAIL_TYPES[cur.cfg.tail].short}, Trimmung: ${(SEL.trimMode.find(t => t[0] === P.trimMode) || ['', ''])[1]}). Unterschied zur aktuellen Wahl in Klammern. Feld anklicken zum Übernehmen.`;
  const W = Math.max(150, Math.floor(($('#cf-matrix').clientWidth - 110) / 3) - 20);
  let h = `<div class="hd"></div>` + Object.keys(MOTOR_POS).map(k => `<div class="hd c">${esc(MOTOR_POS[k].name)}</div>`).join('');
  for (const fus of Object.keys(FUS_TYPES)) {
    h += `<div class="rh">${esc(FUS_TYPES[fus].name)}</div>`;
    for (const mot of Object.keys(MOTOR_POS)) {
      const r = list.find(x => x.fus === fus && x.mot === mot), C = r.C, sel = fus === P.fusType && mot === cur.cfg.mot && cur.cfg.fus === fus;
      const dm = C.m - cur.m, dp = C.pProp - cur.pProp, soc = r.mis ? r.mis.minE / r.mis.cap * 100 : NaN;
      const why = C.cfg.mot !== mot ? 'nicht möglich' : C.bal.g.boomClear < 0 ? 'Rohr im Propellerkreis' : '';
      h += `<button type="button" class="cell${sel ? ' sel' : ''}${r.ok ? '' : ' na'}" data-fus="${fus}" data-mot="${mot}"${r.ok ? '' : ' aria-disabled="true"'} aria-label="${esc(FUS_TYPES[fus].name)}, ${esc(MOTOR_POS[mot].name)}">` +
        `<span class="lab">${esc(MOTOR_POS[mot].short)}${why ? ` · <span class="crit">${esc(why)}</span>` : ''}</span>${sideThumbSVG(C, W, 90)}` +
        `<span class="nums"><span>Masse</span><b>${nf(C.m, 2)} kg${sel ? '' : ` <span class="${dm < -0.005 ? 'good' : dm > 0.005 ? 'crit' : 'muted'}">(${nfs(dm, 2)})</span>`}</b>` +
        `<span>Leistung</span><b>${nf(C.pProp, 1)} W${sel ? '' : ` <span class="${dp < -0.05 ? 'good' : dp > 0.05 ? 'crit' : 'muted'}">(${nfs(dp, 1)})</span>`}</b>` +
        `<span>Ballast</span><b class="${C.bal.ballast > 0.05 ? 'crit' : ''}">${fmtKg(C.bal.ballast)}</b><span>Kabel</span><b>${nf(C.mass.wire * 1000, 0)} g</b>` +
        `<span>Schublinie</span><b>${nfs((C.bal.g.zP - C.bal.zcg) * 100, 0)} cm</b><span>c_A,H Vollgas</span><b class="${Math.abs(r.clh) > 0.75 ? 'crit' : Math.abs(r.clh) > 0.5 ? 'warn' : ''}">${fin(r.clh) ? nfs(r.clh, 2) : '–'}</b>` +
        `<span>min. SoC</span><b class="${r.mis && !r.mis.ok ? 'crit' : ''}">${fin(soc) ? nf(soc, 0) + ' %' : '–'}</b></span></button>`;
    }
  }
  $('#cf-matrix').innerHTML = h;
}
$('#cf-matrix').addEventListener('click', e => {
  const b = e.target.closest('.cell[data-fus]'); if (!b || b.classList.contains('na')) return;
  S.params.fusType = b.dataset.fus; S.params.motorPos = b.dataset.mot; markPreset(); fillForms(); schedule(true);
});
function renderWire(R) {
  const { C, P } = R, hn = C.harness;
  if (!hn) return;
  if (hn.fixed) {
    $('#wire-sub').textContent = `Feste Kabelmasse ${nf(hn.total * 1000, 0)} g eingestellt (z. B. gewogen), je zur Hälfte im Rumpf und im Flügel.`;
    $('#tbl-wire').innerHTML = `<tbody><tr><td>Kabel und Stecker gesamt</td><td class="n">${nf(hn.total * 1000, 0)} g</td></tr><tr><td>Antriebsleitung (nur Verlustrechnung)</td><td class="n">${esc(hn.motor.awg)}, ${nf(hn.motor.R * 1000, 1)} mΩ</td></tr></tbody>`;
    return;
  }
  const U = hn.U, Icr = C.lvl.pel / U;
  $('#wire-sub').textContent = `Jede Leitung auf ihrem Weg durch Rumpf, Flügel und Leitwerk. Querschnitt nach Spannungsfall (Antrieb 7 % bei ${nf(P.motImax, 0)} A, Solar ${nf(P.wireDropSol, 1)} % bei Spitzenleistung) und Erwärmung (10 A/mm²), Kupfer nach IEC 60028, Leitungsmasse nach SAE AS22759/32. Zuschlag Kabelbaum ${nf(P.wireExtra, 0)} %.`;
  const names = { wmot: 'Antriebsleitung Akku → Regler', wsol: 'Solarleitungen Flügel', wsolht: 'Solarleitung Höhenleitwerk', wservo: 'Servoleitungen', wlight: 'Positionslichter, Flügel-Verbraucher', wfus: 'Bordnetz im Rumpf' };
  const agg = {}; for (const r of hn.runs) { const a = agg[r.key] || (agg[r.key] = { L: 0, m: 0, n: 0, size: null, I: null }); a.L += r.L; a.m += r.m * hn.kx; a.n++; if (r.size) a.size = r.size; if (r.I) a.I = r.I; }
  const rows = Object.entries(agg).map(([k, a]) => `<tr><td>${esc(names[k] || k)}${a.n > 1 ? ` <span class="muted small">${a.n} Abschnitte</span>` : ''}</td><td class="n">${nf(a.L, 1)} m</td><td class="n">${a.size ? esc(a.size.awg) : k === 'wservo' ? '3 × 26 AWG' : k === 'wfus' ? '4 × 26 AWG' : '2 × 24 AWG'}${a.I ? `<div class="small muted">${nf(a.I, 1)} A${a.size && a.size.by ? ' · ' + esc(a.size.by) : ''}</div>` : ''}</td><td class="n">${nf(a.m * 1000, 0)} g</td></tr>`);
  const plugs = hn.plugs.filter(p => p.m > 0).map(p => `<tr><td>${esc(p.n)}</td><td class="n"></td><td class="n"></td><td class="n">${nf(p.m * 1000, 0)} g</td></tr>`);
  const loss = wireLoss(hn, Icr);
  $('#tbl-wire').innerHTML = `<thead><tr><th>Leitung</th><th class="n">Länge</th><th class="n">Querschnitt</th><th class="n">Masse</th></tr></thead><tbody>${rows.join('')}${plugs.join('')}</tbody>` +
    `<tfoot><tr><td class="lbl">Verkabelung gesamt</td><td></td><td></td><td class="n">${nf(hn.total * 1000, 0)} g</td></tr></tfoot>` +
    `<caption>Antriebsleitung ${nf(hn.motor.L, 2)} m (einfach), Widerstand Hin und Rück ${nf(hn.motor.R * 1000, 1)} mΩ: im Reiseflug ${nf(Icr, 1)} A, Verlust ${nf(loss, 2)} W; bei Höchststrom ${nf(hn.motor.I * hn.motor.R, 2)} V Spannungsfall (${nf(hn.motor.I * hn.motor.R / U * 100, 1)} %). Längen enthalten 15 cm Reserve je Anschluss.</caption>`;
}
function renderTailStruct(R) {
  const { C, P } = R, ts = C.struct ? C.struct.tail : null, cf = C.cfg, tg = C.tail;
  if (!ts) { $('#tbl-tail').innerHTML = ''; $('#kpis-tail').innerHTML = ''; $('#tl-sub').textContent = 'Feste Strukturmasse eingestellt: keine Bemessung.'; return; }
  const part = ts.boom || ts.cone, wc = ts.boom ? ts.boom.cases : (ts.cone.worst ? [ts.cone.worst] : []);
  $('#tl-sub').textContent = `Bruchlasten (× ${nf(P.safety, 2)}) an der Einspannung des ${ts.boom ? 'Trägers' : 'Röhrenquerschnitts mit der größten Auslastung'}: Manöver bei V_A = ${nf(ts.VA, 1)} m/s, Böe ${nf(P.gustU, 1)} m/s, Landestoß ${nf(ts.nLand, 1)} g (seitlich ${nf(ts.nY, 1)} g). Dünnwandiges Rohr mit Festigkeit, Schub und Beulen (NASA SP-8007).`;
  const rows = wc.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${nf(c.M, 1)} N·m</td><td class="n">${nf(c.T, 1)} N·m</td><td class="n">${nf((c.w ? c.w.t : 0) * 1000, 2)} mm<div class="small muted">${c.w ? esc(c.w.by) : ''}</div></td></tr>`);
  $('#tbl-tail').innerHTML = `<thead><tr><th>Lastfall</th><th class="n">Biegung</th><th class="n">Torsion</th><th class="n">Wand nötig</th></tr></thead><tbody>${rows.join('')}</tbody>` +
    `<caption>${ts.boom ? `Rohr ${nf(P.boomD * 1000, 0)} mm, ${esc(ts.boom.mat.name)}: eingestellt ${nf(P.boomLin * 1000, 0)} g/m (Wand ${nf(P.boomLin / (ts.boom.mat.rho * 2 * Math.PI * ts.boom.r) * 1000, 2)} mm), nötig ${nf(ts.boom.linReq * 1000, 0)} g/m.` : `Röhre aus ${esc(SHELL_QI.name)}, Mindest-Flächengewicht ${nf(P.wCone * 1000, 0)} g/m², im Mittel ${nf(ts.cone.wEff * 1000, 0)} g/m².`} Seitenleitwerk mit ${ts.fin.info ? `Zusatzholm ${fmtKg(ts.fin.extra)} (${esc(ts.fin.info.by)}${ts.fin.info.fT ? `, 1. Biegung ≥ ${nf(ts.fin.info.fT, 0)} Hz` : ''})` : 'Grundbauweise'}.</caption>`;
  $('#kpis-tail').innerHTML = [
    kpi(ts.boom ? 'Träger ausgelastet' : 'Röhre ausgelastet', nf((ts.boom ? ts.boom.util : ts.cone.util) * 100, 0), '%', ts.boom ? `nötige Wand / eingestellte Wand` : 'nötig / Mindest-Flächengewicht', (ts.boom ? ts.boom.util : ts.cone.util) > 1 ? 'bad' : ''),
    kpi('HLW-Wirkung V_max', nf(part.etaH * 100, 0), '%', `elastisch · bei Reisefahrt ${nf(C.np.kFlex * 100, 0)} %`, part.etaH < 0.8 ? 'bad' : ''),
    kpi('SLW-Wirkung V_max', nf(part.etaV * 100, 0), '%', 'elastisch (Querbiegung)', part.etaV < 0.8 ? 'bad' : ''),
    kpi('Leitwerkslasten', nf(ts.LH, 0), 'N', `Höhenleitwerk · Seitenleitwerk ${nf(ts.LV, 0)} N je Fläche · einseitig ${nf(ts.asym, 1)} N·m`)
  ].join('');
}
function renderGround(RR) {
  if (RR !== currentR()) return;
  const { C, P } = RR, ld = C.land, lc = cached('launch', () => launchCheck(C)), pc = propClearance(C);
  $('#gr-sub').textContent = `Landestoß nach Currey: Flügel trägt beim Aufsetzen 2/3 des Gewichts (CS-23.473), ${ld.skid ? 'GFK-Blattfeder gleicher Festigkeit (Wirkungsgrad 0,5)' : 'Schaumstoffboden (Wirkungsgrad 0,7)'}. Start am Startplatz bei ${nf(P.tMax, 0)} °C und ${nf(P.alt, 0)} m (Luftdichte ${nf(lc.rho, 3)} kg/m³), Flugbahn als Punktmasse mit Höchstschub.`;
  const k = [
    kpi('Landestoß', nf(ld.nCG, 1), 'g', `am Schwerpunkt · ${nf(ld.v, 1)} m/s Sinken, ${nf(ld.d * 100, 1)} cm Federweg · Arbeit ${nf(ld.E, 1)} J`, ld.nCG > 10 ? 'bad' : ''),
    kpi(ld.skid ? 'Kufe' : 'Rumpfboden', nf(ld.mass * 1000, 0), 'g', ld.skid ? `Feder ${nf(ld.mSpring * 1000, 0)} g + Beschläge${ld.hook ? ' + Katapulthaken' : ''} · Widerstand ${nf(P.skidCdA, 1)} cm²` : `Verstärkung ${nf(P.wBelly * 1000, 0)} g/m²${ld.hook ? ' + Katapulthaken' : ''}`),
    kpi('Mindestfahrt Startplatz', nf(lc.Vs, 1), 'm/s', `Startgeschwindigkeit ${nf(lc.Vreq, 1)} m/s · Schub/Gewicht ${nf(lc.TW, 2)}`)
  ];
  if (lc.kind === 'catapult') k.push(kpi('Katapult', nf(lc.nx, 1), 'g', `${nf(P.launchRail, 1)} m Schiene · ${nf(lc.E, 0)} J Startenergie`, lc.nx > P.nLaunchMax ? 'bad' : ''));
  else k.push(kpi('Handstart', nf(lc.V0, 1), 'm/s', `Abwurf · nötig ${nf(lc.Vreq, 1)} m/s`, lc.short ? 'bad' : ''));
  $('#kpis-ground').innerHTML = k.join('');
  const msg = [];
  const sim = lc.sim;
  if (sim.crash) msg.push(pillF('crit', `Nach dem ${lc.kind === 'catapult' ? 'Katapult' : 'Abwurf'} sinkt das Flugzeug auf den Boden: ${lc.kind === 'catapult' ? 'Schiene verlängern oder steiler stellen' : 'Katapult verwenden oder schneller werfen'}`, 'launch', 'launch'));
  else msg.push(pillF(sim.hMin < 0.6 ? 'warn' : 'good', `Tiefster Punkt ${nf(sim.hMin, 2)} m über Grund${sim.tSafe != null ? `, sicher im Steigflug nach ${nf(sim.tSafe, 1)} s` : ''}`, 'launch', 'launch'));
  if (lc.kind === 'catapult' && lc.nx > P.nLaunchMax) msg.push(pill('warn', `Startbeschleunigung ${nf(lc.nx, 1)} g über der zulässigen ${nf(P.nLaunchMax, 1)} g: längere Schiene`));
  if (lc.kind === 'hand' && C.m > 8) msg.push(pill('warn', `${nf(C.m, 1)} kg lassen sich kaum sicher werfen: Katapult vorsehen`));
  if (lc.kind === 'hand' && C.cfg.mot === 'pusher') msg.push(pill('warn', 'Handstart mit Druckpropeller: Wurfhand nahe am Propellerkreis'));
  if (ld.nCG > 10) msg.push(pillF('warn', `Landestoß ${nf(ld.nCG, 1)} g: Akkuhalter und Kameras auf diese Last auslegen oder mehr Federweg`, 'land', 'land'));
  msg.push(pill(pc.need === 'free' ? 'good' : 'info', pc.need === 'free' ? 'Propeller ohne Bodenberührung' : 'Klapppropeller nötig'));
  $('#gr-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  const pts = sim.pts;
  if (pts.length > 2) lineChart($('#ch-launch'), { h: 200, title: 'Flugbahn nach dem Start', x: { min: 0, max: pts[pts.length - 1][0], fmt: v => nf(v, 1) + ' s', title: 'Zeit (s)' }, y: { min: 0, max: niceRange([...pts.map(p => p[1]), ...pts.map(p => p[2])], 0.08, true)[1], fmt: v => nf(v, 0) },
    series: [{ name: 'Höhe über Grund (m)', c: 1, pts: pts.map(p => [p[0], p[1]]), fmt: v => nf(v, 2) + ' m' }, { name: 'Fahrt (m/s)', c: 2, pts: pts.map(p => [p[0], p[2]]), fmt: v => nf(v, 1) + ' m/s' }],
    hlines: [{ y: sim.vSafe, label: `1,2 × V_s = ${nf(sim.vSafe, 1)} m/s` }] });
}

/* ---------- Ansicht Ruder ---------- */
const ctrlData = C => cached('ctrl', () => controlSurfaces(C, dynData(C).flex));
RENDER.ruder = (R) => { $('#ru-sub').textContent = 'Wird gerechnet …'; later(() => renderRuder(R)); };
function renderRuder(RR) {
  if (RR !== currentR()) return;
  const { C, P } = RR, cs = ctrlData(C), a = cs.ail, e = cs.elev, r = cs.rud, lv = l => LVL_TXT[l];
  $('#ru-sub').textContent = `Querruder ${nf(a.e0 * 100, 0)}–${nf(a.e1 * 100, 0)} % der Halbspannweite, ${nf(P.ailCf * 100, 0)} % tief (Wirksamkeit ${nf(a.tau0, 2)}); Höhenruder ${e.all ? 'als Pendelruder' : nf(P.elevCf * 100, 0) + ' % tief (' + nf(e.tau0, 2) + ')'}; Seitenruder ${nf(P.rudCf * 100, 0)} % tief (${nf(r.tau0, 2)}). Profiltheorie mit Abminderung für große Ausschläge (DATCOM).`;
  const elW = e.cases.reduce((x, c) => (Math.abs(c.deg) > Math.abs(x.deg) ? c : x), e.cases[0]);
  $('#kpis-ru').innerHTML = [
    kpi('Rollen 60° Reiseflug', fin(a.rB.t) ? nf(a.rB.t, 2) : '–', 's', `${lv(a.lvlB)} · gefordert 1,7 s (MIL-F-8785C, Kl. I, Kat. B) · pb/2V ${nf(a.rB.pb2V, 3)}`, a.lvlB > 1 ? 'bad' : ''),
    kpi('Rollen 30° im Anflug', fin(a.rC.t) ? nf(a.rC.t, 2) : '–', 's', `${lv(a.lvlC)} · gefordert 1,3 s (Kat. C) bei ${nf(a.Va, 1)} m/s`, a.lvlC > 1 ? 'bad' : ''),
    kpi('Querruder bei V_max', nf(a.etaVmax * 100, 0), '%', `elastischer Flügel · Umkehr bei ${fin(a.VR) ? nf(a.VR, 1) + ' m/s' : 'keiner'}`, a.etaVmax < 0.5 || a.VR < 1.2 * P.vmax ? 'bad' : ''),
    kpi('Höhenruder größter Ausschlag', nfs(elW.deg, 1), '°', `${esc(elW.name)} · Vollausschlag ±${nf(P.elevMax, 0)}°`, Math.abs(elW.deg) > P.elevMax ? 'bad' : ''),
    kpi('Höhenruder je g', nf(e.dPerG, 1), '°/g', `bei ${nf(P.v, 1)} m/s · Nickdämpfung überwiegt bei kleiner Flächenbelastung`),
    kpi('Seitenruder größter Ausschlag', nf(r.maxDeg, 1), '°', `von ±${nf(P.rudMax, 0)}° · Schiebeflug ${nf(r.beta * RAD, 1)}°`, r.maxDeg > P.rudMax ? 'bad' : ''),
    kpi('Negatives Wendemoment', nf(a.adverse * 100, 1), '%', `Cn_δa/Cl_δa · Seitenruder ${nf(Math.abs(r.drAdverse) * RAD, 1)}° zum Ausgleich`),
    kpi('Servo größtes Moment', nf(Math.max(...cs.servo.map(s => s.kgcm)), 1), 'kg·cm', 'mit Faktor 1,5 auf das Gelenkmoment (Profiltheorie, eher zu hoch)')
  ].join('');
  const msg = [];
  for (const c of e.cases) if (Math.abs(c.deg) > P.elevMax) msg.push(pillF('crit', `Höhenruder reicht nicht: ${c.name} braucht ${nfs(c.deg, 0)}°`, 'ctrl-elev'));
  else if (Math.abs(c.deg) > 0.8 * P.elevMax) msg.push(pillF('warn', `${c.name}: ${nfs(c.deg, 0)}° (über 80 % des Vollausschlags)`, 'ctrl-elev'));
  for (const c of e.cases) if (Math.abs(c.CLh) > 0.85 * e.ClhMax) msg.push(pill('warn', `Höhenleitwerk nahe am Abriss: ${c.name} (c_A,H ${nfs(c.CLh, 2)})`));
  if (a.lvlB > 1 || a.lvlC > 1) msg.push(pillF('warn', 'Rollen langsamer als MIL-F-8785C Level 1: Querruder länger, tiefer oder weiter ausschlagen', 'ctrl-roll'));
  if (a.VR < 1.2 * P.vmax) msg.push(pillF('crit', `Querruderumkehr bei ${nf(a.VR, 0)} m/s unter 1,2 × V_max: torsionssteifere Nase oder Ruder weiter innen`, 'ctrl-rev'));
  if (r.maxDeg > P.rudMax) msg.push(pillF('crit', `Seitenruder reicht nicht (${nf(r.maxDeg, 0)}° nötig)`, 'ctrl-rud'));
  if (Math.abs(r.pwTrim.dr) * RAD > 5) msg.push(pill('info', `Drall bei Vollgas braucht ${nf(Math.abs(r.pwTrim.dr) * RAD, 1)}° Seitenruder`));
  if (a.cellOverAil) msg.push(pill('warn', `Solarzellen reichen bis ${nf(P.cellX1, 0)} % der Tiefe, das Querruder beginnt bei ${nf((1 - P.ailCf) * 100, 0)} %: Zellen auf dem Ruder oder Ruder schmaler`));
  if (!msg.length) msg.push(pill('good', 'Alle Ruder mit Reserve ausgelegt'));
  $('#ru-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  // Höhenruder-Trimmkurven
  const cv = e.curves, all = [...cv.off, ...cv.on, ...cv.full].map(p => p[1]), yr = niceRange([...all, P.elevMax, -P.elevMax].map(v => clamp(v, -2 * P.elevMax, 2 * P.elevMax)), 0.05);
  $('#el-sub').textContent = `Ausschlag zum Trimmen über der Fahrt (negativ: Hinterkante hoch). Bezug: Reiseflug ohne Ausschlag (Einstellwinkel des Höhenleitwerks entsprechend gewählt). Mit Schubmoment, Strahl am Leitwerk und nachgiebigem Träger.`;
  lineChart($('#ch-elev'), { h: 230, x: { min: cv.off[0][0], max: cv.off[cv.off.length - 1][0], fmt: v => nf(v, 0), tipFmt: v => nf(v, 1) + ' m/s', title: 'Fluggeschwindigkeit (m/s)' }, y: { min: yr[0], max: yr[1], fmt: v => nf(v, 0) + '°' },
    series: [{ name: 'Motor aus', c: 2, pts: cv.off, fmt: v => nfs(v, 1) + '°' }, { name: 'Reiseflug (Schub = Widerstand)', c: 1, pts: cv.on, fmt: v => nfs(v, 1) + '°' }, { name: 'Vollgas', c: 4, pts: cv.full, fmt: v => nfs(v, 1) + '°' }],
    hlines: [{ y: -P.elevMax, label: `Vollausschlag −${nf(P.elevMax, 0)}°` }, { y: P.elevMax, label: `+${nf(P.elevMax, 0)}°` }], vlines: [{ x: P.v, label: 'Reise' }] });
  $('#tbl-elev').innerHTML = `<thead><tr><th>Fall</th><th class="n">Fahrt</th><th class="n">n</th><th class="n">c_A,H</th><th class="n">Ausschlag</th></tr></thead><tbody>` +
    e.cases.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${nf(c.V, 1)} m/s</td><td class="n">${nf(c.n, 1)}</td><td class="n ${Math.abs(c.CLh) > 0.85 * e.ClhMax ? 'warn' : ''}">${nfs(c.CLh, 2)}</td><td class="n ${Math.abs(c.deg) > P.elevMax ? 'crit' : !c.ok ? 'warn' : ''}">${nfs(c.deg, 1)}°</td></tr>`).join('') +
    `</tbody><caption>Schwerpunkt vorn/hinten: ± ${nf(P.cgTol, 1)} cm. Höhenleitwerk erreicht etwa c_A,H ±${nf(e.ClhMax, 2)} (Profil plus Ruder). Höhenruder je g ${nf(e.dPerG, 1)}°: Ausschlag für zusätzliches Lastvielfaches bei Reisefahrt (Etkin & Reid).</caption>`;
  // Rollen
  $('#roll-sub').textContent = `Querlage über der Zeit bei Vollausschlag ${nf(P.ailMax, 0)}° aus dem Geradeausflug (Einfreiheitsgrad-Modell, Rollzeitkonstante ${nf(a.rB.tau, 2)} s, elastische Wirksamkeit eingerechnet).`;
  const t1 = Math.max(2.5, (fin(a.rB.t) ? a.rB.t : 2) * 1.3);
  lineChart($('#ch-roll'), { h: 210, x: { min: 0, max: t1, fmt: v => nf(v, 1) + ' s' }, y: { min: 0, max: 90, ticks: [0, 30, 60, 90], fmt: v => nf(v, 0) + '°' },
    series: [{ name: `Reiseflug ${nf(a.Vc, 1)} m/s`, c: 1, pts: (a.rB.curve || []).filter(p => p[0] <= t1), fmt: v => nf(v, 1) + '°' }, { name: `Anflug ${nf(a.Va, 1)} m/s`, c: 2, pts: (a.rC.curve || []).filter(p => p[0] <= t1), fmt: v => nf(v, 1) + '°' }],
    hlines: [{ y: 60, label: 'Kat. B: 60° in 1,7 s' }, { y: 30, label: 'Kat. C: 30° in 1,3 s' }], vlines: [{ x: 1.7, label: '' }, { x: 1.3, label: '' }] });
  // Elastische Querruderwirksamkeit
  later(() => {
    if (RR !== currentR()) return;
    const A = aeData(C), Vt = Math.max(1.5 * P.vmax, fin(a.VR) ? Math.min(a.VR * 1.2, 4 * P.vmax) : 2 * P.vmax), pts = [];
    const hA = hingeCoef(clamp(P.ailCf, 0.05, 0.6)), t0 = flapTau(clamp(P.ailCf, 0.05, 0.6));
    for (let i = 0; i <= 30; i++) { const V = Math.max(1, Vt * i / 30); let ef = NaN; try { ef = aileronElastic(A.A.bm, V, 0.5 * C.rho * V * V, a.e0, a.e1, t0 * 0.85, hA.Cmd * 0.85); } catch (er) { /* ohne Modell */ } pts.push([V, ef]); }
    $('#ae-ail-sub').textContent = `Rollgeschwindigkeit je Ausschlag, elastisch gegen starr. Das Ruder verdreht den Flügel nach unten (Moment c_m,δ ${nf(hA.Cmd, 2)} je rad) und nimmt sich so Wirkung; bei der Umkehrgeschwindigkeit rollt das Flugzeug falsch herum.`;
    lineChart($('#ch-ailel'), { h: 210, x: { min: 0, max: Vt, fmt: v => nf(v, 0), tipFmt: v => nf(v, 1) + ' m/s', title: 'Fluggeschwindigkeit (m/s)' }, y: { min: Math.min(-0.2, ...pts.map(p => p[1]).filter(fin)), max: 1.05, fmt: v => nf(v * 100, 0) + ' %' },
      series: [{ name: 'Querruderwirksamkeit', c: 1, pts, fmt: v => nf(v * 100, 1) + ' %' }], hlines: [{ y: 0, label: '' }], vlines: [{ x: P.vmax, label: 'V_max' }, { x: 1.2 * P.vmax, label: '1,2·V_max' }].concat(fin(a.VR) && a.VR < Vt ? [{ x: a.VR, label: 'Umkehr' }] : []), legend: false });
  });
  // Seitenruder
  const rd = v => `${nfs(v * RAD, 1)}°`;
  $('#rd-sub').textContent = 'Stationärer Schiebeflug bei Seitenwind im Anflug (Nelson): Querlage, Quer- und Seitenruder halten den Schiebewinkel. Drall und Motormoment bei Vollgas (Richtung je nach Drehsinn).';
  $('#tbl-rud').innerHTML = `<thead><tr><th>Fall</th><th class="n">Seitenruder</th><th class="n">Querruder</th><th class="n">Querlage</th></tr></thead><tbody>` +
    `<tr><td>Seitenwind ${nf(Math.max(P.vCross, 0.2 * C.vs), 1)} m/s, Schiebewinkel ${nf(r.beta * RAD, 1)}°</td><td class="n ${Math.abs(r.cross.dr) * RAD > P.rudMax ? 'crit' : ''}">${rd(r.cross.dr)}</td><td class="n">${rd(r.cross.da)}</td><td class="n">${rd(r.cross.phi)}</td></tr>` +
    `<tr><td>Vollgas: Drall ${nf(Math.abs(r.pwTrim.swV || 0) * RAD, 1)}° am Seitenleitwerk, Motormoment</td><td class="n">${rd(Math.abs(r.pwTrim.dr))}</td><td class="n">${rd(Math.abs(r.pwTrim.da))}</td><td class="n">–</td></tr>` +
    `<tr><td>Querruder voll, negatives Wendemoment ausgleichen</td><td class="n">${rd(Math.abs(r.drAdverse))}</td><td class="n">±${nf(P.ailMax, 0)}°</td><td class="n">–</td></tr>` +
    `</tbody><caption>Cn_δr ${nf(r.CnDr, 4)} je rad (Strahl und elastischer Träger eingerechnet), Cl_δa ${nf(a.ClDa, 3)}, Cn_δa ${nf(a.CnDa, 4)} je rad (Wirbelgitter, Trefftz-Ebene).</caption>`;
  // Gelenkmomente
  $('#sv-sub').textContent = 'Vollausschlag bei V_A und ein Drittel davon bei V_max, Anstellwinkel bzw. Schiebewinkel gleichsinnig; Gelenkmoment nach der Profiltheorie (gemessen meist 50–70 % davon). Servo mit Faktor 1,5.';
  $('#tbl-servo').innerHTML = `<thead><tr><th>Ruder</th><th class="n">Gelenkmoment</th><th class="n">Servo</th></tr></thead><tbody>` +
    cs.servo.map(s => `<tr><td>${esc(s.name)}<div class="small muted">${nf(s.Sf * 1e4, 0)} cm², Rudertiefe ${nf(s.cf * 100, 1)} cm</div></td><td class="n">${nf(s.H, 2)} N·m</td><td class="n">${nf(s.kgcm, 1)} kg·cm<div class="small muted">${nf(s.req, 2)} N·m</div></td></tr>`).join('') +
    `</tbody><caption>Gelenkmomentbeiwerte (je rad): Querruder C_h,α ${nf(a.h.Ca, 2)}, C_h,δ ${nf(a.h.Cd, 2)}; ${e.all ? 'Pendelruder' : `Höhenruder ${nf(e.h.Ca, 2)} / ${nf(e.h.Cd, 2)}`}; Seitenruder ${nf(r.h.Ca, 2)} / ${nf(r.h.Cd, 2)}. Geprüft gegen Theodorsens T-Funktionen.</caption>`;
}

/* ---------- Ansicht Struktur: ganzes Flugzeug, Leitwerk und Ruder ---------- */
const vibData = C => cached('vib', () => vibAnalysis(C));
function renderVib(RR) {
  if (RR !== currentR()) return;
  const { C, P } = RR, ids = ['#kpis-vib', '#vib-msg', '#tbl-vib', '#tbl-bal', '#bal-note', '#tbl-gvt', '#gvt-note'];
  if (!C.struct) { ids.forEach(s => { $(s).innerHTML = ''; }); $('#vib-sub').textContent = 'Braucht das Bauweisen-Modell der Struktur.'; return; }
  const V = vibData(C), vD = P.vmax, vR = V.vReq, cf = C.cfg, tg = C.tail;
  const fv = v => (v ? nf(v, 1) : '> ' + nf(V.vMax, 0));
  const hz = w => (fin(w) && w > 0 ? nf(w / (2 * Math.PI), 1) + ' Hz' : '–');
  const el = ms => ms.filter(m => !m.rigid && m.omega > 0);
  const anti1 = el(V.free.anti)[0], spR = V.bff.spRigid, spE = V.bff.sp, spD = V.spDyn;
  $('#vib-sub').textContent = `Freies Flugzeug mit Rumpf als Starrkörper, Leitwerke auf ${V.fin.M.sp.kind === 'Träger' ? 'dem nachgiebigen Träger' : 'der nachgiebigen Rumpfröhre'}, Ruder als eigene Freiheitsgrade (Theodorsen, NACA Report 496). Strukturdämpfung g = 0,03 (AC 23.629-1B). Ziel: flatterfrei bis 1,2 × V_D = ${nf(vR, 0)} m/s im Betrieb, bis V_D = ${nf(vD, 0)} m/s mit freiem Ruder (Servoausfall, Spiel).`;
  const freeMin = [V.ail, V.fin, V.ht].reduce((a, c) => (c.free && c.free.vf && (!a || c.free.vf < a) ? c.free.vf : a), null);
  $('#kpis-vib').innerHTML = [
    kpi('Flatterfrei im Betrieb', V.vfMin ? nf(V.vfMin, 1) : '> ' + nf(V.vMax, 0), 'm/s', `kleinster Fall · Ziel ${nf(vR, 0)} m/s`, V.ok ? 'ok' : 'bad'),
    kpi('Ruder frei', freeMin ? nf(freeMin, 1) : '> ' + nf(V.vMax, 0), 'm/s', `Servoausfall oder Spiel · Ziel ${nf(vD, 0)} m/s`, V.okFree ? 'ok' : ''),
    kpi('1. Biegung frei', V.b1 ? nf(V.b1.f, 2) : '–', 'Hz', `symmetrisch · antimetrisch ${anti1 ? nf(anti1.f, 2) : '–'} Hz · Torsion ${V.t1 ? nf(V.t1.f, 1) : '–'} Hz`),
    kpi('Anstellwinkelschwingung', spR ? nf(spR.wn, 1) : '–', 'rad/s', `starr · Flugdynamik ${spD ? nf(spD.wn, 1) : '–'} rad/s · mit Flügelbiegung ${spE ? nf(spE.wn, 1) : '–'} rad/s`)
  ].join('');
  const msg = [];
  const fidOf = k => ({ wing: 'ae-flutter', bff: 'vib-bff', ail: 'vib-ctrl', fin: 'vib-tail', ht: 'vib-tail' }[k]);
  for (const c of V.cases) if (!c.ok) msg.push(pillF('crit', `${c.name}: Flattern bei ${nf(c.vf, 1)} m/s, unter 1,2 × V_D`, fidOf(c.k)));
  if (V.ok) msg.push(pillF('good', `Im Betrieb flatterfrei bis ${V.vfMin ? nf(V.vfMin, 0) + ' m/s' : 'über ' + nf(V.vMax, 0) + ' m/s'}`, 'ae-req'));
  const surf = [['Querruder', V.ail], ['Seitenruder', V.fin], ['Höhenruder', V.ht]];
  for (const [n, c] of surf) if (c.free && c.free.vf && c.free.vf < vD) msg.push(pillF('warn', `${n} frei flattert ab ${nf(c.free.vf, 1)} m/s: Massenausgleich ${fin(c.needFree) ? '≥ ' + nf(c.needFree * 100, 0) + ' %' : 'reicht nicht'} oder spielfreie, selbsthemmende Anlenkung`, 'vib-bal'));
  if (V.bff.vf && V.bff.vf < vR) msg.push(pillF('crit', `Freiflug-Flattern (Anstellwinkelschwingung mit Flügelbiegung) bei ${nf(V.bff.vf, 1)} m/s`, 'vib-bff'));
  else if (fin(V.bff.ratio) && V.bff.ratio < 2) msg.push(pillF('info', `1. Flügelbiegung nur ${nf(V.bff.ratio, 1)} × über der Anstellwinkelschwingung: Freiflug-Flattern im Standschwingversuch und Flugversuch beobachten`, 'vib-bff'));
  const r45 = V.r45; msg.push(pillF(r45.ratio <= 1 ? 'info' : 'warn', `Report 45 (nur Orientierung): Torsionsnachgiebigkeit F = ${nf(r45.F * 1e3, 2)}·10⁻³ rad·m²/N, ${nf(r45.ratio * 100, 0)} % der Grenze 200/V_D²`, 'vib-r45'));
  if (cf.tail === 'T') msg.push(pill('info', 'T-Leitwerk: Luftkräfte am Höhenleitwerk bei Seitenleitwerksschwingungen nicht erfasst, Standschwingversuch nötig'));
  if (cf.mot === 'fin') msg.push(pill('info', 'Motor auf dem Seitenleitwerk: Propeller-Wirbelflattern (Whirl Flutter) nicht gerechnet'));
  $('#vib-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  const row = (name, how, vf, wf, req, ok) => `<tr><td>${esc(name)}<div class="small muted">${how}</div></td><td class="n">${fv(vf)} m/s</td><td class="n">${vf ? hz(wf) : '–'}</td><td class="n">${nf(req, 0)} m/s</td><td class="${ok ? 'good' : 'crit'}">${ok ? '✓' : '× Flattern'}</td></tr>`;
  const fN = c => (c.fNom ? `${c.fNom.measured ? 'gemessen' : 'aus Steifigkeit'} ${nf(c.fNom.f, 0)} Hz` : '');
  const rows = [
    row('Flügel eingespannt', `Biegung und Torsion${V.kEI !== 1 || V.kGJ !== 1 ? ', auf Standversuch geeicht' : ''}`, V.wing.vf, V.wing.wf, vR, !(V.wing.vf && V.wing.vf < vR)),
    row('Freies Flugzeug', 'Hub, Nicken, Flügelformen, Höhenleitwerk', V.bff.vf, V.bff.wf, vR, !(V.bff.vf && V.bff.vf < vR)),
    row('Querruder am Servo', `${fN(V.ail)}, untersucht 0,5–1,5-fach`, V.ail.vf, V.ail.wf, vR, V.ail.okOp),
    row('Querruder frei', 'Servoausfall, Spiel', V.ail.free.vf, V.ail.free.wf, vD, V.ail.okFree)
  ];
  for (const [nm, c, rn] of [['Seitenleitwerk', V.fin, 'Seitenruder'], ['Höhenleitwerk', V.ht, 'Höhenruder']]) {
    const slip = c.sV > 1.005 ? `, im Propellerstrahl (${nf((c.sV * c.sV - 1) * 100, 0)} % mehr Staudruck)` : '';
    if (c.all) rows.push(row(nm + ' (Pendelruder)', `Servo als Drehfeder am Träger${slip}`, c.vf, c.wf, vR, c.okOp));
    else { rows.push(row(`${nm} mit ${rn} am Servo`, `${fN(c)}, 0,5–1,5-fach${slip}`, c.vf, c.wf, vR, c.okOp)); rows.push(row(`${rn} frei`, 'Servoausfall, Spiel', c.free.vf, c.free.wf, vD, c.okFree)); }
  }
  $('#tbl-vib').innerHTML = `<thead><tr><th>Fall</th><th class="n">Flattern ab</th><th class="n">Frequenz</th><th class="n">Ziel</th><th>Ergebnis</th></tr></thead><tbody>${rows.join('')}</tbody>` +
    `<caption>Flattergeschwindigkeit als wahre Fahrt bei der Luftdichte der Flughöhe; im Propellerstrahl umgerechnet mit dem Staudruck bei Vollgas und V_max. Ziel 1,2 × V_D nach AC 23.629-1B und ASTM F3093; Fehlerfälle bis V_D sinngemäß CS-25.629(b)(2).</caption>`;
  // Massenausgleich
  const nSeg = Math.max(1, Math.round(P.nAilSeg || 1)), d0 = [
    ['Querruder (je Seite)', V.ail, V.ail.span, nSeg],
    [tg.nFin > 1 ? 'Seitenruder (je Leitwerk)' : 'Seitenruder', V.fin, V.fin.span, 1],
    ['Höhenruder', V.ht, tg.bh, 1]
  ];
  $('#bal-sub').textContent = `Ruder als Platte mit ${nf(P.wCtrl * 1000, 0)} g/m², Schwerpunkt ${nf(P.ctrlXcg, 0)} % der Rudertiefe hinter der Drehachse, Ausgleichsgewicht ein Viertel der Rudertiefe vor der Achse. Eingebaut: ${nf(P.ctrlBal, 0)} % Ausgleich.`;
  const brow = ([name, c, span, nPiece]) => {
    if (c.all || !c.cp) return `<tr><td>${esc(name)}</td><td colspan="5" class="muted">Pendelruder: kein Ruderspalt, Ausgleich über die Lage der Drehachse</td></tr>`;
    const cp = c.cp, m0 = cp.mb0 * span, need = c.need, mBal = fin(need) ? need * cp.mb0 * cp.xb0 / cp.d * span : NaN, mPiece = mBal / nPiece;
    const nTxt = (v) => (fin(v) ? (v > 0 ? nf(v * 100, 0) + ' %' : '0 %') : '> 150 %');
    return `<tr><td>${esc(name)}<div class="small muted">Tiefe ${nf(c.cF * 100, 1)} cm · ${nf(span, 2)} m</div></td><td class="n">${nf(m0 * 1000, 0)} g</td><td class="n">${nTxt(c.needOp)}</td><td class="n">${nTxt(c.needFree)}</td><td class="n">${fin(mBal) ? nf(mBal * 1000, 0) + ' g' : '–'}</td>` +
      `<td class="n">${fin(mPiece) && mPiece > 0 ? `${nf(mPiece * 24 * G, 1)} / ${nf(mPiece * 12 * G, 1)} N<div class="small muted">≥ ${nf(1.5 * c.fMax, 0)} Hz</div>` : '–'}</td></tr>`;
  };
  $('#tbl-bal').innerHTML = `<thead><tr><th>Ruder</th><th class="n">Masse</th><th class="n">Ausgleich Betrieb</th><th class="n">Ausgleich Servo frei</th><th class="n">Gewicht</th><th class="n">Halter 24 g / 12 g</th></tr></thead><tbody>${d0.map(brow).join('')}</tbody>` +
    `<caption>Ausgleich in Prozent des statischen Moments um die Drehachse; Gewicht für den größeren der beiden Werte. Halter: Grenzlast 24 g senkrecht zur Ebene aus Drehachse und Gewicht, 12 g in der Ebene längs der Achse, Eigenfrequenz des Halters mindestens das 1,5-Fache der höchsten beteiligten Eigenfrequenz (AC 23.629-1B, Anhang 1).</caption>`;
  $('#bal-note').innerHTML = 'Ein Gewicht verteilt über die Spannweite wirkt besser als ein einzelnes am Rand. Spiel in Gelenken, Gabelköpfen und Servogetriebe wirkt wie ein freies Ruder: so klein wie möglich halten und im Standversuch prüfen.';
  // Eigenformen für den Standschwingversuch
  const g0 = V.free0, gm = (arr, lab, n) => el(arr).slice(0, n).map(m => ({ lab: `${lab} ${m.label}`, f: m.f }));
  const fmRow = (lab, f, f0, meas) => `<tr><td>${esc(lab)}</td><td class="n">${nf(f, 2)} Hz</td><td class="n">${f0 != null && Math.abs(f0 - f) > 0.005 ? nf(f0, 2) + ' Hz' : '–'}</td><td class="n">${meas > 0 ? nf(meas, 2) + ' Hz' : '–'}</td></tr>`;
  const symC = el(V.free.sym), symU = el(g0.sym), antC = el(V.free.anti), antU = el(g0.anti);
  const gr = [];
  symC.slice(0, 3).forEach((m, i) => gr.push(fmRow(`Flügel symmetrisch ${m.label}`, m.f, symU[i] ? symU[i].f : null, i === 0 && m.kind === 'Biegung' ? P.gvtB1 : 0)));
  antC.slice(0, 3).forEach((m, i) => gr.push(fmRow(`Flügel antimetrisch ${m.label}`, m.f, antU[i] ? antU[i].f : null, 0)));
  if (P.gvtT1 > 0 && V.t1) gr.push(fmRow('Flügel 1. Torsion (geeicht)', V.t1.f, null, P.gvtT1));
  el(V.fin.modes).slice(0, 2).forEach((m, i) => gr.push(fmRow(`Seitenleitwerk ${m.label}`, m.f, null, i === 0 ? P.gvtFin : 0)));
  el(V.ht.modes).slice(0, 2).forEach((m, i) => gr.push(fmRow(`Höhenleitwerk ${m.label}`, m.f, null, i === 0 ? P.gvtHT : 0)));
  for (const [n, c] of [['Querruder dreht am Servo', V.ail], ['Seitenruder dreht am Servo', V.fin], ['Höhenruder dreht am Servo', V.ht]]) if (c.fNom) gr.push(fmRow(n, c.fNom.f, c.fNom.measured ? c.fNom.fCalc : null, c.fNom.measured ? c.fNom.f : 0));
  $('#gvt-sub').textContent = 'Frei aufgehängtes Flugzeug: diese Frequenzen sind im Standschwingversuch zu erwarten. Gemessene Werte links eintragen, dann rechnet der Rechner mit geeichten Steifigkeiten weiter.';
  $('#tbl-gvt').innerHTML = `<thead><tr><th>Eigenform</th><th class="n">Rechnung</th><th class="n">ohne Eichung</th><th class="n">gemessen</th></tr></thead><tbody>${gr.join('')}</tbody>`;
  const kTxt = [['Flügel Biegung', V.kEI], ['Flügel Torsion', V.kGJ], [V.fin.M.sp.kind + ' quer', V.kL], [V.fin.M.sp.kind + ' hoch', V.kV]].filter(([, k]) => Math.abs(k - 1) > 1e-3).map(([n, k]) => `${n} × ${nf(k, 2)}`);
  $('#gvt-note').innerHTML = (kTxt.length ? `<b>Eichfaktoren:</b> ${kTxt.join(' · ')}. ` : '') + 'Eichung über k = (f_gemessen / f_Modell)²; die Massen bleiben, wie sie im Rechner stehen. Aufhängung so weich, dass die Starrkörperfrequenz unter einem Drittel der ersten Flügelbiegung liegt.';
}

/* ---------- Ansicht Formeln ---------- */
RENDER.formeln = () => {
  const sel = $('#fx-ch');
  if (!sel.options.length) sel.innerHTML = `<option value="">Alle Kapitel</option>` + FORMULA_CH.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  if (UI.fxSel) { $('#fx-q').value = ''; sel.value = ''; }
  renderFormulaList();
  $('#fx-sub').textContent = `${FORMULAS.length} Rechenschritte mit Formel, Quelle und Ort im Code; ${Object.keys(LIT).length} Quellen. Die Stellgrößen führen zum Eingabefeld. Dieselben Einträge stehen in docs/BERECHNUNGEN.md im Repository.`;
  $('#fx-lit').innerHTML = Object.entries(LIT).sort((a, b) => a[1].localeCompare(b[1], 'de')).map(([k, t]) => `<li id="lit-${k}">${esc(t)}</li>`).join('');
};
function renderFormulaList() {
  const q = ($('#fx-q').value || '').trim().toLowerCase(), ch = $('#fx-ch').value, out = [];
  for (const [ck, cl] of FORMULA_CH) {
    if (ch && ch !== ck) continue;
    const list = FORMULAS.filter(f => f.ch === ck && (!q || [f.t, f.f, f.v, f.n, f.at, ...(f.p || []).map(k => (PM[k] ? PM[k].l : k)), ...(f.s || []).map(x => LIT[litOf(x).k] || x)].join(' ').toLowerCase().includes(q)));
    if (!list.length) continue;
    out.push(`<h3 class="first">${esc(cl)}</h3>` + list.map(f => `<div class="fx-card${UI.fxSel === f.id ? ' sel' : ''}" id="fx-${f.id}"><h4>${esc(f.t)}</h4><div class="fx">${formulaHTML(f, { link: false, code: true })}</div></div>`).join(''));
  }
  $('#fx-list').innerHTML = out.join('') || '<p class="note">Nichts gefunden.</p>';
  if (UI.fxSel) { const el = document.getElementById('fx-' + UI.fxSel); if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 60); UI.fxSel = null; }
}
$('#fx-q').addEventListener('input', () => renderFormulaList());
$('#fx-ch').addEventListener('change', () => renderFormulaList());

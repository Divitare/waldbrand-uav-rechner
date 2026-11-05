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
    out.push({ fus, mot, C, mis, per, ok: C.cfg.mot === mot && !(C.bal.g.boomClear < 0) });
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
  if (C.np.kFlex < 0.9) msg.push(pill('warn', `Weicher Träger: Höhenleitwerk wirkt bei Reisefahrt nur zu ${nf(C.np.kFlex * 100, 0)} %, Neutralpunkt wandert nach vorn`));
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
        `<span>Schublinie</span><b>${nfs((C.bal.g.zP - C.bal.zcg) * 100, 0)} cm</b><span>min. SoC</span><b class="${r.mis && !r.mis.ok ? 'crit' : ''}">${fin(soc) ? nf(soc, 0) + ' %' : '–'}</b></span></button>`;
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
  if (sim.crash) msg.push(pill('crit', `Nach dem ${lc.kind === 'catapult' ? 'Katapult' : 'Abwurf'} sinkt das Flugzeug auf den Boden: ${lc.kind === 'catapult' ? 'Schiene verlängern oder steiler stellen' : 'Katapult verwenden oder schneller werfen'}`));
  else msg.push(pill(sim.hMin < 0.6 ? 'warn' : 'good', `Tiefster Punkt ${nf(sim.hMin, 2)} m über Grund${sim.tSafe != null ? `, sicher im Steigflug nach ${nf(sim.tSafe, 1)} s` : ''}`));
  if (lc.kind === 'catapult' && lc.nx > P.nLaunchMax) msg.push(pill('warn', `Startbeschleunigung ${nf(lc.nx, 1)} g über der zulässigen ${nf(P.nLaunchMax, 1)} g: längere Schiene`));
  if (lc.kind === 'hand' && C.m > 8) msg.push(pill('warn', `${nf(C.m, 1)} kg lassen sich kaum sicher werfen: Katapult vorsehen`));
  if (lc.kind === 'hand' && C.cfg.mot === 'pusher') msg.push(pill('warn', 'Handstart mit Druckpropeller: Wurfhand nahe am Propellerkreis'));
  if (ld.nCG > 10) msg.push(pill('warn', `Landestoß ${nf(ld.nCG, 1)} g: Akkuhalter und Kameras auf diese Last auslegen oder mehr Federweg`));
  msg.push(pill(pc.need === 'free' ? 'good' : 'info', pc.need === 'free' ? 'Propeller ohne Bodenberührung' : 'Klapppropeller nötig'));
  $('#gr-msg').innerHTML = `<div class="flags">${msg.join('')}</div>`;
  const pts = sim.pts;
  if (pts.length > 2) lineChart($('#ch-launch'), { h: 200, title: 'Flugbahn nach dem Start', x: { min: 0, max: pts[pts.length - 1][0], fmt: v => nf(v, 1) + ' s', title: 'Zeit (s)' }, y: { min: 0, max: niceRange([...pts.map(p => p[1]), ...pts.map(p => p[2])], 0.08, true)[1], fmt: v => nf(v, 0) },
    series: [{ name: 'Höhe über Grund (m)', c: 1, pts: pts.map(p => [p[0], p[1]]), fmt: v => nf(v, 2) + ' m' }, { name: 'Fahrt (m/s)', c: 2, pts: pts.map(p => [p[0], p[2]]), fmt: v => nf(v, 1) + ' m/s' }],
    hlines: [{ y: sim.vSafe, label: `1,2 × V_s = ${nf(sim.vSafe, 1)} m/s` }] });
}

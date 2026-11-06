/* ===================================================================
   Rechenkern Teil 2: Sonnenstand, Einstrahlung auf den gewölbten Flügel,
   Wetterdaten und Wettergenerator, Tages-, Dauerflug- und Jahressimulation.
   =================================================================== */
const NSTEP = 720, DT = 24 / NSTEP; // 2-Minuten-Schritte

/* ---------- Kalender ---------- */
function dayOfYear(ds) {
  const d = new Date(ds + 'T12:00:00Z'); if (isNaN(d)) return 172;
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
}
function yearOf(ds) { const y = Number(String(ds || '').slice(0, 4)); return y > 1900 ? y : 2026; }
function isoOfDay(year, n) { return new Date(Date.UTC(year, 0, n)).toISOString().slice(0, 10); }
function monthOfDay(n) { return new Date(Date.UTC(2026, 0, n)).getUTCMonth(); }
function euDstDoy(year, n) {
  const lastSun = mo => { const last = new Date(Date.UTC(year, mo + 1, 0)); return new Date(Date.UTC(year, mo, last.getUTCDate() - last.getUTCDay())); };
  const d = new Date(Date.UTC(year, 0, n));
  return d >= lastSun(2) && d < lastSun(9);
}
function tzOffset(P, year, n) { return P.tz === 'auto' ? (euDstDoy(year, n) ? 2 : 1) : Number(P.tz); }
const hm = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? Number(m[1]) + Number(m[2]) / 60 : NaN; };

/* ---------- Sonnenstand und Klarhimmel (ASHRAE, Koeffizienten wie im ETH-Werkzeug) ---------- */
const CS_A = [1233, 1230, 1214, 1185, 1135, 1103, 1088, 1085, 1107, 1151, 1192, 1220, 1233, 1230];
const CS_B = [142, 142, 144, 156, 180, 196, 205, 207, 201, 177, 160, 149, 142, 142].map(x => x / 1000);
const CS_C = [57, 58, 60, 71, 97, 121, 134, 136, 122, 92, 73, 57, 57, 57].map(x => x / 1000);
function sunDay(n, lat, lon, alt, offset) {
  const decl = 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365) * DEG;
  const B = 2 * Math.PI * (n - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const d = n - 1, idx = Math.min(12, Math.max(0, Math.floor((d + 15) / 365 * 12))), r = (d + 15 - idx * 365 / 12) / 30;
  const li = a => a[idx] + (a[idx + 1] - a[idx]) * r;
  const la = lat * DEG;
  return {
    n, decl, eot, offset, lat: la, lon, A: li(CS_A), B: li(CS_B), C: li(CS_C),
    ss: Math.sin(la) * Math.sin(decl), cc: Math.cos(la) * Math.cos(decl), t0: offset - lon / 15 - eot / 60 + 12,
    tau: Math.pow(Math.max(0, 1 - alt / 44308), 5.257), E0: 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * n / 365))
  };
}
function sinElev(t, s) { return s.ss + s.cc * Math.cos((t - s.t0) * 15 * DEG); }
function clearSky(cz, s) { // {dni, dhi, ghi}
  if (cz <= 0) return { dni: 0, dhi: 0, ghi: 0 };
  const am = 35 / Math.sqrt(1224 * cz * cz + 1), dni = s.A * Math.exp(-s.B * am * s.tau);
  return { dni, dhi: s.C * dni, ghi: dni * (cz + s.C) };
}
// Sonnenauf- und -untergang (Ortszeit) analytisch aus cos H0 = −tan φ · tan δ; null bei Polartag/-nacht
function sunTimes(s) {
  const c = -s.ss / s.cc;
  if (!(c > -1 && c < 1)) return { rise: null, set: null, polar: c <= -1 ? 'day' : 'night' };
  const h = Math.acos(c) * RAD / 15;
  return { rise: (s.t0 - h + 24) % 24, set: (s.t0 + h + 24) % 24 };
}
// Tagesgang der Lufttemperatur: Minimum bei Sonnenaufgang, Maximum um 15 Uhr Ortszeit
function airTemp(t, tMin, tMax, rise) {
  const r = rise == null ? 6 : rise, pk = 15;
  if (t >= r && t <= pk) return tMin + (tMax - tMin) * (1 - Math.cos(Math.PI * (t - r) / (pk - r))) / 2;
  const tt = t < r ? t + 24 : t;
  return tMin + (tMax - tMin) * (1 + Math.cos(Math.PI * (tt - pk) / (24 - pk + r))) / 2;
}

/* ---------- Einstrahlung auf die Zellen: Profilwölbung, Anstellwinkel, Kurvenflug ----------
   Zellen auf der Profiloberseite zwischen cellX0 und cellX1 der Flügeltiefe. Für jede Zellreihe die
   Flächennormale aus der Profilkontur; gemittelt über alle Kurse zur Sonne (Patrouillen- und Kreisflug).
   Direktanteil mit Einfallswinkel-Modifikator (ASHRAE, b0 = 0,05), Diffus isotrop, Bodenreflexion. */
const IAM_B0 = 0.05;
const iam = c => (c <= 0 ? 0 : Math.max(0, 1 - IAM_B0 * (1 / c - 1)));
function cellPanels(P, foil) {
  const sh = foil.shape, x0 = clamp(P.cellX0 / 100, 0, 0.95), x1 = clamp(P.cellX1 / 100, x0 + 0.02, 1), M = 16, out = [];
  const yu = x => { const X = sh.x; let k = 0; while (k < X.length - 2 && X[k + 1] < x) k++; const t = (x - X[k]) / (X[k + 1] - X[k]); return sh.yu[k] + (sh.yu[k + 1] - sh.yu[k]) * t; };
  let wsum = 0;
  for (let j = 0; j < M; j++) {
    const xa = x0 + (x1 - x0) * j / M, xb = x0 + (x1 - x0) * (j + 1) / M, slope = (yu(xb) - yu(xa)) / (xb - xa);
    const w = Math.hypot(xb - xa, yu(xb) - yu(xa)); wsum += w;
    out.push({ slope, w });
  }
  out.forEach(p => { p.w /= wsum; });
  return { panels: out, arc: wsum / (x1 - x0), x0, x1 };
}
function geomFactors(panels, pitch, roll, dihedral, layout, nPsi = 36) {
  // Normalen im Körpersystem (x vorn, y rechts, z oben) für beide Flügelhälften
  const halves = [roll + dihedral, roll - dihedral].map(ph => panels.map(p => {
    const nn = Math.hypot(p.slope, 1); let nx = p.slope / nn, nz = 1 / nn;
    const x2 = nx * Math.cos(pitch) - nz * Math.sin(pitch), z2 = nx * Math.sin(pitch) + nz * Math.cos(pitch);
    return { x: x2, y: -z2 * Math.sin(ph), z: z2 * Math.cos(ph), w: p.w };
  }));
  let Fd = 0, Fg = 0;
  for (const H of halves) for (const n of H) { Fd += n.w * (1 + n.z) / 2 * 0.95 / 2; Fg += n.w * (1 - n.z) / 2 * 0.95 / 2; }
  const Fb = new Float64Array(91);
  for (let k = 0; k <= 90; k++) {
    const e = k * DEG, ce = Math.cos(e), se = Math.sin(e);
    let acc = 0;
    for (let ip = 0; ip < nPsi; ip++) {
      const ps = 2 * Math.PI * (ip + 0.5) / nPsi, sx = ce * Math.cos(ps), sy = ce * Math.sin(ps);
      for (const H of halves) {
        if (layout === 'chord') { let mn = Infinity; for (const n of H) { const c = n.x * sx + n.y * sy + n.z * se; mn = Math.min(mn, c > 0 ? c * iam(c) : 0); } acc += mn / 2; }
        else for (const n of H) { const c = n.x * sx + n.y * sy + n.z * se; if (c > 0) acc += n.w * c * iam(c) / 2; }
      }
    }
    Fb[k] = acc / nPsi;
  }
  return { Fb, Fd, Fg };
}
const geoCache = new Map();
function solarGeometry(P, C) {
  if (P.solarGeom === 'flach') {
    const Fb = new Float64Array(91); for (let k = 0; k <= 90; k++) Fb[k] = Math.sin(k * DEG);
    return { Fb, Fd: 1, Fg: 0, flat: true, lvl: null, turn: null };
  }
  const pitchDeg = Math.round(clamp(C.lvl ? C.lvl.alpha : 4, -5, 15) * 4) / 4, pitch = pitchDeg * DEG, dih = (P.dihedral || 0) * DEG;
  const f = clamp(P.turnFrac / 100, 0, 1);
  const key = [P.airfoil, P.cellX0, P.cellX1, pitchDeg, P.dihedral, P.stringLayout, f > 0 ? P.bank : 0].join('|');
  let g = geoCache.get(key);
  if (!g) {
    const cp = cellPanels(P, C.foil);
    const lvl = geomFactors(cp.panels, pitch, 0, dih, P.stringLayout);
    const turn = f > 0 ? geomFactors(cp.panels, pitch, clamp(P.bank, 0, 60) * DEG, dih, P.stringLayout) : lvl;
    g = { cp, lvl, turn }; if (geoCache.size > 400) geoCache.clear(); geoCache.set(key, g);
  }
  const { cp, lvl, turn } = g;
  const Fb = new Float64Array(91);
  for (let k = 0; k <= 90; k++) Fb[k] = (1 - f) * lvl.Fb[k] + f * turn.Fb[k];
  return { Fb, Fd: (1 - f) * lvl.Fd + f * turn.Fd, Fg: (1 - f) * lvl.Fg + f * turn.Fg, flat: false, lvl, turn, arc: cp.arc, pitch: pitchDeg };
}
const fbAt = (Fb, se) => { if (se <= 0) return 0; const k = Math.asin(Math.min(1, se)) * RAD, i = Math.min(89, Math.floor(k)), t = k - i; return Fb[i] + (Fb[i + 1] - Fb[i]) * t; };

/* ---------- Umgebung eines Tages: Strahlungskomponenten und Lufttemperatur ---------- */
function envClear(P, n, year) {
  const off = tzOffset(P, year, n), s = sunDay(n, P.lat, P.lon, P.alt + P.hAGL, off), st = sunTimes(s), k = P.sky / 100;
  const e = { n, off, rise: st.rise, set: st.set, sinE: new Float64Array(NSTEP), dni: new Float64Array(NSTEP), dhi: new Float64Array(NSTEP), ghi: new Float64Array(NSTEP), T: new Float64Array(NSTEP), src: 'clear' };
  const lap = 0.0065 * P.hAGL;
  for (let i = 0; i < NSTEP; i++) {
    const t = (i + 0.5) * DT, cz = sinElev(t, s), c = clearSky(cz, s);
    e.sinE[i] = cz; e.dni[i] = c.dni * k; e.dhi[i] = c.dhi * k; e.ghi[i] = c.ghi * k;
    e.T[i] = airTemp(t, P.tMin, P.tMax, st.rise) - lap;
  }
  return e;
}
// Erbs et al. (1982): Diffusanteil aus dem stündlichen Klarheitsindex
function erbs(kt) { return kt <= 0.22 ? 1 - 0.09 * kt : kt <= 0.8 ? 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4 : 0.165; }

/* ---------- Wetterdatensätze ----------
   Stündliche Reihe in Datensatzzeit (utc: Zeitzone des Datensatzes, tc: Lage des Stundenwerts).
   Gespeichert werden Klarhimmelindex kc und Diffusanteil fd, damit Sonnenauf- und -untergang minutengenau
   bleiben und die Bewölkung auf einen anderen Ort übertragen werden kann. */
function b64bytes(s) {
  if (typeof atob === 'function') { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  return Uint8Array.from(Buffer.from(s, 'base64'));
}
function prepWeather(site, ghi, dhi, T, ws) {
  const H = ghi.length, kc = new Float32Array(H), fd = new Float32Array(H);
  const days = Math.round(H / 24);
  for (let d = 0; d < days; d++) {
    const n = (d % 365) + 1, s = sunDay(n, site.lat, site.lon, site.elev || 0, site.utc || 0);
    for (let h = 0; h < 24; h++) {
      const i = d * 24 + h; if (i >= H) break;
      const t = h + site.tc, cz = sinElev(t, s), cs = clearSky(cz, s);
      kc[i] = cs.ghi > 25 ? clamp(ghi[i] / cs.ghi, 0, 1.35) : (ghi[i] > 5 ? 1 : 0);
      fd[i] = ghi[i] > 1 ? clamp(dhi[i] / ghi[i], 0, 1) : 1;
    }
  }
  // Nachtstunden mit kc = 0 an Dämmerungsstunden angleichen (für die Interpolation)
  for (let i = 1; i < H - 1; i++) if (kc[i] === 0 && ghi[i] === 0) { const a = kc[i - 1], b = kc[i + 1]; if (a > 0 || b > 0) kc[i] = Math.max(a, b) * 0.999; }
  return { ...site, hours: H, years: H / 8760, kc, fd, T: Float32Array.from(T), ws: Float32Array.from(ws), ghi: Float32Array.from(ghi) };
}
function decodeSite(site) {
  const u = b64bytes(site.data), H = u.length / 4, g = new Float32Array(H), d = new Float32Array(H), T = new Float32Array(H), w = new Float32Array(H);
  for (let i = 0; i < H; i++) { g[i] = u[4 * i] * 5; d[i] = u[4 * i + 1] * 5; T[i] = u[4 * i + 2] / 2 - 40; w[i] = u[4 * i + 3] / 5; }
  return prepWeather({ key: site.key, name: site.name, lat: site.lat, lon: site.lon, elev: site.elev, utc: site.utc, tc: site.tc, src: site.src }, g, d, T, w);
}
function envWeather(P, W, n, yi, year) {
  const off = tzOffset(P, year, n), s = sunDay(n, P.lat, P.lon, P.alt + P.hAGL, off), st = sunTimes(s);
  const e = { n, off, rise: st.rise, set: st.set, sinE: new Float64Array(NSTEP), dni: new Float64Array(NSTEP), dhi: new Float64Array(NSTEP), ghi: new Float64Array(NSTEP), T: new Float64Array(NSTEP), wind: 0, src: W.key };
  const H = W.hours, base = (yi * 365 + n - 1) * 24, lap = 0.0065 * (P.hAGL + P.alt - (W.elev || 0));
  let wsum = 0;
  for (let i = 0; i < NSTEP; i++) {
    const t = (i + 0.5) * DT, tau = base + (t - off) + (W.utc || 0) - W.tc;
    let h0 = Math.floor(tau); const fr = tau - h0; h0 = ((h0 % H) + H) % H; const h1 = (h0 + 1) % H;
    const cz = sinElev(t, s), cs = clearSky(cz, s);
    const kc = W.kc[h0] + (W.kc[h1] - W.kc[h0]) * fr;
    const ghi = kc * cs.ghi;
    let fd;
    if (W.fd) fd = W.fd[h0] + (W.fd[h1] - W.fd[h0]) * fr;
    else fd = cz > 0 ? erbs(ghi / (s.E0 * cz)) : 1;
    let dhi = fd * ghi, dni = cz > 0.03 ? (ghi - dhi) / cz : 0;
    if (dni > cs.dni * 1.15) { dni = cs.dni * 1.15; dhi = Math.max(0, ghi - dni * cz); }
    e.sinE[i] = cz; e.ghi[i] = ghi; e.dhi[i] = dhi; e.dni[i] = Math.max(0, dni);
    e.T[i] = W.T[h0] + (W.T[h1] - W.T[h0]) * fr - lap;
    wsum += W.ws[h0];
  }
  e.wind = wsum / NSTEP;
  return e;
}

/* ---------- Wettergenerator (Bendt et al. 1981, AR(1)-Folge der Tage) ---------- */
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rnd) { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
function bendt(ktMean, ktMin = 0.05) {
  const ktMax = clamp(0.6313 + 0.267 * ktMean - 11.9 * (ktMean - 0.75) ** 8, ktMean + 0.05, 0.9);
  const mean = g => { const a = Math.exp(g * ktMin), b = Math.exp(g * ktMax); return ((ktMin - 1 / g) * a - (ktMax - 1 / g) * b) / (a - b); };
  let lo = -60, hi = 60;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2, g = Math.abs(m) < 1e-6 ? 1e-6 : m; if (mean(g) < ktMean) lo = m; else hi = m; }
  const g = (lo + hi) / 2 || 1e-6;
  return u => Math.log(Math.exp(g * ktMin) - u * (Math.exp(g * ktMin) - Math.exp(g * ktMax))) / g;
}
// Monatskennwerte eines stündlichen Datensatzes (für Generator-Vorlagen)
function monthlyStats(W) {
  const out = Array.from({ length: 12 }, () => ({ h: 0, h0: 0, T: 0, Tn: 0, amp: 0, d: 0, ws: 0 }));
  const days = Math.min(365, Math.floor(W.hours / 24));
  for (let d = 0; d < days; d++) {
    const n = d + 1, m = monthOfDay(n), s = sunDay(n, W.lat, W.lon, W.elev || 0, W.utc || 0), o = out[m];
    let tmax = -99, tmin = 99;
    for (let h = 0; h < 24; h++) {
      const i = d * 24 + h, cz = sinElev(h + W.tc, s);
      o.h += W.ghi[i]; o.h0 += cz > 0 ? s.E0 * cz : 0; o.T += W.T[i]; o.Tn++; o.ws += W.ws[i];
      tmax = Math.max(tmax, W.T[i]); tmin = Math.min(tmin, W.T[i]);
    }
    o.amp += tmax - tmin; o.d++;
  }
  return out.map(o => ({ kt: o.h0 ? o.h / o.h0 : 0, H: o.h / Math.max(1, o.d) / 1000, T: o.T / Math.max(1, o.Tn), amp: o.amp / Math.max(1, o.d), ws: o.ws / Math.max(1, o.Tn) }));
}
// Tägliche extraterrestrische und Klarhimmel-Strahlung (kWh/m²) für Generator und Eingabe in kWh/m²·d
function dailyH0(n, lat) { const s = sunDay(n, lat, 0, 0, 0); let h0 = 0, hc = 0; for (let i = 0; i < 96; i++) { const cz = sinElev((i + 0.5) / 4, s); if (cz > 0) { h0 += s.E0 * cz / 4; hc += clearSky(cz, s).ghi / 4; } } return { h0: h0 / 1000, hc: hc / 1000 }; }
function genWeather(site, months, years, seed) {
  const rnd = mulberry(seed || 1), H = years * 8760;
  const ghi = new Float32Array(H), dhi = new Float32Array(H), T = new Float32Array(H), ws = new Float32Array(H);
  const inv = months.map(m => bendt(clamp(m.kt, 0.08, 0.78)));
  let z = 0, zt = 0;
  for (let y = 0; y < years; y++) for (let d = 0; d < 365; d++) {
    const n = d + 1, m = monthOfDay(n), mm = months[m];
    z = 0.3 * z + Math.sqrt(1 - 0.09) * gauss(rnd); zt = 0.7 * zt + Math.sqrt(1 - 0.49) * gauss(rnd);
    const kt = inv[m](clamp(normCdf(z), 1e-4, 1 - 1e-4));
    const s = sunDay(n, site.lat, site.lon, site.elev || 0, site.utc || 0);
    // Tages-Klarheitsindex → Klarhimmelindex, über den Tag konstant
    let h0 = 0, hc = 0; for (let h = 0; h < 24; h++) { const cz = sinElev(h + site.tc, s); if (cz > 0) { h0 += s.E0 * cz; hc += clearSky(cz, s).ghi; } }
    const kc = hc > 0 ? clamp(kt * h0 / hc, 0, 1.1) : 0;
    const amp = mm.amp * clamp(0.45 + 0.9 * kt / Math.max(0.1, mm.kt) * 0.6, 0.3, 1.5), tMean = mm.T + 2.2 * zt;
    const u = rnd(), wDay = (mm.ws / 0.8862) * Math.pow(-Math.log(1 - u), 0.5); // Weibull k = 2
    const st = sunTimes(s);
    for (let h = 0; h < 24; h++) {
      const i = (y * 365 + d) * 24 + h, t = h + site.tc, cz = sinElev(t, s), cs = clearSky(cz, s), g = kc * cs.ghi;
      ghi[i] = g; dhi[i] = cz > 0 ? erbs(g / (s.E0 * cz)) * g : 0;
      T[i] = airTemp(t, tMean - amp / 2, tMean + amp / 2, st.rise);
      ws[i] = wDay * (0.8 + 0.4 * Math.sin(Math.PI * clamp((h - 6) / 14, 0, 1)));
    }
  }
  const W = prepWeather({ key: 'gen', name: site.name || 'Wettergenerator', lat: site.lat, lon: site.lon, elev: site.elev || 0, utc: site.utc || 0, tc: site.tc, src: 'Generator' }, ghi, dhi, T, ws);
  W.fd = null; // Diffusanteil wird minütlich nach Erbs bestimmt
  return W;
}

/* ---------- Leistungsreihen eines Tages ---------- */
function solarPowerAt(C, e, i) {
  const s = C.sol, P = C.P, se = e.sinE[i];
  const g = e.dni[i] * fbAt(s.Fb, se) + e.dhi[i] * s.Fd + e.ghi[i] * P.albedo * s.Fg;
  if (g <= 0) return 0;
  const Tc = e.T[i] + P.cellHeat * g;
  return g * C.solK * Math.max(0, 1 - P.tempCoef / 100 * (Tc - 25));
}
function dayTurb(t, rise, set, turbDay) {
  if (!(turbDay > 0) || rise == null || set == null) return 0;
  const a = rise + 2.1, b = set - 1.5; if (!(b > a) || t <= a || t >= b) return 0;
  const mid = (a + b) / 2; return 2 * turbDay / 100 * (1 - Math.abs(t - mid) / (mid - a));
}
function inWindow(t, t0, t1) { return t1 >= t0 ? (t >= t0 && t < t1) : (t >= t0 || t < t1); }
function daySeries(C, e) {
  const P = C.P, ps = new Float64Array(NSTEP), pc = new Float64Array(NSTEP), pp = new Float64Array(NSTEP), cold = new Uint8Array(NSTEP);
  const t0 = hm(P.tStart), t1 = hm(P.tEnd), Tk = C.tFly + 273.15, sol = C.sol, Fb = sol.Fb, Fd = sol.Fd, Fg = sol.Fg * P.albedo;
  const solK = C.solK, cH = P.cellHeat, tc = P.tempCoef / 100, pP = C.pProp, cA = C.comp.always, cD = C.comp.day, cN = C.comp.night, cM = C.comp.mission;
  const turb = P.turbDay > 0, cold0 = P.noColdCharge ? -P.battHeat : -1e9;
  for (let i = 0; i < NSTEP; i++) {
    const t = (i + 0.5) * DT, se = e.sinE[i];
    let fb = 0;
    if (se > 0) { const k = Math.asin(se < 1 ? se : 1) * RAD, j = k < 89 ? Math.floor(k) : 89; fb = Fb[j] + (Fb[j + 1] - Fb[j]) * (k - j); }
    const g = e.dni[i] * fb + e.dhi[i] * Fd + e.ghi[i] * Fg;
    ps[i] = g > 0 ? g * solK * Math.max(0, 1 - tc * (e.T[i] + cH * g - 25)) : 0;
    const dens = Math.sqrt((e.T[i] + 273.15) / Tk); // gleiche Fluggeschwindigkeit: grob P ~ 1/sqrt(rho)
    pp[i] = pP * dens * (turb ? 1 + dayTurb(t, e.rise, e.set, P.turbDay) : 1);
    pc[i] = pp[i] + cA + (se > 0 ? cD : cN) + (inWindow(t, t0, t1) ? cM : 0);
    cold[i] = e.T[i] < cold0 ? 1 : 0;
  }
  return { ps, pc, pp, cold, e };
}
// Ladebegrenzung wie ETH (ChargeLimiter.m): bis 90 % max. chargeC·C, darüber exponentiell auf 4,6 %
const LIM_C = -Math.log(0.046);
function chargeLimit(soc, p, cap, cRate) {
  const pMax = cRate * cap;
  if (soc < 0.9) return Math.min(p, pMax);
  if (soc >= 1) return 0;
  return Math.min(p, Math.exp(-LIM_C * (soc - 0.9) / 0.1) * pMax);
}
function stepE(C, E, ps, pc, cold) {
  const P = C.P, net = ps - pc;
  if (net > 0) return cold ? E : Math.min(C.cap, E + chargeLimit(C.cap > 0 ? E / C.cap : 1, net * P.etaCharge / 100, C.cap, P.chargeC) * DT);
  return E + net / (P.etaDischarge / 100) * DT;
}
/* ---------- Energie in der Höhe ----------
   Strategie nach Gao et al. (2013, Energy Conversion and Management 70, 20–30) und Klesh & Kabamba
   (2009, J. Guidance Control Dynamics 32(4)): Solarüberschuss lädt zuerst den Akku; was der Akku nicht
   aufnimmt (voll oder Ladebegrenzung), hebt das Flugzeug bis zur Höchsthöhe h_max über der Einsatzhöhe:
   dh/dt = P_rest·η_Antrieb/(m·g). Bei Fehlbetrag ersetzt Gleiten (Höhe abbauen) die Antriebsleistung, höchstens
   P_Antrieb(h); Bordsysteme und der Rest kommen aus dem Akku.
   Antriebsleistung in der Höhe ∝ ρ^(−1/2) bei gleichem Auftriebsbeiwert, ρ ∝ e^(−h/H), H = R_L·T/g. */
function stepEH(C, st, ps, pc, pp, cold) {
  const P = C.P, hMax = Math.max(0, P.hStore), eta = clamp(C.lvl.eta || 0.6, 0.2, 0.95), mg = C.m * G, H = 29.27 * (C.tFly + 273.15);
  const net = ps - (pc + pp * (Math.exp(st.h / (2 * H)) - 1));
  if (net > 0) {
    const acc = cold ? 0 : chargeLimit(C.cap > 0 ? st.E / C.cap : 1, net * P.etaCharge / 100, C.cap, P.chargeC), E1 = Math.min(C.cap, st.E + acc * DT);
    const used = (E1 - st.E) / DT / (P.etaCharge / 100); st.E = E1;
    const rest = net - used; if (rest > 0 && st.h < hMax) st.h = Math.min(hMax, st.h + rest * eta * DT * 3600 / mg);
  } else {
    // Gleiten ersetzt nur die Antriebsleistung; Bordsysteme und Nutzlast laufen weiter aus dem Akku
    const need = -net, ppH = pp * Math.exp(st.h / (2 * H)), g0 = st.h > 0 ? Math.min(need, ppH) : 0, dh = g0 * eta * DT * 3600 / mg;
    const fromH = dh > 0 ? Math.min(1, st.h / dh) * g0 : 0;
    st.h = Math.max(0, st.h - dh);
    st.E -= (need - fromH) / (P.etaDischarge / 100) * DT;
  }
}
// Gespeicherte Höhenenergie als gleichwertige Akkuenergie (Wh): m·g·h/(η·3600)
const hEnergy = (C, h) => C.m * G * h / (clamp(C.lvl.eta || 0.6, 0.2, 0.95) * 3600);

/* ---------- Einsatz: Start am Morgen mit vollem Akku ---------- */
function climbEnergy(C) { return C.m * G * C.P.hAGL / Math.max(0.2, C.lvl.eta || 0.6) / 3600; }
function mission(C, ser, ser2, record) {
  const P = C.P, t0 = hm(P.tStart), t1 = hm(P.tEnd);
  if (!fin(t0) || !fin(t1) || !(C.cap > 0)) return null;
  const i0 = Math.floor(t0 / DT), dur = ((t1 - t0 + 24) % 24) || 24, nM = Math.round(dur / DT), eRes = C.cap * P.reserve / 100;
  let E = C.cap - climbEnergy(C), minE = E, tRes = null, tEmpty = null, eSol = 0, eCons = 0, peak = 0, endur = null, tFull = null;
  const pts = record ? [] : null, alt = P.hStore > 0, st = { E, h: 0 };
  let hMaxR = 0, tTop = 0;
  for (let s = 0; s < 2 * NSTEP; s++) {
    const i = i0 + s, srs = i < NSTEP ? ser : (ser2 || ser), k = i % NSTEP;
    const ps = srs.ps[k], pc = srs.pc[k];
    if (s < nM) {
      eSol += ps * DT; eCons += pc * DT; if (ps > peak) peak = ps;
      if (record) pts.push([t0 + s * DT, ps, pc, E / C.cap * 100, st.h]);
    }
    if (alt) { st.E = E; stepEH(C, st, ps, pc, srs.pp ? srs.pp[k] : 0, srs.cold[k]); E = st.E; if (s < nM) { if (st.h > hMaxR) hMaxR = st.h; if (st.h >= P.hStore - 1e-6) tTop += DT; } }
    else E = stepE(C, E, ps, pc, srs.cold[k]);
    if (s < nM) {
      if (E < minE) minE = E;
      if (tRes === null && E < eRes) tRes = t0 + (s + 1) * DT;
      if (tEmpty === null && E < 0) tEmpty = t0 + (s + 1) * DT;
      if (tFull === null && E >= C.cap - 1e-6 && s > 0) tFull = t0 + (s + 1) * DT;
    }
    if (endur === null && E < eRes) endur = (s + 1) * DT;
    if (s >= nM && endur !== null) break;
  }
  if (record) pts.push([t0 + nM * DT, NaN, NaN, NaN, NaN]);
  return { cap: C.cap, eRes, minE, E, tRes, tEmpty, tFull, eSol, eCons, peak, pts, t0, t1, dur, endur, eClimb: climbEnergy(C), ok: minE >= eRes - 1e-9, hMax: hMaxR, tTop };
}
// Leistungsreserve: wie viel zusätzliche Dauerlast (W) der Einsatz verkraftet
function missionMargin(C, ser) {
  const test = x => { const s2 = { ps: ser.ps, pc: ser.pc.map(v => v + x), pp: ser.pp, cold: ser.cold }; const r = mission(C, s2, s2, false); return r && r.minE >= r.eRes - 1e-9; };
  const pCons = C.pProp + C.comp.always;
  let lo, hi;
  if (test(0)) { lo = 0; hi = 400; if (test(hi)) return { w: hi, capped: true }; }
  else { lo = -pCons; hi = 0; if (!test(lo)) return { w: null }; }
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (test(mid)) lo = mid; else hi = mid; }
  return { w: lo };
}

/* ---------- Dauerflug nach Leutenegger et al. (2011) / Oettershagen et al. (2017) ----------
   Start am Morgen im Leistungsgleichgewicht mit leerem Akku, zwei Tage simulieren.
   Excess Time = Restflugzeit beim zweiten Gleichgewicht, Charge Margin = Zeit mit vollem Akku. */
function periodic(C, ser, record) {
  const { ps, pc } = ser, base = { tExc: NaN, tCm: 0, minSoc: NaN, tEq: NaN, tEq2: NaN, tFc: NaN, reason: '', pts: null };
  if (!(C.cap > 0)) return { ...base, reason: 'cap' };
  let iRise = -1, iMax = 0;
  for (let i = 0; i < NSTEP; i++) { if (ps[i] > 0 && iRise < 0) iRise = i; if (ps[i] > ps[iMax]) iMax = i; }
  if (iRise < 0) return { ...base, reason: 'night' };
  let all = true; for (let i = 0; i < NSTEP; i++) if (ps[i] < pc[i]) { all = false; break; }
  if (all) return { ...base, tExc: Infinity, tCm: Infinity, minSoc: 1, reason: 'polarday' };
  // Gleichgewicht: ab hier bleibt die Solarleistung bis zum Mittag über dem Verbrauch (robust gegen Lastsprünge)
  let iEq = -1;
  if (ps[iMax] >= pc[iMax]) { iEq = iMax; while (iEq > iRise && ps[iEq - 1] >= pc[iEq - 1]) iEq--; }
  if (iEq < 0) return { ...base, reason: 'nosolar' };
  let iEq2 = iMax;
  while (iEq2 < NSTEP - 1 && ps[iEq2 + 1] >= pc[iEq2 + 1]) iEq2++;
  let E = 0, fail = -1, fcS = -1, fcE = -1, emin = Infinity, hMaxR = 0;
  const pts = record ? [] : null, alt = C.P.hStore > 0, st = { E: 0, h: 0 };
  for (let s = 0; s < 2 * NSTEP; s++) {
    const i = (iEq + s) % NSTEP;
    if (record) pts.push([iEq * DT + s * DT, ps[i], pc[i], E / C.cap * 100, st.h]);
    if (alt) { st.E = E; stepEH(C, st, ps[i], pc[i], ser.pp ? ser.pp[i] : 0, ser.cold[i]); E = st.E; if (st.h > hMaxR) hMaxR = st.h; }
    else E = stepE(C, E, ps[i], pc[i], ser.cold[i]);
    if (E < 0) { fail = s + 1; if (record) pts.push([iEq * DT + (s + 1) * DT, NaN, NaN, 0, 0]); break; }
    if (s >= NSTEP) { if (E >= C.cap - 1e-9) { if (fcS < 0) fcS = s; fcE = s; } if (E < emin) emin = E; }
  }
  const tEq = iEq * DT, tEq2 = iEq2 * DT, pNom = pc[iEq];
  if (fail >= 0) {
    const tm = ((iEq + fail) % NSTEP) * DT;
    return { ...base, tExc: tm < tEq ? tm - tEq : tm - 24 - tEq, minSoc: 0, tEq, tEq2, reason: 'empty', tEmpty: tm, pts };
  }
  // Excess Time: Restenergie im Akku plus die beim zweiten Gleichgewicht noch gespeicherte Höhe
  return { ...base, tExc: (E * C.P.etaDischarge / 100 + (alt ? hEnergy(C, st.h) : 0)) / pNom, minSoc: E / C.cap, tEq, tEq2, tCm: fcS >= 0 ? (fcE - fcS + 1) * DT : 0, tFc: fcS >= 0 ? ((iEq + fcS) % NSTEP) * DT : NaN, reason: 'ok', pNom, pts, hMax: hMaxR };
}

/* ---------- Bequeme Hüllen ---------- */
function envFor(P, n, year, W, yi) { return W ? envWeather(P, W, n, yi || 0, year) : envClear(P, n, year); }
function runDay(C, n, year, W, yi) {
  const e = envFor(C.P, n, year, W, yi), ser = daySeries(C, e);
  return { e, ser, per: periodic(C, ser) };
}
function seasonSweep(C, step = 7) {
  const y = yearOf(C.P.date), out = [];
  for (let n = 1; n <= 365; n += step) { const ser = daySeries(C, envClear(C.P, n, y)); out.push([n, periodic(C, ser), mission(C, ser, ser, false)]); }
  return out;
}
function seasonWindow(sw, req) {
  const ok = sw.filter(([, r]) => r.tExc >= 0).map(([n]) => n), rob = sw.filter(([, r]) => r.tExc >= req).map(([n]) => n);
  return { ok: ok.length ? [ok[0], ok[ok.length - 1], ok.length === sw.length] : null, rob: rob.length ? [rob[0], rob[rob.length - 1], rob.length === sw.length] : null };
}

/* ---------- Jahressimulation mit Wetterdaten ----------
   Je Tag (a) Einsatz mit vollem Akku ab Startzeit, (b) Dauerflug-Kriterium nach ETH mit dem Tageswetter,
   (c) durchgehende Folge: Landung bei Erreichen der Reserve, Neustart am nächsten Morgen mit vollem Akku. */
function yearSim(C, W, opt = {}) { const it = yearSimIter(C, W, opt); let r = it.next(); while (!r.done) r = it.next(); return r.value; }
function* yearSimIter(C, W, opt = {}) {
  const P = C.P, years = Math.max(1, Math.floor(W.hours / 8760)), y0 = yearOf(P.date);
  const M = Array.from({ length: 12 }, () => ({ days: 0, mOK: 0, perOK: 0, robOK: 0, noLand: 0, air: 0, endur: [], eSol: 0, wind: 0, launches: 0 }));
  const t0 = hm(P.tStart), eRes = C.cap * P.reserve / 100;
  let E = C.cap, flying = true, prev = null, lastLaunch = 0, longest = 0, cur = 0;
  const daily = opt.daily ? [] : null;
  const total = years * 365;
  let prevSer = null;
  for (let d = 0; d <= total; d++) {
    const yi = Math.floor(d / 365) % years, n = (d % 365) + 1;
    const e = envWeather(P, W, n, yi, y0), ser = daySeries(C, e);
    if (prevSer) {
      // Einsatz des Vortags (braucht ggf. den Folgetag für die Ausdauer)
      const r = mission(C, prevSer.ser, ser, false), per = periodic(C, prevSer.ser), m = M[monthOfDay(prevSer.n)];
      m.days++; if (r && r.ok) m.mOK++; if (per.tExc >= 0) m.perOK++; if (per.tExc >= P.tExcReq) m.robOK++;
      m.endur.push(r && r.endur != null ? r.endur : 48); m.eSol += r ? r.eSol : 0; m.wind += prevSer.e.wind;
      if (daily) daily.push({ d: prevSer.d, n: prevSer.n, ok: r && r.ok, tExc: per.tExc, endur: r && r.endur, eSol: r ? r.eSol : 0 });
    }
    if (d === total) break;
    if (d % 30 === 29) yield d / total;
    // durchgehende Folge
    const m = M[monthOfDay(n)]; let landed = false, airSteps = 0;
    for (let i = 0; i < NSTEP; i++) {
      const t = (i + 0.5) * DT;
      if (!flying && Math.abs(t - t0) < DT / 2 + 1e-9) { flying = true; E = C.cap - climbEnergy(C); m.launches++; cur = 0; }
      if (flying) {
        E = stepE(C, E, ser.ps[i], ser.pc[i], ser.cold[i]); airSteps++; cur += DT;
        if (E < eRes) { flying = false; landed = true; longest = Math.max(longest, cur); }
      }
    }
    m.air += airSteps / NSTEP; if (!landed && airSteps === NSTEP) m.noLand++;
    prevSer = { ser, e, n, d };
  }
  longest = Math.max(longest, cur);
  const months = M.map(m => {
    const en = m.endur.slice().sort((a, b) => a - b), q = p => en.length ? en[Math.min(en.length - 1, Math.floor(p * en.length))] : NaN;
    return { days: m.days, mission: m.mOK / Math.max(1, m.days), perpetual: m.perOK / Math.max(1, m.days), robust: m.robOK / Math.max(1, m.days), noLand: m.noLand / Math.max(1, m.days), airborne: m.air / Math.max(1, m.days), endurMed: q(0.5), endurP10: q(0.1), eSol: m.eSol / Math.max(1, m.days), wind: m.wind / Math.max(1, m.days), launches: m.launches };
  });
  const yr = k => months.reduce((s, m) => s + m[k] * m.days, 0) / Math.max(1, months.reduce((s, m) => s + m.days, 0));
  return { years, months, year: { mission: yr('mission'), perpetual: yr('perpetual'), robust: yr('robust'), noLand: yr('noLand'), airborne: yr('airborne') }, longest, daily };
}

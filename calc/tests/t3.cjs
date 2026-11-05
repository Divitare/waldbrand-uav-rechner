const { load } = require('./load.cjs');
const U = load();
const f = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : String(x));
const R = U.REFS;
// 1) Wölbungsfaktor MH139F vs. ETH-Annahme 0,95
{
  const base = { ...U.DEFAULT_PARAMS, ...R.atlantik.params };
  const E = P => { const C = U.buildCase(P, R.atlantik.comps); const ser = U.daySeries(C, U.envClear(P, U.dayOfYear(P.date), 2015)); let s = 0; for (let i = 0; i < U.NSTEP; i++) s += ser.ps[i] * U.DT; return [s, C]; };
  const [eFlat] = E({ ...base, solarGeom: 'flach', camberEta: 100 });
  for (const [lab, extra] of [['span x0 8..85', {}], ['span x0 10..80', { cellX0: 10, cellX1: 80 }], ['chord-Strings 8..85', { stringLayout: 'chord' }], ['span, 30% Kurven 20°', { turnFrac: 30 }], ['Dez. 21', { date: '2015-12-21' }]]) {
    const P = { ...base, solarGeom: 'profil', ...extra };
    const [e, C] = E(P);
    let ref = eFlat; if (extra.date) ref = E({ ...base, solarGeom: 'flach', camberEta: 100, date: extra.date })[0];
    console.log('Wölbung/IAM', lab, 'Faktor', f(e / ref, 3), 'pitch', f(C.sol.pitch, 1), 'Fd', f(C.sol.Fd, 3), 'Fg', f(C.sol.Fg, 3), 'arc', f(C.sol.arc, 3));
  }
}
// 2) Wetter
const t0 = Date.now();
const Wp = U.decodeSite(U.weather.sites[0]), Wa = U.decodeSite(U.weather.sites[1]);
console.log('decode ms', Date.now() - t0);
const ms = U.monthlyStats(Wp);
console.log('Piemont kt', ms.map(m => f(m.kt)).join(' '), '\n H', ms.map(m => f(m.H, 1)).join(' '), '\n T', ms.map(m => f(m.T, 1)).join(' '), '\n amp', ms.map(m => f(m.amp, 1)).join(' '));
const msa = U.monthlyStats(Wa);
console.log('Amsterdam kt', msa.map(m => f(m.kt)).join(' '), '\n H', msa.map(m => f(m.H, 1)).join(' '));
// Clear-sky-Index-Rekonstruktion: Tagessumme aus kc*cs vs. Original
{
  const P = { ...U.DEFAULT_PARAMS, lat: Wp.lat, lon: Wp.lon, alt: Wp.elev, hAGL: 0, tz: 1 };
  let sumRec = 0, sumOrig = 0;
  for (let n = 1; n <= 365; n++) { const e = U.envWeather(P, Wp, n, 0, 2026); for (let i = 0; i < U.NSTEP; i++) sumRec += e.ghi[i] * U.DT; }
  for (let i = 0; i < 8760; i++) sumOrig += Wp.ghi[i];
  console.log('Piemont Jahres-GHI rekonstruiert', f(sumRec / 1000, 0), 'Original', f(sumOrig / 1000, 0), 'kWh/m²');
}
// 3) Jahressimulation Standardentwurf mit Piemont-Wetter
const P = { ...U.DEFAULT_PARAMS, lat: 45, lon: 8, alt: 250 };
const comps = U.DEFAULT_COMPS.map(c => ({ ...c }));
const C = U.buildCase(P, comps);
let t1 = Date.now();
const ys = U.yearSim(C, Wp);
console.log('yearSim ms', Date.now() - t1);
console.log('Monat: Einsatz-Erfolg / Dauerflug(ETH) / ohne Landung / airborne / Ausdauer-Median');
ys.months.forEach((m, i) => console.log(i + 1, f(m.mission), f(m.perpetual), f(m.noLand), f(m.airborne), f(m.endurMed, 1), f(m.eSol, 0), 'Wind', f(m.wind, 1)));
console.log('Jahr', JSON.stringify(ys.year), 'längster Flug', f(ys.longest, 1), 'h');
// 4) Generator aus Piemont-Monatswerten, 20 Jahre
t1 = Date.now();
const Wg = U.genWeather({ name: 'Gen Piemont', lat: 45, lon: 8, elev: 250, utc: 1, tc: 0.5 }, ms, 20, 7);
console.log('gen ms', Date.now() - t1);
const msg = U.monthlyStats(Wg);
console.log('Gen kt', msg.map(m => f(m.kt)).join(' '), '\n Gen T', msg.map(m => f(m.T, 1)).join(' '), '\n Gen amp', msg.map(m => f(m.amp, 1)).join(' '));
t1 = Date.now();
const yg = U.yearSim(C, Wg);
console.log('yearSim 20 J ms', Date.now() - t1);
yg.months.forEach((m, i) => console.log(i + 1, f(m.mission), f(m.perpetual), f(m.noLand), f(m.airborne), f(m.endurMed, 1)));

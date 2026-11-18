/* ===================================================================
   Ebene Solarmodule (Facetten) statt gebogener: Profil mit ebenen Abschnitten und seine Polaren
   - Eben eingebaut liegt jedes Modul als gerade Sehne auf der Profiloberseite: Vorder- und Hinterkante sitzen auf der
     Kontur, dazwischen liegt es tiefer (Stich δ). Ein Modul darf nur dort liegen, wo δ ≤ δ_zul·c (solar.js, flatScan).
   - Die Oberseite wird so zu einem Vieleck mit Knicken an den Modulkanten. Ihre Wirkung auf die Polaren rechnet derselbe
     Ansatz wie die Profildatenbank: NeuralFoil (Sharpe & Hansman, MIT), hier das Netz „xlarge“ direkt im Browser. Die
     Kontur wird wie in NeuralFoil mit Kulfan-Parametern angenähert (CST: je Seite 8 Bernstein-Gewichte, Nasen- und
     Hinterkantenterm, kleinste Quadrate); die Knicke werden dabei leicht gerundet.
   - Knicke von einigen Grad in laminarer Grenzschicht lösen den Umschlag aus. Angenommen wird deshalb Umschlag auf der
     Oberseite an der Vorderkante des vordersten Moduls (wie „Umschlag an der Zellkante“ bei gebogenen Zellen).
   - Differenzverfahren: c_d(c_l), α(c_l) und die Kennwerte (c_l,max, α₀, Anstieg, c_m) des Facettenprofils minus die
     des Originalprofils, beide mit demselben Netz aus denselben Stützstellen gerechnet. Die Differenz kommt zu den
     Tabellen der Datenbank (Netz xxxlarge), gewichtet mit dem Anteil φ der Flügelfläche, auf dem Module liegen.
     So heben sich die Fehler des kleineren Netzes weitgehend auf, und gebogene Zellen rechnen genau wie bisher.
     c_l,max wird dabei nur verringert, nie erhöht (Tabellen enden am c_l,max der Datenbank).
   =================================================================== */
const NF_RI = [0, 2, 4, 6, 8, 10];                                // Re-Stufen der Datenbank, an denen das Netz rechnet
const NF_AL = Array.from({ length: 45 }, (_, i) => -5 + 0.5 * i);  // Anstellwinkel −5 … 17°
let NFW = null;
function nfB64(s) {
  const bin = atob(s), n = bin.length >> 1, out = new Int16Array(n);
  for (let i = 0; i < n; i++) { const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); out[i] = v > 32767 ? v - 65536 : v; }
  return out;
}
// Netzgewichte (in der Profildatenbank, je Zeile auf 16 bit gerundet) einmal je Datenbank entpacken
function nfNet() {
  const nn = AF && AF.db && AF.db.nn; if (!nn) return null;
  if (NFW && NFW.db === AF.db) return NFW.L;
  const L = nn.layers.map(l => {
    const wq = nfB64(l.w), bq = nfB64(l.b), W = new Float64Array(l.r * l.c), b = new Float64Array(l.r);
    for (let i = 0; i < l.r; i++) { const s = l.sw[i]; for (let j = 0; j < l.c; j++) W[i * l.c + j] = wq[i * l.c + j] * s; b[i] = bq[i] * l.sb; }
    return { r: l.r, c: l.c, W, b };
  });
  NFW = { db: AF.db, L };
  return L;
}
// Vorwärtsrechnung für n Eingänge (je 25 Werte): Swish zwischen den Schichten, letzte Schicht linear (c_l, c_d, c_m roh).
// Je vier Eingänge zugleich, damit jedes Gewicht nur einmal je Vierergruppe gelesen wird
const nfAct = (s, last) => (last ? s : s / (1 + Math.exp(-s)));
function nfForward(X, n) {
  const L = nfNet(); let cur = X;
  for (let l = 0; l < L.length; l++) {
    const { r, c, W, b } = L[l], out = new Float64Array(n * r), last = l === L.length - 1;
    let k = 0;
    for (; k + 3 < n; k += 4) {
      const x0 = k * c, x1 = x0 + c, x2 = x1 + c, x3 = x2 + c, o0 = k * r;
      for (let i = 0; i < r; i++) {
        let s0 = b[i], s1 = s0, s2 = s0, s3 = s0; const wo = i * c;
        for (let j = 0; j < c; j++) { const w = W[wo + j]; s0 += w * cur[x0 + j]; s1 += w * cur[x1 + j]; s2 += w * cur[x2 + j]; s3 += w * cur[x3 + j]; }
        out[o0 + i] = nfAct(s0, last); out[o0 + r + i] = nfAct(s1, last); out[o0 + 2 * r + i] = nfAct(s2, last); out[o0 + 3 * r + i] = nfAct(s3, last);
      }
    }
    for (; k < n; k++) {
      const xo = k * c, oo = k * r;
      for (let i = 0; i < r; i++) { let s = b[i]; const wo = i * c; for (let j = 0; j < c; j++) s += W[wo + j] * cur[xo + j]; out[oo + i] = nfAct(s, last); }
    }
    cur = out;
  }
  return cur;
}
/* Beiwerte wie neuralfoil.get_aero_from_kulfan_parameters: Profil und gespiegeltes Profil (Ober- und Unterseite
   getauscht, α und Umschlagorte gespiegelt) gerechnet und gemittelt. N_krit 9, Unterseite frei. */
function nfAero(kp, Re, xtrU, alphas) {
  const al = alphas || NF_AL, na = al.length, X = new Float64Array(2 * na * 25), lre = (Math.log(Re) - 12.5) / 3.5;
  for (let k = 0; k < na; k++) {
    const a = al[k] * DEG, o = k * 25, f = (na + k) * 25, ca = Math.cos(a);
    for (let i = 0; i < 8; i++) { X[o + i] = kp.u[i]; X[o + 8 + i] = kp.l[i]; X[f + i] = -kp.l[i]; X[f + 8 + i] = -kp.u[i]; }
    X[o + 16] = kp.le; X[f + 16] = -kp.le;
    X[o + 17] = X[f + 17] = kp.te * 50;
    X[o + 18] = Math.sin(2 * a); X[f + 18] = -X[o + 18];
    X[o + 19] = X[f + 19] = ca;
    X[o + 20] = X[f + 20] = 1 - ca * ca;
    X[o + 21] = X[f + 21] = lre;
    X[o + 22] = X[f + 22] = 0;
    X[o + 23] = xtrU; X[o + 24] = 1; X[f + 23] = 1; X[f + 24] = xtrU;
  }
  const Y = nfForward(X, 2 * na), CL = new Float64Array(na), CD = new Float64Array(na), CM = new Float64Array(na);
  for (let k = 0; k < na; k++) {
    const y = k * 3, yf = (na + k) * 3;
    CL[k] = (Y[y] - Y[yf]) / 4; CD[k] = Math.exp(((Y[y + 1] + Y[yf + 1]) / 2 - 2) * 2); CM[k] = (Y[y + 2] - Y[yf + 2]) / 40;
  }
  return { CL, CD, CM };
}
// Kleinste Quadrate mit Householder-Spiegelungen (A: m × n zeilenweise, wird überschrieben)
function lsqHouse(A, y, m, n) {
  for (let k = 0; k < n; k++) {
    let nr = 0; for (let i = k; i < m; i++) nr += A[i * n + k] * A[i * n + k];
    nr = Math.sqrt(nr); if (!(nr > 0)) continue;
    const alpha = A[k * n + k] > 0 ? -nr : nr, v = new Float64Array(m - k);
    for (let i = k; i < m; i++) v[i - k] = A[i * n + k];
    v[0] -= alpha;
    let vn = 0; for (let i = 0; i < v.length; i++) vn += v[i] * v[i];
    if (!(vn > 0)) continue;
    for (let j = k; j < n; j++) { let s = 0; for (let i = k; i < m; i++) s += v[i - k] * A[i * n + j]; s = 2 * s / vn; for (let i = k; i < m; i++) A[i * n + j] -= s * v[i - k]; }
    let s = 0; for (let i = k; i < m; i++) s += v[i - k] * y[i];
    s = 2 * s / vn; for (let i = k; i < m; i++) y[i] -= s * v[i - k];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j]; x[i] = Math.abs(A[i * n + i]) > 1e-14 ? s / A[i * n + i] : 0; }
  return x;
}
/* Kulfan-Parameter (AeroSandbox get_kulfan_parameters): Koordinaten in Selig-Reihenfolge (Hinterkante – Oberseite –
   Nase – Unterseite – Hinterkante). Klassenfunktion √x·(1−x), 8 Bernstein-Polynome je Seite, Nasenterm
   x·(1−x)^8,5, Hinterkantendicke; ist diese negativ, ohne sie neu angepasst. */
const KF_BIN = [1, 7, 21, 35, 35, 21, 7, 1];
function kulfanFit(xs, ys) {
  const m = xs.length, n = 18; let le = 0;
  for (let i = 1; i < m; i++) if (xs[i] < xs[le]) le = i;
  const A = new Float64Array(m * n), y = Float64Array.from(ys);
  for (let i = 0; i < m; i++) {
    const x = Math.max(0, xs[i]), x1 = Math.max(0, 1 - xs[i]), Cx = Math.sqrt(x) * x1, up = i <= le, o = i * n;
    for (let k = 0; k < 8; k++) A[o + (up ? 8 : 0) + k] = Cx * KF_BIN[k] * Math.pow(x, k) * Math.pow(x1, 7 - k);
    A[o + 16] = xs[i] * Math.pow(Math.max(1 - xs[i], 0), 8.5);
    A[o + 17] = up ? xs[i] / 2 : -xs[i] / 2;
  }
  let sol = lsqHouse(Float64Array.from(A), Float64Array.from(y), m, n);
  if (sol[17] < 0) {
    const B = new Float64Array(m * 17); for (let i = 0; i < m; i++) for (let k = 0; k < 17; k++) B[i * 17 + k] = A[i * n + k];
    const s2 = lsqHouse(B, Float64Array.from(y), m, 17); sol = Float64Array.from([...s2, 0]);
  }
  return { l: Array.from(sol.slice(0, 8)), u: Array.from(sol.slice(8, 16)), le: sol[16], te: sol[17] };
}
// Profilkoordinaten (Selig-Reihenfolge) aus der Datenbank, Oberseite aus dem Spline (solar.js) mit Facetten als Sehnen
const FC_X = Array.from({ length: 121 }, (_, i) => 0.5 * (1 - Math.cos(Math.PI * i / 120)));
function foilYu(U, x) { const i = upIdx(U.X, x), t = clamp((x - U.X[i]) / (U.X[i + 1] - U.X[i] || 1), 0, 1); return U.Y[i] + (U.Y[i + 1] - U.Y[i]) * t; }
function foilYl(f, x) { const s = f.shape, X = s.x; let k = 0; while (k < X.length - 2 && X[k + 1] < x) k++; const t = (x - X[k]) / (X[k + 1] - X[k] || 1); return s.yl[k] + (s.yl[k + 1] - s.yl[k]) * t; }
function facetYu(U, facets, x) {
  for (const [a, b] of facets) if (x >= a - 1e-12 && x <= b + 1e-12) { const ya = foilYu(U, a), yb = foilYu(U, b); return ya + (yb - ya) * (x - a) / (b - a || 1); }
  return foilYu(U, x);
}
function facetCoords(foil, facets) {
  const U = foilUpper(foil), xu = Array.from(new Set([...FC_X, ...facets.flat()].map(v => Math.round(clamp(v, 0, 1) * 1e6) / 1e6))).sort((a, b) => a - b);
  const xs = [], ys = [];
  for (let i = xu.length - 1; i >= 0; i--) { xs.push(xu[i]); ys.push(facetYu(U, facets, xu[i])); }
  for (let i = 1; i < FC_X.length; i++) { xs.push(FC_X[i]); ys.push(foilYl(foil, FC_X[i])); }
  return { xs, ys, xu, yu: xu.map(x => facetYu(U, facets, x)), xl: FC_X, yl: FC_X.map(x => foilYl(foil, x)) };
}
// Anliegender Ast und Tabellen auf dem c_l-Raster der Datenbank (wie make_polars.py: branch, polar_tables)
function nfTable(r) {
  const al = NF_AL, cl = r.CL, n = cl.length; let imax = 0;
  for (let i = 1; i < n; i++) if (cl[i] > cl[imax]) imax = i;
  for (let i = 1; i < n - 1; i++) {
    if (al[i] > 4 && cl[i] >= cl[i - 1] && cl[i] > cl[i + 1]) { let mx = -Infinity; for (let k = i; k < Math.min(n, i + 8); k++) mx = Math.max(mx, cl[k]); if (cl[i] > mx - 1e-4) { imax = i; break; } }
  }
  let j = 0; for (let i = 1; i <= imax; i++) if (cl[i] < cl[j]) j = i;
  const a = [], c = [], d = [], m = [];
  for (let i = j; i <= imax; i++) if (!c.length || cl[i] > c[c.length - 1] + 1e-6) { a.push(al[i]); c.push(cl[i]); d.push(r.CD[i]); m.push(r.CM[i]); }
  const ip = (t, X, Y) => { let k = 0; while (k < X.length - 2 && X[k + 1] < t) k++; const w = (t - X[k]) / (X[k + 1] - X[k] || 1); return Y[k] + (Y[k + 1] - Y[k]) * clamp(w, 0, 1); };
  const cd = AF.cl.map(t => (c.length > 1 && t >= c[0] && t <= c[c.length - 1] ? ip(t, c, d) : null));
  const alT = AF.cl.map(t => (c.length > 1 && t >= c[0] && t <= c[c.length - 1] ? ip(t, c, a) : null));
  const a0 = c.length > 1 && c[0] <= 0 && 0 <= c[c.length - 1] ? ip(0, c, a) : a[0] - c[0] / 0.1;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, nl = 0;
  for (let i = 0; i < c.length; i++) if (c[i] > 0.1 && c[i] < 0.8) { const x = a[i] * DEG; sx += x; sy += c[i]; sxx += x * x; sxy += x * c[i]; nl++; }
  const slope = nl > 3 ? (nl * sxy - sx * sy) / (nl * sxx - sx * sx) : 2 * Math.PI * 0.95;
  let cs = 0, cn = 0; for (let i = 0; i < c.length; i++) if (c[i] > 0.2 && c[i] < 0.9) { cs += m[i]; cn++; }
  const cm = cn ? cs / cn : m.reduce((q, v) => q + v, 0) / Math.max(1, m.length);
  return { cd, al: alT, meta: { clmax: cl[imax], a0, slope, cm } };
}
// Polaren eines Profils (Koordinaten) mit dem Netz an den Re-Stufen NF_RI
function nfPolars(kp, xtrU) { return NF_RI.map(i => nfTable(nfAero(kp, AF.re[i], xtrU))); }
const nfOrig = new Map(), facetDCache = new Map(), facetFoilCache = new Map();
// Differenzen Facettenprofil − Originalprofil auf allen Re-Stufen der Datenbank (log-Re-linear zwischen den Netzstufen)
function facetDelta(foil, facets, xtr) {
  const key = `${foil.key}|${facets.map(f => f.map(v => v.toFixed(3)).join('-')).join(',')}|${xtr.toFixed(3)}`;
  let D = facetDCache.get(key); if (D) return D;
  let P0 = nfOrig.get(foil.key);
  if (!P0) { const c0 = facetCoords(foil, []); P0 = nfPolars(kulfanFit(c0.xs, c0.ys), 1); nfOrig.set(foil.key, P0); }
  const cf = facetCoords(foil, facets), kp = kulfanFit(cf.xs, cf.ys), P1 = nfPolars(kp, clamp(xtr, 0.01, 1));
  const dr = P0.map((p0, r) => ({
    cd: p0.cd.map((v, k) => (v != null && P1[r].cd[k] != null ? P1[r].cd[k] - v : null)),
    al: p0.al.map((v, k) => (v != null && P1[r].al[k] != null ? P1[r].al[k] - v : null)),
    meta: { clmax: P1[r].meta.clmax - p0.meta.clmax, a0: P1[r].meta.a0 - p0.meta.a0, slope: P1[r].meta.slope - p0.meta.slope, cm: P1[r].meta.cm - p0.meta.cm }
  }));
  const L = AF.lre, mix = (a, b, w) => (a != null && b != null ? a + (b - a) * w : a ?? b);
  D = { cd: [], al: [], meta: [], kp, rows: dr };
  for (let i = 0; i < AF.re.length; i++) {
    let r = 0; while (r < NF_RI.length - 2 && NF_RI[r + 1] < i) r++;
    const i0 = NF_RI[r], i1 = NF_RI[r + 1], w = clamp((L[i] - L[i0]) / (L[i1] - L[i0]), 0, 1), A = dr[r], B = dr[r + 1];
    D.cd.push(A.cd.map((v, k) => mix(v, B.cd[k], w)));
    D.al.push(A.al.map((v, k) => mix(v, B.al[k], w)));
    D.meta.push(Object.fromEntries(Object.keys(A.meta).map(k => [k, mix(A.meta[k], B.meta[k], w)])));
  }
  if (facetDCache.size > 500) facetDCache.clear();
  facetDCache.set(key, D);
  return D;
}
// nächster vorhandener Wert einer Tabellenzeile (nach außen gesucht)
function nearVal(row, k) { for (let d = 0; d < row.length; d++) { if (row[k - d] != null) return row[k - d]; if (row[k + d] != null) return row[k + d]; } return null; }
function facetPolarSet(base, D, phi) {
  const cd = [], al = [], meta = [];
  for (let i = 0; i < base.cd.length; i++) {
    const m0 = base.meta[i], dm = D.meta[i];
    if (!m0) { cd.push(base.cd[i].slice()); al.push(base.al[i].slice()); meta.push(m0); continue; }
    const mt = { ...m0, clmax: Math.min(m0.clmax, m0.clmax + phi * dm.clmax), a0: m0.a0 + phi * dm.a0, slope: m0.slope + phi * dm.slope, cm: m0.cm + phi * dm.cm };
    const rc = [], ra = [];
    for (let k = 0; k < AF.cl.length; k++) {
      const b = base.cd[i][k];
      if (b == null || AF.cl[k] > mt.clmax + 1e-9) { rc.push(null); ra.push(null); continue; }
      const d = nearVal(D.cd[i], k), a = nearVal(D.al[i], k);
      rc.push(Math.max(Math.round(0.3 * b), Math.round(b + phi * (d ?? 0) * 1e5)));
      ra.push(base.al[i][k] != null ? Math.round((base.al[i][k] + phi * (a ?? 0)) * 100) / 100 : null);
    }
    cd.push(rc); al.push(ra); meta.push(mt);
  }
  const ps = { cd, al, meta };
  ps.rng = cd.map(row => { let lo = -1, hi = -1; row.forEach((v, k) => { if (v != null) { if (lo < 0) lo = k; hi = k; } }); return [lo, hi]; });
  return ps;
}
/* Profil mit Facetten als eigener Eintrag (Schlüssel „…~eben…“): Polaren der Datenbank (Umschlag frei) plus φ mal die
   Differenz. fac: { xs: [[x_vorn, x_hinten], …] Tiefenanteile, xtr: Umschlag oben, phi: belegter Flächenanteil } */
function facetFoil(foil, fac) {
  if (!fac || !fac.xs || !fac.xs.length || !(fac.phi > 0) || !nfNet()) return foil;
  const xs = fac.xs.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]), xtr = Math.round(fac.xtr * 100) / 100, phi = Math.round(clamp(fac.phi, 0, 1) * 100) / 100;
  const key = `${foil.key}~eben~${xs.map(f => f.join('-')).join(',')}~${xtr}~${phi}`;
  let F = facetFoilCache.get(key); if (F) return F;
  const D = facetDelta(foil, xs, xtr), ps = facetPolarSet(foil.free, D, phi);
  F = { ...foil, key, name: `${foil.name} mit ebenen Modulen`, base: foil, facet: { ...fac, xs, xtr, phi }, free: ps, trip: ps };
  if (facetFoilCache.size > 300) facetFoilCache.clear();
  facetFoilCache.set(key, F);
  return F;
}

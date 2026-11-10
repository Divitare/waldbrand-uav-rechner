/* ===================================================================
   Lineare Algebra: LU, Inverse, Cholesky, Jacobi (symmetrisch),
   allgemeine reelle Eigenwerte (Balancierung, Hessenberg, QR nach
   Numerical Recipes: balanc, elmhes, hqr)
   =================================================================== */
const zeros = (n, m) => Array.from({ length: n }, () => new Array(m).fill(0));
const matMul = (A, B) => { const n = A.length, m = B[0].length, k = B.length, C = zeros(n, m); for (let i = 0; i < n; i++) for (let l = 0; l < k; l++) { const a = A[i][l]; if (a) for (let j = 0; j < m; j++) C[i][j] += a * B[l][j]; } return C; };
const transpose = A => A[0].map((_, j) => A.map(r => r[j]));
function luDecomp(A) {
  const n = A.length, M = A.map(r => r.slice()), p = Array.from({ length: n }, (_, i) => i);
  for (let c = 0; c < n; c++) {
    let mx = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[mx][c])) mx = r;
    if (mx !== c) { [M[c], M[mx]] = [M[mx], M[c]]; [p[c], p[mx]] = [p[mx], p[c]]; }
    const d = M[c][c] || 1e-300;
    for (let r = c + 1; r < n; r++) { const f = (M[r][c] /= d); if (f) for (let k = c + 1; k < n; k++) M[r][k] -= f * M[c][k]; }
  }
  return { M, p };
}
function luSolve({ M, p }, b) {
  const n = M.length, x = p.map(i => b[i]);
  for (let i = 0; i < n; i++) for (let k = 0; k < i; k++) x[i] -= M[i][k] * x[k];
  for (let i = n - 1; i >= 0; i--) { for (let k = i + 1; k < n; k++) x[i] -= M[i][k] * x[k]; x[i] /= M[i][i] || 1e-300; }
  return x;
}
function matInv(A) { const lu = luDecomp(A), n = A.length, cols = []; for (let j = 0; j < n; j++) { const e = new Array(n).fill(0); e[j] = 1; cols.push(luSolve(lu, e)); } return transpose(cols); }
function cholesky(A) {
  const n = A.length, L = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) L[i][i] = Math.sqrt(Math.max(s, 1e-300)); else L[i][j] = s / L[j][j];
  }
  return L;
}
// Symmetrische Eigenwerte und -vektoren (zyklisches Jacobi-Verfahren)
function jacobiEig(S) {
  const n = S.length, A = S.map(r => r.slice()), V = zeros(n, n);
  for (let i = 0; i < n; i++) V[i][i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22 * (1 + A.reduce((s, r, i) => s + r[i] * r[i], 0))) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p][q]; if (Math.abs(apq) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[a][a] - A[b][b]);
  return { values: idx.map(i => A[i][i]), vectors: idx.map(i => V.map(r => r[i])) };
}
// Symmetrische Eigenwerte und -vektoren: Householder-Tridiagonalisierung und implizites QL
// (tred2/tql2 aus EISPACK in der Fassung von JAMA); gleiche Ausgabe wie jacobiEig, bei n = 36 etwa 10-mal schneller
function symEig(S) {
  const n = S.length, V = S.map(r => r.slice()), d = new Float64Array(n), e = new Float64Array(n);
  if (n === 1) return { values: [V[0][0]], vectors: [[1]] };
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
    } else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1], g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j]; V[j][i] = f; g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j]; g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j]; V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i]; V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
  V[n - 1][n - 1] = 1; e[0] = 0;
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0, tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n - 1 && Math.abs(e[m]) > eps * tst1) m++;
    if (m > l) {
      let iter = 0;
      do {
        iter++;
        let g = d[l], p = (d[l + 1] - g) / (2 * e[l]), r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r); d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1, c2 = 1, c3 = 1, s = 0, s2 = 0;
        const el1 = e[l + 1];
        for (let i = m - 1; i >= l; i--) {
          c3 = c2; c2 = c; s2 = s;
          g = c * e[i]; h = c * p; r = Math.hypot(p, e[i]);
          e[i + 1] = s * r; s = e[i] / r; c = p / r; p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) { h = V[k][i + 1]; V[k][i + 1] = s * V[k][i] + c * h; V[k][i] = c * V[k][i] - s * h; }
        }
        p = -s * s2 * c3 * el1 * e[l] / dl1; e[l] = s * p; d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1 && iter < 60);
    }
    d[l] += f; e[l] = 0;
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[a] - d[b]);
  return { values: idx.map(i => d[i]), vectors: idx.map(i => V.map(r => r[i])) };
}
// Verallgemeinert symmetrisch: K φ = λ M φ (M positiv definit)
function genSymEig(K, M) {
  const L = cholesky(M), Li = matInv(L), A = matMul(matMul(Li, K), transpose(Li));
  for (let i = 0; i < A.length; i++) for (let j = 0; j < i; j++) { const m = (A[i][j] + A[j][i]) / 2; A[i][j] = A[j][i] = m; }
  const r = symEig(A), LiT = transpose(Li);
  return { values: r.values, vectors: r.vectors.map(v => LiT.map(row => row.reduce((s, x, k) => s + x * v[k], 0))) };
}
// Allgemeine reelle Matrix: komplexe Eigenwerte [{re, im}]
function eigReal(A0) {
  const n = A0.length; if (!n) return [];
  const a = zeros(n + 1, n + 1);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) a[i + 1][j + 1] = A0[i][j];
  // balanc
  const RADIX = 2, sq = 4; let last = 0;
  while (last === 0) {
    last = 1;
    for (let i = 1; i <= n; i++) {
      let r = 0, c = 0;
      for (let j = 1; j <= n; j++) if (j !== i) { c += Math.abs(a[j][i]); r += Math.abs(a[i][j]); }
      if (c && r) {
        let g = r / RADIX, f = 1; const s = c + r;
        while (c < g) { f *= RADIX; c *= sq; }
        g = r * RADIX;
        while (c > g) { f /= RADIX; c /= sq; }
        if ((c + r) / f < 0.95 * s) { last = 0; g = 1 / f; for (let j = 1; j <= n; j++) a[i][j] *= g; for (let j = 1; j <= n; j++) a[j][i] *= f; }
      }
    }
  }
  // elmhes
  for (let m = 2; m < n; m++) {
    let x = 0, i = m;
    for (let j = m; j <= n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; }
      for (let j = 1; j <= n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; }
    }
    if (x) for (i = m + 1; i <= n; i++) {
      let y = a[i][m - 1];
      if (y) { y /= x; a[i][m - 1] = y; for (let j = m; j <= n; j++) a[i][j] -= y * a[m][j]; for (let j = 1; j <= n; j++) a[j][m] += y * a[j][i]; }
    }
  }
  for (let i = 1; i <= n; i++) for (let j = 1; j < i - 1; j++) a[i][j] = 0;
  // hqr
  const wr = new Array(n + 1).fill(0), wi = new Array(n + 1).fill(0);
  const SIGN = (x, y) => (y >= 0 ? Math.abs(x) : -Math.abs(x));
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
  let nn = n, t = 0, l = 1;
  while (nn >= 1) {
    let its = 0;
    do {
      for (l = nn; l >= 2; l--) {
        let s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]); if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; }
      }
      let x = a[nn][nn];
      if (l === nn) { wr[nn] = x + t; wi[nn--] = 0; }
      else {
        let y = a[nn - 1][nn - 1], w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          const p = 0.5 * (y - x), q = p * p + w; let z = Math.sqrt(Math.abs(q)); x += t;
          if (q >= 0) { z = p + SIGN(z, p); wr[nn - 1] = wr[nn] = x + z; if (z) wr[nn] = x - w / z; wi[nn - 1] = wi[nn] = 0; }
          else { wr[nn - 1] = wr[nn] = x + p; wi[nn - 1] = -(wi[nn] = z); }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('Eigenwerte konvergieren nicht');
          if (its === 10 || its === 20) { t += x; for (let i = 1; i <= nn; i++) a[i][i] -= x; const s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]); y = x = 0.75 * s; w = -0.4375 * s * s; }
          ++its;
          let m, p = 0, q = 0, r = 0, z = 0;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m]; r = x - z; let s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1]; q = a[m + 1][m + 1] - z - r - s; r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r); p /= s; q /= s; r /= s;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r)), v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) { a[i][i - 2] = 0; if (i !== m + 2) a[i][i - 3] = 0; }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1]; q = a[k + 1][k - 1]; r = 0; if (k !== nn - 1) r = a[k + 2][k - 1];
              if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; }
            }
            const s = SIGN(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; } else a[k][k - 1] = -s * x;
              p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; }
                a[k + 1][j] -= p * y; a[k][j] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; }
                a[i][k + 1] -= p * q; a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  const out = []; for (let i = 1; i <= n; i++) out.push({ re: wr[i], im: wi[i] });
  return out;
}

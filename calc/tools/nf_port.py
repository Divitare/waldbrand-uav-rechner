"""
Reine numpy-Portierung der NeuralFoil-Auswertung (Sharpe & Hansman, MIT) inklusive
Kulfan/CST-Fit nach AeroSandbox. Nur die Beiwerte CL, CD, CM, Umschlagpunkte und die
Analyse-Konfidenz werden ausgewertet, die Grenzschichtdaten werden nicht benötigt.

Quellen:
  NeuralFoil  https://github.com/peterdsharpe/NeuralFoil  (neuralfoil/main.py)
  AeroSandbox https://github.com/peterdsharpe/AeroSandbox (airfoil.py, airfoil_families.py)
"""
import re
import os
from math import comb
from pathlib import Path

import numpy as np

NF_DIR = Path(os.environ.get('UAV_EXT', Path(__file__).resolve().parents[2] / 'ext')) / 'nf/neuralfoil/nn_weights_and_biases'
_dist = dict(np.load(NF_DIR / 'scaled_input_distribution.npz'))
_dist['N_inputs'] = len(_dist['mean_inputs_scaled'])
_params = {}


def _nn(size):
    if size not in _params:
        _params[size] = dict(np.load(NF_DIR / f'nn-{size}.npz'))
    return _params[size]


def _sigmoid(x):
    return 0.5 * (1 + np.tanh(x / 2))


def _swish(x):
    return x * _sigmoid(x)


def _maha2(x):
    mean = _dist['mean_inputs_scaled'].reshape(1, -1)
    d = x - mean
    return np.sum(d @ _dist['inv_cov_inputs_scaled'] * d, axis=1)


# ---------------------------------------------------------------- Geometrie
def read_dat(path):
    """Liest UIUC-.dat (Selig- oder Lednicer-Format) und gibt Selig-Reihenfolge zurück
    (Hinterkante -> Oberseite -> Nase -> Unterseite -> Hinterkante)."""
    pts = []
    for line in Path(path).read_text(errors='ignore').splitlines():
        items = [s for s in re.split(r'[;,\s\t]+', line.strip()) if s]
        if len(items) != 2:
            continue
        try:
            x, y = float(items[0]), float(items[1])
        except ValueError:
            continue
        pts.append((x, y))
    pts = np.array(pts)
    # Lednicer: erste Zeile enthält Punktzahlen (>1.5)
    if len(pts) and pts[0, 0] > 1.5:
        nu, nl = int(round(pts[0, 0])), int(round(pts[0, 1]))
        body = pts[1:]
        up, lo = body[:nu], body[nu:nu + nl]
        pts = np.vstack([up[::-1], lo[1:] if np.allclose(lo[0], up[0]) else lo])
    # doppelte Punkte entfernen
    keep = [0]
    for i in range(1, len(pts)):
        if np.hypot(*(pts[i] - pts[keep[-1]])) > 1e-9:
            keep.append(i)
    return pts[keep]


def normalize(c):
    """AeroSandbox Airfoil.normalize(): Nase im Ursprung, Hinterkante bei (1,0), Sehne 1."""
    x, y = c[:, 0], c[:, 1]
    xte, yte = (x[0] + x[-1]) / 2, (y[0] + y[-1]) / 2
    dist = np.hypot(x - xte, y - yte)
    le = int(np.argmax(dist))
    xt, yt = -x[le], -y[le]
    c2 = c + np.array([xt, yt])
    scale = 1 / dist[le]
    c2 = c2 * scale
    xte, yte = (c2[0, 0] + c2[-1, 0]) / 2, (c2[0, 1] + c2[-1, 1]) / 2
    rot = -np.arctan2(yte, xte)
    R = np.array([[np.cos(rot), -np.sin(rot)], [np.sin(rot), np.cos(rot)]])
    c3 = (R @ c2.T).T
    return c3, dict(x_translation=xt, y_translation=yt, scale_factor=scale, rotation_angle=np.degrees(rot))


def kulfan_fit(c, n=8, N1=0.5, N2=1.0):
    """Kulfan-(CST)-Parameter mit Vorderkanten-Modifikation per kleinster Quadrate (AeroSandbox)."""
    x, y = c[:, 0], c[:, 1]
    le = int(np.argmin(x))
    is_upper = np.arange(len(x)) <= le
    C = np.clip(x, 0, None) ** N1 * np.clip(1 - x, 0, None) ** N2
    N = n - 1
    K = np.array([comb(N, i) for i in range(N + 1)], dtype=float)
    S = K[:, None] * np.clip(x, 0, None)[None, :] ** np.arange(N + 1)[:, None] * np.clip(1 - x, 0, None)[None, :] ** (N - np.arange(N + 1))[:, None]
    lem = x * np.maximum(1 - x, 0) ** (n + 0.5)
    te = np.where(is_upper, x / 2, -x / 2)
    A = np.concatenate([
        np.where(is_upper[None, :], 0, C[None, :] * S).T,
        np.where(is_upper[None, :], C[None, :] * S, 0).T,
        lem[:, None], te[:, None]], axis=1)
    sol = np.linalg.lstsq(A, y, rcond=None)[0]
    if sol[-1] < 0:
        sol = np.linalg.lstsq(A[:, :-1], y, rcond=None)[0]
        sol = np.append(sol, 0.0)
    return dict(lower_weights=sol[:n], upper_weights=sol[n:2 * n], leading_edge_weight=sol[2 * n], TE_thickness=sol[2 * n + 1])


def kulfan_coords(kp, npts=81, N1=0.5, N2=1.0):
    """Koordinaten aus Kulfan-Parametern (für Vorschau und Fit-Kontrolle)."""
    beta = np.linspace(0, np.pi, npts)
    x = 0.5 * (1 - np.cos(beta))
    n = len(kp['upper_weights'])
    N = n - 1
    K = np.array([comb(N, i) for i in range(N + 1)], dtype=float)
    S = K[:, None] * x[None, :] ** np.arange(N + 1)[:, None] * (1 - x)[None, :] ** (N - np.arange(N + 1))[:, None]
    C = x ** N1 * (1 - x) ** N2
    lem = kp['leading_edge_weight'] * x * np.maximum(1 - x, 0) ** (n + 0.5)
    yu = C * (kp['upper_weights'] @ S) + x * kp['TE_thickness'] / 2 + lem
    yl = C * (kp['lower_weights'] @ S) - x * kp['TE_thickness'] / 2 + lem
    return x, yu, yl


# ---------------------------------------------------------------- Netz
def nf_kulfan(kp, alpha, Re, n_crit=9.0, xtr_upper=1.0, xtr_lower=1.0, size='xxxlarge'):
    alpha = np.atleast_1d(np.asarray(alpha, float))
    Re = np.broadcast_to(np.atleast_1d(np.asarray(Re, float)), alpha.shape)
    ncase = alpha.size
    p = _nn(size)
    rows = [*[np.full(ncase, kp['upper_weights'][i]) for i in range(8)],
            *[np.full(ncase, kp['lower_weights'][i]) for i in range(8)],
            np.full(ncase, kp['leading_edge_weight']),
            np.full(ncase, kp['TE_thickness'] * 50),
            np.sin(np.radians(2 * alpha)), np.cos(np.radians(alpha)), 1 - np.cos(np.radians(alpha)) ** 2,
            (np.log(Re) - 12.5) / 3.5,
            np.full(ncase, (n_crit - 9) / 4.5), np.full(ncase, xtr_upper), np.full(ncase, xtr_lower)]
    x = np.stack(rows, axis=1)
    idx = sorted({int(k.split('.')[1]) for k in p})

    def net(z):
        z = z.T
        for j, i in enumerate(idx):
            z = p[f'net.{i}.weight'] @ z + p[f'net.{i}.bias'].reshape(-1, 1)
            if j < len(idx) - 1:
                z = _swish(z)
        return z.T

    y = net(x)
    y[:, 0] -= _maha2(x) / (2 * _dist['N_inputs'])
    xf = x.copy()
    xf[:, :8] = -x[:, 8:16]
    xf[:, 8:16] = -x[:, :8]
    xf[:, 16] = -x[:, 16]
    xf[:, 18] = -x[:, 18]
    xf[:, 23] = x[:, 24]
    xf[:, 24] = x[:, 23]
    yf = net(xf)
    yf[:, 0] -= _maha2(xf) / (2 * _dist['N_inputs'])
    yu = yf.copy()
    yu[:, 1] = -yf[:, 1]
    yu[:, 3] = -yf[:, 3]
    yu[:, 4] = yf[:, 5]
    yu[:, 5] = yf[:, 4]
    yy = (y[:, :6] + yu[:, :6]) / 2
    return dict(conf=_sigmoid(yy[:, 0]), CL=yy[:, 1] / 2, CD=np.exp((yy[:, 2] - 2) * 2), CM=yy[:, 3] / 20,
                xtr_u=np.clip(yy[:, 4], 0, 1), xtr_l=np.clip(yy[:, 5], 0, 1))


class Foil:
    """Profil aus Koordinaten, ausgewertet wie neuralfoil.get_aero_from_airfoil()."""

    def __init__(self, coords, name=''):
        self.name = name
        self.raw = coords
        self.norm, info = normalize(coords)
        self.kp = kulfan_fit(self.norm)
        self.dalpha = info['rotation_angle']
        self.scale = info['scale_factor']
        xt, yt = info['x_translation'], info['y_translation']
        self.xqc = -xt + 0.25 * (1.0 / self.scale * np.cos(np.radians(self.dalpha))) - 0.25
        self.yqc = -yt + 0.25 * (1.0 / self.scale * np.sin(np.radians(-self.dalpha)))

    def aero(self, alpha, Re, n_crit=9.0, xtr_upper=1.0, xtr_lower=1.0, size='xxxlarge'):
        r = nf_kulfan(self.kp, np.asarray(alpha) + self.dalpha, np.asarray(Re) / self.scale, n_crit, xtr_upper, xtr_lower, size)
        r['CM'] = r['CM'] - r['CL'] * self.xqc + r['CD'] * self.yqc
        return r

    def geometry(self):
        """Dicke, Wölbung und deren Lage aus den normierten Koordinaten."""
        c = self.norm
        le = int(np.argmin(c[:, 0]))
        up = c[:le + 1][::-1]
        lo = c[le:]
        xs = np.linspace(0, 1, 401)
        yu = np.interp(xs, up[:, 0], up[:, 1])
        yl = np.interp(xs, lo[:, 0], lo[:, 1])
        t = yu - yl
        cam = (yu + yl) / 2
        return dict(t=float(t.max()), xt=float(xs[t.argmax()]), f=float(cam.max()), xf=float(xs[cam.argmax()]),
                    xs=xs, yu=yu, yl=yl)

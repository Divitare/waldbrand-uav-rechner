"""
Erzeugt die Profildatenbank für den Rechner (data/airfoils.json).

Für jedes Profil:
  * NeuralFoil (xxxlarge) über alpha = -8 ... 20 deg in 0,25-deg-Schritten,
    für 12 Reynoldszahlen 40.000 ... 1.000.000,
    in zwei Fällen: freier Umschlag (Ncrit 9) und Umschlag erzwungen auf der Oberseite
    bei x/c = 0,10 (Kante aufgesetzter Solarzellen).
  * Daraus c_d(c_l) auf einem festen c_l-Raster entlang des anliegenden Astes bis c_l,max,
    c_l,max, Nullauftriebswinkel, Auftriebsanstieg, c_m.
  * Geometrie: Dicke, Wölbung, Oberseiten-/Unterseitenkontur für Vorschau und
    Solarzellen-Neigung.
Zusätzlich das MH 139F mit den originalen XFoil-Polaren der ETH (init.m) als eigener Eintrag.

Dazu das NeuralFoil-Netz „xlarge“ (nur die Ausgänge c_l, c_d, c_m; Gewichte je Zeile auf 16 bit gerundet), mit dem der
Rechner im Browser Profile mit ebenen Solarzellen (Facetten) nachrechnet (facet.js).
Aufruf:  python make_polars.py            alles neu (Polaren mit xxxlarge, dauert)
         python make_polars.py --nn-only  nur Netz und Beschreibungen in der vorhandenen Datei erneuern
"""
import base64
import json
import os
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from nf_port import Foil, read_dat  # noqa: E402

# Externe Quellen (nur zum Neuerzeugen der Polaren nötig): AeroSandbox-Profildatenbank und ETH-Werkzeug
EXT = Path(os.environ.get('UAV_EXT', Path(__file__).resolve().parents[2] / 'ext'))
DB = EXT / 'asb/aerosandbox/geometry/airfoil/airfoil_database'
ETH = Path(os.environ.get('UAV_ETH', EXT / 'fw_conceptual_design'))
OUT = Path(__file__).resolve().parents[1] / 'data' / 'airfoils.json'

RE = [40e3, 60e3, 80e3, 100e3, 130e3, 170e3, 220e3, 300e3, 400e3, 550e3, 750e3, 1000e3]
CL = [round(-0.3 + 0.1 * i, 1) for i in range(23)]  # -0.3 ... 1.9
ALPHA = np.arange(-8, 20.001, 0.25)

# (Schlüssel, Datei, Anzeigename, Kategorie, Kurzbeschreibung)
WING = [
    ('mh139f', 'ETH:MH139F', 'MH 139F', 'Solar/Segler', 'Eigens für AtlantikSolar (ETH Zürich) entworfenes Profil, 11,6 % dick; dort mit zwei Reihen SunPower-E60-Zellen auf der Oberseite.'),
    ('sd7037', 'sd7037', 'SD7037', 'Segler', 'Klassisches Seglerprofil für Re 100.000 bis 500.000, beim Solar-UAV Sun Falcon eingesetzt.'),
    ('sd7032', 'sd7032', 'SD7032', 'Segler', 'Etwas dicker und stärker gewölbt als das SD7037, gutmütiges Abreißverhalten.'),
    ('sd7062', 'sd7062', 'SD7062', 'Segler', '14 % dick, hoher Auftrieb, gut für schwere, langsame Flugzeuge.'),
    ('sd7080', 'sd7080', 'SD7080', 'Segler', 'Dünneres Leistungsprofil für etwas höhere Geschwindigkeiten.'),
    ('sd7003', 'sd7003', 'SD7003', 'Niedrig-Re', 'Dünnes Profil (8,5 %) für sehr kleine Reynoldszahlen, oft als Referenz in Windkanalstudien.'),
    ('s1223', 's1223', 'S1223', 'Hochauftrieb', 'Extrem gewölbtes Hochauftriebsprofil, c_l,max über 2. Hoher Widerstand und Nickmoment.'),
    ('s1210', 's1210', 'S1210', 'Hochauftrieb', 'Hochauftriebsprofil, etwas weniger extrem als das S1223.'),
    ('s7075', 's7075', 'S7075', 'Segler', 'Selig-Profil für Thermiksegler, flache Polare.'),
    ('s9000', 's9000', 'S9000', 'Segler', 'Dünnes Selig-Seglerprofil mit geringem Widerstand.'),
    ('s3021', 's3021', 'S3021', 'Segler', 'Weit verbreitetes Modellsegler-Profil (9,5 %).'),
    ('e387', 'e387', 'Eppler E387', 'Referenz', 'Standard-Referenz für Niedrig-Re-Messungen, viele Windkanaldaten vorhanden.'),
    ('e214', 'e214', 'Eppler E214', 'Segler', 'Kräftig gewölbtes Eppler-Profil für Re um 200.000.'),
    ('e423', 'e423', 'Eppler E423', 'Hochauftrieb', 'Hochauftriebsprofil mit dicker Hinterkante, für Lastenflieger.'),
    ('fx63137', 'fx63137', 'FX 63-137', 'Solar/HPA', 'Wortmann-Profil, beliebt bei Muskelkraft- und Solarflugzeugen, hoher Auftrieb.'),
    ('fx60126', 'fx60126', 'FX 60-126', 'Segler', 'Wortmann-Profil, 12,6 % dick, ausgewogen.'),
    ('fx60100', 'fx60100', 'FX 60-100', 'Segler', 'Dünnes Wortmann-Profil (10 %).'),
    ('ag35', 'ag35', 'AG35', 'Segler', 'Drela-Profil für Modellsegler, auf geringen Widerstand bei kleinem Re optimiert.'),
    ('ag24', 'ag24', 'AG24', 'Segler', 'Dünneres Drela-Profil der AG-Familie.'),
    ('dae11', 'dae11', 'DAE11', 'Solar/HPA', 'Profil des Muskelkraftflugzeugs Daedalus (MIT), für Re um 500.000.'),
    ('dae21', 'dae21', 'DAE21', 'Solar/HPA', 'Außenflügelprofil von Daedalus, dünner.'),
    ('mh32', 'mh32', 'MH 32', 'Segler', 'Hepperle-Profil für Modellsegler, 8,7 % dick.'),
    ('mh114', 'mh114', 'MH 114', 'Hochauftrieb', 'Dickes Hepperle-Hochauftriebsprofil (13 %) für langsame Flugzeuge.'),
    ('mh45', 'mh45', 'MH 45', 'Nurflügel', 'S-Schlag-Profil für Nurflügel: geringes Nickmoment, dafür weniger Auftrieb.'),
    ('rg15', 'rg15', 'RG15', 'Segler', 'Schnelles Seglerprofil (F3B), auf hohe Geschwindigkeit ausgelegt.'),
    ('sa7038', 'sa7038', 'SA7038', 'Segler', 'Seglerprofil von Selig und Ashok für kleine Reynoldszahlen.'),
    ('naca4412', 'naca4412', 'NACA 4412', 'Klassisch', 'Klassisches Profil als Vergleich, für hohe Re ausgelegt.'),
    ('naca2412', 'naca2412', 'NACA 2412', 'Klassisch', 'Klassisches Profil der Allgemeinen Luftfahrt, wenig gewölbt.'),
    ('clarky', 'clarky', 'Clark Y', 'Klassisch', 'Historisches Profil mit flacher Unterseite.'),
]
TAIL = [
    ('naca0010', 'naca0010', 'NACA 0010', 'Leitwerk', 'Symmetrisch, 10 % dick.'),
    ('naca0012', 'naca0012', 'NACA 0012', 'Leitwerk', 'Symmetrisch, 12 % dick.'),
    ('ht14', 'ht14', 'HT14', 'Leitwerk', 'Drela-Leitwerksprofil für kleine Reynoldszahlen, 7,5 % dick.'),
    ('sd8020', 'sd8020', 'SD8020', 'Leitwerk', 'Symmetrisches Selig/Donovan-Profil, 10 %.'),
]


def load(src):
    if src.startswith('ETH:'):
        return read_dat(ETH / 'Aerodynamics/Airfoils' / (src[4:] + '.dat'))
    return read_dat(DB / (src + '.dat'))


def branch(al, cl, cd, cm):
    """Anliegender Ast: vom Minimum von c_l vor dem Maximum bis zum ersten Maximum."""
    # erstes lokales Maximum, das nicht nur Rauschen ist
    imax = int(np.argmax(cl))
    for i in range(1, len(cl) - 1):
        if al[i] > 4 and cl[i] >= cl[i - 1] and cl[i] > cl[i + 1] and cl[i] > cl[i:i + 8].max() - 1e-4:
            imax = i
            break
    j = int(np.argmin(cl[:imax + 1]))
    s = slice(j, imax + 1)
    a, c, d, m = al[s], cl[s], cd[s], cm[s]
    # streng monoton steigend machen
    keep = [0]
    for i in range(1, len(c)):
        if c[i] > c[keep[-1]] + 1e-6:
            keep.append(i)
    return a[keep], c[keep], d[keep], m[keep], cl[imax], al[imax]


def polar_tables(foil, xtr_upper):
    cd_tab, a_tab, out = [], [], []
    for Re in RE:
        r = foil.aero(ALPHA, Re, n_crit=9.0, xtr_upper=xtr_upper)
        a, c, d, m, clmax, almax = branch(ALPHA, r['CL'], r['CD'], r['CM'])
        row_cd, row_a = [], []
        for t in CL:
            if c[0] <= t <= c[-1]:
                row_cd.append(int(round(np.interp(t, c, d) * 1e5)))
                row_a.append(round(float(np.interp(t, c, a)), 2))
            else:
                row_cd.append(None)
                row_a.append(None)
        # Nullauftriebswinkel und Auftriebsanstieg aus dem linearen Bereich
        a0 = float(np.interp(0.0, c, a)) if c[0] <= 0 <= c[-1] else float(a[0] - c[0] / 0.1)
        lin = (c > 0.1) & (c < 0.8)
        slope = float(np.polyfit(np.radians(a[lin]), c[lin], 1)[0]) if lin.sum() > 3 else 2 * np.pi * 0.95
        cm0 = float(np.mean(m[(c > 0.2) & (c < 0.9)])) if ((c > 0.2) & (c < 0.9)).sum() else float(np.mean(m))
        # Konfidenz nur im Betriebsbereich (c_l 0,2 bis c_l,max - 0,15)
        clv, cfv = r['CL'], r['conf']
        sel = (ALPHA <= almax) & (clv >= 0.2) & (clv <= clmax - 0.15)
        conf = cfv[sel]
        cd_tab.append(row_cd)
        a_tab.append(row_a)
        out.append(dict(clmax=round(float(clmax), 3), a0=round(a0, 2), slope=round(slope, 3), cm=round(cm0, 4),
                        conf=round(float(conf.min()) if conf.size else 0.0, 2)))
    return cd_tab, a_tab, out


def shape(foil, n=33):
    g = foil.geometry()
    beta = np.linspace(0, np.pi, n)
    xs = 0.5 * (1 - np.cos(beta))
    yu = np.interp(xs, g['xs'], g['yu'])
    yl = np.interp(xs, g['xs'], g['yl'])
    return dict(x=[round(float(v), 4) for v in xs], yu=[round(float(v), 4) for v in yu], yl=[round(float(v), 4) for v in yl]), g


def build(entry, tail=False):
    key, src, name, cat, desc = entry
    coords = load(src)
    foil = Foil(coords, name)
    sh, g = shape(foil)
    # Fit-Kontrolle: RMS-Abstand Kulfan-Kontur zu Originalkontur auf der Oberseite
    from nf_port import kulfan_coords
    x, yu, yl = kulfan_coords(foil.kp, 101)
    rms = float(np.sqrt(np.mean((np.interp(x, g['xs'], g['yu']) - yu) ** 2 + (np.interp(x, g['xs'], g['yl']) - yl) ** 2)))
    d = dict(key=key, name=name, cat=cat, desc=desc, tail=tail, src='NeuralFoil' if True else '',
             t=round(g['t'], 4), xt=round(g['xt'], 3), f=round(g['f'], 4), xf=round(g['xf'], 3),
             fit_rms=round(rms, 5), shape=sh, dat=dat_block(entry))
    cdn, an, metan = polar_tables(foil, 1.0)
    d['free'] = dict(cd=cdn, al=an, meta=metan)
    if not tail:
        cdt, at, metat = polar_tables(foil, 0.10)
        d['trip'] = dict(cd=cdt, al=at, meta=metat)
    return d


def eth_xfoil_entry(base):
    """MH 139F mit den XFoil-Polaren aus dem ETH-Werkzeug (init.m), auf dasselbe Raster gebracht."""
    src = (ETH / 'matlab_functions/aerodynamics/init.m').read_text()
    relist = [30000, 60000, 100000, 150000, 200000, 250000, 300000, 350000, 400000, 500000, 600000]
    blocks = {relist[int(k) - 1]: np.array([list(map(float, l.split())) for l in b.strip().splitlines() if len(l.split()) == 4])
              for k, b in re.findall(r'wingPolar\{(\d+)\}=\[\.\.\.(.*?)\];', src, re.S)}
    cd_tab, a_tab, meta = [], [], []
    res = sorted(blocks)
    for Re in RE:
        # nur im Datenbereich der ETH (30k ... 600k); darüber kein Eintrag
        if Re > res[-1] * 1.0001:
            cd_tab.append([None] * len(CL))
            a_tab.append([None] * len(CL))
            meta.append(None)
            continue
        # logarithmische Interpolation zwischen den Nachbar-Re
        lo = max(r for r in res if r <= Re)
        hi = min(r for r in res if r >= Re)
        rows = []
        for R in sorted({lo, hi}):
            e = blocks[R]
            a, c, d, m, clmax, almax = branch(e[:, 0], e[:, 1], e[:, 2], e[:, 3])
            rows.append((R, a, c, d, m, clmax))
        w = 0.0 if lo == hi else (np.log(Re) - np.log(lo)) / (np.log(hi) - np.log(lo))
        row_cd, row_a = [], []
        for t in CL:
            vals = []
            for (R, a, c, d, m, clmax) in rows:
                vals.append((np.interp(t, c, d), np.interp(t, c, a)) if c[0] <= t <= c[-1] else None)
            if any(v is None for v in vals):
                row_cd.append(None)
                row_a.append(None)
            else:
                cdv = vals[0][0] * (1 - w) + vals[-1][0] * w
                av = vals[0][1] * (1 - w) + vals[-1][1] * w
                row_cd.append(int(round(cdv * 1e5)))
                row_a.append(round(float(av), 2))
        clm = rows[0][5] * (1 - w) + rows[-1][5] * w
        a, c, d, m, _ = rows[0][1:]
        lin = (c > 0.1) & (c < 0.8)
        slope = float(np.polyfit(np.radians(a[lin]), c[lin], 1)[0]) if lin.sum() > 3 else 6.0
        a0 = float(np.interp(0.0, c, a)) if c[0] <= 0 <= c[-1] else -3.5
        cm0 = float(np.mean(m[(c > 0.2) & (c < 0.9)]))
        cd_tab.append(row_cd)
        a_tab.append(row_a)
        meta.append(dict(clmax=round(float(clm), 3), a0=round(a0, 2), slope=round(slope, 3), cm=round(cm0, 4), conf=1.0))
    d = dict(base)
    d.update(key='mh139f_xf', name='MH 139F (ETH-XFoil)', src='XFoil (ETH)',
             desc='Dasselbe Profil mit den originalen XFoil-Polaren aus dem ETH-Werkzeug fw_conceptual_design, nur bis Re 600.000. Zum Vergleich der Datenquellen.')
    d['free'] = dict(cd=cd_tab, al=a_tab, meta=meta)
    d.pop('trip', None)
    return d


def nn_block(size='xlarge'):
    """NeuralFoil-Netz für den Browser: alle Schichten, die letzte nur mit den Zeilen für c_l, c_d, c_m (1, 2, 3).
    Gewichte je Zeile auf int16 gerundet (Skala = größter Betrag / 32767), Base64, Zeilen nacheinander."""
    from nf_port import _nn
    p = _nn(size)
    idx = sorted({int(k.split('.')[1]) for k in p})
    layers = []
    for j, i in enumerate(idx):
        W = p[f'net.{i}.weight'].astype(np.float64)
        b = p[f'net.{i}.bias'].astype(np.float64)
        if j == len(idx) - 1:
            W, b = W[[1, 2, 3]], b[[1, 2, 3]]
        sw = np.abs(W).max(axis=1) / 32767
        sw[sw == 0] = 1e-12
        wq = np.round(W / sw[:, None]).astype('<i2')
        sb = float(np.abs(b).max() / 32767) or 1e-12
        bq = np.round(b / sb).astype('<i2')
        layers.append(dict(r=int(W.shape[0]), c=int(W.shape[1]), w=base64.b64encode(wq.tobytes()).decode(),
                           sw=[float('%.6e' % s) for s in sw], b=base64.b64encode(bq.tobytes()).decode(), sb=float('%.6e' % sb)))
    lic = (EXT / 'nf' / 'LICENSE.txt').read_text().strip()
    return dict(size=size, src='NeuralFoil (Sharpe & Hansman, MIT), Netz ' + size + ', Ausgänge c_l, c_d, c_m', license=lic, layers=layers)


def dat_block(entry):
    """Koordinaten für den CAD-Export: normiert wie für NeuralFoil (Nase im Ursprung, Hinterkante bei (1, 0)),
    Selig-Reihenfolge, auf 1e-5 gerundet; doppelte Punkte entfernt."""
    foil = Foil(load(entry[1]), entry[2])
    c = foil.norm
    pts = []
    for x, y in c:
        p = [round(float(x), 5), round(float(y), 5)]
        if not pts or p != pts[-1]:
            pts.append(p)
    return dict(x=[p[0] for p in pts], y=[p[1] for p in pts])


def refresh_nn():
    """Vorhandene Datei: Netz, Profilbeschreibungen und Koordinaten erneuern, Polaren unverändert."""
    out = json.loads(OUT.read_text())
    ent = {e[0]: e for e in WING + TAIL}
    for f in out['foils']:
        e = ent.get(f['key']) or ent.get(f['key'].replace('_xf', ''))
        if f['key'] in ent:
            f['desc'] = ent[f['key']][4]
        if e:
            f['dat'] = dat_block(e)
    out['nn'] = nn_block()
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print('written', OUT, OUT.stat().st_size // 1024, 'KB (Netz und Beschreibungen erneuert)')


def main():
    if '--nn-only' in sys.argv:
        refresh_nn()
        return
    foils = []
    for e in WING:
        d = build(e)
        foils.append(d)
        m = d['free']['meta']
        print(f"{d['key']:10s} t={d['t']:.3f} f={d['f']:.3f} fit={d['fit_rms']:.5f} clmax@100k={m[3]['clmax']:.2f} "
              f"@300k={m[7]['clmax']:.2f} conf={[x['conf'] for x in m]}")
        if e[0] == 'mh139f':
            foils.append(eth_xfoil_entry(d))
    for e in TAIL:
        d = build(e, tail=True)
        foils.append(d)
        print(f"{d['key']:10s} tail t={d['t']:.3f} fit={d['fit_rms']:.5f}")
    out = dict(re=RE, cl=CL, ncrit=9, trip_xc=0.10, source='NeuralFoil xxxlarge (Sharpe & Hansman, MIT), Koordinaten UIUC/AeroSandbox; MH 139F aus fw_conceptual_design (ETH)',
               foils=foils, nn=nn_block())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print('written', OUT, OUT.stat().st_size // 1024, 'KB', len(foils), 'Profile')


if __name__ == '__main__':
    main()

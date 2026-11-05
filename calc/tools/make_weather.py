"""
Erzeugt data/weather.json mit zwei echten stündlichen Datensätzen (je 8760 h):
  - PVGIS-TMY Piemont 45,0 N / 8,0 O (SARAH3 + ERA5, 2005–2023), aus den pvlib-Testdaten
  - IWEC Amsterdam (ASHRAE), aus den pvlib-Testdaten
Kodierung je Stunde 4 Byte: GHI/5, DHI/5, (T+40)*2, Wind*5  -> base64.
'tc' = Stundenmitte in UTC relativ zum Zeitstempel (Stunden), damit die Seite die Sonnenposition richtig zuordnet.
"""
import base64, json, math
import os
from pathlib import Path

EXT = Path(os.environ.get('UAV_EXT', Path(__file__).resolve().parents[2] / 'ext'))
D = EXT / 'pvlib/tests/data'
OUT = Path(__file__).resolve().parents[1] / 'data' / 'weather.json'


def enc(rows):
    b = bytearray()
    for g, d, t, w in rows:
        g = max(0.0, g); d = max(0.0, min(d, g))
        b += bytes([min(255, round(g / 5)), min(255, round(d / 5)), max(0, min(255, round((t + 40) * 2))), min(255, round(w * 5))])
    return base64.b64encode(bytes(b)).decode()


def symmetry_center(ghi_by_hour, noon_utc):
    """Schätzt die Lage des Stundenwerts relativ zum Zeitstempel aus der Symmetrie um den Sonnenmittag."""
    best = None
    for c in [x / 20 for x in range(-20, 21)]:
        err = 0
        for h in range(24):
            for h2 in range(24):
                pass
        # Vergleich: für jedes Paar Stunde h, Spiegelstunde h' = 2*(noon-c) - h
        err = 0; n = 0
        for h in range(5, 12):
            hm = 2 * (noon_utc - c) - h
            lo = math.floor(hm); fr = hm - lo
            if 0 <= lo < 23:
                v = ghi_by_hour[lo] * (1 - fr) + ghi_by_hour[lo + 1] * fr
                err += (ghi_by_hour[h] - v) ** 2; n += 1
        if best is None or err < best[0]:
            best = (err, c)
    return best[1]


# ---------- Piemont PVGIS TMY
j = json.loads((D / 'tmy_45.000_8.000_2005_2023.json').read_text())
rows = [(r['G(h)'], r['Gd(h)'], r['T2m'], r['WS10m']) for r in j['outputs']['tmy_hourly']]
assert len(rows) == 8760
byh = [0.0] * 24
for i, r in enumerate(rows):
    byh[i % 24] += r[0]
# Sonnenmittag in UTC bei 8° O, Jahresmittel der Zeitgleichung ~0
c_pv = symmetry_center(byh, 12 - 8 / 15)
print('PVGIS: Lage Stundenwert relativ Zeitstempel', c_pv, 'h  (Metadaten irradiance_time_offset', j['inputs']['location']['irradiance_time_offset'], ')')
piemont = dict(key='piemont', name='Piemont, Italien (45,0° N, 8,0° O)', lat=45.0, lon=8.0, elev=250,
               src='PVGIS-TMY 5.3, SARAH3/ERA5 2005–2023 (pvlib-Testdaten)', tc=0.176, utc=0, data=enc(rows))

# ---------- Amsterdam IWEC (EPW)
lines = (D / 'NLD_Amsterdam062400_IWEC.epw').read_text(errors='ignore').splitlines()
hdr = lines[0].split(',')
lat, lon, tz, elev = float(hdr[6]), float(hdr[7]), float(hdr[8]), float(hdr[9])
rows = []
for ln in lines[8:]:
    p = ln.split(',')
    if len(p) < 22:
        continue
    rows.append((float(p[13]), float(p[15]), float(p[6]), float(p[21])))
assert len(rows) == 8760, len(rows)
byh = [0.0] * 24
for i, r in enumerate(rows):
    byh[i % 24] += r[0]
# EPW: Stunde 1 = 0–1 Uhr Normalzeit, Index 0 -> Zeitstempel 0 Uhr Ortszeit = -tz UTC
c_epw = symmetry_center(byh, 12 - lon / 15 + tz)
print('EPW: Lage Stundenwert relativ Index (Ortszeit)', c_epw, 'h  erwartet ~0,5')
ams = dict(key='amsterdam', name='Amsterdam, Niederlande (52,3° N, 4,8° O)', lat=lat, lon=lon, elev=elev,
           src='IWEC (ASHRAE), typisches Jahr aus 1983–2001 (pvlib-Testdaten)', tc=0.5, utc=tz, data=enc(rows))

OUT.write_text(json.dumps(dict(sites=[piemont, ams]), ensure_ascii=False, separators=(',', ':')))
print(OUT, OUT.stat().st_size)

# Monatsmittel zur Kontrolle
for s, rr in (('piemont', [(r['G(h)'], r['T2m'], r['WS10m']) for r in j['outputs']['tmy_hourly']]), ('ams', [(float(p.split(',')[13]), float(p.split(',')[6]), float(p.split(',')[21])) for p in lines[8:]])):
    import calendar
    i = 0; out = []
    for m in range(1, 13):
        n = calendar.monthrange(2026, m)[1] * 24
        seg = rr[i:i + n]; i += n
        out.append((m, round(sum(x[0] for x in seg) / (n / 24) / 1000, 2), round(sum(x[1] for x in seg) / n, 1), round(sum(x[2] for x in seg) / n, 1)))
    print(s, out)

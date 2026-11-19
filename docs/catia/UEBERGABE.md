# Übergabe: Waldbrand-UAV in CATIA V5 aufbauen

Stand 19.11.2026. Diese Datei ist für die nächste Sitzung (Claude Code auf dem Windows-Rechner) geschrieben:
Was es schon gibt, was am Rechner vorhanden ist und wie man vorgehen sollte.

## 1. Worum es geht

- Studententeam, solares Starrflügel-UAV zur Waldbrandüberwachung (5–6 m Spannweite, 8–15 kg).
- Die Auslegung läuft im **Waldbrand-UAV-Rechner** (Browser). Repository `Divitare/waldbrand-uav-rechner`
  (öffentlich), Veröffentlichung über Cloudflare bei jedem Push auf `main`.
- Nächster Schritt: Den Entwurf aus dem Rechner **per Python-Skript in CATIA V5** aufbauen. Danach Bilder und
  Messwerte aus CATIA holen, mit dem Rechner vergleichen und die Skripte nachbessern.
- Der Rechner exportiert dafür die Geometrie als JSON („Datei → CAD-Geometrie für CATIA“). Diese Datei ist die
  einzige Schnittstelle; CATIA muss nichts vom Rechner wissen.

## 2. Was am Windows-Rechner vorhanden ist (geprüft am 19.11.2026)

| Was | Befund |
|---|---|
| CATIA | **V5-6R2012** (= V5R22), Hochschulversion „CATIA V5 für Hochschulen“, deutsche Oberfläche, `C:\Program Files\Dassault Systemes\B22\win_b64\code\bin\CNEXT.exe` |
| Lizenz | läuft; neues Part angelegt, **Generative Shape Design** geladen (Menü Einfügen zeigt Drahtmodell, Flächen, Volumen, Operationen) |
| Python | **3.14.3** (64 bit) unter `C:\Users\maxim\AppData\Local\Programs\Python\Python314\`; zusätzlich 3.15 installiert, das **nicht** verwenden |
| Pakete | `pywin32` und `pycatia` sind **nicht** installiert |
| Verhalten | CATIA hängt beim Laden einer Arbeitsumgebung oder eines neuen Dokuments 10–30 s („Keine Rückmeldung“); Dialoge öffnen sich teils am Bildschirmrand |

Der Nutzer möchte, dass nur freigegebene Ordner benutzt werden (kein Vollzugriff auf Explorer). Vorschlag:
ein Arbeitsordner, z. B. `C:\Users\maxim\Documents\UAV-CATIA\`, darin `skripte\`, `eingabe\` (JSON aus dem
Rechner), `modelle\` (CATParts), `bilder\`, `berichte\`.

## 3. Einrichten

```powershell
py -3.14 -m venv C:\Users\maxim\Documents\UAV-CATIA\.venv
C:\Users\maxim\Documents\UAV-CATIA\.venv\Scripts\python -m pip install pywin32 pycatia
```

Erster Test bei laufendem CATIA (Verbindung über COM):

```python
from pycatia import catia
caa = catia()
print(caa.name, caa.documents.count)
doc = caa.documents.add("Part")          # neues Part
print(doc.name)
```

Klappt `pycatia` mit R2012 nicht vollständig, geht alles auch direkt mit `win32com.client.Dispatch("CATIA.Application")`
(die Automation-Schnittstelle von V5 ist seit Jahren gleich; Methodennamen englisch, unabhängig von der deutschen Oberfläche).
Vor größeren Skripten jede benutzte API-Funktion einmal einzeln prüfen.

**Rückmeldung ohne Klicken** (dafür ist die Skriptsteuerung da):
- Bild: `caa.active_window.active_viewer.capture_to_file(format, pfad)` (COM: `ActiveWindow.ActiveViewer.CaptureToFile`),
  vorher Ansicht setzen (`reframe`, Blickrichtung über den Viewpoint).
- Messen: Arbeitsumgebung `SPAWorkbench` des Dokuments, `GetMeasurable(referenz)` → Fläche, Volumen, Schwerpunkt,
  Längen, Abstände. Damit die Kontrollwerte aus Abschnitt 6 prüfen.
- Nach jedem Schritt `part.update()` und das Part speichern (`.CATPart` im Ordner `modelle\`).

## 4. Die CAD-Datei aus dem Rechner

Zwei Wege:
1. Im Rechner: Knopf **Datei** → „CAD-Geometrie für CATIA“ → „Geometrie herunterladen (.json)“.
2. Ohne Browser aus einer Modelldatei (Export „Datei herunterladen“, `*.uav.json`), mit Node.js ab 20 und dem Repository:
   `node calc/tools/cad_export.cjs modell.uav.json eingabe\entwurf.cad.json`
   (ohne Modelldatei: Standardentwurf). Beispiel: `docs/catia/beispiel-standardentwurf.cad.json`.

Der Export wird in `calc/src/cad.js` erzeugt (Formel und Erklärung auch in `docs/BERECHNUNGEN.md`,
Eintrag „CAD-Export der Geometrie“).

### Konventionen

- Längen **mm** (auf 0,1 mm), Winkel **Grad**, Massen **g**, Trägheitsmomente kg·m².
- Achsen: **x nach hinten ab der Rumpfnase, y nach rechts (rechter Flügel), z nach oben**; Ursprung Rumpfnase auf der
  Rumpfachse. Nur die **rechte Hälfte**; symmetrisch zur xz-Ebene, also in CATIA spiegeln.
- Profile normiert auf Tiefe 1 (Nase (0, 0), Hinterkante (1, 0)), **Selig-Reihenfolge**: Hinterkante → Oberseite →
  Nase → Unterseite → Hinterkante. Originalkoordinaten (UIUC bzw. ETH), 60–300 Punkte.
- Schnitt bauen: Profil mit der Tiefe skalieren, um den **t/4-Punkt** um `twist_deg` drehen (**positiv = Nase hoch**),
  so verschieben, dass die Vorderkante auf `le` liegt. `le`/`te` sind die Punkte **nach** der Drehung; Kontrolle:
  |te − le| = chord. Schnitte stehen **senkrecht** (Ebenen parallel zur xz-Ebene), auch im V-Form-Bereich.

### Inhalt (Schlüssel)

| Schlüssel | Inhalt |
|---|---|
| `airfoils.wing`, `airfoils.tail` | Profilname, Dicke `t`, `coords` [[x, z], …] |
| `wing.sections[]` | `eta`, `label` (Wurzel, Knick, Querruder innen/außen, Teilung, Spitze), `y`, `chord`, `le`, `te`, `twist_deg`; bei ebenen Modulen `facets` [[x/c vorn, x/c hinten], …] je Modulreihe an diesem Schnitt |
| `wing.incidence_deg` | Einstellwinkel (Anstellwinkel der Wurzelsehne im Reiseflug, Rumpf liegt dann in Flugrichtung); ist in `twist_deg` schon enthalten |
| `wing.dihedral` | V-Form `deg` ab `from_y` (in den `le`-Höhen schon enthalten) |
| `wing.spar` | Holmart, Lage `x_c`, Höhe je Schnitt |
| `wing.ailerons` | `eta0`, `eta1`, Anzahl Segmente, Drehachse `hinge_x_c`, `hinge_line` (zwei 3D-Punkte), Ausschlag |
| `wing.splits` | Flügelteilungen (`eta`, `y`) |
| `htail` | Spannweite, Tiefe, `x_le`, `z`, `incidence_deg` (Vorschlag für Trimmung bei Ruder null), Höhenruder bzw. Pendelruder |
| `vtail` | Anzahl, `y`, Höhe, Wurzel-/Spitzentiefe, `x_le_root`/`x_le_tip`, `z_root`/`z_tip`, Seitenruderachse |
| `fuselage` | Typ, Länge, Durchmesser, `stations` [{x, z, d}] (Kreise mit Mittelpunkt z), `boom` (Rohr von `start` nach `end`, Durchmesser `d`, bei Doppelträger y = ±`y`) |
| `propulsion` | Anordnung, Propellerdurchmesser, Propellerebene `prop_plane_x`, Nabe `hub_z`, Motor, Gondel, Pylon |
| `landing` | Kufe (x, z) oder Bauchlandung |
| `solar` | `mount` (`bent` gebogen / `flat` eben), Zelle, Modulformat, bei eben `facet` (größte Abweichung, Knicke, Umschlag, Flächenanteil); `wing_modules[]` und `ht_modules[]`: je Modulreihe `corners` = vier 3D-Ecken auf der Oberseite (vorn innen, vorn außen, hinten außen, hinten innen) |
| `mass` | Gesamtmasse, Schwerpunkt `cg`, Trägheitsmomente, `items[]` mit Lage; **y > 0 heißt: je zur Hälfte bei +y und −y** |

Geprüft: Fläche aus den Schnitten = `wing.area_mm2`; Modulecken höchstens 0,3 mm neben der Profiloberseite
(zwischen den Schnitten linear).

## 5. Vorgehen in CATIA (Vorschlag)

Jeder Schritt ein eigenes Skript, das die JSON liest, ein eigenes geometrisches Set erzeugt, das Part speichert,
ein Bild schreibt und Kontrollwerte in `berichte\` ablegt. Erst weiter, wenn der Schritt stimmt.

1. **Ein Profil**: Punkte und Spline des Wurzelschnitts in einem geometrischen Set; Hinterkante geschlossen
   (Dicke beachten). Kontrolle: Tiefe, Dicke.
2. **Flügel**: alle Schnitte als Splines, je Abschnitt zwischen zwei Schnitten Mehrschnittfläche (gerade
   Kanten wie im Rechner), dann spiegeln. Kontrolle: projizierte Fläche, Spannweite, mittlere Profiltiefe.
3. **Holm, Querruderachse, Teilungen**: Linien und Ebenen; Querruder abtrennen.
4. **Leitwerke**: Höhenleitwerk (Rechteck, Leitwerksprofil, Einstellwinkel), Seitenleitwerk (trapezförmig).
5. **Rumpf und Träger**: Drehkörper bzw. Mehrschnittfläche durch die Kreise der Stationen; Rohr(e); Propellerkreis
   als Scheibe zum Prüfen der Freigänge.
6. **Solarmodule**: gebogen = Viereck auf die Flügeloberseite projizieren; eben = ebene Fläche durch die Ecken,
   Abstand zur Kontur messen (muss ≤ `solar.facet.deviation_max` sein).
7. **Massen**: Punkte mit Massen als Parameter; Schwerpunkt aus CATIA mit `mass.cg` vergleichen.
8. **Abgleich**: Abweichungen berichten. Liegt ein Fehler im Export, im Repository `calc/src/cad.js` ändern.

## 6. Braucht die neue Sitzung das Repository?

Nicht zwingend: Für die Skripte reicht die JSON-Datei mit dieser Beschreibung. **Lesezugriff ist aber nützlich**:
`calc/src/cad.js` (Definition des Formats), `calc/tools/cad_export.cjs` (Export ohne Browser),
`docs/BERECHNUNGEN.md` (alle Formeln mit Quellen), `docs/catia/beispiel-standardentwurf.cad.json`.

Falls am Rechner etwas geändert werden muss:
- Auf einem eigenen Zweig arbeiten, fertig per Fast-Forward nach `main` (jeder Push auf `main` wird veröffentlicht).
- Vor dem Commit `npm run build` (baut, prüft `docs/BERECHNUNGEN.md` gegen den Formelkatalog, läuft `calc/tests/check.cjs`);
  nach Änderungen am Formelkatalog `npm run docs`.
- Das Repository ist öffentlich: keine Passwörter oder Schlüssel einchecken. Das Team-Passwort ist nur ein
  Cloudflare-Secret; Tests nutzen lokal `test`.
- Antworten an den Nutzer auf Deutsch.

## 7. Fachlicher Stand, der für das CAD wichtig ist

- **Solarzellen**: SunPower E60 (oder Nachfolger), 125 × 125 mm pseudoquadratisch, 165 µm, in Streifenmodulen eine
  Zelle tief, bis 6 Zellen lang, wie AtlantikSolar (ETH). Moduldaten: 23,7 % am fertigen Modul, 590 g/m², 0,3 %/K.
  Die Module sollen in die Flügelstruktur integriert werden und dort die Bespannung ersetzen.
- **Gebogen oder eben**: Der Rechner vergleicht beides. Gebogen (Zellen folgen der Oberseite) ist aerodynamisch
  besser, wenn die Module stufenlos eingebettet sind; eben braucht auf 30 cm Tiefe 4–5 mm Abweichung und Knicke von
  6–10°, kostet rund 25 % Profilwiderstand. Im CAD beide Varianten darstellbar halten (`solar.mount`).
- **Offen**: Auf 30,5 cm Tiefe passen mit den Vorgaben des Rechners (Zellen bis 90 % der Tiefe, 2 mm Modulrand,
  3 mm Fuge, 0,10 % Dehnung) über weite Teile der Spannweite nur eine Zellreihe; AtlantikSolar hatte zwei Reihen über
  die ganze Spannweite. Mit 92 %, 1 mm Rand und 2 mm Fuge passen 68 von 88 Zellen, mit Querruderachse bei 90 % 80.
  Die Toleranzen des eigenen Moduls festlegen und im Rechner eintragen, bevor das CAD als endgültig gilt.
- Quelle für AtlantikSolar: Oettershagen, P. (2018), Dissertation ETH Zürich Nr. 24947 (Tab. 4.1, Kap. 5).

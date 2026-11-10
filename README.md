# Waldbrand-UAV-Rechner

Auslegungsrechner für ein solarbetriebenes Starrflügel-UAV zur Waldbrandüberwachung
(5–6 m Spannweite, 10–15 kg, BVLOS, SORA 2.5). Rechnet komplett im Browser; der
Cloudflare-Worker liefert die Seite aus, hält gemeinsame Teammodelle live synchron und holt PVGIS-Wetterdaten.

Ansichten: Übersicht, Flugzeug, Konfiguration, Schwerpunkt, Struktur, Antrieb, Flugdynamik, Ruder,
Profile, Komponenten, Energie, Wetter, Einsatz, Robustheit, SORA, Anforderungen, Entwurf, Validierung, Formeln, Team.

- **Bauraum und Freigang:** Motor, Motorgondel und Pylon liegen so, dass die Propellerblätter die Mindestabstände
  nach 14 CFR 23.925 einhalten (25,4 mm zur Struktur, 12,7 mm zur Blattebene, einstellbar). Geprüft wird der
  Propellerkreis gegen Rumpf, Träger, Flügel, Seiten- und Höhenleitwerk, dazu Boden und Heck bei der Landung,
  Leitwerk hinter der Gondel, Heckkegel nicht steiler als 15°. Nicht baubare Entwürfe meldet die Übersicht,
  die Seitenansicht zeigt den gesperrten Bereich rot; „Entwurf berechnen“ lässt nur baubare Entwürfe zu.
- **Solarzellen:** nur ganze quadratische Zellen (SunPower C60, 125 mm, oder eigene). Jede Zelle folgt der
  gewölbten Oberseite; aus dem zulässigen Stich (10 % je Zelle) und der Randdehnung folgt je Profil und
  Flügeltiefe, wie weit vorn und hinten Zellen liegen können. Schatten von Seitenleitwerk, Motorgondel, Pylon
  und Propellerkreis auf Flügel- und Leitwerkszellen, mit und ohne Bypassdioden.
- **Motor auf dem Seitenleitwerk:** Abschätzung des Propeller-Wirbelflatterns (Whirl Flutter) aus den
  Eigenformen von Seitenleitwerk und Träger, Blattelement-Luftkräften und Kreiselkopplung.
- **Anforderungen:** Jede Eingabe lässt sich über das Fähnchen am Feld festhalten (Feld gesperrt) oder auf einen
  Bereich bzw. erlaubte Werte begrenzen; Ergebnisse (Masse, SAIL, Excess Time, Flattersicherheit …) bekommen
  Mindest- und Höchstwerte. Was knapp an der Grenze liegt, ist markiert. Kommentare an Feldern, Ergebnissen und am Modell.
- **Entwurf berechnen:** sucht Entwürfe, die alle Anforderungen erfüllen und ein gewähltes Ziel verbessern
  (z. B. möglichst leicht, möglichst viel Nutzlast). Festgehaltenes bleibt, Bereiche begrenzen die Suche.
  Ein Lauf je Prozessorkern (bis acht) parallel im Browser, die Läufe tauschen ihre besten Entwürfe aus
  (Differential Evolution mit Machbarkeitsregeln und Neustart bei Stillstand, Feinschliff mit Evolutionsstrategie,
  Durchprobieren der Auswahlgrößen und Koordinatensuche, Aufräumen auf die Änderungen, die zählen); vier Stufen
  bis „sehr gründlich“ und „Weiterrechnen“ ab den besten Entwürfen der letzten Suche; bei wenigen freien Größen werden
  einfach alle Entwürfe gerechnet. Vor der Suche zeigt „Jetziger Entwurf“, welche Bedingungen schon jetzt verletzt
  sind, und „Woran hängt es?“, welche Größe daran etwas ändert – auch festgehaltene oder ausgeschaltete. Findet die
  Suche keinen zulässigen Entwurf, zeigt sie je Anforderung, was erreicht wurde und ob sie überhaupt von den freien
  Größen abhängt.
  Vorschläge mit Grundriss-Vergleich und Übernehmen/Rückgängig.
- **Datei:** Export und Import eines Modells mit allem (Eingaben, Komponenten, Wetter, Anforderungen, Kommentare).
- **Team:** gemeinsame Modelle mit einem Team-Passwort. Änderungen erscheinen sofort bei allen, die das Modell offen
  haben; verschiedene Stellen gelten beide, an derselben Stelle gilt die spätere. Anzeige, wer wo arbeitet,
  Verlauf mit Rückgängig, gespeicherte Stände, Papierkorb. Ohne Netz geht die Arbeit weiter und wird nachgereicht.

**Alle Formeln mit Quellen:** [`docs/BERECHNUNGEN.md`](docs/BERECHNUNGEN.md) (im Rechner: Ansicht *Formeln*).
Warnungen und Hinweise lassen sich aufklappen: Formel, Stellgrößen mit Sprung zum Eingabefeld und auf
Knopfdruck der Einfluss jeder Stellgröße.

## Arbeitsablauf

```
Änderung in calc/ oder worker/  →  git push auf main  →  Cloudflare baut, prüft, veröffentlicht
```

Cloudflare Workers Builds führt bei jedem Push auf `main` aus:

1. `npm run build` – erzeugt `public/index.html` aus `calc/`, prüft, ob `docs/BERECHNUNGEN.md` zum
   Formelkatalog passt, und prüft die Rechenkerne (AtlantikSolar, Goland-Flügel, typischer Profilschnitt
   mit Ruder, Navion, APC-Propeller, Standardentwurf, freies Flugzeug gegen Flugdynamik).
   **Schlägt eine Prüfung fehl, wird nichts veröffentlicht** – die alte Version bleibt online.
2. `npx wrangler deploy` – lädt Worker und Seite hoch.

Teammodelle liegen in Durable Objects (je Modell eine eigene SQLite-Datenbank mit Dokument, Verlauf und
Ständen), die Liste der Modelle in der D1-Datenbank; beides bleibt bei jedem Deploy erhalten.
Andere Zweige als `main` werden nur gebaut und geprüft (GitHub Actions), nicht veröffentlicht.

GitHub Actions: **Prüfung** (`check.yml`) baut und prüft bei jedem Push. **Teamarbeit** (`team.yml`) startet bei
Änderungen an Worker oder Teamarbeit die echte Cloudflare-Laufzeit im Runner (`wrangler dev`, workerd mit
Durable Objects und D1 lokal) und spielt mit zwei Browsern alle Teamfunktionen durch (`calc/tests/t16.cjs`);
das Passwort `test` gilt nur in diesem Lauf. Von Hand: Reiter *Actions* → *Teamarbeit* → *Run workflow*.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `calc/src/` | Rechenkern und Oberfläche, Reihenfolge in `calc/tools/modules.json` (siehe unten) |
| `calc/src/formulas.js` | Formelkatalog mit Quellen; daraus entstehen Ansicht *Formeln* und `docs/BERECHNUNGEN.md` |
| `docs/BERECHNUNGEN.md` | erzeugt mit `npm run docs`, nicht von Hand ändern |
| `calc/data/` | Profilpolaren, Wetterdaten, Komponententexte (eingebettet in die Seite) |
| `calc/tools/build.mjs` | baut `dist/uav-budget.html` (Einzelseite) und `public/index.html` (Worker-Seite) |
| `calc/tools/*.py` | erzeugen `calc/data/` neu (nur bei Bedarf, brauchen externe Quellen unter `ext/`) |
| `calc/tests/` | `check.cjs` (Prüfung vor dem Deploy), weitere Rechen- und Browsertests, `cfsim.mjs` (Cloudflare-Nachbildung) |
| `worker/index.js` | Worker: Seite, `/api/team` (Modelle; je Modell ein Durable Object `ModelRoom` mit WebSocket), `/api/pvgis` |
| `worker/schema.sql` | Tabelle `models` der D1-Datenbank (legt der Worker auch selbst an) |
| `wrangler.jsonc` | Worker-Konfiguration: D1-Datenbank `uav-budget`, Durable Object `ModelRoom` (SQLite) |

`public/index.html` und `dist/` sind Build-Ergebnisse und stehen nicht im Repository.

Rechenkern in `calc/src/`:

| Datei | Inhalt |
|---|---|
| `core.js` | Atmosphäre, Profilpolaren, Widerstand, Antrieb (Impuls), Flügelstruktur, Rechenfall |
| `vlm.js` | Wirbelgitter (Weissinger) mit Pfeilung |
| `layout.js` | Rumpfformen, Leitwerk, drei Motoranordnungen, Massen in x/y/z, Schwerpunkt, Trägheit, Neutralpunkt, Trimmung |
| `harness.js` | Verkabelung je Konfiguration (Spannungsfall, Erwärmung, Masse) |
| `ground.js`, `tail.js` | Landung ohne Fahrwerk, Hand-/Katapultstart; Leitwerk, Träger, Rumpfröhre, Pylon und Motorgondel als tragende Bauteile |
| `bau.js` | Bauraum und Freigang: Propellerkreis gegen alle Teile (14 CFR 23.925), Boden, Heck, Flügellage |
| `shade.js` | Schatten von Seitenleitwerk, Motorgondel, Pylon und Propeller auf den Zellen, Verschaltung mit und ohne Bypassdioden |
| `prop.js`, `power.js` | Propeller (Blattelement) und Motor; Propellerstrahl, Drall, Normalkraft, Schubmoment |
| `aeroel.js`, `vib.js` | Balkenmodell, Divergenz, Flattern; freies Flugzeug, Leitwerks- und Ruderflattern, Propeller-Wirbelflattern, Massenausgleich, Standschwingversuch |
| `dyn.js`, `controls.js` | Flugdynamik (MIL-F-8785C); Quer-, Höhen- und Seitenruder |
| `batt.js`, `turb.js` | Akkuspannung über dem Ladezustand; Dryden-Turbulenz und Bildruhe an der Kamera |
| `sim.js`, `ext.js` | Sonne, Wetter, Tages- und Dauerflug, Energie in der Höhe; Einsatzleistung, SORA, Unsicherheit |
| `solar.js` | ganze quadratische Zellen auf Flügel und Höhenleitwerk packen; Zellband je Profil und Tiefe aus Stich und Dehnung der gebogenen Zelle |
| `kenn.js`, `opt.js` | Kenngrößen mit Richtung und Rechenaufwand, Grundbedingungen; Entwurfsvorschläge (Optimierer, auch im Web Worker) |

Oberfläche: `ui-*.js` (Ansichten, `ui-doc.js` Datei, `ui-req.js` Anforderungen und Kommentare, `ui-opt.js` Entwurf),
`team.js`/`team.html`/`team.css` nur in der Worker-Seite.

## Einmalige Einrichtung

### 1. Repository auf GitHub

Leeres Repository anlegen (ohne README), dann:

```bash
git remote add origin https://github.com/<konto>/waldbrand-uav-rechner.git
git push -u origin main
```

### 2. Cloudflare mit dem Repository verbinden

**Worker gibt es schon** (Name `waldbrand-uav-rechner`):
Cloudflare-Dashboard → **Workers & Pages** → `waldbrand-uav-rechner` → **Settings** → **Builds** → **Connect**,
GitHub-Konto autorisieren, Repository wählen.

**Worker gibt es noch nicht:** **Workers & Pages** → **Create application** → **GitHub** →
Repository wählen.

Einstellungen in beiden Fällen:

| Feld | Wert |
|---|---|
| Branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | leer lassen (`/`) |

Der Worker-Name im Dashboard muss `waldbrand-uav-rechner` sein wie in `wrangler.jsonc`, sonst bricht der Build ab.

### 3. Team-Passwort und Datenbank (nur falls noch nicht geschehen)

- Team-Passwort: Worker → **Settings** → **Variables and Secrets** → Secret `TEAM_KEY` anlegen
  (oder `npx wrangler secret put TEAM_KEY`). Secrets bleiben über alle Deploys erhalten. Ohne Secret
  meldet die Ansicht Team, dass noch kein Passwort gesetzt ist; der Rechner selbst läuft trotzdem.
- Datenbank: Die D1-Datenbank `uav-budget` ist in `wrangler.jsonc` eingetragen und angelegt; die Tabelle
  `models` legt der Worker beim ersten Zugriff an.
- Durable Objects: Die Klasse `ModelRoom` legt der erste Deploy über den Eintrag `migrations` in
  `wrangler.jsonc` an (SQLite-Speicher, im Free-Plan enthalten). Diesen Eintrag nie ändern oder entfernen.

Danach genügt ein Push auf `main`. Den Build-Verlauf zeigt Cloudflare unter **Deployments**,
GitHub zeigt am Commit ein Häkchen oder Kreuz.

## Lokal arbeiten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm run build          # Seiten bauen und prüfen; dist/uav-budget.html direkt im Browser öffnen
npm run docs           # docs/BERECHNUNGEN.md nach Änderungen am Formelkatalog neu erzeugen
npm install            # Wrangler für den lokalen Worker
echo 'TEAM_KEY="test"' > .dev.vars
npm run dev            # http://localhost:8787 mit Teamarbeit
```

Ohne Wrangler und Cloudflare-Konto: `npm run teamsim` startet eine Nachbildung der Cloudflare-Laufzeit
(`calc/tests/cfsim.mjs`: Durable Objects mit SQLite über `node:sqlite`, WebSockets, D1, Seiten aus `public/`)
unter http://127.0.0.1:8787 mit dem Team-Passwort `test`. Sie braucht Node.js 22 und das Paket `ws`
(kommt mit Wrangler).

Wer lokal `npm install` ausführt, sollte die entstehende `package-lock.json` mit einchecken,
damit Cloudflare immer dieselbe Wrangler-Version verwendet.

Browsertests (`calc/tests/t*.cjs`, `interact.cjs`, `presets.cjs`, `hint.cjs`, `elshot.cjs`) brauchen Playwright
und öffnen `dist/uav-budget.html`; Bilder landen in `calc/tests/out/`. `t15.cjs` prüft „Entwurf berechnen“ im
Browser, `t18.cjs` dasselbe bei unerreichbaren Anforderungen (Diagnose, Weiterrechnen), `t19.cjs` bei nicht baubarem
Ausgangsentwurf (verletzte Bauraum-Prüfung, „Woran hängt es?“), `t17.cjs` den Optimierer im
Rechenkern (auch mehrere Inseln mit Austausch und eine Grenze bei null), `t16.cjs` die Teamarbeit mit zwei Browsern gegen die Nachbildung
oder mit `TEAM_BASE=http://127.0.0.1:8787` gegen `npm run dev`.

## Zugriff

- Der Rechner selbst ist für alle mit dem Link nutzbar; ohne Anmeldung bleibt alles im eigenen Browser.
- Teammodelle lesen und ändern: nur mit dem Team-Passwort (ein gemeinsames für alle, keine Konten). Der Name
  beim Anmelden dient nur der Anzeige. Das Passwort steht im Browser, bis man sich abmeldet.
- Soll die Seite nicht öffentlich sein: beim Worker unter **Settings → Domains & Routes**
  Cloudflare Access aktivieren und die E-Mail-Adressen des Teams freigeben.

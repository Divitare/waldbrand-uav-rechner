# Waldbrand-UAV-Rechner

Auslegungsrechner für ein solarbetriebenes Starrflügel-UAV zur Waldbrandüberwachung
(5–6 m Spannweite, 10–15 kg, BVLOS, SORA 2.5). Läuft komplett im Browser; der
Cloudflare-Worker liefert die Seite aus, speichert Team-Varianten und holt PVGIS-Wetterdaten.

Ansichten: Übersicht, Flugzeug, Schwerpunkt, Struktur, Antrieb, Flugdynamik, Profile,
Komponenten, Energie, Wetter, Einsatz, Robustheit, SORA, Validierung, Team.

## Arbeitsablauf

```
Änderung in calc/ oder worker/  →  git push auf main  →  Cloudflare baut, prüft, veröffentlicht
```

Cloudflare Workers Builds führt bei jedem Push auf `main` aus:

1. `npm run build` – erzeugt `public/index.html` aus `calc/` und prüft die Rechenkerne
   (AtlantikSolar, Goland-Flügel, Navion, APC-Propeller, Standardentwurf).
   **Schlägt eine Prüfung fehl, wird nichts veröffentlicht** – die alte Version bleibt online.
2. `npx wrangler deploy` – lädt Worker und Seite hoch.

Gespeicherte Team-Varianten liegen in der D1-Datenbank und bleiben bei jedem Deploy erhalten.
Andere Zweige als `main` werden nur gebaut und geprüft (GitHub Actions), nicht veröffentlicht.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `calc/src/` | Rechenkern (`core.js`, `vlm.js`, `layout.js`, `prop.js`, `aeroel.js`, `dyn.js`, `sim.js`, `ext.js`, `defaults.js`) und Oberfläche (`ui-*.js`, `ui.html`, `ui.css`, `team.*`) |
| `calc/data/` | Profilpolaren, Wetterdaten, Komponententexte (eingebettet in die Seite) |
| `calc/tools/build.mjs` | baut `dist/uav-budget.html` (Einzelseite) und `public/index.html` (Worker-Seite) |
| `calc/tools/*.py` | erzeugen `calc/data/` neu (nur bei Bedarf, brauchen externe Quellen unter `ext/`) |
| `calc/tests/` | `check.cjs` (Prüfung vor dem Deploy), weitere Rechen- und Browsertests |
| `worker/index.js` | Worker: Seite, `/api/variants` (Team-Speicher), `/api/pvgis` |
| `worker/schema.sql` | Tabellenschema der D1-Datenbank |
| `wrangler.jsonc` | Worker-Konfiguration, D1-Datenbank `uav-budget` |

`public/index.html` und `dist/` sind Build-Ergebnisse und stehen nicht im Repository.

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
  (oder `npx wrangler secret put TEAM_KEY`). Secrets bleiben über alle Deploys erhalten.
- Datenbank: Die D1-Datenbank `uav-budget` ist in `wrangler.jsonc` eingetragen und angelegt.
  Bei einer neuen Datenbank einmal `npm run db:remote` ausführen.

Danach genügt ein Push auf `main`. Den Build-Verlauf zeigt Cloudflare unter **Deployments**,
GitHub zeigt am Commit ein Häkchen oder Kreuz.

## Lokal arbeiten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm run build          # Seiten bauen und prüfen; dist/uav-budget.html direkt im Browser öffnen
npm install            # Wrangler für den lokalen Worker
npm run db:local
echo 'TEAM_KEY="test"' > .dev.vars
npm run dev            # http://localhost:8787 mit Team-Speicher
```

Wer lokal `npm install` ausführt, sollte die entstehende `package-lock.json` mit einchecken,
damit Cloudflare immer dieselbe Wrangler-Version verwendet.

Browsertests (`calc/tests/shot6.cjs`, `interact.cjs`, `presets.cjs`, `elshot.cjs`) brauchen Playwright
und öffnen `dist/uav-budget.html`; Bilder landen in `calc/tests/out/`.

## Zugriff

- Lesen und Laden von Varianten: alle mit dem Link.
- Speichern, Überschreiben, Löschen: nur mit Team-Passwort.
- Soll die Seite nicht öffentlich sein: beim Worker unter **Settings → Domains & Routes**
  Cloudflare Access aktivieren und die E-Mail-Adressen des Teams freigeben.

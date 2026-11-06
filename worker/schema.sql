-- Liste der Teammodelle in der Cloudflare-D1-Datenbank "uav-budget".
-- Der Worker legt die Tabelle beim ersten Zugriff selbst an; diese Datei dient lokalen Tests (npm run db:local)
-- und als Nachweis. Die Modelle selbst (Dokument, Verlauf, Stände) liegen in den Durable Objects (ModelRoom).
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  deleted_at INTEGER,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_models_updated ON models (updated_at DESC);
-- Frühere Tabelle "variants" (Team-Varianten bis Version 7) wird nicht mehr benutzt.

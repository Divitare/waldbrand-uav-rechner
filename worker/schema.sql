-- Bereits in der Cloudflare-D1-Datenbank "uav-budget" angelegt.
-- Nur für lokale Tests nötig: npm run db:local
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  mass_kg REAL,
  power_w REAL,
  verdict TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_variants_updated ON variants (updated_at DESC);

-- Utaeru D1 schema (Phase 4C)
-- The streamers table already exists in production; do not recreate it here.
--
-- Expected existing table:
--   CREATE TABLE streamers (
--     streamer_id TEXT PRIMARY KEY,
--     public_data  TEXT NOT NULL,
--     created_at   TEXT NOT NULL DEFAULT (datetime('now')),
--     updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
--   );

CREATE TABLE IF NOT EXISTS users (
  google_sub TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  picture    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS streamer_owners (
  streamer_id TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (google_sub),
  claimed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_streamer_owners_user_id
  ON streamer_owners (user_id);

-- Phase 5: Anonymous ownership via edit key (hash only, never store plaintext)
-- Safe to run on production: CREATE IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS streamer_edit_keys (
  streamer_id TEXT PRIMARY KEY,
  key_hash    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);

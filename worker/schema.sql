-- Utaeru D1 schema (Phase 4C production)
-- These tables already exist in production utaeru-db. This file documents the live schema only.
-- Do NOT run destructive migrations against production.

-- streamers (Phase 4B + Phase 7 soft delete)
-- CREATE TABLE streamers (
--   streamer_id TEXT PRIMARY KEY,
--   public_data  TEXT NOT NULL,
--   created_at   TEXT NOT NULL,
--   updated_at   TEXT NOT NULL,
--   deleted_at   TEXT
-- );

-- users (Phase 4C-2)
-- CREATE TABLE users (
--   user_id        TEXT PRIMARY KEY,
--   google_sub     TEXT NOT NULL UNIQUE,
--   email          TEXT,
--   display_name   TEXT,
--   created_at     TEXT NOT NULL,
--   last_login_at  TEXT NOT NULL
-- );

-- streamer_owners (Phase 4C-2)
-- CREATE TABLE streamer_owners (
--   streamer_id TEXT PRIMARY KEY,
--   user_id     TEXT NOT NULL REFERENCES users(user_id),
--   created_at  TEXT NOT NULL
-- );

-- streamer_edit_keys (Phase 5)
-- Anonymous ownership: SHA-256 hash of edit key (+ server pepper). Plaintext never stored.
-- CREATE TABLE streamer_edit_keys (
--   streamer_id TEXT PRIMARY KEY,
--   key_hash    TEXT NOT NULL,
--   created_at  TEXT NOT NULL,
--   revoked_at  TEXT
-- );

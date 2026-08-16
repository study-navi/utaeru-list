-- Manual rollback only. SQLite cannot DROP COLUMN on older builds; recreate if needed.
-- Phase 7 down migration is documented for operators; do not run against production casually.

DROP INDEX IF EXISTS idx_streamers_created_at;
DROP INDEX IF EXISTS idx_streamers_deleted_at;

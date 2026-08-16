-- Phase 7: soft delete for public pages (non-destructive migration)
-- Existing rows keep deleted_at = NULL (including hiro).

ALTER TABLE streamers ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_streamers_deleted_at ON streamers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_streamers_created_at ON streamers(created_at);

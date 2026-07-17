-- Batch C (v2) — task scheduled duration. The deadline (due_at) doubles as the
-- calendar block's start; duration_min gives its length (defaults to 30 in the
-- service). Blocks may overlap; no collision logic. Drops the earlier, reverted
-- start_at/end_at experiment if present. Additive & nullable — no data loss.
ALTER TABLE tasks DROP COLUMN IF EXISTS start_at;
ALTER TABLE tasks DROP COLUMN IF EXISTS end_at;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_min int;

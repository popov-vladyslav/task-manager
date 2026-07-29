-- Recurring occurrences that were never completed used to pile up: the engine
-- spawns a new one each period while yesterday's stays open. They are now closed
-- out with a terminal 'missed' status instead of being deleted, so history and
-- future streak/stats work survive.
--
-- Only the recurrence engine writes 'missed'; ordinary one-off overdue tasks are
-- deliberately left alone (they are surfaced by the morning summary).
--
-- Schema change only — this does NOT touch existing rows. The one-off backfill
-- for occurrences already stacked up is a separate, confirmation-gated script:
--   npm --workspace server exec tsx src/db/backfill-missed-occurrences.ts        (dry run)
--   npm --workspace server exec tsx src/db/backfill-missed-occurrences.ts --apply

-- The CHECK was declared inline in 0000_init.sql, so its name is generated.
-- Find it by definition rather than assuming, then replace it with a named one.
DO $$
DECLARE
  conname_found text;
BEGIN
  SELECT c.conname INTO conname_found
  FROM pg_constraint c
  WHERE c.conrelid = 'tasks'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%';

  IF conname_found IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', conname_found);
  END IF;
END $$;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('active', 'waiting', 'done', 'missed'));

-- The open-task index skipped only 'done'; 'missed' is terminal too.
DROP INDEX IF EXISTS idx_tasks_open;
CREATE INDEX idx_tasks_open ON tasks (status, context_id)
  WHERE status NOT IN ('done', 'missed');

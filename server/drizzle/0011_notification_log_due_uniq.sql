-- Due-time pushes: a second delivery channel alongside 'initial' reminders, so a
-- task with both a remind_at and a due_at produces two distinct pushes. The send
-- is claim-then-send exactly like drizzle/0009 — this partial unique index is
-- what makes the claim exclusive, so two concurrent cron ticks cannot both
-- deliver.
--
-- No dedupe prelude (unlike 0009, which had to clean up duplicates that already
-- existed): no 'due' rows have ever been written.

-- The `kind` column is NOT free-form: 0000_init.sql constrains it to
-- ('initial','repeat'). Widening the TypeScript enum in db/schema.ts is therefore
-- not enough on its own — without this the first 'due' insert fails the CHECK.
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_kind_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_kind_check
  CHECK (kind IN ('initial','repeat','due'));

CREATE UNIQUE INDEX IF NOT EXISTS notification_log_due_uniq
  ON notification_log (task_id)
  WHERE kind = 'due';

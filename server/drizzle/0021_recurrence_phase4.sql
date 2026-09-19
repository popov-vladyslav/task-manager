-- Phase 4 (calendar + recurrence). Every change here is additive or widening, so
-- it ships with the code rather than after it: older code ignores the new
-- columns and the new table. See the plan's rollback note for the one caveat --
-- 'skipped' rows must be rewritten to 'missed' before reverting to code that
-- does not know the status, or they would read as open.

-- A rule can now stop on a date, opt out of completion tracking (an untracked
-- routine closes as 'skipped' instead of 'missed'), and carry the block length
-- the calendar projects its future occurrences with.
ALTER TABLE recurrence_rules
  ADD COLUMN until             date,
  ADD COLUMN tracks_completion boolean NOT NULL DEFAULT true,
  ADD COLUMN duration_min      integer;

-- Backfill duration from each rule's most recent occurrence, so existing rules
-- project at the length their tasks already use. Rules that never spawned a
-- task with a duration stay null; the projector falls back to its default.
UPDATE recurrence_rules r
SET duration_min = t.duration_min
FROM (
  SELECT DISTINCT ON (recurrence_id) recurrence_id, duration_min
  FROM tasks
  WHERE recurrence_id IS NOT NULL AND duration_min IS NOT NULL
  ORDER BY recurrence_id, created_at DESC
) t
WHERE t.recurrence_id = r.id;

-- 'skipped' is terminal like 'done' and 'missed': an occurrence of an untracked
-- routine that simply passed. Named constraint since 0006, so replace it by name.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('active', 'waiting', 'done', 'missed', 'skipped'));

-- The open-task index must skip the new terminal status too.
DROP INDEX IF EXISTS idx_tasks_open;
CREATE INDEX idx_tasks_open ON tasks (status, context_id)
  WHERE status NOT IN ('done', 'missed', 'skipped');

-- One moved occurrence of a rule. Both the calendar projection and the spawner
-- read these, so a moved ghost spawns -- and reminds -- at the moved time.
-- occurs_on is the day the rule would have matched, not the day it moved to.
CREATE TABLE recurrence_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id    uuid NOT NULL REFERENCES recurrence_rules(id) ON DELETE CASCADE,
  occurs_on  date NOT NULL,
  due_at     timestamptz,
  remind_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, occurs_on)
);
CREATE INDEX idx_recurrence_overrides_rule ON recurrence_overrides (rule_id, occurs_on);

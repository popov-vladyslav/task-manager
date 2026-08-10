-- One-off repair for tasks that were rescheduled before the due-claim release
-- existed. The due claim is keyed on task_id alone (0011), and updateTask did not
-- clear it, so moving a task's deadline left the row written for the OLD deadline
-- in place — permanently suppressing the push for the new one. The code fix ships
-- with this migration; this heals the rows already stranded by the old behaviour.
--
-- Restricted to due_at strictly in the FUTURE, deliberately. For those tasks no
-- legitimate send can have happened yet for the current deadline, so the row can
-- only be a stale claim from a previous one — deleting it cannot cause a
-- duplicate. Tasks whose due_at is in the past are left alone: there the row may
-- record a delivery that genuinely happened, and re-claiming could double-notify.
--
-- Backfill is impossible either way: sendDueNotifications filters on
-- gte(due_at, now - DUE_SEND_WINDOW_MS), so a deadline outside that window stays
-- silent whatever notification_log says.

DELETE FROM notification_log n
USING tasks t
WHERE n.task_id = t.id
  AND n.kind = 'due'
  AND t.due_at > now();

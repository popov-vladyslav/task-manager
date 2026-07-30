-- Duplicate push notifications: send-reminders used to check "has this task an
-- 'initial' log row?" and only write that row *after* sending. Two runs entering
-- that window together (a deploy overlap, or a second API process on the same DB)
-- both passed the check and both sent. It happened twice in production, each time
-- as two 'initial' rows for one task ~250ms apart inside a single cron tick.
--
-- The send is now claim-then-send: the log row is inserted first, and the push
-- goes out only if that insert won. This index is what makes the claim exclusive
-- — without it "insert first" would just narrow the race instead of closing it.
--
-- 'repeat' rows are deliberately NOT covered: repeats are supposed to recur, and
-- are bounded by their time window instead. Concurrent repeat runs are prevented
-- by the scheduler's advisory job lock.

-- The index cannot be created while duplicates exist. Keep the earliest row per
-- task (the one whose push actually informed the user first) and drop the later
-- ones — these are delivery-log rows for pushes already sent, so removing the
-- surplus loses no user-visible state.
DELETE FROM notification_log a
USING notification_log b
WHERE a.kind = 'initial'
  AND b.kind = 'initial'
  AND a.task_id = b.task_id
  AND a.task_id IS NOT NULL
  AND (b.sent_at, b.id) < (a.sent_at, a.id);

CREATE UNIQUE INDEX IF NOT EXISTS notification_log_initial_uniq
  ON notification_log (task_id)
  WHERE kind = 'initial';

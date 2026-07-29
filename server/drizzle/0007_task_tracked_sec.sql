-- Tracked time was transient: the timer only lived in the app's memory, so it was
-- lost on restart and never accumulated across sessions.
--
-- time_entries already stores every interval as its own row (started_at/ended_at)
-- — that history is kept as the source of truth. This adds a denormalized total
-- on the task, written whenever an interval is closed, so lists and the MCP
-- payload can show it without a per-task aggregate query.
ALTER TABLE tasks ADD COLUMN tracked_sec integer NOT NULL DEFAULT 0;

-- Seed the new column from the intervals already recorded. Derived data only:
-- it recomputes exactly what time_entries already says, and re-running it would
-- produce the same numbers.
UPDATE tasks t
SET tracked_sec = COALESCE(agg.total, 0)
FROM (
  SELECT task_id, FLOOR(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))))::int AS total
  FROM time_entries
  WHERE ended_at IS NOT NULL
  GROUP BY task_id
) agg
WHERE agg.task_id = t.id;

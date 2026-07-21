-- CR02 §1: recurring instances may be dateless. A rule carries an optional
-- default_due_time; when set, each spawned instance gets a due_at at that time
-- (and shows on the calendar). When null, instances spawn without a due_at.
ALTER TABLE recurrence_rules ADD COLUMN default_due_time time;

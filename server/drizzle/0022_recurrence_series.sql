-- A series that was split with "this and all following" is several rules that
-- belong together. They share a group key so "delete the whole series" is one
-- scoped UPDATE, however many times the series was split. Additive: older code
-- ignores the column. Rules split before this migration are not linked.
ALTER TABLE recurrence_rules ADD COLUMN series_id uuid;
CREATE INDEX idx_recurrence_rules_series ON recurrence_rules (user_id, series_id);

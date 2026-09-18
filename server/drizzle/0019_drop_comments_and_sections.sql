-- Contracting migration. comments were replaced by tasks.note (ADR 0006); the sections
-- feature (0017, 0018) was removed on 2026-09-18. No code reads or writes these objects.
-- Ship only after that code is live in the target environment (stage first, prod last).
-- Drop the column that references sections before the sections table itself.
DROP TABLE IF EXISTS comments;
ALTER TABLE tasks DROP COLUMN IF EXISTS section_id, DROP COLUMN IF EXISTS sort_section;
ALTER TABLE contexts DROP COLUMN IF EXISTS sections_enabled;
DROP TABLE IF EXISTS sections;

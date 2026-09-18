CREATE TABLE sections (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_id integer NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort       real NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sections_context ON sections (context_id, sort);

ALTER TABLE tasks ADD COLUMN section_id uuid REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN sort_section real NOT NULL DEFAULT 0;
CREATE INDEX idx_tasks_section ON tasks (section_id, sort_section);

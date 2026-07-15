-- Task Manager "Log" — initial schema (tech_spec.md §2).
-- Ordered by FK dependency. `priority` is intentionally omitted (out of scope).

CREATE TABLE contexts (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  label       text NOT NULL,
  color       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  archived    boolean NOT NULL DEFAULT false
);

CREATE TABLE recurrence_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  context_id    int REFERENCES contexts(id),
  rule          text NOT NULL,
  remind_time   time,
  due_offset_d  int DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  last_spawned  date
);

CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  context_id    int REFERENCES contexts(id),
  status        text CHECK (status IN ('active','waiting','done')) DEFAULT 'active',
  due_at        timestamptz,
  remind_at     timestamptz,
  sort_global   real NOT NULL DEFAULT 0,
  sort_context  real NOT NULL DEFAULT 0,
  recurrence_id uuid REFERENCES recurrence_rules(id),
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_via   text CHECK (created_via IN ('app','mcp')) DEFAULT 'app'
);
CREATE INDEX idx_tasks_open ON tasks (status, context_id) WHERE status != 'done';

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  r2_key     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routines (
  id         serial PRIMARY KEY,
  title      text NOT NULL,
  time_hint  time,
  sort_order int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE routine_completions (
  routine_id int  REFERENCES routines(id) ON DELETE CASCADE,
  day        date NOT NULL,
  done_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (routine_id, day)
);

CREATE TABLE time_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at   timestamptz
);
-- One active task at a time:
CREATE UNIQUE INDEX one_running_timer ON time_entries ((true)) WHERE ended_at IS NULL;

CREATE TABLE notification_log (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id  uuid REFERENCES tasks(id) ON DELETE CASCADE,
  kind     text CHECK (kind IN ('initial','repeat')),
  sent_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_tokens (
  token      text PRIMARY KEY,
  device     text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE auth_tokens (
  token_hash text PRIMARY KEY,
  kind       text CHECK (kind IN ('magic','refresh')),
  expires_at timestamptz NOT NULL
);

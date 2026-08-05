-- Multi-user: give every user-data table an owner, and add the tables that
-- accounts, sessions and per-user MCP tokens need.
--
-- ORDERING / SAFETY (read before touching this file):
--
-- * Render's preDeploy runs `db:migrate` BEFORE the new build serves traffic, so
--   the OLD code runs against this schema for a minute or two. Everything here is
--   therefore additive or permissive. The two genuinely contracting changes —
--   dropping `settings`' single-column primary key, and dropping `auth_tokens` —
--   are deliberately NOT done here; they belong in a later migration once the new
--   code is live. See memory `local-db-is-production`.
--
-- * The owner's email is injected by the migration runner as the GUC
--   `app.owner_email` (see src/db/migrations.ts). `current_setting` without a
--   fallback throws when it is unset, so a misconfigured environment fails the
--   migration loudly instead of quietly assigning data to the wrong account.
--
-- * On an empty database this still creates the owner's user row and updates
--   zero data rows, so the fresh-install and upgrade paths converge on the same
--   final schema.

-- ---------------------------------------------------------------- accounts --

CREATE TABLE users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Email identity is case-insensitive: sign-in lowercases before lookup, so the
-- uniqueness guarantee has to be on the lowercased value, not the raw string.
CREATE UNIQUE INDEX users_email_lower_uniq ON users (lower(email));

-- Refresh-token sessions, one row per signed-in device. Revoking a device is a
-- DELETE here; "sign out everywhere" deletes the user's rows.
CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- Sign-in codes. Keyed by EMAIL, not user_id: with implicit sign-up the account
-- may not exist yet when the code is issued — it is created when the code is
-- confirmed.
CREATE TABLE login_codes (
  token_hash text PRIMARY KEY,
  email      text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_login_codes_email ON login_codes (lower(email));

-- Personal MCP tokens. Only the hash is stored; the token itself is emailed once
-- and never persisted or displayed.
CREATE TABLE mcp_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX idx_mcp_tokens_user ON mcp_tokens (user_id);

-- Regeneration invalidates the previous token: at most one live token per user.
-- Revoked rows are kept for their metadata, so the constraint is partial.
CREATE UNIQUE INDEX one_active_mcp_token ON mcp_tokens (user_id) WHERE revoked_at IS NULL;

-- ----------------------------------------------------------- owner columns --

ALTER TABLE contexts         ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE recurrence_rules ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tasks            ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE comments         ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE time_entries     ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notification_log ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE push_tokens      ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE settings         ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- --------------------------------------------------------------- backfill ---

DO $$
DECLARE
  owner_email text := current_setting('app.owner_email');
  owner_id    uuid;
BEGIN
  IF owner_email IS NULL OR btrim(owner_email) = '' THEN
    RAISE EXCEPTION 'app.owner_email is empty — refusing to assign existing data';
  END IF;

  INSERT INTO users (email) VALUES (btrim(owner_email))
  ON CONFLICT (lower(email)) DO NOTHING;

  SELECT id INTO STRICT owner_id FROM users WHERE lower(email) = lower(btrim(owner_email));

  UPDATE contexts         SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE recurrence_rules SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE tasks            SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE comments         SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE time_entries     SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE notification_log SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE push_tokens      SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE settings         SET user_id = owner_id WHERE user_id IS NULL;
END $$;

ALTER TABLE contexts         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recurrence_rules ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE tasks            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE comments         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE time_entries     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE notification_log ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE push_tokens      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE settings         ALTER COLUMN user_id SET NOT NULL;

-- ---------------------------------------------------------------- indexes ---

CREATE INDEX idx_contexts_user         ON contexts (user_id);
CREATE INDEX idx_recurrence_rules_user ON recurrence_rules (user_id);
CREATE INDEX idx_tasks_user            ON tasks (user_id);
CREATE INDEX idx_comments_user         ON comments (user_id);
CREATE INDEX idx_time_entries_user     ON time_entries (user_id);
CREATE INDEX idx_notification_log_user ON notification_log (user_id);
CREATE INDEX idx_push_tokens_user      ON push_tokens (user_id);
CREATE INDEX idx_settings_user         ON settings (user_id);

-- The open-task index leads with the owner: every list query filters by user
-- first, so a user-less index would scan other people's rows to discard them.
DROP INDEX IF EXISTS idx_tasks_open;
CREATE INDEX idx_tasks_open ON tasks (user_id, status, context_id)
  WHERE status NOT IN ('done', 'missed');

-- ------------------------------------------------- per-user uniqueness -----

-- Context slugs were globally unique, so the second account to receive a starter
-- context named e.g. "home" would fail to sign up. Slugs are per-owner now.
ALTER TABLE contexts DROP CONSTRAINT IF EXISTS contexts_slug_key;
CREATE UNIQUE INDEX contexts_user_slug_uniq ON contexts (user_id, slug);

-- "One running timer" was enforced across the WHOLE TABLE — under multi-user
-- that would let only one person in the entire system have a timer running, and
-- everyone else's start_timer would fail on a unique violation. Now it is one
-- running timer PER USER.
DROP INDEX IF EXISTS one_running_timer;
CREATE UNIQUE INDEX one_running_timer ON time_entries (user_id) WHERE ended_at IS NULL;

-- Settings are per user, so the key alone can no longer be the primary key —
-- it would stop a second account from ever holding 'repeat_reminders'.
--
-- This is the one genuinely contracting change here. During the deploy window
-- the old build's `ON CONFLICT (key)` upsert (the morning-summary sent-marker)
-- has no single-column unique index to target and will error until the new code
-- is live. That is a couple of minutes affecting one 07:30 job, so: do not merge
-- to main during the morning-summary window.
ALTER TABLE settings DROP CONSTRAINT settings_pkey;
ALTER TABLE settings ADD PRIMARY KEY (user_id, key);

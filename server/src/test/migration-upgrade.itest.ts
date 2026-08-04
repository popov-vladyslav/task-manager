// The UPGRADE path for 0010_multi_user.sql: an existing single-user database
// with real rows, migrated in place. The harness's resetDb() only proves the
// fresh-install path (migrate from zero on an empty schema); this proves the
// path production will actually take, including that every pre-existing row
// ends up owned by OWNER_EMAIL and none are left unattributed.
import './env-guard';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { pool } from '../db/client';
import { env } from '../env';

const MIGRATION_UNDER_TEST = '0010_multi_user.sql';

let client: PoolClient;

function migrationDir(): string {
  return path.resolve(__dirname, '../../drizzle');
}

function migrationFiles(): string[] {
  return fs
    .readdirSync(migrationDir())
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function apply(file: string): Promise<void> {
  await client.query(fs.readFileSync(path.join(migrationDir(), file), 'utf8'));
}

before(async () => {
  client = await pool.connect();
  // The runner normally provides this; we drive the files directly here.
  await client.query('SELECT set_config($1, $2, false)', ['app.owner_email', env.OWNER_EMAIL]);

  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');

  // Rebuild the world as it looked BEFORE multi-user.
  for (const file of migrationFiles().filter((f) => f < MIGRATION_UNDER_TEST)) {
    await apply(file);
  }

  // Seed it the way the single-user database actually looks: a context, a task
  // in it, a comment and a tracked interval on that task, a push token and a
  // settings row. None of these carry an owner yet.
  await client.query(`INSERT INTO contexts (slug, label, color) VALUES ('work', 'Work', '#112233')`);
  await client.query(`
    INSERT INTO tasks (title, context_id, status)
    VALUES ('legacy task', (SELECT id FROM contexts WHERE slug = 'work'), 'active')
  `);
  await client.query(`
    INSERT INTO comments (task_id, body)
    VALUES ((SELECT id FROM tasks WHERE title = 'legacy task'), 'legacy comment')
  `);
  await client.query(`
    INSERT INTO time_entries (task_id, started_at, ended_at)
    VALUES ((SELECT id FROM tasks WHERE title = 'legacy task'), now() - interval '1 hour', now())
  `);
  await client.query(`INSERT INTO push_tokens (token, device) VALUES ('ExpoPushToken[legacy]', 'iPhone')`);
  await client.query(`INSERT INTO settings (key, value) VALUES ('repeat_reminders', 'true'::jsonb)`);

  // ...then upgrade.
  await apply(MIGRATION_UNDER_TEST);
});

after(async () => {
  client.release();
  await pool.end();
});

test('creates exactly one account, for OWNER_EMAIL', async () => {
  const { rows } = await client.query<{ count: string; email: string }>(
    'SELECT count(*)::text AS count, min(email) AS email FROM users',
  );
  assert.equal(rows[0].count, '1');
  assert.equal(rows[0].email.toLowerCase(), env.OWNER_EMAIL.toLowerCase());
});

// The post-migration ownership check the spec requires, as an assertion.
test('every pre-existing row is owned by the owner, none left unattributed', async () => {
  const owned = ['contexts', 'tasks', 'comments', 'time_entries', 'push_tokens', 'settings'];

  for (const table of owned) {
    const { rows } = await client.query<{ total: string; orphaned: string; foreign: string }>(`
      SELECT count(*)::text AS total,
             count(*) FILTER (WHERE user_id IS NULL)::text AS orphaned,
             count(*) FILTER (WHERE user_id <> (SELECT id FROM users))::text AS foreign
      FROM ${table}
    `);
    assert.ok(Number(rows[0].total) > 0, `${table} should have a seeded row to migrate`);
    assert.equal(rows[0].orphaned, '0', `${table} has rows with no owner`);
    assert.equal(rows[0].foreign, '0', `${table} has rows owned by someone else`);
  }
});

test('owner columns are NOT NULL after the upgrade', async () => {
  const { rows } = await client.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id' AND is_nullable = 'YES'
  `);
  assert.deepEqual(
    rows.map((r) => r.table_name),
    [],
    'every user_id column should be NOT NULL',
  );
});

test('the running-timer constraint is per user, not global', async () => {
  const { rows } = await client.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'one_running_timer'`,
  );
  assert.match(rows[0].indexdef, /\(user_id\)/);
  assert.match(rows[0].indexdef, /ended_at IS NULL/);
});

test('two users may hold the same context slug', async () => {
  await client.query(`INSERT INTO users (email) VALUES ('second@example.test')`);
  await client.query(`
    INSERT INTO contexts (user_id, slug, label, color)
    VALUES ((SELECT id FROM users WHERE email = 'second@example.test'), 'work', 'Work', '#445566')
  `);
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM contexts WHERE slug = 'work'`,
  );
  assert.equal(rows[0].count, '2');
});

test('a user delete cascades away all of their data', async () => {
  await client.query(`DELETE FROM users WHERE email = 'second@example.test'`);
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM contexts WHERE slug = 'work'`,
  );
  assert.equal(rows[0].count, '1', 'only the owner’s context should remain');
});

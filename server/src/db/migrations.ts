import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { env } from '../env';

// Minimal, deterministic migration runner: applies every *.sql in drizzle/
// (lexicographic order) exactly once, each in its own transaction, tracked in
// a _migrations table. Hand-authored SQL keeps full control over the DDL
// (partial indexes, CHECK constraints) that generators tend to mangle.
//
// Lives apart from migrate.ts (the CLI entrypoint) so importing it has no side
// effects — the test harness migrates a scratch database from zero with it.
export async function runMigrations(client: PoolClient, log = true): Promise<void> {
  const dir = path.resolve(__dirname, '../../drizzle');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // Migrations that must attribute existing rows to the single pre-multi-user
  // owner read this GUC (0010_multi_user.sql). Session-scoped, so it survives
  // the per-file transactions below. `current_setting` throws when it is unset,
  // which is deliberate: a misconfigured environment fails the migration rather
  // than silently assigning data to the wrong account.
  await client.query('SELECT set_config($1, $2, false)', ['app.owner_email', env.OWNER_EMAIL]);

  await client.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const { rows } = await client.query('SELECT name FROM _migrations');
  const applied = new Set(rows.map((r) => r.name as string));

  for (const file of files) {
    if (applied.has(file)) {
      if (log) console.log(`= skip  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    if (log) process.stdout.write(`+ apply ${file} ... `);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      if (log) console.log('ok');
    } catch (err) {
      await client.query('ROLLBACK');
      if (log) console.log('FAILED');
      throw err;
    }
  }
}

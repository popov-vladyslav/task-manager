import fs from 'node:fs';
import path from 'node:path';
import { pool } from './client';

// Minimal, deterministic migration runner: applies every *.sql in drizzle/
// (lexicographic order) exactly once, each in its own transaction, tracked in
// a _migrations table. Hand-authored SQL keeps full control over the DDL
// (partial indexes, CHECK constraints) that generators tend to mangle.
async function run() {
  const dir = path.resolve(__dirname, '../../drizzle');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
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
        console.log(`= skip  ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      process.stdout.write(`+ apply ${file} ... `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw err;
      }
    }
    console.log('migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { pool } from './client';
import { env } from '../env';

// Post-migration verification for 0010_multi_user.sql — the check the spec
// requires be run immediately after the prod migration, before anyone trusts it.
//
//   npm --workspace server run db:check-ownership
//
// Exits non-zero if anything is wrong, so it can gate a deploy or a rollback
// decision. Read-only: it never writes.
//
// Lives under src/ (not scripts/) so it is covered by typecheck and lint.

// Every table that holds user data, with the column that must be attributed.
const OWNED_TABLES = [
  'contexts',
  'recurrence_rules',
  'tasks',
  'comments',
  'time_entries',
  'notification_log',
  'push_tokens',
  'settings',
] as const;

interface Problem {
  table: string;
  detail: string;
}

async function run(): Promise<void> {
  const client = await pool.connect();
  const problems: Problem[] = [];
  const expected = env.OWNER_EMAIL.trim().toLowerCase();

  try {
    const { rows: accounts } = await client.query<{ id: string; email: string }>(
      'SELECT id, email FROM users ORDER BY created_at',
    );

    console.log(`\nAccounts: ${accounts.length}`);
    for (const a of accounts) console.log(`  ${a.id}  ${a.email}`);

    const owner = accounts.find((a) => a.email.trim().toLowerCase() === expected);
    if (!owner) {
      problems.push({
        table: 'users',
        detail: `no account for OWNER_EMAIL (${env.OWNER_EMAIL})`,
      });
    }

    // At the cutover moment the database should hold exactly one account: the
    // owner's. More than that means the migration ran somewhere unexpected, or
    // someone signed up before the check.
    if (accounts.length !== 1) {
      problems.push({
        table: 'users',
        detail: `expected exactly 1 account at cutover, found ${accounts.length}`,
      });
    }

    console.log('\nOwnership by table:');
    for (const table of OWNED_TABLES) {
      const { rows } = await client.query<{
        total: string;
        orphaned: string;
        not_owner: string;
      }>(
        `SELECT count(*)::text                                       AS total,
                count(*) FILTER (WHERE user_id IS NULL)::text        AS orphaned,
                count(*) FILTER (WHERE user_id <> $1)::text          AS not_owner
           FROM ${table}`,
        [owner?.id ?? null],
      );

      const { total, orphaned, not_owner: notOwner } = rows[0];
      const flag = orphaned !== '0' || (owner && notOwner !== '0') ? ' <-- PROBLEM' : '';
      console.log(
        `  ${table.padEnd(18)} total=${total.padStart(6)}  unowned=${orphaned.padStart(4)}` +
          `  other-owner=${notOwner.padStart(4)}${flag}`,
      );

      if (orphaned !== '0') {
        problems.push({ table, detail: `${orphaned} row(s) have no owner` });
      }
      if (owner && notOwner !== '0') {
        problems.push({ table, detail: `${notOwner} row(s) belong to another account` });
      }
    }

    if (problems.length > 0) {
      console.error('\nFAILED — the migration did not attribute data correctly:');
      for (const p of problems) console.error(`  ${p.table}: ${p.detail}`);
      console.error(
        '\nDo not proceed. Roll back by restoring the Neon branch to the ' +
          'pre-migration snapshot (decision 0003).\n',
      );
      process.exitCode = 1;
      return;
    }

    console.log(`\nOK — every row is owned by ${owner?.email}.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

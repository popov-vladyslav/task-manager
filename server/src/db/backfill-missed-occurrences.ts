import { pool } from './client';

// One-off backfill for the recurrence-accumulation bug: occurrences of recurring
// tasks that were superseded by a newer occurrence but left open. They are closed
// out with the terminal 'missed' status (never deleted, so history and future
// streak/stats work survive).
//
// Deliberately NOT an auto-applied drizzle migration: it mutates data, and
// recurrence in this project has misbehaved before. It prints exactly what it
// would touch and does nothing until re-run with --apply.
//
//   npm --workspace server exec tsx src/db/backfill-missed-occurrences.ts
//   npm --workspace server exec tsx src/db/backfill-missed-occurrences.ts --apply
//
// Scope, precisely: rows with a recurrence_id, status in ('active','waiting'),
// that are NOT the newest open occurrence of their rule. Ordinary one-off tasks
// (recurrence_id IS NULL) can never match — those overdue tasks are surfaced by
// the morning summary instead.

const SELECT_STALE = `
  with ranked as (
    select
      t.id,
      t.title,
      t.status,
      t.due_at,
      t.created_at,
      t.recurrence_id,
      r.rule,
      row_number() over (
        partition by t.recurrence_id
        order by t.created_at desc, t.id desc
      ) as rn,
      count(*) over (partition by t.recurrence_id) as open_count
    from tasks t
    join recurrence_rules r on r.id = t.recurrence_id
    where t.recurrence_id is not null
      and t.status in ('active', 'waiting')
  )
  select id, title, status, due_at, created_at, recurrence_id, rule, open_count
  from ranked
  where rn > 1
  order by recurrence_id, created_at
`;

async function run() {
  const apply = process.argv.includes('--apply');
  const client = await pool.connect();
  try {
    const { rows } = await client.query(SELECT_STALE);

    if (rows.length === 0) {
      console.log('Nothing to do: every recurring task already has at most one open occurrence.');
      return;
    }

    console.log(
      `\n${rows.length} stale recurring occurrence(s) would be closed out as 'missed':\n`,
    );
    let currentRule: string | null = null;
    for (const r of rows) {
      if (r.recurrence_id !== currentRule) {
        currentRule = r.recurrence_id as string;
        console.log(`  rule ${currentRule} (${r.rule}) — ${r.open_count} open occurrences`);
      }
      const due = r.due_at ? new Date(r.due_at).toISOString() : 'no due date';
      const created = new Date(r.created_at).toISOString();
      console.log(
        `    ${r.id}  status=${r.status}  created=${created}  due=${due}  ${JSON.stringify(r.title)}`,
      );
    }
    console.log('\n  (the newest open occurrence of each rule is kept active)\n');

    if (!apply) {
      console.log('DRY RUN — nothing was changed. Re-run with --apply to close these out.\n');
      return;
    }

    const ids = rows.map((r) => r.id as string);
    await client.query('BEGIN');
    try {
      const res = await client.query(
        `update tasks set status = 'missed'
         where id = any($1::uuid[]) and status in ('active','waiting')`,
        [ids],
      );
      await client.query('COMMIT');
      console.log(`APPLIED — ${res.rowCount} occurrence(s) closed out as 'missed'.\n`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

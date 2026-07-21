import { seedContexts } from '@task-manager/shared';
import { db, pool } from './client';
import { contexts } from './schema';

// One-time bootstrap of the five starter contexts (ZT / DA / Cairn / Zalando /
// Home) — ONLY when the table is empty. This runs on every deploy (Render
// preDeploy), so it must NOT re-add contexts: once the owner has managed their
// contexts (added/renamed/deleted any), we leave the table alone. Otherwise a
// deleted starter context would reappear after every deploy.
// The single owner is env-based (OWNER_EMAIL), so there is no user row to seed.
async function run() {
  const [existing] = await db.select({ id: contexts.id }).from(contexts).limit(1);
  if (existing) {
    console.log('contexts already present — skipping seed (owner-managed).');
    await pool.end();
    return;
  }

  await db.insert(contexts).values(
    seedContexts.map((c, i) => ({ slug: c.slug, label: c.label, color: c.color, sortOrder: i })),
  );
  const rows = await db.select().from(contexts);
  console.log(`seeded ${rows.length} contexts (empty DB bootstrap)`);
  for (const c of rows) console.log(`  ${c.sortOrder}  ${c.slug.padEnd(8)} ${c.label.padEnd(10)} ${c.color}`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { seedContexts } from '@task-manager/shared';
import { db, pool } from './client';
import { contexts } from './schema';

// Idempotent seed of the five work contexts (ZT / DA / Cairn / Zalando / Home).
// The single owner is env-based (OWNER_EMAIL), so there is no user row to seed.
async function run() {
  for (const [i, c] of seedContexts.entries()) {
    await db
      .insert(contexts)
      .values({ slug: c.slug, label: c.label, color: c.color, sortOrder: i })
      .onConflictDoNothing({ target: contexts.slug });
  }
  const rows = await db.select().from(contexts);
  console.log(`contexts in DB: ${rows.length}`);
  for (const c of rows) console.log(`  ${c.sortOrder}  ${c.slug.padEnd(8)} ${c.label.padEnd(10)} ${c.color}`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

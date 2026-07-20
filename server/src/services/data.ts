import { sql } from 'drizzle-orm';
import { db } from '../db/client';

// Reset = wipe user content, keep contexts/settings/auth/push. (Routines removed.)
export async function resetData(): Promise<void> {
  await db.execute(sql`TRUNCATE tasks, recurrence_rules RESTART IDENTITY CASCADE`);
}

import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { invalidateReminderClocks } from './reminder-clock';

// Reset = wipe user content, keep contexts/settings/auth/push. (Routines removed.)
export async function resetData(): Promise<void> {
  await db.execute(sql`TRUNCATE tasks, recurrence_rules RESTART IDENTITY CASCADE`);
  // Every pending reminder just went away; the scheduler's cache still points at
  // one of the deleted tasks.
  invalidateReminderClocks();
}

import { sql } from 'drizzle-orm';
import { db } from '../db/client';

export async function resetData(): Promise<void> {
  await db.execute(
    sql`TRUNCATE tasks, recurrence_rules, routines RESTART IDENTITY CASCADE`,
  );
}

import { db } from '../db/client';
import { recurrenceRules, tasks } from '../db/schema';
import { ownedBy } from '../db/scope';
import { invalidateReminderClocks } from './reminder-clock';

// Reset = wipe ONE account's task content, keeping its contexts/settings/auth/push.
//
// This was `TRUNCATE tasks, recurrence_rules` — table-wide, which under
// multi-user would have destroyed every account's tasks when any one user reset
// theirs. It is a scoped DELETE now. Comments, time entries and notification-log
// rows go with their tasks via ON DELETE CASCADE; tasks are removed before the
// rules they reference.
export async function resetData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(tasks).where(ownedBy(tasks.userId, userId));
    await tx.delete(recurrenceRules).where(ownedBy(recurrenceRules.userId, userId));
  });
  // Every pending reminder just went away; the scheduler's cache still points at
  // one of the deleted tasks.
  invalidateReminderClocks();
}

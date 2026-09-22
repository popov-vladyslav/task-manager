import { and, asc, isNotNull, isNull, lt, notInArray } from 'drizzle-orm';
import { TERMINAL_STATUSES, type MorningSummary } from '@task-manager/shared';
import { db } from '../db/client';
import { tasks } from '../db/schema';
import { ownedBy } from '../db/scope';
import { toTask } from '../db/mappers';
import { bucketOverdue, startOfLocalDay } from '../lib/morning-summary';
import { subtasksByTask } from './subtasks-read';

// Unfinished work from before today, split into yesterday's leftovers and the
// older pile. ORDINARY TASKS ONLY: `recurrence_id IS NULL` excludes every
// occurrence of a recurring task, so a missed daily routine never nags here —
// the recurrence engine closes those out on its next run instead ('missed', or
// 'skipped' for a rule that does not track completion). That exclusion is also
// what already satisfies "an untracked occurrence never reaches the morning
// summary" (spec P4.2); the overdue filter for it lives in services/tasks.ts.
export async function getMorningSummary(
  userId: string,
  now: Date = new Date(),
): Promise<MorningSummary> {
  const todayStart = startOfLocalDay(now);

  const rows = await db
    .select({
      task: tasks,
    })
    .from(tasks)
    .where(
      and(
        ownedBy(tasks.userId, userId),
        isNull(tasks.recurrenceId),
        isNotNull(tasks.dueAt),
        lt(tasks.dueAt, todayStart),
        notInArray(tasks.status, [...TERMINAL_STATUSES]),
      ),
    )
    .orderBy(asc(tasks.dueAt));

  const subs = await subtasksByTask(
    userId,
    rows.map((r) => r.task.id),
  );
  const overdue = rows.map((r) =>
    toTask(r.task, {
      // Ordinary tasks only, so there is never a recurrence rule to report.
      nextInstance: null,
      recurrenceRule: null,
      recurrenceUntil: null,
      tracksCompletion: true,
      subtasks: subs.get(r.task.id) ?? [],
    }),
  );

  const { yesterday, older } = bucketOverdue(overdue, now);
  return { yesterday, older, generatedAt: now.toISOString() };
}

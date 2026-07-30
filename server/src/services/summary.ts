import { and, asc, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { TERMINAL_STATUSES, type MorningSummary } from '@task-manager/shared';
import { db } from '../db/client';
import { tasks } from '../db/schema';
import { toTask } from '../db/mappers';
import { bucketOverdue, startOfLocalDay } from '../lib/morning-summary';

// Unfinished work from before today, split into yesterday's leftovers and the
// older pile. ORDINARY TASKS ONLY: `recurrence_id IS NULL` excludes every
// occurrence of a recurring task, so a skipped daily routine never nags here —
// the recurrence engine closes those out as 'missed' instead.
export async function getMorningSummary(now: Date = new Date()): Promise<MorningSummary> {
  const todayStart = startOfLocalDay(now);

  const rows = await db
    .select({
      task: tasks,
      commentsCount: sql<number>`(select count(*)::int from comments c where c.task_id = ${tasks.id})`,
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.recurrenceId),
        isNotNull(tasks.dueAt),
        lt(tasks.dueAt, todayStart),
        notInArray(tasks.status, [...TERMINAL_STATUSES]),
      ),
    )
    .orderBy(asc(tasks.dueAt));

  const overdue = rows.map((r) =>
    toTask(r.task, {
      commentsCount: Number(r.commentsCount ?? 0),
      // Ordinary tasks only, so there is never a recurrence rule to report.
      nextInstance: null,
      recurrenceRule: null,
    }),
  );

  const { yesterday, older } = bucketOverdue(overdue, now);
  return { yesterday, older, generatedAt: now.toISOString() };
}

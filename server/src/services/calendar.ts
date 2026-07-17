import { and, eq, gte, isNull, lte, ne, or } from 'drizzle-orm';
import type { CalendarData } from '@task-manager/shared';
import { db } from '../db/client';
import { tasks, timeEntries } from '../db/schema';
import { badRequest } from '../lib/errors';

// Tracked time blocks + task deadlines overlapping [from, to].
export async function getCalendar(fromISO: string, toISO: string): Promise<CalendarData> {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest('from and to must be valid ISO dates');
  }

  // Entries overlap the window when they start before `to` and either haven't
  // ended or ended after `from` (includes the running one).
  const entryRows = await db
    .select({
      id: timeEntries.id,
      taskId: timeEntries.taskId,
      taskTitle: tasks.title,
      contextId: tasks.contextId,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(
      and(
        lte(timeEntries.startedAt, to),
        or(isNull(timeEntries.endedAt), gte(timeEntries.endedAt, from)),
      ),
    );

  const deadlineRows = await db
    .select({ id: tasks.id, title: tasks.title, contextId: tasks.contextId, dueAt: tasks.dueAt })
    .from(tasks)
    .where(and(gte(tasks.dueAt, from), lte(tasks.dueAt, to), ne(tasks.status, 'done')));

  return {
    entries: entryRows.map((r) => ({
      id: r.id,
      taskId: r.taskId as string,
      taskTitle: r.taskTitle,
      contextId: r.contextId ?? null,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    })),
    deadlines: deadlineRows.map((r) => ({
      id: r.id,
      title: r.title,
      contextId: r.contextId ?? null,
      dueAt: (r.dueAt as Date).toISOString(),
    })),
  };
}

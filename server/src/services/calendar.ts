import { and, isNotNull, lte } from 'drizzle-orm';
import { DEFAULT_DURATION_MIN, type CalendarData } from '@task-manager/shared';
import { db } from '../db/client';
import { tasks } from '../db/schema';
import { badRequest } from '../lib/errors';

// Scheduled task time-blocks overlapping [from, to]. A task with a deadline
// (due_at) is a block from due_at for duration_min minutes (default 30).
// Completed tasks are included (flagged done) — not filtered out. Sourced from
// tasks, NOT from timer time_entries.
//
// A context's `exclude_from_all` flag does NOT suppress calendar visibility
// (CR02 §2): every task with a due_at shows here regardless of its context.
// Tasks without a due_at never appear (they have no block).
export async function getCalendar(fromISO: string, toISO: string): Promise<CalendarData> {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest('from and to must be valid ISO dates');
  }

  // Blocks start at due_at, so any block reaching into the window starts at/before
  // `to`. Its end depends on duration, so filter end >= from in JS (dataset is
  // small — a single user's tasks).
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      contextId: tasks.contextId,
      dueAt: tasks.dueAt,
      durationMin: tasks.durationMin,
      status: tasks.status,
    })
    .from(tasks)
    .where(and(isNotNull(tasks.dueAt), lte(tasks.dueAt, to)));

  const blocks = rows
    .map((r) => {
      const start = r.dueAt as Date;
      const end = new Date(start.getTime() + (r.durationMin ?? DEFAULT_DURATION_MIN) * 60_000);
      return { start, end, r };
    })
    .filter(({ end }) => end >= from)
    .map(({ start, end, r }) => ({
      id: r.id,
      title: r.title,
      contextId: r.contextId ?? null,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      done: r.status === 'done',
    }));

  return { blocks };
}

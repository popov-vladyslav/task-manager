import { eq, isNull } from 'drizzle-orm';
import type { ActiveTimer, TimeEntry } from '@task-manager/shared';
import { db } from '../db/client';
import { timeEntries, tasks } from '../db/schema';
import { notFound } from '../lib/errors';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toEntry(r: typeof timeEntries.$inferSelect): TimeEntry {
  return {
    id: r.id,
    taskId: r.taskId as string,
    startedAt: r.startedAt.toISOString(),
    endedAt: iso(r.endedAt),
  };
}

// A running entry can only realistically last a work day; anything longer is an
// orphan from a hard-killed app. Cap it so it can't accumulate unbounded time.
const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

async function capStaleTimer(): Promise<void> {
  const [running] = await db
    .select({ id: timeEntries.id, startedAt: timeEntries.startedAt })
    .from(timeEntries)
    .where(isNull(timeEntries.endedAt));
  if (running && Date.now() - running.startedAt.getTime() > MAX_SESSION_MS) {
    await db
      .update(timeEntries)
      .set({ endedAt: new Date(running.startedAt.getTime() + MAX_SESSION_MS) })
      .where(eq(timeEntries.id, running.id));
  }
}

// The single running entry (ended_at IS NULL), enriched with its task title.
// Reconciles a stale orphan first, so a read also cleans up after a crash.
export async function getActiveTimer(): Promise<ActiveTimer | null> {
  await capStaleTimer();
  const [row] = await db
    .select({
      id: timeEntries.id,
      taskId: timeEntries.taskId,
      startedAt: timeEntries.startedAt,
      taskTitle: tasks.title,
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(isNull(timeEntries.endedAt));
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.taskId as string,
    taskTitle: row.taskTitle,
    startedAt: row.startedAt.toISOString(),
  };
}

// Auto-switch (design brief): starting a new timer stops the previous one, so
// tapping Play on any card "just works". The one_running_timer index still
// guarantees a single active entry.
export async function startTimer(taskId: string): Promise<ActiveTimer> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw notFound('Task not found');
  await db.update(timeEntries).set({ endedAt: new Date() }).where(isNull(timeEntries.endedAt));
  const [row] = await db.insert(timeEntries).values({ taskId, startedAt: new Date() }).returning();
  return { id: row.id, taskId, taskTitle: task.title, startedAt: row.startedAt.toISOString() };
}

// Close the running entry (no-op returns null if nothing is running).
export async function stopTimer(): Promise<TimeEntry | null> {
  const [row] = await db
    .update(timeEntries)
    .set({ endedAt: new Date() })
    .where(isNull(timeEntries.endedAt))
    .returning();
  return row ? toEntry(row) : null;
}

import { eq, isNull, sql } from 'drizzle-orm';
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
// orphan from a hard-killed app.
const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

// Close the running interval and credit its length to the task's running total,
// as one unit — time_entries stays the source of truth, tasks.tracked_sec is the
// denormalized sum that lists and the MCP payload read.
//
// `credit: false` closes the entry without adding anything: used for an orphan
// left behind by a hard kill, where the elapsed wall-clock is not time actually
// worked and would otherwise silently inflate the total by up to 8 hours.
async function closeRunningEntry(
  endedAt: Date,
  opts?: { credit?: boolean },
): Promise<typeof timeEntries.$inferSelect | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(timeEntries)
      .set({ endedAt })
      .where(isNull(timeEntries.endedAt))
      .returning();
    if (!row || !row.taskId) return row ?? null;

    if (opts?.credit !== false) {
      const seconds = Math.max(0, Math.floor((endedAt.getTime() - row.startedAt.getTime()) / 1000));
      if (seconds > 0) {
        await tx
          .update(tasks)
          .set({ trackedSec: sql`${tasks.trackedSec} + ${seconds}` })
          .where(eq(tasks.id, row.taskId));
      }
    }
    return row;
  });
}

// An entry still open long past any plausible session is an orphan: the app was
// killed with the timer running. It is closed at its start (zero length) rather
// than credited, so phantom time never lands in the total. The row itself is
// kept as evidence that a session was abandoned.
//
// Note the ordinary hard-kill case never reaches here: on next launch the app
// adopts the still-running entry (store/timer.ts `load`), so a genuine session
// continues and is credited normally when it stops.
async function reconcileStaleTimer(): Promise<void> {
  const [running] = await db
    .select({ id: timeEntries.id, startedAt: timeEntries.startedAt })
    .from(timeEntries)
    .where(isNull(timeEntries.endedAt));
  if (running && Date.now() - running.startedAt.getTime() > MAX_SESSION_MS) {
    await closeRunningEntry(running.startedAt, { credit: false });
  }
}

// The single running entry (ended_at IS NULL), enriched with its task title.
// Reconciles a stale orphan first, so a read also cleans up after a crash.
export async function getActiveTimer(): Promise<ActiveTimer | null> {
  await reconcileStaleTimer();
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
// guarantees a single active entry. The interrupted entry is credited — it was
// real worked time.
export async function startTimer(taskId: string): Promise<ActiveTimer> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw notFound('Task not found');
  await closeRunningEntry(new Date());
  const [row] = await db
    .insert(timeEntries)
    .values({ taskId, startedAt: new Date(), userId: task.userId })
    .returning();
  return { id: row.id, taskId, taskTitle: task.title, startedAt: row.startedAt.toISOString() };
}

// Close the running entry, crediting its length to the task's total (no-op
// returns null if nothing is running).
export async function stopTimer(): Promise<TimeEntry | null> {
  const row = await closeRunningEntry(new Date());
  return row ? toEntry(row) : null;
}

import { and, eq, isNotNull, min, notExists, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { notificationLog, settings, tasks } from '../db/schema';
import { ReminderClock } from '../lib/reminder-clock';

// The database-backed clocks the scheduler gates its two reminder jobs on.
// Each answers "what is the earliest instant this job could have work?", so an
// idle tick can skip the job — and its advisory-lock connection — entirely.
//
// This module must not import services/push.ts or services/tasks.ts: they import
// it, to invalidate after a write.

// Earliest remind_at that send-reminders could act on. Mirrors its due-task
// predicate in services/push.ts — if the two ever diverge, the gate either fires
// early (harmless, one wasted query) or late (a delayed reminder).
export const reminderClock = new ReminderClock({
  nextAt: async () => {
    const [row] = await db
      .select({ next: min(tasks.remindAt) })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'active'),
          isNotNull(tasks.remindAt),
          notExists(
            db
              .select({ one: sql`1` })
              .from(notificationLog)
              .where(
                and(eq(notificationLog.taskId, tasks.id), eq(notificationLog.kind, 'initial')),
              ),
          ),
        ),
      );
    return row?.next ? new Date(row.next) : null;
  },
});

// Earliest instant repeat-reminders could act on.
//
// Its eligibility rule (services/push.ts) is: an 'initial' row older than the
// cutoff, and no 'repeat' row newer than it — i.e. *every* log row for the task
// is older than `now - repeat_after_h`. So a task becomes eligible exactly at
// max(sent_at) + repeat_after_h, and the job's next work is the earliest such
// instant across active tasks. Exact, not an approximation, so the gate can't
// delay a repeat.
export const repeatClock = new ReminderClock({
  nextAt: async () => {
    const [enabled] = await db.select().from(settings).where(eq(settings.key, 'repeat_reminders'));
    if (!enabled || enabled.value !== true) return null; // opt-in: nothing to do, ever

    const [afterCfg] = await db.select().from(settings).where(eq(settings.key, 'repeat_after_h'));
    const hours = typeof afterCfg?.value === 'number' ? afterCfg.value : 3;

    const result = await db.execute(sql`
      select min(latest) as next from (
        select max(n.sent_at) as latest
        from notification_log n
        join tasks t on t.id = n.task_id
        where t.status = 'active'
        group by n.task_id
        having bool_or(n.kind = 'initial')
      ) s
    `);
    const next = (result.rows[0] as { next: Date | string | null } | undefined)?.next;
    return next ? new Date(new Date(next).getTime() + hours * 3_600_000) : null;
  },
});

// Call after any write that can move either clock. Both are invalidated
// together: the cost is one query on the next tick, and reasoning about which
// writes affect which clock is not worth the risk of a missed push.
export function invalidateReminderClocks(): void {
  reminderClock.invalidate();
  repeatClock.invalidate();
}

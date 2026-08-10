import { and, eq, gte, isNotNull, min, notExists, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { notificationLog, tasks } from '../db/schema';
import { ReminderClock } from '../lib/reminder-clock';
import { DUE_CLOCK_MAX_SYNC_AGE_MS, dueCutoff } from '../lib/due-window';
import { reminderCutoff } from '../lib/reminder-window';

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
          gte(tasks.remindAt, reminderCutoff(new Date())),
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
    // Opt-in and the interval are PER USER. Reading one global row here would
    // take an arbitrary account's preference: with two users, one of them
    // turning repeats off could suppress the gate — and therefore repeats — for
    // everyone. So the eligibility instant is computed per user in SQL and the
    // earliest across all opted-in users wins.
    const result = await db.execute(sql`
      with cfg as (
        select s.user_id,
               coalesce(
                 (select (a.value #>> '{}')::numeric
                    from settings a
                   where a.user_id = s.user_id and a.key = 'repeat_after_h'),
                 3
               ) as hours
          from settings s
         where s.key = 'repeat_reminders' and s.value = 'true'::jsonb
      ),
      latest as (
        select t.user_id, max(n.sent_at) as latest
          from notification_log n
          join tasks t on t.id = n.task_id
         where t.status = 'active'
         group by t.user_id, n.task_id
        having bool_or(n.kind = 'initial')
      )
      select min(l.latest + make_interval(hours => cfg.hours::int)) as next
        from latest l
        join cfg on cfg.user_id = l.user_id
    `);
    const next = (result.rows[0] as { next: Date | string | null } | undefined)?.next;
    return next ? new Date(next) : null;
  },
});

// Earliest due_at that the due-time send could act on. Mirrors its predicate in
// services/push.ts — same divergence rule as reminderClock above.
export const dueClock = new ReminderClock(
  {
    nextAt: async () => {
      const [row] = await db
        .select({ next: min(tasks.dueAt) })
        .from(tasks)
        .where(
          and(
            eq(tasks.status, 'active'),
            isNotNull(tasks.dueAt),
            gte(tasks.dueAt, dueCutoff(new Date())),
            notExists(
              db
                .select({ one: sql`1` })
                .from(notificationLog)
                .where(and(eq(notificationLog.taskId, tasks.id), eq(notificationLog.kind, 'due'))),
            ),
          ),
        );
      return row?.next ? new Date(row.next) : null;
    },
  },
  DUE_CLOCK_MAX_SYNC_AGE_MS,
);

// Call after any write that can move either clock. Both are invalidated
// together: the cost is one query on the next tick, and reasoning about which
// writes affect which clock is not worth the risk of a missed push.
export function invalidateReminderClocks(): void {
  reminderClock.invalidate();
  repeatClock.invalidate();
  dueClock.invalidate();
}

export function invalidateDueClock(): void {
  dueClock.invalidate();
}

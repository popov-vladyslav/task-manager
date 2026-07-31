import { and, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { TERMINAL_STATUSES } from '@task-manager/shared';
import { db } from '../db/client';
import { recurrenceRules, tasks } from '../db/schema';
import { localDateStr, planRecurringSpawn, type OpenOccurrence } from '../lib/recurrence-plan';
import { invalidateReminderClocks } from './reminder-clock';

// For each active rule whose day is today (Europe/Warsaw) and that hasn't spawned
// today, create the task instance and stamp last_spawned. Idempotent per day.
// Instances are dated only when the rule carries a default_due_time — otherwise
// they spawn dateless (no calendar block). (CR02 §1)
//
// Spawning a new occurrence also closes out that rule's previous open
// occurrences with the terminal 'missed' status, in the same transaction — a
// recurring task therefore only ever shows its current occurrence, and stale
// ones stop accumulating. Kept in the generation step on purpose: the invariant
// then holds without the app being opened, and can't drift from a separate job.
// One-off tasks are untouched (only rows with a recurrence_id are considered).
export async function spawnDueRecurring(now: Date = new Date()): Promise<number> {
  const today = localDateStr(now);
  const rules = await db
    .select()
    .from(recurrenceRules)
    .where(
      and(
        eq(recurrenceRules.active, true),
        or(isNull(recurrenceRules.lastSpawned), lt(recurrenceRules.lastSpawned, today)),
      ),
    );
  if (rules.length === 0) return 0;

  const openOccurrences: OpenOccurrence[] = (
    await db
      .select({ id: tasks.id, recurrenceId: tasks.recurrenceId })
      .from(tasks)
      .where(and(isNotNull(tasks.recurrenceId), notInArray(tasks.status, [...TERMINAL_STATUSES])))
  ).map((r) => ({ id: r.id, recurrenceId: r.recurrenceId as string }));

  const plans = planRecurringSpawn(rules, openOccurrences, now);

  let spawned = 0;
  for (const plan of plans) {
    // Insert + missed-cleanup + last_spawned stamp are one unit per rule: the
    // daily-idempotency guard relies on all of them landing (a partial would let
    // the rule re-spawn, or leave two occurrences open).
    await db.transaction(async (tx) => {
      const [{ minSort }] = await tx
        .select({ minSort: sql<number>`coalesce(min(${tasks.sortGlobal}), 1)` })
        .from(tasks);
      const top = Number(minSort) - 1;

      if (plan.missedOccurrenceIds.length > 0) {
        await tx
          .update(tasks)
          .set({ status: 'missed' })
          .where(
            and(
              inArray(tasks.id, plan.missedOccurrenceIds),
              // Re-check under the transaction: the occurrence may have been
              // completed between the read above and here.
              notInArray(tasks.status, [...TERMINAL_STATUSES]),
            ),
          );
      }

      await tx.insert(tasks).values({
        title: plan.title,
        contextId: plan.contextId,
        dueAt: plan.dueAt,
        remindAt: plan.remindAt,
        recurrenceId: plan.ruleId,
        sortGlobal: top,
        sortContext: top,
      });
      await tx
        .update(recurrenceRules)
        .set({ lastSpawned: plan.today })
        .where(eq(recurrenceRules.id, plan.ruleId));
    });
    spawned += 1;
  }
  // Spawned instances carry their own remind_at and are inserted directly here,
  // bypassing services/tasks.ts — so this is the only place that can tell the
  // scheduler's cache about them.
  if (spawned > 0) invalidateReminderClocks();
  return spawned;
}

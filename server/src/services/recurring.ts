import { and, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { TERMINAL_STATUSES } from '@task-manager/shared';
import { db } from '../db/client';
import { recurrenceOverrides, recurrenceRules, tasks } from '../db/schema';
import {
  localDateStr,
  planRecurringSpawn,
  type OpenOccurrence,
  type PlanOverride,
} from '../lib/recurrence-plan';
import { invalidateReminderClocks } from './reminder-clock';

// For each active rule whose day is today (Europe/Warsaw) and that hasn't spawned
// today, create the task instance and stamp last_spawned. Idempotent per day.
// Instances are dated only when the rule carries a default_due_time — otherwise
// they spawn dateless (no calendar block). (CR02 §1)
//
// A rule stops at its `until` day (inclusive), and an occurrence the user moved
// (recurrence_overrides for today) spawns at the moved time, so its reminder
// moves with it. The occurrence inherits the rule's duration_min when it has a
// deadline at all.
//
// Spawning a new occurrence also closes out that rule's previous open
// occurrences with a terminal status — 'missed', or 'skipped' when the rule does
// not track completion — in the same transaction. A
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

  // Deliberately global, like the rules query above: this is a cron job that
  // spawns for every account. It is safe to mix owners here because a rule id is
  // a UUID, so `o.recurrenceId === rule.id` can only ever match occurrences of
  // that rule — i.e. of that rule's owner. The writes below are still scoped.
  const openOccurrences: OpenOccurrence[] = (
    await db
      .select({ id: tasks.id, recurrenceId: tasks.recurrenceId })
      .from(tasks)
      .where(and(isNotNull(tasks.recurrenceId), notInArray(tasks.status, [...TERMINAL_STATUSES])))
  ).map((r) => ({ id: r.id, recurrenceId: r.recurrenceId as string }));

  // Only today's moved occurrences matter to the spawner; the future ones are
  // the calendar projection's business. Global like the queries above, and keyed
  // by rule id (a UUID), so it cannot mix owners.
  const overrides: PlanOverride[] = (
    await db
      .select({
        ruleId: recurrenceOverrides.ruleId,
        occursOn: recurrenceOverrides.occursOn,
        dueAt: recurrenceOverrides.dueAt,
        remindAt: recurrenceOverrides.remindAt,
      })
      .from(recurrenceOverrides)
      .where(eq(recurrenceOverrides.occursOn, today))
  ).map((o) => ({ ...o, dueAt: o.dueAt ?? null, remindAt: o.remindAt ?? null }));

  const plans = planRecurringSpawn(rules, openOccurrences, now, overrides);

  let spawned = 0;
  for (const plan of plans) {
    // Insert + missed-cleanup + last_spawned stamp are one unit per rule: the
    // daily-idempotency guard relies on all of them landing (a partial would let
    // the rule re-spawn, or leave two occurrences open).
    await db.transaction(async (tx) => {
      // Top-of-list is per owner: another user's ordering must not shift this
      // occurrence's position.
      const [{ minSort }] = await tx
        .select({ minSort: sql<number>`coalesce(min(${tasks.sortGlobal}), 1)` })
        .from(tasks)
        .where(eq(tasks.userId, plan.userId));
      const top = Number(minSort) - 1;

      if (plan.staleOccurrenceIds.length > 0) {
        await tx
          .update(tasks)
          .set({ status: plan.staleStatus })
          .where(
            and(
              // Defence in depth: these ids came from this rule's own
              // occurrences, so the owner filter should be redundant — but a
              // cross-account status write must be impossible, not merely
              // unlikely.
              eq(tasks.userId, plan.userId),
              inArray(tasks.id, plan.staleOccurrenceIds),
              // Re-check under the transaction: the occurrence may have been
              // completed between the read above and here.
              notInArray(tasks.status, [...TERMINAL_STATUSES]),
            ),
          );
      }

      await tx.insert(tasks).values({
        userId: plan.userId,
        title: plan.title,
        contextId: plan.contextId,
        dueAt: plan.dueAt,
        remindAt: plan.remindAt,
        durationMin: plan.durationMin,
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

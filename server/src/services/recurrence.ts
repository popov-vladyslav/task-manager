import { and, eq, gt, gte, isNotNull, notInArray } from 'drizzle-orm';
import { TERMINAL_STATUSES } from '@task-manager/shared';
import { db } from '../db/client';
import { notificationLog, recurrenceOverrides, recurrenceRules, tasks } from '../db/schema';
import { ownedBy } from '../db/scope';
import { badRequest, notFound } from '../lib/errors';
import { computeInstanceTimes, ruleMatchesToday } from '../lib/recurrence';
import { localDateStr } from '../lib/recurrence-plan';
import { addLocalDays, parseLocalDay, shiftInstant, shiftRule } from '../lib/recurrence-shift';
import { parseWhen } from '../lib/when';
import { invalidateReminderClocks } from './reminder-clock';

export type MoveScope = 'occurrence' | 'following';

export interface MoveInput {
  // The block's own `occursOn`: the local due day of a real occurrence, the
  // match day of a projected one.
  occursOn: string;
  dueAt: string;
  scope: MoveScope;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Moves one occurrence of a rule, or that occurrence and every later one.
// Returns the rule that governs the moved occurrence afterwards — a new one when
// a future split was needed.
export async function moveOccurrence(
  userId: string,
  ruleId: string,
  input: MoveInput,
  now: Date = new Date(),
): Promise<{ ruleId: string }> {
  if (!DAY.test(input.occursOn)) throw badRequest('occursOn must be YYYY-MM-DD');
  const newDue = parseWhen(input.dueAt);
  if (Number.isNaN(newDue.getTime())) throw badRequest('Invalid dueAt');
  const today = localDateStr(now);
  if (localDateStr(newDue) < today) throw badRequest('Cannot move an occurrence into the past');

  const result = await db.transaction(async (tx) => {
    const [rule] = await tx
      .select()
      .from(recurrenceRules)
      .where(and(ownedBy(recurrenceRules.userId, userId), eq(recurrenceRules.id, ruleId)));
    if (!rule) throw notFound('Series not found');
    if (!rule.active) throw badRequest('This series has ended');

    const open = await tx
      .select({ id: tasks.id, dueAt: tasks.dueAt, remindAt: tasks.remindAt })
      .from(tasks)
      .where(
        and(
          ownedBy(tasks.userId, userId),
          eq(tasks.recurrenceId, ruleId),
          isNotNull(tasks.dueAt),
          notInArray(tasks.status, [...TERMINAL_STATUSES]),
        ),
      );
    const real = open.find((t) => t.dueAt && localDateStr(t.dueAt) === input.occursOn);

    const moveTask = async (id: string, from: Date | null, remindAt: Date | null, to: Date) => {
      await tx
        .update(tasks)
        .set({ dueAt: to, remindAt: shiftInstant(remindAt, from, to) })
        .where(and(ownedBy(tasks.userId, userId), eq(tasks.id, id)));
      // Both channels are keyed on the task: claims written for the old times
      // would silence the pushes for the new ones.
      await tx
        .delete(notificationLog)
        .where(and(ownedBy(notificationLog.userId, userId), eq(notificationLog.taskId, id)));
    };

    if (real) {
      if (input.scope === 'occurrence') {
        await moveTask(real.id, real.dueAt, real.remindAt, newDue);
        return { ruleId };
      }
      const matchDay = addLocalDays(input.occursOn, -(rule.dueOffsetD ?? 0));
      const shifted = shiftRule(rule, matchDay, newDue);
      await tx
        .update(recurrenceRules)
        .set({
          rule: shifted.rule,
          defaultDueTime: shifted.defaultDueTime,
          remindTime: shifted.remindTime,
        })
        .where(and(ownedBy(recurrenceRules.userId, userId), eq(recurrenceRules.id, ruleId)));
      await tx
        .delete(recurrenceOverrides)
        .where(
          and(
            ownedBy(recurrenceOverrides.userId, userId),
            eq(recurrenceOverrides.ruleId, ruleId),
            gte(recurrenceOverrides.occursOn, matchDay),
          ),
        );
      await moveTask(real.id, real.dueAt, real.remindAt, shifted.dueAt);
      return { ruleId };
    }

    const matchDay = input.occursOn;
    const projected =
      rule.defaultDueTime != null &&
      matchDay >= today &&
      (rule.lastSpawned == null || matchDay > rule.lastSpawned) &&
      (rule.until == null || matchDay <= rule.until) &&
      ruleMatchesToday(rule.rule, parseLocalDay(matchDay));
    if (!projected) throw badRequest('Not an occurrence of this series');

    if (input.scope === 'occurrence') {
      const base = computeInstanceTimes(rule, parseLocalDay(matchDay));
      const remindAt = shiftInstant(base.remindAt, base.dueAt, newDue);
      await tx
        .insert(recurrenceOverrides)
        .values({ userId, ruleId, occursOn: matchDay, dueAt: newDue, remindAt })
        .onConflictDoUpdate({
          target: [recurrenceOverrides.ruleId, recurrenceOverrides.occursOn],
          set: { dueAt: newDue, remindAt },
        });
      return { ruleId };
    }

    const shifted = shiftRule(rule, matchDay, newDue);
    if (rule.until != null && shifted.matchDay > rule.until) {
      throw badRequest('Cannot move past the end of the series');
    }
    // Both rules change hands on the same day — the earlier of the old and the
    // new match day — so no day in between is spawned twice or dropped.
    const lastOldDay = addLocalDays(shifted.matchDay < matchDay ? shifted.matchDay : matchDay, -1);
    await tx
      .update(recurrenceRules)
      .set({ until: lastOldDay })
      .where(and(ownedBy(recurrenceRules.userId, userId), eq(recurrenceRules.id, ruleId)));
    await tx
      .delete(recurrenceOverrides)
      .where(
        and(
          ownedBy(recurrenceOverrides.userId, userId),
          eq(recurrenceOverrides.ruleId, ruleId),
          gt(recurrenceOverrides.occursOn, lastOldDay),
        ),
      );
    const [next] = await tx
      .insert(recurrenceRules)
      .values({
        userId,
        title: rule.title,
        contextId: rule.contextId,
        rule: shifted.rule,
        remindTime: shifted.remindTime,
        defaultDueTime: shifted.defaultDueTime,
        dueOffsetD: rule.dueOffsetD,
        until: rule.until,
        tracksCompletion: rule.tracksCompletion,
        durationMin: rule.durationMin,
        lastSpawned: lastOldDay,
      })
      .returning({ id: recurrenceRules.id });
    return { ruleId: next.id };
  });

  invalidateReminderClocks();
  return result;
}

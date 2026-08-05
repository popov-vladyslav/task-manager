import { computeInstanceTimes, expandTitle, ruleMatchesToday } from './recurrence';

// Decides what the recurrence engine should do on a given day, as pure data:
// which rules spawn a new occurrence, and which of their still-open occurrences
// must be closed out as 'missed'.
//
// Why cleanup lives *here*, tied to generation: the invariant we want is "a
// recurring task shows exactly one occurrence — the current one". That
// invariant is only ever broken by generating a new occurrence, so closing the
// previous one out in the same step (and the same transaction) keeps it true
// even if the app is never opened, and needs no extra job or launch hook.

export interface PlanRule {
  id: string;
  /** Owner of the rule — the occurrence it spawns inherits it. */
  userId: string;
  title: string;
  contextId: number | null;
  rule: string;
  defaultDueTime: string | null;
  remindTime: string | null;
  dueOffsetD: number | null;
  lastSpawned: string | null; // 'YYYY-MM-DD'
}

// A still-open occurrence already in the DB (status not done/missed).
export interface OpenOccurrence {
  id: string;
  recurrenceId: string;
}

export interface PlannedSpawn {
  ruleId: string;
  /** Copied from the rule: the spawned task belongs to the rule's owner. */
  userId: string;
  title: string;
  contextId: number | null;
  dueAt: Date | null;
  remindAt: Date | null;
  today: string; // stamped onto recurrence_rules.last_spawned
  /** Older open occurrences of this same rule — superseded, so closed as 'missed'. */
  missedOccurrenceIds: string[];
}

export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Rules whose day is today and that haven't spawned today yet. `openOccurrences`
// is every open occurrence of any recurring task, in any order.
export function planRecurringSpawn(
  rules: PlanRule[],
  openOccurrences: OpenOccurrence[],
  now: Date,
): PlannedSpawn[] {
  const today = localDateStr(now);
  const plans: PlannedSpawn[] = [];

  for (const rule of rules) {
    // Idempotent per day: a rule that already spawned today does nothing (and in
    // particular does not close out the occurrence it just created).
    if (rule.lastSpawned != null && rule.lastSpawned >= today) continue;
    if (!ruleMatchesToday(rule.rule, now)) continue;

    const { dueAt, remindAt } = computeInstanceTimes(
      {
        defaultDueTime: rule.defaultDueTime,
        remindTime: rule.remindTime,
        dueOffsetD: rule.dueOffsetD,
      },
      now,
    );

    plans.push({
      ruleId: rule.id,
      userId: rule.userId,
      title: expandTitle(rule.title, now),
      contextId: rule.contextId,
      dueAt,
      remindAt,
      today,
      missedOccurrenceIds: openOccurrences
        .filter((o) => o.recurrenceId === rule.id)
        .map((o) => o.id),
    });
  }

  return plans;
}

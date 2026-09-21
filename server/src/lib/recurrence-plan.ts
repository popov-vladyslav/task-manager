import { DEFAULT_DURATION_MIN } from '@task-manager/shared';
import { computeInstanceTimes, expandTitle, ruleMatchesToday } from './recurrence';

// Decides what the recurrence engine should do on a given day, as pure data:
// which rules spawn a new occurrence (at what time, for how long), and which of
// their still-open occurrences must be closed out — as 'missed' for a rule whose
// occurrences are meant to be ticked off, as 'skipped' for one that is not.
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
  until: string | null; // 'YYYY-MM-DD' — last day the rule spawns; null = open-ended
  /** false → a superseded occurrence closes as 'skipped', not 'missed'. */
  tracksCompletion: boolean;
  /** Block length copied onto each occurrence that has a deadline. */
  durationMin: number | null;
}

// A still-open occurrence already in the DB (status not terminal).
export interface OpenOccurrence {
  id: string;
  recurrenceId: string;
  dueAt: Date | null;
}

// A single occurrence the user moved (recurrence_overrides). Only today's
// matters here — the calendar projection reads the future ones.
export interface PlanOverride {
  ruleId: string;
  occursOn: string; // 'YYYY-MM-DD'
  dueAt: Date | null;
  remindAt: Date | null;
}

export interface PlannedSpawn {
  ruleId: string;
  /** Copied from the rule: the spawned task belongs to the rule's owner. */
  userId: string;
  title: string;
  contextId: number | null;
  dueAt: Date | null;
  remindAt: Date | null;
  durationMin: number | null;
  today: string; // stamped onto recurrence_rules.last_spawned
  /** Older open occurrences of this same rule — superseded, so closed out. */
  staleOccurrenceIds: string[];
  /** Terminal status for those: 'missed' when the rule tracks completion. */
  staleStatus: 'missed' | 'skipped';
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
  overrides: PlanOverride[] = [],
): PlannedSpawn[] {
  const today = localDateStr(now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const plans: PlannedSpawn[] = [];

  for (const rule of rules) {
    // Idempotent per day: a rule that already spawned today does nothing (and in
    // particular does not close out the occurrence it just created).
    if (rule.lastSpawned != null && rule.lastSpawned >= today) continue;
    // Past its end date. Compared as 'YYYY-MM-DD' strings, which sort
    // chronologically, so `until` is inclusive: the rule spawns on that day.
    if (rule.until != null && today > rule.until) continue;
    if (!ruleMatchesToday(rule.rule, now)) continue;

    const computed = computeInstanceTimes(
      {
        defaultDueTime: rule.defaultDueTime,
        remindTime: rule.remindTime,
        dueOffsetD: rule.dueOffsetD,
      },
      now,
    );

    // A moved occurrence spawns at the time it was moved to — and reminds there
    // too, which is the whole point of the spawner reading overrides.
    const moved = overrides.find((o) => o.ruleId === rule.id && o.occursOn === today);
    // Moved to an earlier day and already created there — nothing left to spawn.
    if (moved && moved.dueAt == null) continue;
    const dueAt = moved ? moved.dueAt : computed.dueAt;
    const remindAt = moved ? moved.remindAt : computed.remindAt;

    plans.push({
      ruleId: rule.id,
      userId: rule.userId,
      title: expandTitle(rule.title, now),
      contextId: rule.contextId,
      dueAt,
      remindAt,
      // Deadline ⇒ duration invariant, same as services/tasks.ts: a dateless
      // occurrence carries no block length.
      durationMin: dueAt ? (rule.durationMin ?? DEFAULT_DURATION_MIN) : null,
      today,
      // An occurrence the user moved to today or later is not superseded by
      // this spawn; it is closed by the first spawn after its own day has passed.
      staleOccurrenceIds: openOccurrences
        .filter((o) => o.recurrenceId === rule.id && (o.dueAt == null || o.dueAt < startOfToday))
        .map((o) => o.id),
      // An untracked routine is never "missed" — nobody was going to tick it off.
      staleStatus: rule.tracksCompletion ? 'missed' : 'skipped',
    });
  }

  return plans;
}

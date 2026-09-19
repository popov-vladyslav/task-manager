import { DEFAULT_DURATION_MIN } from '@task-manager/shared';
import { computeInstanceTimes, expandTitle, ruleMatchesToday } from './recurrence';
import { localDateStr } from './recurrence-plan';

// Projects future occurrences of recurrence rules onto a calendar window, as
// pure data. Nothing here is stored: the spawner still creates exactly one real
// task per rule per day, and these "ghosts" are what the days *after* that would
// look like ([[0010-ghost-projection-range]]).
//
// The projection deliberately reuses the spawner's own helpers —
// `ruleMatchesToday` and `computeInstanceTimes` — so a ghost cannot drift from
// the task that eventually replaces it. It also mirrors the spawner's gates:
// a rule stops at its `until`, and a day already covered by a real occurrence is
// never projected.
//
// Cost is bounded by the caller: the window is capped at 42 days before ghosts
// are requested at all (ADR 0010), so this is days x active rules.

export interface ExpandRule {
  id: string;
  title: string;
  contextId: number | null;
  rule: string;
  defaultDueTime: string | null;
  dueOffsetD: number | null;
  durationMin: number | null;
  lastSpawned: string | null; // 'YYYY-MM-DD'
  until: string | null; // 'YYYY-MM-DD', inclusive
  active: boolean;
}

// A moved occurrence: `occursOn` is the day the rule matched, `dueAt` where it
// went. A null dueAt means the occurrence has no block at all that day.
export interface ExpandOverride {
  ruleId: string;
  occursOn: string;
  dueAt: Date | null;
}

export interface GhostBlock {
  ruleId: string;
  occursOn: string; // the day the rule matched, not necessarily the block's day
  title: string;
  contextId: number | null;
  start: Date;
  end: Date;
}

/** Key for the set of (rule, day) pairs that already have a real task. */
export function occurrenceKey(ruleId: string, day: string): string {
  return `${ruleId}@${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Ghost blocks overlapping [from, to].
 *
 * @param taken (rule, day) pairs that already have a real occurrence — see
 *   `occurrenceKey`. Today's real task is the case that matters: without this a
 *   rule created today (never spawned, so `last_spawned` is still null) would be
 *   drawn twice.
 */
export function expandGhosts(
  rules: ExpandRule[],
  overrides: ExpandOverride[],
  from: Date,
  to: Date,
  now: Date = new Date(),
  taken: ReadonlySet<string> = new Set(),
): GhostBlock[] {
  const today = localDateStr(now);
  const fromDay = startOfDay(from);
  const toDay = startOfDay(to);
  const ghosts: GhostBlock[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    // No default_due_time → the rule spawns dateless occurrences, which have no
    // calendar block, so there is nothing to project.
    if (!rule.defaultDueTime) continue;

    // due_offset_d shifts the deadline off the day the rule matched, so to cover
    // the window we scan match days shifted back by the same amount.
    const offset = rule.dueOffsetD ?? 0;
    const last = addDays(toDay, -offset);

    for (let day = addDays(fromDay, -offset); day <= last; day = addDays(day, 1)) {
      const occursOn = localDateStr(day);
      // Only the future: the past is whatever really happened, and today is
      // already on the calendar as a real task.
      if (occursOn < today) continue;
      // Strictly after the last spawn, which is what keeps today from being
      // drawn twice once the spawner has run.
      if (rule.lastSpawned != null && occursOn <= rule.lastSpawned) continue;
      if (rule.until != null && occursOn > rule.until) continue;
      if (!ruleMatchesToday(rule.rule, day)) continue;
      if (taken.has(occurrenceKey(rule.id, occursOn))) continue;

      const override = overrides.find((o) => o.ruleId === rule.id && o.occursOn === occursOn);
      const start = override
        ? override.dueAt
        : computeInstanceTimes(
            {
              defaultDueTime: rule.defaultDueTime,
              remindTime: null,
              dueOffsetD: rule.dueOffsetD,
            },
            day,
          ).dueAt;
      if (!start) continue;

      const end = new Date(start.getTime() + (rule.durationMin ?? DEFAULT_DURATION_MIN) * 60_000);
      // A move can push an occurrence out of the window entirely.
      if (end < from || start > to) continue;

      ghosts.push({
        ruleId: rule.id,
        occursOn,
        title: expandTitle(rule.title, day),
        contextId: rule.contextId,
        start,
        end,
      });
    }
  }

  return ghosts.sort((a, b) => a.start.getTime() - b.start.getTime());
}

import { and, eq, gte, isNotNull, lte, notInArray } from 'drizzle-orm';
import { DEFAULT_DURATION_MIN, type CalendarBlock, type CalendarData } from '@task-manager/shared';
import { db } from '../db/client';
import { ownedBy } from '../db/scope';
import { recurrenceOverrides, recurrenceRules, tasks } from '../db/schema';
import { badRequest } from '../lib/errors';
import { expandGhosts, occurrenceKey, type ExpandRule } from '../lib/calendar-expand';
import { localDateStr } from '../lib/recurrence-plan';

// Scheduled task time-blocks overlapping [from, to]. A task with a deadline
// (due_at) is a block from due_at for duration_min minutes (default 30).
// Completed tasks are included (flagged done) — not filtered out. Sourced from
// tasks, NOT from timer time_entries.
//
// A context's `exclude_from_all` flag does NOT suppress calendar visibility
// (CR02 §2): every task with a due_at shows here regardless of its context.
// Tasks without a due_at never appear (they have no block).
//
// With `ghosts`, the response also carries projected future occurrences of the
// recurrence rules (`virtual: true`) — never stored, recomputed per request.
// They are capped by window length, not by how far ahead they reach (ADR 0010).
export const GHOST_MAX_WINDOW_DAYS = 42;

export async function getCalendar(
  userId: string,
  fromISO: string,
  toISO: string,
  opts: { ghosts?: boolean } = {},
): Promise<CalendarData> {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest('from and to must be valid ISO dates');
  }

  // Blocks start at due_at, so any block reaching into the window starts at/before
  // `to`. Its end depends on duration, so filter end >= from in JS (dataset is
  // small — a single user's tasks).
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      contextId: tasks.contextId,
      dueAt: tasks.dueAt,
      durationMin: tasks.durationMin,
      status: tasks.status,
      recurrenceId: tasks.recurrenceId,
    })
    .from(tasks)
    // Completed tasks stay (flagged done). Occurrences closed out as 'missed' or
    // 'skipped' are dropped: the block never happened, and rendering it would be
    // indistinguishable from one still pending.
    .where(
      and(
        ownedBy(tasks.userId, userId),
        isNotNull(tasks.dueAt),
        lte(tasks.dueAt, to),
        notInArray(tasks.status, ['missed', 'skipped']),
      ),
    );

  const real = rows
    .map((r) => {
      const start = r.dueAt as Date;
      const end = new Date(start.getTime() + (r.durationMin ?? DEFAULT_DURATION_MIN) * 60_000);
      return { start, end, r };
    })
    .filter(({ end }) => end >= from)
    .map(({ start, end, r }) => ({
      key: r.id,
      id: r.id,
      title: r.title,
      contextId: r.contextId ?? null,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      done: r.status === 'done',
      virtual: false,
      ruleId: r.recurrenceId ?? null,
      occursOn: r.recurrenceId ? localDateStr(start) : null,
    }));

  const blocks: CalendarBlock[] = [...real];

  if (opts.ghosts && windowDays(from, to) <= GHOST_MAX_WINDOW_DAYS) {
    blocks.push(...(await projectGhosts(userId, rows, from, to)));
  }

  return { blocks };
}

function windowDays(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

async function projectGhosts(
  userId: string,
  rows: { recurrenceId: string | null; dueAt: Date | null }[],
  from: Date,
  to: Date,
): Promise<CalendarBlock[]> {
  const today = localDateStr(new Date());

  const [rules, overrides] = await Promise.all([
    db
      .select()
      .from(recurrenceRules)
      .where(and(ownedBy(recurrenceRules.userId, userId), eq(recurrenceRules.active, true))),
    // Past overrides can never affect a projection, which starts at today.
    db
      .select({
        ruleId: recurrenceOverrides.ruleId,
        occursOn: recurrenceOverrides.occursOn,
        dueAt: recurrenceOverrides.dueAt,
      })
      .from(recurrenceOverrides)
      .where(
        and(
          ownedBy(recurrenceOverrides.userId, userId),
          gte(recurrenceOverrides.occursOn, today),
        ),
      ),
  ]);
  if (rules.length === 0) return [];

  // Days that already hold a real occurrence: those are drawn from `tasks`, so
  // projecting them too would double the block.
  const taken = new Set(
    rows
      .filter((r) => r.recurrenceId && r.dueAt)
      .map((r) => occurrenceKey(r.recurrenceId as string, localDateStr(r.dueAt as Date))),
  );

  const expandable: ExpandRule[] = rules.map((r) => ({
    id: r.id,
    title: r.title,
    contextId: r.contextId ?? null,
    rule: r.rule,
    defaultDueTime: r.defaultDueTime,
    dueOffsetD: r.dueOffsetD,
    durationMin: r.durationMin,
    lastSpawned: r.lastSpawned,
    until: r.until,
    active: r.active,
  }));

  return expandGhosts(
    expandable,
    overrides.map((o) => ({ ...o, dueAt: o.dueAt ?? null })),
    from,
    to,
    new Date(),
    taken,
  ).map((g) => ({
    key: occurrenceKey(g.ruleId, g.occursOn),
    id: null,
    title: g.title,
    contextId: g.contextId,
    startAt: g.start.toISOString(),
    endAt: g.end.toISOString(),
    done: false,
    virtual: true,
    ruleId: g.ruleId,
    occursOn: g.occursOn,
  }));
}

import { DOW_ORDER, ruleFromSpec } from './recurrence';
import { localDateStr } from './recurrence-plan';

// "This and all following": what a rule becomes once one of its occurrences is
// dragged to a new day and time. Pure — all dates are server-local (Europe/Warsaw).

export interface ShiftableRule {
  rule: string;
  defaultDueTime: string | null;
  remindTime: string | null;
  dueOffsetD: number | null;
}

export interface ShiftedRule {
  rule: string;
  defaultDueTime: string;
  remindTime: string | null;
  // The day the shifted rule matches for the dragged occurrence, 'YYYY-MM-DD'.
  matchDay: string;
  // Where the dragged occurrence itself ends up.
  dueAt: Date;
}

const MINUTES_PER_DAY = 24 * 60;

export function parseLocalDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addLocalDays(day: string, n: number): string {
  const d = parseLocalDay(day);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, total));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

// A reminder keeps its distance from the deadline. Clamped to the same day: a
// rule's remind_time is a time of day and cannot point at the day before.
export function shiftTimeOfDay(
  remindTime: string | null,
  oldDueTime: string | null,
  newDueTime: string,
): string | null {
  if (!remindTime || !oldDueTime) return remindTime;
  return fromMinutes(toMinutes(remindTime) + toMinutes(newDueTime) - toMinutes(oldDueTime));
}

export function shiftInstant(
  remindAt: Date | null,
  oldDue: Date | null,
  newDue: Date,
): Date | null {
  if (!remindAt || !oldDue) return remindAt;
  return new Date(remindAt.getTime() + newDue.getTime() - oldDue.getTime());
}

// `matchDay` is the day the rule matched for the dragged occurrence (its due day
// minus due_offset_d). A daily rule has no day to change, so only its time moves
// and the occurrence stays on its own day.
export function shiftRule(rule: ShiftableRule, matchDay: string, newDue: Date): ShiftedRule {
  const offset = rule.dueOffsetD ?? 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultDueTime = `${pad(newDue.getHours())}:${pad(newDue.getMinutes())}`;
  const remindTime = shiftTimeOfDay(rule.remindTime, rule.defaultDueTime, defaultDueTime);
  const [kind, arg] = rule.rule.split(':');

  if (kind !== 'weekly' && kind !== 'monthly') {
    const stay = parseLocalDay(addLocalDays(matchDay, offset));
    stay.setHours(newDue.getHours(), newDue.getMinutes(), 0, 0);
    return { rule: rule.rule, defaultDueTime, remindTime, matchDay, dueAt: stay };
  }

  const newMatchDay = addLocalDays(localDateStr(newDue), -offset);
  const newMatch = parseLocalDay(newMatchDay);

  if (kind === 'monthly') {
    return {
      rule: `monthly:${newMatch.getDate()}`,
      defaultDueTime,
      remindTime,
      matchDay: newMatchDay,
      dueAt: newDue,
    };
  }

  const from = DOW_ORDER[parseLocalDay(matchDay).getDay()];
  const to = DOW_ORDER[newMatch.getDay()];
  const days = (arg ?? '').split(',').map((d) => d.trim().toLowerCase());
  if (!days.includes(from)) throw new Error(`Rule ${rule.rule} does not match ${matchDay}.`);
  return {
    rule: ruleFromSpec({ freq: 'weekly', days: days.map((d) => (d === from ? to : d)) }),
    defaultDueTime,
    remindTime,
    matchDay: newMatchDay,
    dueAt: newDue,
  };
}

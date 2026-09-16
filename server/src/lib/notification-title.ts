// CR02 §3a — compose a push notification's title. Pure + unit-tested; kept out
// of the send path so the 4×2 matrix (context × due × kind) is testable in
// isolation. The body is always the plain task title (composed by the caller).
//
// Matrix (kind = 'reminder'):
//   ctx yes / due yes → "{emoji} {context} · {rel}"
//   ctx yes / due no  → "{emoji} {context}"
//   ctx no  / due yes → "{rel}"
//   ctx no  / due no  → "Task"
// kind = 'spawn' replaces the relative-time slot with the literal "new"
// (whether or not a due date is set).

import {
  contextEmoji,
  DEFAULT_LOCALE,
  nearestEmoji,
  translate,
  type Locale,
} from '@task-manager/shared';

export { nearestEmoji };

export interface NotifTitleInput {
  contextName: string | null;
  contextColor: string | null; // hex, e.g. '#5B8DEF'
  contextEmoji?: string | null;
  dueAt: Date | string | null;
}

// Relative-time label for a due date (CR02). 'now' wins within ±5 min (incl. up
// to 5 min past); anything more than 5 min in the past is 'overdue'.
export function relativeTime(due: Date, now: Date, locale: Locale = DEFAULT_LOCALE): string {
  const diffMin = (due.getTime() - now.getTime()) / 60_000;
  if (diffMin < -5) return translate(locale, 'push.overdue');
  if (diffMin <= 5) return translate(locale, 'push.now');
  if (diffMin < 60) return translate(locale, 'push.inMin', { n: Math.round(diffMin) });
  if (diffMin < 1440) return translate(locale, 'push.inHours', { n: Math.round(diffMin / 60) });
  return translate(locale, 'push.inDays', { n: Math.round(diffMin / 1440) });
}

export function composeNotificationTitle(
  t: NotifTitleInput,
  kind: 'reminder' | 'spawn',
  now: Date = new Date(),
  locale: Locale = DEFAULT_LOCALE,
): string {
  const parsed = t.dueAt == null ? null : t.dueAt instanceof Date ? t.dueAt : new Date(t.dueAt);
  const due = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  if (t.contextName) {
    const emoji = contextEmoji({ emoji: t.contextEmoji, color: t.contextColor });
    const label = emoji ? `${emoji} ${t.contextName}` : t.contextName;
    if (kind === 'spawn') return `${label} · ${translate(locale, 'push.new')}`;
    return due ? `${label} · ${relativeTime(due, now, locale)}` : label;
  }

  // No context → the whole title is the relative-time slot.
  if (kind === 'spawn') return translate(locale, 'push.new');
  return due ? relativeTime(due, now, locale) : translate(locale, 'push.task');
}

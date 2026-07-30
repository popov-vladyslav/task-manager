import type { Task } from '@task-manager/shared';

// Buckets for the morning summary. Yesterday's leftovers are the actionable
// list; anything older is a separate, potentially long and stale pile that the
// UI keeps collapsed — hence the split rather than one flat "overdue" list.
//
// Boundaries are computed in server-local time (deploy runs TZ=Europe/Warsaw),
// matching the recurrence engine and the reminder scheduler.

export interface OverdueBuckets<T> {
  yesterday: T[]; // due within yesterday's calendar day
  older: T[]; // due before yesterday — never acted on, so still sitting there
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Tasks are expected to be pre-filtered to *ordinary* open tasks with a due_at
// in the past (see services/summary.ts) — recurring occurrences never appear
// here, so a skipped daily routine can't generate a nag.
export function bucketOverdue<T extends Pick<Task, 'dueAt'>>(
  overdue: T[],
  now: Date = new Date(),
): OverdueBuckets<T> {
  const todayStart = startOfLocalDay(now).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  const buckets: OverdueBuckets<T> = { yesterday: [], older: [] };
  for (const t of overdue) {
    if (!t.dueAt) continue; // no deadline → nothing was scheduled to miss
    const due = Date.parse(t.dueAt);
    if (Number.isNaN(due) || due >= todayStart) continue; // today or later isn't overdue
    if (due >= yesterdayStart) buckets.yesterday.push(t);
    else buckets.older.push(t);
  }
  return buckets;
}

// Body of the morning push. Deliberately just the count — the actionable list
// lives in the in-app sheet the notification opens.
export function summaryPushBody(counts: { yesterday: number; older: number }): string {
  const total = counts.yesterday + counts.older;
  const noun = total === 1 ? 'task' : 'tasks';
  if (counts.older === 0) return `You have ${total} overdue ${noun} from yesterday.`;
  if (counts.yesterday === 0) return `You have ${total} older overdue ${noun}.`;
  return `You have ${total} overdue ${noun} — ${counts.yesterday} from yesterday.`;
}

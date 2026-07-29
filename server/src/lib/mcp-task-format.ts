import { DEFAULT_DURATION_MIN, formatTrackedShort, type Task } from '@task-manager/shared';

// One-line rendering of a task for the MCP tools. Pure, so the payload a client
// actually receives is unit-testable.

// How long the task's block is, as a client would experience it. A task with a
// deadline always occupies a block: either the duration that was set, or the
// implicit DEFAULT_DURATION_MIN. Reporting nothing there hid the block length
// (and the fact that a default was applied at all), so it is spelled out —
// including which of the two it is. A task with no deadline has no block.
export function fmtDuration(t: Pick<Task, 'dueAt' | 'durationMin'>): string | null {
  if (!t.dueAt) return null;
  if (t.durationMin != null) return `duration_min=${t.durationMin}`;
  return `duration_min=${DEFAULT_DURATION_MIN} (default)`;
}

export function fmtTask(t: Task, contextLabel?: string): string {
  const bits = [`• ${t.title}`, `[${t.id}]`];
  if (contextLabel) bits.push(`(${contextLabel})`);
  if (t.dueAt) {
    bits.push(`due ${t.dueAt.slice(0, 16).replace('T', ' ')}`);
    const duration = fmtDuration(t);
    if (duration) bits.push(duration);
  }
  if (t.remindAt) bits.push(`remind ${t.remindAt.slice(0, 16).replace('T', ' ')}`);
  // Time actually spent, accumulated across timer sessions. Omitted when never
  // tracked, so an untouched task stays terse.
  const tracked = formatTrackedShort(t.trackedSec);
  if (tracked) bits.push(`tracked=${tracked}`);
  if (t.recurrenceRule) {
    bits.push(`repeats ${t.recurrenceRule}${t.nextInstance ? ` (next ${t.nextInstance})` : ''}`);
  }
  if (t.status !== 'active') bits.push(t.status);
  if (t.commentsCount) bits.push(`${t.commentsCount} comment(s)`);
  return bits.join(' ');
}

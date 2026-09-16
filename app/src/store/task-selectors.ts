import type { Context, Task } from '@task-manager/shared';

export function excludedContextIds(contexts: Context[]): Set<number> {
  const s = new Set<number>();
  for (const c of contexts) if (c.excludeFromAll) s.add(c.id);
  return s;
}

export function isInAll(task: Task, excluded: Set<number>): boolean {
  return task.contextId == null || !excluded.has(task.contextId);
}

export function subtaskProgress(task: Task): { done: number; total: number } | null {
  const subs = task.subtasks ?? [];
  if (subs.length === 0) return null;
  return { done: subs.filter((s) => s.done).length, total: subs.length };
}

export function openCounts(tasks: Task[], contexts: Context[]): Record<string, number> {
  const excluded = excludedContextIds(contexts);
  const counts: Record<string, number> = { all: 0 };
  for (const t of tasks) {
    if (t.contextId != null) counts[String(t.contextId)] = (counts[String(t.contextId)] ?? 0) + 1;
    if (isInAll(t, excluded)) counts.all += 1;
  }
  return counts;
}

import type { InferSelectModel } from 'drizzle-orm';
import type { Context, Task } from '@task-manager/shared';
import { contexts, tasks } from './schema';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toContext(r: InferSelectModel<typeof contexts>): Context {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    color: r.color,
    sortOrder: r.sortOrder,
    archived: r.archived,
    excludeFromAll: r.excludeFromAll,
    emoji: r.emoji,
  };
}

export interface TaskExtras {
  nextInstance: string | null;
  recurrenceRule: string | null;
}

export function toTask(r: InferSelectModel<typeof tasks>, extras: TaskExtras): Task {
  return {
    id: r.id,
    title: r.title,
    contextId: r.contextId ?? null,
    status: r.status,
    dueAt: iso(r.dueAt),
    remindAt: iso(r.remindAt),
    durationMin: r.durationMin ?? null,
    trackedSec: r.trackedSec ?? 0,
    sortGlobal: r.sortGlobal,
    sortContext: r.sortContext,
    recurrenceId: r.recurrenceId ?? null,
    recurrenceRule: extras.recurrenceRule,
    completedAt: iso(r.completedAt),
    createdAt: r.createdAt.toISOString(),
    createdVia: r.createdVia,
    note: r.note,
    nextInstance: extras.nextInstance,
  };
}

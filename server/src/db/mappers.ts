import type { InferSelectModel } from 'drizzle-orm';
import type { Context, Task, Comment } from '@task-manager/shared';
import { contexts, tasks, comments } from './schema';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toContext(r: InferSelectModel<typeof contexts>): Context {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    color: r.color,
    sortOrder: r.sortOrder,
    archived: r.archived,
  };
}

export interface TaskExtras {
  commentsCount: number;
  photosCount: number;
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
    sortGlobal: r.sortGlobal,
    sortContext: r.sortContext,
    recurrenceId: r.recurrenceId ?? null,
    recurrenceRule: extras.recurrenceRule,
    completedAt: iso(r.completedAt),
    createdAt: r.createdAt.toISOString(),
    createdVia: r.createdVia,
    commentsCount: extras.commentsCount,
    photosCount: extras.photosCount,
    nextInstance: extras.nextInstance,
  };
}

export function toComment(r: InferSelectModel<typeof comments>): Comment {
  return {
    id: r.id,
    taskId: r.taskId as string,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  };
}

import { and, eq, sql } from 'drizzle-orm';
import type { Task, UpdateSubtaskInput } from '@task-manager/shared';
import { db } from '../db/client';
import { subtasks } from '../db/schema';
import { ownedBy } from '../db/scope';
import { badRequest, notFound } from '../lib/errors';
import { getTask } from './tasks';

export async function parentTaskId(userId: string, id: string): Promise<string | null> {
  const [row] = await db
    .select({ taskId: subtasks.taskId })
    .from(subtasks)
    .where(and(ownedBy(subtasks.userId, userId), eq(subtasks.id, id)));
  return row?.taskId ?? null;
}

export async function addSubtask(userId: string, taskId: string, title: string): Promise<Task> {
  const clean = title.trim();
  if (!clean) throw badRequest('Title is required');
  await getTask(userId, taskId);
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${subtasks.sortOrder}), -1) + 1` })
    .from(subtasks)
    .where(and(ownedBy(subtasks.userId, userId), eq(subtasks.taskId, taskId)));
  await db.insert(subtasks).values({ userId, taskId, title: clean, sortOrder: next });
  return getTask(userId, taskId);
}

export async function updateSubtask(
  userId: string,
  taskId: string,
  id: string,
  patch: UpdateSubtaskInput,
): Promise<Task> {
  const set: { title?: string; done?: boolean } = {};
  if (patch.title !== undefined) {
    const clean = patch.title.trim();
    if (!clean) throw badRequest('Title is required');
    set.title = clean;
  }
  if (patch.done !== undefined) set.done = patch.done;
  if (Object.keys(set).length === 0) return getTask(userId, taskId);
  const [row] = await db
    .update(subtasks)
    .set(set)
    .where(and(ownedBy(subtasks.userId, userId), eq(subtasks.taskId, taskId), eq(subtasks.id, id)))
    .returning({ id: subtasks.id });
  if (!row) throw notFound('Subtask not found');
  return getTask(userId, taskId);
}

export async function deleteSubtask(userId: string, taskId: string, id: string): Promise<Task> {
  const [row] = await db
    .delete(subtasks)
    .where(and(ownedBy(subtasks.userId, userId), eq(subtasks.taskId, taskId), eq(subtasks.id, id)))
    .returning({ id: subtasks.id });
  if (!row) throw notFound('Subtask not found');
  return getTask(userId, taskId);
}

export async function reorderSubtasks(
  userId: string,
  taskId: string,
  ids: string[],
): Promise<Task> {
  await getTask(userId, taskId);
  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx
        .update(subtasks)
        .set({ sortOrder: index })
        .where(
          and(ownedBy(subtasks.userId, userId), eq(subtasks.taskId, taskId), eq(subtasks.id, id)),
        );
    }
  });
  return getTask(userId, taskId);
}

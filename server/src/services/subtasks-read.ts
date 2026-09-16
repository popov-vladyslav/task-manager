import { and, asc, inArray } from 'drizzle-orm';
import type { Subtask } from '@task-manager/shared';
import { db } from '../db/client';
import { subtasks } from '../db/schema';
import { toSubtask } from '../db/mappers';
import { ownedBy } from '../db/scope';

export async function subtasksByTask(
  userId: string,
  taskIds: string[],
): Promise<Map<string, Subtask[]>> {
  const grouped = new Map<string, Subtask[]>();
  if (taskIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(subtasks)
    .where(and(ownedBy(subtasks.userId, userId), inArray(subtasks.taskId, taskIds)))
    .orderBy(asc(subtasks.sortOrder), asc(subtasks.createdAt));
  for (const r of rows) {
    const list = grouped.get(r.taskId) ?? [];
    list.push(toSubtask(r));
    grouped.set(r.taskId, list);
  }
  return grouped;
}

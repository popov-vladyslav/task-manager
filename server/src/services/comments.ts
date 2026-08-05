import { and, asc, eq } from 'drizzle-orm';
import type { Comment } from '@task-manager/shared';
import { db } from '../db/client';
import { comments, tasks } from '../db/schema';
import { toComment } from '../db/mappers';
import { ownedBy } from '../db/scope';
import { notFound } from '../lib/errors';

export async function listComments(userId: string, taskId: string): Promise<Comment[]> {
  const rows = await db
    .select()
    .from(comments)
    .where(and(ownedBy(comments.userId, userId), eq(comments.taskId, taskId)))
    .orderBy(asc(comments.createdAt));
  return rows.map(toComment);
}

export async function addComment(userId: string, taskId: string, body: string): Promise<Comment> {
  // Commenting on someone else's task is refused as "not found": the parent must
  // be the caller's own, and the comment inherits that ownership.
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(ownedBy(tasks.userId, userId), eq(tasks.id, taskId)));
  if (!task) throw notFound('Task not found');
  const [row] = await db.insert(comments).values({ taskId, body, userId }).returning();
  return toComment(row);
}

export async function deleteComment(userId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(comments)
    .where(and(ownedBy(comments.userId, userId), eq(comments.id, id)))
    .returning({ id: comments.id });
  if (!row) throw notFound('Comment not found');
}

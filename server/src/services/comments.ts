import { asc, eq } from 'drizzle-orm';
import type { Comment } from '@task-manager/shared';
import { db } from '../db/client';
import { comments, tasks } from '../db/schema';
import { toComment } from '../db/mappers';
import { notFound } from '../lib/errors';

export async function listComments(taskId: string): Promise<Comment[]> {
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.createdAt));
  return rows.map(toComment);
}

export async function addComment(taskId: string, body: string): Promise<Comment> {
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw notFound('Task not found');
  const [row] = await db.insert(comments).values({ taskId, body }).returning();
  return toComment(row);
}

export async function deleteComment(id: string): Promise<void> {
  const [row] = await db.delete(comments).where(eq(comments.id, id)).returning({ id: comments.id });
  if (!row) throw notFound('Comment not found');
}

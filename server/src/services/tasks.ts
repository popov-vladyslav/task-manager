import { and, asc, eq, ilike, isNotNull, lte, ne, sql } from 'drizzle-orm';
import type {
  CreateTaskInput,
  ReorderInput,
  Task,
  TaskStatus,
  UpdateTaskInput,
} from '@task-manager/shared';
import { db } from '../db/client';
import { tasks, recurrenceRules } from '../db/schema';
import { toTask } from '../db/mappers';
import { between } from '../lib/frac-index';
import { nextInstance as computeNext } from '../lib/recurrence';
import { badRequest, notFound } from '../lib/errors';

interface ListFilter {
  contextId?: number;
  status?: TaskStatus;
  dueBefore?: Date; // only tasks with a due date at/before this
}

const DEFAULT_DURATION_MIN = 30; // a task with a deadline gets a 30-min block unless set

// A scheduled task (has a deadline) always has a duration; a task with no
// deadline has none. Returns the duration_min to store for a given (due, dur).
function resolveDuration(due: Date | null, durationMin: number | null | undefined): number | null {
  if (!due) return null;
  return durationMin ?? DEFAULT_DURATION_MIN;
}

// Task columns + derived comment/photo counts + the linked recurrence rule.
const selection = {
  task: tasks,
  rule: recurrenceRules.rule,
  commentsCount: sql<number>`(select count(*)::int from comments c where c.task_id = ${tasks.id})`,
  photosCount: sql<number>`(select count(*)::int from photos p where p.task_id = ${tasks.id})`,
};

type Row = {
  task: typeof tasks.$inferSelect;
  rule: string | null;
  commentsCount: number;
  photosCount: number;
};

function rowToTask(r: Row): Task {
  return toTask(r.task, {
    commentsCount: Number(r.commentsCount ?? 0),
    photosCount: Number(r.photosCount ?? 0),
    nextInstance: r.rule ? computeNext(r.rule) : null,
    recurrenceRule: r.rule,
  });
}

export async function listTasks(filter: ListFilter): Promise<Task[]> {
  const conds = [];
  if (filter.contextId != null) conds.push(eq(tasks.contextId, filter.contextId));
  if (filter.status) conds.push(eq(tasks.status, filter.status));
  else conds.push(ne(tasks.status, 'done')); // default: open tasks only
  if (filter.dueBefore) {
    conds.push(isNotNull(tasks.dueAt));
    conds.push(lte(tasks.dueAt, filter.dueBefore));
  }

  // "All" orders by sort_global; a single context orders by sort_context.
  const order = filter.contextId != null ? tasks.sortContext : tasks.sortGlobal;

  const rows = await db
    .select(selection)
    .from(tasks)
    .leftJoin(recurrenceRules, eq(tasks.recurrenceId, recurrenceRules.id))
    .where(and(...conds))
    .orderBy(asc(order), asc(tasks.createdAt));

  return rows.map(rowToTask);
}

export async function getTask(id: string): Promise<Task> {
  const rows = await db
    .select(selection)
    .from(tasks)
    .leftJoin(recurrenceRules, eq(tasks.recurrenceId, recurrenceRules.id))
    .where(eq(tasks.id, id));
  if (!rows[0]) throw notFound('Task not found');
  return rowToTask(rows[0]);
}

// Fuzzy title search over open tasks — used by MCP `title_match`.
export async function searchOpenTasks(query: string): Promise<Task[]> {
  const rows = await db
    .select(selection)
    .from(tasks)
    .leftJoin(recurrenceRules, eq(tasks.recurrenceId, recurrenceRules.id))
    .where(and(ne(tasks.status, 'done'), ilike(tasks.title, `%${query.trim()}%`)))
    .orderBy(asc(tasks.sortGlobal));
  return rows.map(rowToTask);
}

// Open tasks due today or overdue (Europe/Warsaw — the server runs in TZ).
export async function tasksDueToday(now: Date = new Date()): Promise<Task[]> {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return listTasks({ status: 'active', dueBefore: end });
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const title = input.title?.trim();
  if (!title) throw badRequest('Title is required');
  const contextId = input.contextId ?? null;

  // New task goes to the top of both the global and the context scope.
  const [mins] = await db
    .select({
      ming: sql<number>`coalesce(min(${tasks.sortGlobal}), 1)`,
      minc: sql<number>`coalesce(min(${tasks.sortContext}) filter (where ${tasks.contextId} is not distinct from ${contextId}), 1)`,
    })
    .from(tasks);

  let recurrenceId: string | null = null;
  if (input.recurrence) {
    const [rule] = await db
      .insert(recurrenceRules)
      .values({
        title,
        contextId,
        rule: input.recurrence.rule,
        remindTime: input.recurrence.remindTime ?? null,
        dueOffsetD: input.recurrence.dueOffsetDays ?? 0,
      })
      .returning();
    recurrenceId = rule.id;
  }

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;

  const [row] = await db
    .insert(tasks)
    .values({
      title,
      contextId,
      dueAt,
      remindAt: input.remindAt ? new Date(input.remindAt) : null,
      durationMin: resolveDuration(dueAt, input.durationMin),
      sortGlobal: Number(mins.ming) - 1,
      sortContext: Number(mins.minc) - 1,
      recurrenceId,
      createdVia: 'app',
    })
    .returning();

  return getTask(row.id);
}

export async function updateTask(id: string, patch: UpdateTaskInput): Promise<Task> {
  const [cur] = await db
    .select({
      recurrenceId: tasks.recurrenceId,
      title: tasks.title,
      contextId: tasks.contextId,
      dueAt: tasks.dueAt,
      durationMin: tasks.durationMin,
    })
    .from(tasks)
    .where(eq(tasks.id, id));
  if (!cur) throw notFound('Task not found');

  const set: Partial<typeof tasks.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.contextId !== undefined) set.contextId = patch.contextId;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.dueAt !== undefined) set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  if (patch.remindAt !== undefined) set.remindAt = patch.remindAt ? new Date(patch.remindAt) : null;

  // Deadline ⇒ duration invariant: recompute whenever either changes so a task
  // with a deadline always has a duration (default 30), and one without has none.
  if (patch.dueAt !== undefined || patch.durationMin !== undefined) {
    const nextDue = patch.dueAt !== undefined ? (patch.dueAt ? new Date(patch.dueAt) : null) : cur.dueAt;
    const nextDur = patch.durationMin !== undefined ? patch.durationMin : cur.durationMin;
    set.durationMin = resolveDuration(nextDue, nextDur);
  }

  // { completed: true } runs the complete-logic (spec §3).
  if (patch.completed !== undefined) {
    if (patch.completed) {
      set.status = 'done';
      set.completedAt = new Date();
    } else {
      set.status = 'active';
      set.completedAt = null;
    }
  }

  // Recurrence: create/update the linked rule, or unlink (and drop the orphan).
  let orphanRuleId: string | null = null;
  if (patch.recurrence !== undefined) {
    if (patch.recurrence === null) {
      if (cur.recurrenceId) {
        set.recurrenceId = null;
        orphanRuleId = cur.recurrenceId;
      }
    } else if (cur.recurrenceId) {
      await db
        .update(recurrenceRules)
        .set({
          rule: patch.recurrence.rule,
          remindTime: patch.recurrence.remindTime ?? null,
          dueOffsetD: patch.recurrence.dueOffsetDays ?? 0,
        })
        .where(eq(recurrenceRules.id, cur.recurrenceId));
    } else {
      const [rule] = await db
        .insert(recurrenceRules)
        .values({
          title: patch.title ?? cur.title,
          contextId: patch.contextId !== undefined ? patch.contextId : cur.contextId,
          rule: patch.recurrence.rule,
          remindTime: patch.recurrence.remindTime ?? null,
          dueOffsetD: patch.recurrence.dueOffsetDays ?? 0,
        })
        .returning();
      set.recurrenceId = rule.id;
    }
  }

  if (Object.keys(set).length > 0) {
    await db.update(tasks).set(set).where(eq(tasks.id, id));
  }
  // Delete the rule only after the task no longer references it (FK).
  if (orphanRuleId) {
    await db.delete(recurrenceRules).where(eq(recurrenceRules.id, orphanRuleId));
  }

  return getTask(id);
}

export async function deleteTask(id: string): Promise<void> {
  const [row] = await db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
  if (!row) throw notFound('Task not found');
}

export async function reorderTask(id: string, input: ReorderInput): Promise<Task> {
  const col = input.scope === 'context' ? tasks.sortContext : tasks.sortGlobal;

  const neighborSort = async (nid?: string | null): Promise<number | null> => {
    if (!nid) return null;
    const [n] = await db.select({ s: col }).from(tasks).where(eq(tasks.id, nid));
    return n ? n.s : null;
  };

  const after = await neighborSort(input.afterId);
  const before = await neighborSort(input.beforeId);
  const newSort = between(after, before);

  const set: Partial<typeof tasks.$inferInsert> =
    input.scope === 'context' ? { sortContext: newSort } : { sortGlobal: newSort };
  const [row] = await db.update(tasks).set(set).where(eq(tasks.id, id)).returning({ id: tasks.id });
  if (!row) throw notFound('Task not found');
  return getTask(row.id);
}

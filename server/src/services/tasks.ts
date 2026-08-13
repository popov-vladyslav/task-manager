import { and, asc, eq, ilike, inArray, isNotNull, lte, notInArray, sql } from 'drizzle-orm';
import { DEFAULT_DURATION_MIN, TERMINAL_STATUSES } from '@task-manager/shared';
import type {
  CreateTaskInput,
  ReorderInput,
  Task,
  TaskStatus,
  UpdateTaskInput,
} from '@task-manager/shared';
import { db } from '../db/client';
import { tasks, recurrenceRules, notificationLog, contexts } from '../db/schema';
import { toTask } from '../db/mappers';
import { ownedBy, type Executor } from '../db/scope';
import { between } from '../lib/frac-index';
import { nextInstance as computeNext } from '../lib/recurrence';
import { badRequest, notFound } from '../lib/errors';
import { invalidateReminderClocks } from './reminder-clock';

// A task may only point at a context its own owner holds. Without this, a
// crafted contextId would attach one user's task to another user's context —
// ownership of the row being written is not enough, the rows it REFERENCES must
// be checked too.
async function assertContextOwned(
  executor: Executor,
  userId: string,
  contextId: number | null | undefined,
): Promise<void> {
  if (contextId == null) return;
  const [row] = await executor
    .select({ id: contexts.id })
    .from(contexts)
    .where(and(ownedBy(contexts.userId, userId), eq(contexts.id, contextId)));
  if (!row) throw badRequest('Unknown context');
}

interface ListFilter {
  contextId?: number;
  status?: TaskStatus;
  dueBefore?: Date; // only tasks with a due date at/before this
}

// A scheduled task (has a deadline) always has a duration; a task with no
// deadline has none. Returns the duration_min to store for a given (due, dur).
function resolveDuration(due: Date | null, durationMin: number | null | undefined): number | null {
  if (!due) return null;
  return durationMin ?? DEFAULT_DURATION_MIN;
}

// A recurrence rule's default_due_time is the task's own deadline time (server-
// local = Europe/Warsaw), or null when the task has no deadline → dateless
// instances. Copied onto each spawned instance's due_at. (CR02 §1)
function timeOf(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Task columns + the derived comment count + the linked recurrence rule.
const selection = {
  task: tasks,
  rule: recurrenceRules.rule,
  commentsCount: sql<number>`(select count(*)::int from comments c where c.task_id = ${tasks.id})`,
};

type Row = {
  task: typeof tasks.$inferSelect;
  rule: string | null;
  commentsCount: number;
};

function rowToTask(r: Row): Task {
  return toTask(r.task, {
    commentsCount: Number(r.commentsCount ?? 0),
    nextInstance: r.rule ? computeNext(r.rule) : null,
    recurrenceRule: r.rule,
  });
}

export async function listTasks(userId: string, filter: ListFilter): Promise<Task[]> {
  const conds = [ownedBy(tasks.userId, userId)];
  if (filter.contextId != null) conds.push(eq(tasks.contextId, filter.contextId));
  if (filter.status) conds.push(eq(tasks.status, filter.status));
  // Default: open tasks only. 'done' and 'missed' are both terminal — a
  // recurring occurrence closed out as 'missed' must not show in any list.
  else conds.push(notInArray(tasks.status, [...TERMINAL_STATUSES]));
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

export async function getTask(userId: string, id: string): Promise<Task> {
  const rows = await db
    .select(selection)
    .from(tasks)
    .leftJoin(recurrenceRules, eq(tasks.recurrenceId, recurrenceRules.id))
    .where(and(ownedBy(tasks.userId, userId), eq(tasks.id, id)));
  if (!rows[0]) throw notFound('Task not found');
  return rowToTask(rows[0]);
}

// Fuzzy title search over open tasks — used by MCP `title_match`.
export async function searchOpenTasks(userId: string, query: string): Promise<Task[]> {
  const rows = await db
    .select(selection)
    .from(tasks)
    .leftJoin(recurrenceRules, eq(tasks.recurrenceId, recurrenceRules.id))
    .where(
      and(
        ownedBy(tasks.userId, userId),
        notInArray(tasks.status, [...TERMINAL_STATUSES]),
        ilike(tasks.title, `%${query.trim()}%`),
      ),
    )
    .orderBy(asc(tasks.sortGlobal));
  return rows.map(rowToTask);
}

// Open tasks due today or overdue (Europe/Warsaw — the server runs in TZ).
export async function tasksDueToday(userId: string, now: Date = new Date()): Promise<Task[]> {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return listTasks(userId, { status: 'active', dueBefore: end });
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<Task> {
  const title = input.title?.trim();
  if (!title) throw badRequest('Title is required');
  const contextId = input.contextId ?? null;
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  await assertContextOwned(db, userId, contextId);

  // One unit of work: a failure between the rule insert and the task insert would
  // otherwise leave an orphaned recurrence_rules row.
  const id = await db.transaction(async (tx) => {
    // New task goes to the top of both the global and the context scope.
    const [mins] = await tx
      .select({
        ming: sql<number>`coalesce(min(${tasks.sortGlobal}), 1)`,
        minc: sql<number>`coalesce(min(${tasks.sortContext}) filter (where ${tasks.contextId} is not distinct from ${contextId}), 1)`,
      })
      .from(tasks)
      .where(ownedBy(tasks.userId, userId));

    let recurrenceId: string | null = null;
    if (input.recurrence) {
      const [rule] = await tx
        .insert(recurrenceRules)
        .values({
          userId,
          title,
          contextId,
          rule: input.recurrence.rule,
          remindTime: input.recurrence.remindTime ?? null,
          defaultDueTime: timeOf(input.dueAt),
          dueOffsetD: input.recurrence.dueOffsetDays ?? 0,
        })
        .returning();
      recurrenceId = rule.id;
    }

    const [row] = await tx
      .insert(tasks)
      .values({
        userId,
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
    return row.id;
  });

  // The scheduler caches when the next push is due and skips the database until
  // then; a new remind_at is invisible to it until the cache is dropped.
  invalidateReminderClocks();
  return getTask(userId, id);
}

export async function updateTask(
  userId: string,
  id: string,
  patch: UpdateTaskInput,
): Promise<Task> {
  // The task update and its dependent recurrence-rule writes (upsert / sync /
  // orphan-delete) are one unit so a mid-way failure can't leave a partial state.
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select({
        recurrenceId: tasks.recurrenceId,
        // A rule created from an existing task inherits that task's owner.
        userId: tasks.userId,
        title: tasks.title,
        contextId: tasks.contextId,
        dueAt: tasks.dueAt,
        durationMin: tasks.durationMin,
      })
      .from(tasks)
      .where(and(ownedBy(tasks.userId, userId), eq(tasks.id, id)));
    if (!cur) throw notFound('Task not found');

    // Re-pointing a task at another user's context is a cross-account write.
    await assertContextOwned(tx, userId, patch.contextId);

    const set: Partial<typeof tasks.$inferInsert> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.contextId !== undefined) set.contextId = patch.contextId;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.dueAt !== undefined) set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
    if (patch.remindAt !== undefined)
      set.remindAt = patch.remindAt ? new Date(patch.remindAt) : null;

    // Deadline ⇒ duration invariant: recompute whenever either changes so a task
    // with a deadline always has a duration (default 30), and one without has none.
    if (patch.dueAt !== undefined || patch.durationMin !== undefined) {
      const nextDue =
        patch.dueAt !== undefined ? (patch.dueAt ? new Date(patch.dueAt) : null) : cur.dueAt;
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
        await tx
          .update(recurrenceRules)
          .set({
            rule: patch.recurrence.rule,
            remindTime: patch.recurrence.remindTime ?? null,
            defaultDueTime: timeOf(patch.dueAt !== undefined ? patch.dueAt : cur.dueAt),
            dueOffsetD: patch.recurrence.dueOffsetDays ?? 0,
          })
          .where(
            and(ownedBy(recurrenceRules.userId, userId), eq(recurrenceRules.id, cur.recurrenceId)),
          );
      } else {
        const [rule] = await tx
          .insert(recurrenceRules)
          .values({
            userId: cur.userId,
            title: patch.title ?? cur.title,
            contextId: patch.contextId !== undefined ? patch.contextId : cur.contextId,
            rule: patch.recurrence.rule,
            remindTime: patch.recurrence.remindTime ?? null,
            defaultDueTime: timeOf(patch.dueAt !== undefined ? patch.dueAt : cur.dueAt),
            dueOffsetD: patch.recurrence.dueOffsetDays ?? 0,
          })
          .returning();
        set.recurrenceId = rule.id;
      }
    }

    // Deadline changed on an already-recurring task without touching the rule:
    // keep the rule's default_due_time in sync so future instances match. (CR02 §1)
    if (patch.recurrence === undefined && patch.dueAt !== undefined && cur.recurrenceId) {
      await tx
        .update(recurrenceRules)
        .set({ defaultDueTime: timeOf(patch.dueAt) })
        .where(
          and(ownedBy(recurrenceRules.userId, userId), eq(recurrenceRules.id, cur.recurrenceId)),
        );
    }

    if (Object.keys(set).length > 0) {
      await tx.update(tasks).set(set).where(and(ownedBy(tasks.userId, userId), eq(tasks.id, id)));
    }

    // A new deadline is a new event, but the due claim is keyed on task_id alone
    // (drizzle/0011), so the row written for the OLD deadline would suppress it
    // forever. Release it. Mirrors what snoozeTask does for the reminder channel
    // — which is scoped to 'initial'/'repeat' for the mirror-image reason.
    // Safe against backfill: the send still filters on dueCutoff, so a deadline
    // moved into the past stays silent.
    //
    // Known race, deliberately not locked against: this runs in a transaction,
    // the cron send does not. A reschedule landing between a tick's SELECT and
    // its claim() lets that tick write a claim for the OLD deadline just after
    // the release, suppressing the new one. Sub-second window, and the next edit
    // to the task clears it — not worth serialising the send path for.
    const nextDueAt = set.dueAt instanceof Date ? set.dueAt : null;
    if (
      patch.dueAt !== undefined &&
      (nextDueAt?.getTime() ?? null) !== (cur.dueAt?.getTime() ?? null)
    ) {
      await tx
        .delete(notificationLog)
        .where(
          and(
            ownedBy(notificationLog.userId, userId),
            eq(notificationLog.taskId, id),
            eq(notificationLog.kind, 'due'),
          ),
        );
    }
    // Delete the rule only after the task no longer references it (FK).
    if (orphanRuleId) {
      await tx
        .delete(recurrenceRules)
        .where(and(ownedBy(recurrenceRules.userId, userId), eq(recurrenceRules.id, orphanRuleId)));
    }
  });

  // Unconditional: remind_at is not the only field that moves the next push —
  // completing a task or changing its status takes it out of the due set too.
  invalidateReminderClocks();
  return getTask(userId, id);
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(tasks)
    .where(and(ownedBy(tasks.userId, userId), eq(tasks.id, id)))
    .returning({ id: tasks.id });
  if (!row) throw notFound('Task not found');
  invalidateReminderClocks();
}

// Snooze a task's reminder by `minutes` from now, and clear its notification log
// so the scheduler re-sends when the new remind_at arrives.
export async function snoozeTask(userId: string, id: string, minutes: number): Promise<Task> {
  const remindAt = new Date(Date.now() + minutes * 60_000);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set({ remindAt })
      .where(and(ownedBy(tasks.userId, userId), eq(tasks.id, id)))
      .returning({ id: tasks.id });
    if (!row) throw notFound('Task not found');
    // Reminder channel only. The 'due' claim belongs to the deadline, which a
    // snooze does not move — wiping it would let the every-minute cron re-send
    // the same due push while due_at is still inside the send window, once per
    // snooze. Unscoped, this delete was harmless until drizzle/0011 added 'due'.
    await tx
      .delete(notificationLog)
      .where(
        and(
          ownedBy(notificationLog.userId, userId),
          eq(notificationLog.taskId, id),
          inArray(notificationLog.kind, ['initial', 'repeat']),
        ),
      );
  });
  invalidateReminderClocks();
  return getTask(userId, id);
}

export async function reorderTask(userId: string, id: string, input: ReorderInput): Promise<Task> {
  const col = input.scope === 'context' ? tasks.sortContext : tasks.sortGlobal;

  const neighborSort = async (nid?: string | null): Promise<number | null> => {
    if (!nid) return null;
    // Neighbours must be the caller's own tasks — otherwise another user's
    // ordering could be used to position (and thereby probe) rows.
    const [n] = await db
      .select({ s: col })
      .from(tasks)
      .where(and(ownedBy(tasks.userId, userId), eq(tasks.id, nid)));
    return n ? n.s : null;
  };

  const after = await neighborSort(input.afterId);
  const before = await neighborSort(input.beforeId);
  const newSort = between(after, before);

  const set: Partial<typeof tasks.$inferInsert> =
    input.scope === 'context' ? { sortContext: newSort } : { sortGlobal: newSort };
  const [row] = await db
    .update(tasks)
    .set(set)
    .where(and(ownedBy(tasks.userId, userId), eq(tasks.id, id)))
    .returning({ id: tasks.id });
  if (!row) throw notFound('Task not found');
  return getTask(userId, row.id);
}

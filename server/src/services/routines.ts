import { and, asc, eq, sql } from 'drizzle-orm';
import type { CreateRoutineInput, Routine, UpdateRoutineInput } from '@task-manager/shared';
import { db } from '../db/client';
import { routines, routineCompletions } from '../db/schema';
import { toRoutine } from '../db/mappers';
import { badRequest, notFound } from '../lib/errors';

// Warsaw day string ('YYYY-MM-DD'). The server runs in TZ=Europe/Warsaw, so the
// local date fields already reflect Warsaw — same approach as spawnDueRecurring.
function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function isDone(id: number, day: string): Promise<boolean> {
  const [c] = await db
    .select({ id: routineCompletions.routineId })
    .from(routineCompletions)
    .where(and(eq(routineCompletions.routineId, id), eq(routineCompletions.day, day)));
  return !!c;
}

// Active routines with their done-state for the given day (default: today).
export async function listRoutines(day: string = localDay()): Promise<Routine[]> {
  const rows = await db
    .select({
      routine: routines,
      done: sql<boolean>`${routineCompletions.routineId} is not null`,
    })
    .from(routines)
    .leftJoin(
      routineCompletions,
      and(eq(routineCompletions.routineId, routines.id), eq(routineCompletions.day, day)),
    )
    .where(eq(routines.active, true))
    .orderBy(asc(routines.sortOrder), asc(routines.id));
  return rows.map((r) => toRoutine(r.routine, r.done));
}

export async function createRoutine(input: CreateRoutineInput): Promise<Routine> {
  const title = input.title?.trim();
  if (!title) throw badRequest('Title is required');
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${routines.sortOrder}), -1)` })
    .from(routines);
  const [row] = await db
    .insert(routines)
    .values({ title, timeHint: input.timeHint ?? null, sortOrder: Number(max) + 1 })
    .returning();
  return toRoutine(row, false);
}

export async function updateRoutine(id: number, patch: UpdateRoutineInput): Promise<Routine> {
  if (Number.isNaN(id)) throw notFound('Routine not found');
  const fields: Partial<typeof routines.$inferInsert> = {};
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.timeHint !== undefined) fields.timeHint = patch.timeHint;
  if (patch.active !== undefined) fields.active = patch.active;
  if (patch.sortOrder !== undefined) fields.sortOrder = patch.sortOrder;
  const [row] = await db.update(routines).set(fields).where(eq(routines.id, id)).returning();
  if (!row) throw notFound('Routine not found');
  return toRoutine(row, await isDone(id, localDay()));
}

// Idempotent toggle: mark done if not yet done for the day, else clear it.
export async function toggleRoutine(id: number, day: string = localDay()): Promise<Routine> {
  if (Number.isNaN(id)) throw notFound('Routine not found');
  const [r] = await db.select().from(routines).where(eq(routines.id, id));
  if (!r) throw notFound('Routine not found');
  if (await isDone(id, day)) {
    await db
      .delete(routineCompletions)
      .where(and(eq(routineCompletions.routineId, id), eq(routineCompletions.day, day)));
    return toRoutine(r, false);
  }
  await db.insert(routineCompletions).values({ routineId: id, day }).onConflictDoNothing();
  return toRoutine(r, true);
}

export async function deleteRoutine(id: number): Promise<void> {
  if (Number.isNaN(id)) throw notFound('Routine not found');
  const [row] = await db.delete(routines).where(eq(routines.id, id)).returning();
  if (!row) throw notFound('Routine not found'); // completions cascade
}

import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Context, CreateContextInput, UpdateContextInput } from '@task-manager/shared';
import { db } from '../db/client';
import { contexts, recurrenceRules, tasks } from '../db/schema';
import { toContext } from '../db/mappers';
import { conflict, notFound } from '../lib/errors';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// slug is a UNIQUE column, so two contexts named "Home" would collide. Suffix
// -2, -3, … until free. (slug is stable identity — we never re-slug on rename.)
async function uniqueSlug(base: string): Promise<string> {
  const desired = base || 'context';
  const rows = await db.select({ slug: contexts.slug }).from(contexts);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(desired)) return desired;
  for (let i = 2; ; i++) {
    const candidate = `${desired}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function listContexts(): Promise<Context[]> {
  const rows = await db.select().from(contexts).orderBy(asc(contexts.sortOrder), asc(contexts.id));
  return rows.map(toContext);
}

export async function findContextBySlug(slug: string): Promise<Context | null> {
  const [row] = await db
    .select()
    .from(contexts)
    .where(eq(contexts.slug, slug.trim().toLowerCase()));
  return row ? toContext(row) : null;
}

export async function createContext(input: CreateContextInput): Promise<Context> {
  const slug = await uniqueSlug(input.slug?.trim() || slugify(input.label));
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${contexts.sortOrder}), -1)` })
    .from(contexts);
  const [row] = await db
    .insert(contexts)
    .values({
      slug,
      label: input.label,
      color: input.color,
      sortOrder: Number(max) + 1,
      excludeFromAll: input.excludeFromAll ?? false,
    })
    .returning();
  return toContext(row);
}

export async function updateContext(id: number, patch: UpdateContextInput): Promise<Context> {
  if (Number.isNaN(id)) throw notFound('Context not found');
  const [row] = await db.update(contexts).set(patch).where(eq(contexts.id, id)).returning();
  if (!row) throw notFound('Context not found');
  return toContext(row);
}

// Delete a context. Block ONLY on OPEN tasks (status != 'done') — those are
// visible in the list and the user can move them. Done tasks and recurrence
// rules aren't surfaced anywhere (and empty contexts are hidden from the chip
// row), so blocking on them would be a dead-end — instead we detach them
// (context_id → NULL) inside the delete. Tasks/rules have a nullable FK with no
// cascade, so we must null them before dropping the row.
export async function deleteContext(id: number): Promise<void> {
  if (Number.isNaN(id)) throw notFound('Context not found');
  const [row] = await db.select({ id: contexts.id }).from(contexts).where(eq(contexts.id, id));
  if (!row) throw notFound('Context not found');

  const [{ openCount }] = await db
    .select({ openCount: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.contextId, id), ne(tasks.status, 'done')));
  if (Number(openCount) > 0) {
    throw conflict(`${openCount} open task(s) still use this context — move or delete them first.`);
  }

  await db.transaction(async (tx) => {
    // Only done tasks remain (open ones were blocked above); detach them + rules.
    await tx.update(tasks).set({ contextId: null }).where(eq(tasks.contextId, id));
    await tx.update(recurrenceRules).set({ contextId: null }).where(eq(recurrenceRules.contextId, id));
    await tx.delete(contexts).where(eq(contexts.id, id));
  });
}

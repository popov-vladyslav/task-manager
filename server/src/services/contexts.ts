import { asc, eq, sql } from 'drizzle-orm';
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

// Hard delete, but only when nothing references the context. Tasks and
// recurrence rules both point at contexts (nullable FK, no cascade), so a
// naive delete would either orphan them or hit an FK error. Instead we refuse
// and report the counts, so the caller (Settings UI / MCP) can tell the user
// to move or delete those tasks first.
export async function deleteContext(id: number): Promise<void> {
  if (Number.isNaN(id)) throw notFound('Context not found');
  const [row] = await db.select({ id: contexts.id }).from(contexts).where(eq(contexts.id, id));
  if (!row) throw notFound('Context not found');

  const [{ taskCount }] = await db
    .select({ taskCount: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.contextId, id));
  const [{ ruleCount }] = await db
    .select({ ruleCount: sql<number>`count(*)::int` })
    .from(recurrenceRules)
    .where(eq(recurrenceRules.contextId, id));

  const refs = Number(taskCount) + Number(ruleCount);
  if (refs > 0) {
    const parts: string[] = [];
    if (Number(taskCount) > 0) parts.push(`${taskCount} task(s)`);
    if (Number(ruleCount) > 0) parts.push(`${ruleCount} recurring rule(s)`);
    throw conflict(`${parts.join(' and ')} still use this context — move or delete them first.`);
  }

  await db.delete(contexts).where(eq(contexts.id, id));
}

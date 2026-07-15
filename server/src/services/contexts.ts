import { asc, eq, sql } from 'drizzle-orm';
import type { Context, CreateContextInput, UpdateContextInput } from '@task-manager/shared';
import { db } from '../db/client';
import { contexts } from '../db/schema';
import { toContext } from '../db/mappers';
import { notFound } from '../lib/errors';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function listContexts(): Promise<Context[]> {
  const rows = await db.select().from(contexts).orderBy(asc(contexts.sortOrder), asc(contexts.id));
  return rows.map(toContext);
}

export async function createContext(input: CreateContextInput): Promise<Context> {
  const slug = input.slug?.trim() || slugify(input.label);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${contexts.sortOrder}), -1)` })
    .from(contexts);
  const [row] = await db
    .insert(contexts)
    .values({ slug, label: input.label, color: input.color, sortOrder: Number(max) + 1 })
    .returning();
  return toContext(row);
}

export async function updateContext(id: number, patch: UpdateContextInput): Promise<Context> {
  if (Number.isNaN(id)) throw notFound('Context not found');
  const [row] = await db.update(contexts).set(patch).where(eq(contexts.id, id)).returning();
  if (!row) throw notFound('Context not found');
  return toContext(row);
}

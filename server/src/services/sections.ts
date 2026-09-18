import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { translate, type Section } from '@task-manager/shared';
import { languageOf } from './settings';
import { db } from '../db/client';
import { contexts, sections, tasks } from '../db/schema';
import { toSection } from '../db/mappers';
import { ownedBy, type Executor } from '../db/scope';
import { badRequest, conflict, notFound } from '../lib/errors';
import { between } from '../lib/frac-index';

export async function listSections(userId: string, contextId?: number): Promise<Section[]> {
  const conds = [ownedBy(sections.userId, userId)];
  if (contextId != null) conds.push(eq(sections.contextId, contextId));
  const rows = await db
    .select()
    .from(sections)
    .where(and(...conds))
    .orderBy(asc(sections.contextId), asc(sections.sort), asc(sections.createdAt));
  return rows.map(toSection);
}

export async function assertSectionInContext(
  executor: Executor,
  userId: string,
  sectionId: string | null | undefined,
  contextId: number | null,
): Promise<void> {
  if (sectionId == null) return;
  if (contextId == null) throw badRequest('A section needs a category');
  const [row] = await executor
    .select({ id: sections.id })
    .from(sections)
    .where(
      and(
        ownedBy(sections.userId, userId),
        eq(sections.id, sectionId),
        eq(sections.contextId, contextId),
      ),
    );
  if (!row) throw badRequest('Unknown section');
}

async function assertNameFree(userId: string, contextId: number, name: string, exceptId?: string) {
  const [dup] = await db
    .select({ id: sections.id })
    .from(sections)
    .where(
      and(
        ownedBy(sections.userId, userId),
        eq(sections.contextId, contextId),
        sql`lower(${sections.name}) = ${name.toLowerCase()}`,
      ),
    );
  if (dup && dup.id !== exceptId) throw conflict('A section with this name already exists');
}

export async function createSection(
  userId: string,
  contextId: number,
  name: string,
): Promise<Section> {
  const clean = name.trim();
  if (!clean) throw badRequest('Name is required');
  const [ctx] = await db
    .select({ id: contexts.id })
    .from(contexts)
    .where(and(ownedBy(contexts.userId, userId), eq(contexts.id, contextId)));
  if (!ctx) throw notFound('Category not found');
  await assertNameFree(userId, contextId, clean);
  const [agg] = await db
    .select({ next: sql<number>`coalesce(max(${sections.sort}), 0) + 1` })
    .from(sections)
    .where(and(ownedBy(sections.userId, userId), eq(sections.contextId, contextId)));
  const [row] = await db
    .insert(sections)
    .values({ userId, contextId, name: clean, sort: Number(agg.next) })
    .returning();
  return toSection(row);
}

async function firstSection(
  executor: Executor,
  userId: string,
  contextId: number,
  exceptId?: string,
) {
  const [row] = await executor
    .select()
    .from(sections)
    .where(
      and(
        ownedBy(sections.userId, userId),
        eq(sections.contextId, contextId),
        exceptId ? ne(sections.id, exceptId) : undefined,
      ),
    )
    .orderBy(asc(sections.sort), asc(sections.createdAt))
    .limit(1);
  return row ?? null;
}

export async function ensureSection(userId: string, contextId: number): Promise<Section> {
  const first = await firstSection(db, userId, contextId);
  if (first) return toSection(first);
  const name = translate(await languageOf(userId), 'contexts.section.unsorted');
  return createSection(userId, contextId, name);
}

async function getOwned(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(sections)
    .where(and(ownedBy(sections.userId, userId), eq(sections.id, id)));
  if (!row) throw notFound('Section not found');
  return row;
}

export async function renameSection(userId: string, id: string, name: string): Promise<Section> {
  const clean = name.trim();
  if (!clean) throw badRequest('Name is required');
  const cur = await getOwned(userId, id);
  await assertNameFree(userId, cur.contextId, clean, id);
  const [row] = await db
    .update(sections)
    .set({ name: clean })
    .where(and(ownedBy(sections.userId, userId), eq(sections.id, id)))
    .returning();
  return toSection(row);
}

export async function reorderSection(
  userId: string,
  id: string,
  input: { afterId?: string | null; beforeId?: string | null },
): Promise<Section> {
  const cur = await getOwned(userId, id);
  const neighbourSort = async (nid?: string | null): Promise<number | null> => {
    if (!nid) return null;
    const [n] = await db
      .select({ s: sections.sort })
      .from(sections)
      .where(
        and(
          ownedBy(sections.userId, userId),
          eq(sections.id, nid),
          eq(sections.contextId, cur.contextId),
        ),
      );
    return n ? n.s : null;
  };
  const sort = between(await neighbourSort(input.afterId), await neighbourSort(input.beforeId));
  const [row] = await db
    .update(sections)
    .set({ sort })
    .where(and(ownedBy(sections.userId, userId), eq(sections.id, id)))
    .returning();
  return toSection(row);
}

export async function deleteSection(userId: string, id: string): Promise<void> {
  const cur = await getOwned(userId, id);
  await db.transaction(async (tx) => {
    const target = await firstSection(tx, userId, cur.contextId, id);
    await tx
      .update(tasks)
      .set({ sectionId: target?.id ?? null })
      .where(and(ownedBy(tasks.userId, userId), eq(tasks.sectionId, id)));
    const [row] = await tx
      .delete(sections)
      .where(and(ownedBy(sections.userId, userId), eq(sections.id, id)))
      .returning({ id: sections.id });
    if (!row) throw notFound('Section not found');
  });
}

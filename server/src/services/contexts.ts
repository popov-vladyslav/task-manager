import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { TERMINAL_STATUSES, seedContexts } from '@task-manager/shared';
import type { Context, CreateContextInput, UpdateContextInput } from '@task-manager/shared';
import { db } from '../db/client';
import { contexts, recurrenceRules, tasks } from '../db/schema';
import { toContext } from '../db/mappers';
import { ownedBy, type Executor } from '../db/scope';
import { conflict, notFound } from '../lib/errors';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// slug is unique per owner, so two of ONE user's contexts named "Home" would
// collide (another user's "home" is fine). Suffix
// -2, -3, … until free. (slug is stable identity — we never re-slug on rename.)
async function uniqueSlug(userId: string, base: string): Promise<string> {
  const desired = base || 'context';
  const rows = await db
    .select({ slug: contexts.slug })
    .from(contexts)
    .where(ownedBy(contexts.userId, userId));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(desired)) return desired;
  for (let i = 2; ; i++) {
    const candidate = `${desired}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function listContexts(userId: string): Promise<Context[]> {
  const rows = await db
    .select()
    .from(contexts)
    .where(ownedBy(contexts.userId, userId))
    .orderBy(asc(contexts.sortOrder), asc(contexts.id));
  return rows.map(toContext);
}

// Slugs are unique per owner, so the lookup must be too — otherwise one user's
// slug could resolve to another user's context.
export async function findContextBySlug(userId: string, slug: string): Promise<Context | null> {
  const [row] = await db
    .select()
    .from(contexts)
    .where(and(ownedBy(contexts.userId, userId), eq(contexts.slug, slug.trim().toLowerCase())));
  return row ? toContext(row) : null;
}

export async function createContext(userId: string, input: CreateContextInput): Promise<Context> {
  const slug = await uniqueSlug(userId, input.slug?.trim() || slugify(input.label));
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${contexts.sortOrder}), -1)` })
    .from(contexts)
    .where(ownedBy(contexts.userId, userId));
  const [row] = await db
    .insert(contexts)
    .values({
      userId,
      slug,
      label: input.label,
      color: input.color,
      sortOrder: Number(max) + 1,
      excludeFromAll: input.excludeFromAll ?? false,
    })
    .returning();
  return toContext(row);
}

// Starter contexts for a brand-new account. Called once, by sign-up, inside the
// same transaction that creates the user — hence the executor argument. Calling
// it twice for one account violates contexts_user_slug_uniq, by design.
export async function createStarterContexts(userId: string, executor: Executor = db): Promise<void> {
  await executor.insert(contexts).values(
    seedContexts.map((c, i) => ({
      userId,
      slug: c.slug,
      label: c.label,
      color: c.color,
      excludeFromAll: c.excludeFromAll,
      sortOrder: i,
    })),
  );
}

// The owner predicate is part of the UPDATE itself: someone else's id simply
// matches no row, so it is indistinguishable from "not found".
export async function updateContext(
  userId: string,
  id: number,
  patch: UpdateContextInput,
): Promise<Context> {
  if (Number.isNaN(id)) throw notFound('Context not found');
  const [row] = await db
    .update(contexts)
    .set(patch)
    .where(and(ownedBy(contexts.userId, userId), eq(contexts.id, id)))
    .returning();
  if (!row) throw notFound('Context not found');
  return toContext(row);
}

// Delete a context. Block ONLY on OPEN tasks (status != 'done') — those are
// visible in the list and the user can move them. Done tasks and recurrence
// rules aren't surfaced anywhere (and empty contexts are hidden from the chip
// row), so blocking on them would be a dead-end — instead we detach them
// (context_id → NULL) inside the delete. Tasks/rules have a nullable FK with no
// cascade, so we must null them before dropping the row.
export async function deleteContext(userId: string, id: number): Promise<void> {
  if (Number.isNaN(id)) throw notFound('Context not found');
  const [row] = await db
    .select({ id: contexts.id })
    .from(contexts)
    .where(and(ownedBy(contexts.userId, userId), eq(contexts.id, id)));
  if (!row) throw notFound('Context not found');

  const [{ openCount }] = await db
    .select({ openCount: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        ownedBy(tasks.userId, userId),
        eq(tasks.contextId, id),
        notInArray(tasks.status, [...TERMINAL_STATUSES]),
      ),
    );
  if (Number(openCount) > 0) {
    throw conflict(`${openCount} open task(s) still use this context — move or delete them first.`);
  }

  await db.transaction(async (tx) => {
    // Only done tasks remain (open ones were blocked above); detach them + rules.
    await tx
      .update(tasks)
      .set({ contextId: null })
      .where(and(ownedBy(tasks.userId, userId), eq(tasks.contextId, id)));
    await tx
      .update(recurrenceRules)
      .set({ contextId: null })
      .where(and(ownedBy(recurrenceRules.userId, userId), eq(recurrenceRules.contextId, id)));
    await tx.delete(contexts).where(and(ownedBy(contexts.userId, userId), eq(contexts.id, id)));
  });
}

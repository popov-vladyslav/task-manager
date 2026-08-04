import { eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from './client';

// The single place per-user scoping is expressed.
//
// Decision 0001: scoping is enforced by a repo layer rather than Postgres RLS,
// but the shape is kept RLS-ready — every user table has a user_id column and
// ownership is one predicate, so policies plus a session GUC can be layered on
// later without touching call sites.
//
// Rule for services: never build an owner comparison by hand and never call
// `db` for user data without one. Take a userId argument and use `ownedBy`.

/**
 * Either the pool-backed `db` or an open transaction. Services that may run
 * inside a caller's transaction (sign-up creating a user's first rows, task
 * creation spawning a recurrence rule) take this instead of importing `db`.
 */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The ownership predicate. Every user-data query must carry one. */
export function ownedBy(column: PgColumn, userId: string): SQL {
  return eq(column, userId);
}

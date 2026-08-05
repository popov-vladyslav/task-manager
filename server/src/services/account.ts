import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { loginCodes, users } from '../db/schema';
import { notFound } from '../lib/errors';

export interface AccountInfo {
  email: string;
  createdAt: string;
}

// The client used to read its own identity out of the JWT `sub` claim. That
// broke when `sub` became a user id instead of an email, which is the general
// lesson: the token says who you are to the server, not what to render.
export async function getAccount(userId: string): Promise<AccountInfo> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) throw notFound('Account not found');
  return { email: row.email, createdAt: row.createdAt.toISOString() };
}

// Full account deletion — an App Store / Play Store requirement, not a nicety.
//
// Synchronous hard delete in one transaction (Resolved Q3): when the response
// returns, the data is gone. No queue, no purge window, nothing to explain to a
// store reviewer.
//
// Everything the account owns cascades from the user row (0010_multi_user.sql):
// contexts, recurrence_rules, tasks, comments, time_entries, notification_log,
// push_tokens, settings, sessions and mcp_tokens. The three NO ACTION foreign
// keys between tasks / recurrence_rules / contexts are checked at END of
// statement rather than per row, so the parent delete takes them all down in one
// go instead of tripping over its own children.
//
// KNOWN WINDOW (accepted): the account's current access token is a stateless
// 15-minute JWT, so requireAuth keeps accepting it until it expires. The account
// is nonetheless unusable the moment this returns — every read is owner-scoped
// so returns nothing, every write fails its foreign key, the refresh token is
// gone, and the MCP token no longer resolves. The client signs out at its next
// refresh. The alternative, a user-existence lookup on every authenticated
// request, was rejected as too costly for a scale-to-zero database.
export async function deleteAccount(userId: string): Promise<void> {
  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!account) throw notFound('Account not found');

  await db.transaction(async (tx) => {
    // Pending sign-in codes are keyed by EMAIL, not by user, so they are not
    // reachable by cascade. Without this, a code issued moments before deletion
    // would still be redeemable afterwards — it would create a fresh empty
    // account rather than restore anything, but leaving live credentials behind
    // for a deleted account is not something to hand a reviewer.
    await tx
      .delete(loginCodes)
      .where(sql`lower(${loginCodes.email}) = ${account.email.trim().toLowerCase()}`);

    await tx.delete(users).where(eq(users.id, userId));
  });
}

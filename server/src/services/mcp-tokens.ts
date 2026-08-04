import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { mcpTokens, users } from '../db/schema';
import { hashToken, randomToken } from '../lib/tokens';
import { sendMcpToken } from '../lib/email';
import { notFound } from '../lib/errors';

// Personal MCP tokens (decision 0002). One credential authenticates both MCP
// transports — the static bearer path and the OAuth connector — and only its
// hash is ever stored. The raw token leaves this process exactly once, by email.

/** Everything Settings is allowed to know. Never the token itself. */
export interface McpTokenMetadata {
  createdAt: string;
  lastUsedAt: string | null;
}

export async function getTokenMetadata(userId: string): Promise<McpTokenMetadata | null> {
  const [row] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)));
  if (!row) return null;
  return {
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

// Issue, or regenerate. Revoking the previous token and inserting the new one
// are one transaction: the partial unique index one_active_mcp_token would
// reject the insert otherwise. That is the point — "regeneration invalidates
// the old one" is enforced by the database, not by remembering to do it here.
//
// Returns metadata only.
export async function issueToken(userId: string): Promise<McpTokenMetadata> {
  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!account) throw notFound('Account not found');

  const token = randomToken();

  const created = await db.transaction(async (tx) => {
    await tx
      .update(mcpTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)));

    const [row] = await tx
      .insert(mcpTokens)
      .values({ userId, tokenHash: hashToken(token) })
      .returning();
    return row;
  });

  // Sent after the commit, deliberately. Inside the transaction a later
  // rollback would leave the user holding a token that does not exist; here, a
  // failed send leaves a live token they never received — recoverable by
  // regenerating, which is the lesser failure.
  await sendMcpToken(account.email, token);

  return { createdAt: created.createdAt.toISOString(), lastUsedAt: null };
}

export async function revokeToken(userId: string): Promise<void> {
  await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)));
}

export interface ResolvedToken {
  userId: string;
  /** The mcp_tokens row id — stamped into OAuth JWTs so revocation can bite. */
  tokenId: string;
}

// Token -> owning user, for both MCP transports. The hash is the lookup key, so
// an invalid token costs one indexed miss and reveals nothing. A revoked row can
// never match: the predicate excludes it, which is what makes revocation
// immediate rather than eventual.
export async function resolveToken(rawToken: string): Promise<ResolvedToken | null> {
  const [row] = await db
    .select({ id: mcpTokens.id, userId: mcpTokens.userId, lastUsedAt: mcpTokens.lastUsedAt })
    .from(mcpTokens)
    .where(and(eq(mcpTokens.tokenHash, hashToken(rawToken)), isNull(mcpTokens.revokedAt)));
  if (!row) return null;

  // Coarsened to at most one write an hour. Stamping last_used on every tool
  // call would turn a read-only MCP request into a write, and keep a
  // scale-to-zero database awake for no user-visible benefit.
  const hourAgo = new Date(Date.now() - 3_600_000);
  if (!row.lastUsedAt || row.lastUsedAt < hourAgo) {
    await db.update(mcpTokens).set({ lastUsedAt: sql`now()` }).where(eq(mcpTokens.id, row.id));
  }

  return { userId: row.userId, tokenId: row.id };
}

// Is the token behind an already-issued OAuth JWT still live?
//
// Checked on EVERY MCP call. The OAuth tokens are stateless JWTs with a 90-day
// refresh lifetime, so without this lookup a revoked or regenerated personal
// token would keep working until natural expiry — the connector would stay
// connected for months after the user revoked it. One indexed read is the price
// of "revocation is immediate" (decision 0002).
export async function tokenOwnerIfLive(tokenId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: mcpTokens.userId })
    .from(mcpTokens)
    .where(and(eq(mcpTokens.id, tokenId), isNull(mcpTokens.revokedAt)));
  return row ? row.userId : null;
}

import { and, eq, gt, sql } from 'drizzle-orm';
import type { AuthTokens } from '@task-manager/shared';
import { db } from '../db/client';
import { loginCodes, sessions, users } from '../db/schema';
import { env } from '../env';
import { hashToken, randomToken } from '../lib/tokens';
import { signAccess } from '../lib/jwt';
import { sendMagicLink } from '../lib/email';
import { unauthorized } from '../lib/errors';
import { createStarterContexts } from './contexts';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 min
// Sessions expire on INACTIVITY, not on age: every refresh pushes expires_at
// out by this much. Someone who opens the app at least once a fortnight is never
// signed out; a session left unused for longer dies on its own.
//
// This replaced rotating refresh tokens. Rotation consumed the token on every
// use, which meant a lost response (app backgrounded mid-request, flaky network)
// or two parallel refreshes left the client holding a dead token and signed the
// user out — in production, on nearly every access-token expiry. Rotation's real
// payoff is reuse DETECTION, which we never implemented, so it was costing
// reliability and buying nothing. Revocation is unaffected: sign-out,
// sign-out-all and account deletion all delete the session row outright.
const IDLE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days since last use

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Implicit sign-up: anyone may request a code. No account is created here — the
// address is unverified until the code comes back, so the account is created on
// confirmation instead. That also means this endpoint reveals nothing about
// which addresses are already registered.
export async function requestLoginCode(email: string, platform?: string): Promise<void> {
  const address = normalizeEmail(email);
  const token = randomToken();

  await db.insert(loginCodes).values({
    tokenHash: hashToken(token),
    email: address,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  // Open the platform the request came from: native → app deep link, else web.
  const isNative = platform === 'ios' || platform === 'android';
  const link = isNative
    ? `${env.APP_SCHEME}://auth?token=${token}`
    : `${env.APP_URL}/auth?token=${token}`;
  await sendMagicLink(address, link, token);
}

// Confirming a code proves the address. If no account exists for it, this is a
// sign-up: the user row and their starter contexts are created in the same
// transaction that consumes the code, so a new account can never end up
// half-built.
export async function verifyLoginCode(token: string, device?: string): Promise<AuthTokens> {
  const hash = hashToken(token);

  const [code] = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.tokenHash, hash), gt(loginCodes.expiresAt, new Date())));

  if (!code) throw unauthorized('Invalid or expired code');

  const userId = await db.transaction(async (tx) => {
    // Single-use: deleting inside the transaction means two concurrent
    // confirmations of one code cannot both succeed.
    const consumed = await tx
      .delete(loginCodes)
      .where(eq(loginCodes.tokenHash, hash))
      .returning({ hash: loginCodes.tokenHash });
    if (consumed.length === 0) throw unauthorized('Invalid or expired code');

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${code.email}`);
    if (existing) return existing.id;

    const [created] = await tx.insert(users).values({ email: code.email }).returning({
      id: users.id,
    });
    // Exactly once per account — the per-user unique slug index would reject a
    // second call anyway.
    await createStarterContexts(created.id, tx);
    return created.id;
  });

  return issueTokens(userId, device);
}

// Refresh does NOT rotate. The same refresh token comes back; only the short
// access token is new. Because the token is not consumed, concurrent refreshes
// and lost responses are both harmless — the client can always retry.
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const hash = hashToken(refreshToken);
  const now = new Date();

  // Extend and read in one statement: the UPDATE only matches a session that is
  // still live, so an expired or revoked one simply affects no rows.
  const [session] = await db
    .update(sessions)
    .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + IDLE_TTL_MS) })
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now)))
    .returning({ userId: sessions.userId });

  if (!session) throw unauthorized('Invalid or expired refresh token');

  return { jwt: signAccess(session.userId), refresh: refreshToken };
}

// Sign out this device only.
export async function signOut(refreshToken: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(refreshToken)));
}

// Sign out everywhere. Access tokens already issued stay valid until they
// expire (15 min) — that window is why the access TTL is short.
export async function signOutAll(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

async function issueTokens(userId: string, device?: string): Promise<AuthTokens> {
  const refreshToken = randomToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(refreshToken),
    userId,
    device: device ?? null,
    expiresAt: new Date(Date.now() + IDLE_TTL_MS),
  });
  return { jwt: signAccess(userId), refresh: refreshToken };
}

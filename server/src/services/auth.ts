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
const REFRESH_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

// Native deep-link scheme — must match app/app.json `scheme`.
const APP_SCHEME = 'app';

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
    ? `${APP_SCHEME}://auth?token=${token}`
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

// Refresh rotates: the presented token is deleted and a new one issued, so a
// stolen refresh token stops working as soon as the real client refreshes.
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const hash = hashToken(refreshToken);

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, new Date())));

  if (!session) throw unauthorized('Invalid or expired refresh token');

  const rotated = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hash))
    .returning({ hash: sessions.tokenHash });
  if (rotated.length === 0) throw unauthorized('Invalid or expired refresh token');

  return issueTokens(session.userId, session.device ?? undefined);
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
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { jwt: signAccess(userId), refresh: refreshToken };
}

import { and, eq } from 'drizzle-orm';
import type { AuthTokens } from '@task-manager/shared';
import { db } from '../db/client';
import { authTokens } from '../db/schema';
import { env } from '../env';
import { hashToken, randomToken } from '../lib/tokens';
import { signAccess } from '../lib/jwt';
import { sendMagicLink } from '../lib/email';
import { unauthorized } from '../lib/errors';

const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 min
const REFRESH_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

// Native deep-link scheme — must match app/app.json `scheme`.
const APP_SCHEME = 'app';

export async function requestMagicLink(email: string, platform?: string): Promise<void> {
  // Single-user app: only the owner email gets a link. Silently no-op otherwise
  // so we don't reveal which address is the owner.
  if (email.trim().toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) return;

  const token = randomToken();
  await db.insert(authTokens).values({
    tokenHash: hashToken(token),
    kind: 'magic',
    expiresAt: new Date(Date.now() + MAGIC_TTL_MS),
  });

  // Open the platform the request came from: native → app deep link, else web.
  const isNative = platform === 'ios' || platform === 'android';
  const link = isNative
    ? `${APP_SCHEME}://auth?token=${token}`
    : `${env.APP_URL}/auth?token=${token}`;
  await sendMagicLink(env.OWNER_EMAIL, link);
}

export async function verifyMagicLink(token: string): Promise<AuthTokens> {
  const hash = hashToken(token);
  const [rec] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hash), eq(authTokens.kind, 'magic')));

  if (!rec || rec.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Invalid or expired link');
  }
  await db.delete(authTokens).where(eq(authTokens.tokenHash, hash)); // single-use

  return issueTokens();
}

export async function refresh(refreshToken: string): Promise<{ jwt: string }> {
  const hash = hashToken(refreshToken);
  const [rec] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hash), eq(authTokens.kind, 'refresh')));

  if (!rec || rec.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Invalid or expired refresh token');
  }
  return { jwt: signAccess(env.OWNER_EMAIL) };
}

async function issueTokens(): Promise<AuthTokens> {
  const refreshToken = randomToken();
  await db.insert(authTokens).values({
    tokenHash: hashToken(refreshToken),
    kind: 'refresh',
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { jwt: signAccess(env.OWNER_EMAIL), refresh: refreshToken };
}

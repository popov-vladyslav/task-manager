import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { env } from '../env';

let cachedOwnerId: string | null = null;

// The pre-multi-user owner's account — the one 0010_multi_user.sql attributed
// all existing data to.
//
// Used ONLY by the legacy static MCP token path, which has no user of its own
// and stays owner-scoped until the prod connector is cut over to a personal
// token (spec: "prod MCP connector stays on legacy static token until
// cutover"). Everything else resolves a user from its credential.
export async function getOwnerUserId(): Promise<string> {
  if (cachedOwnerId) return cachedOwnerId;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${env.OWNER_EMAIL.trim().toLowerCase()}`);
  if (!row) throw new Error(`No account for OWNER_EMAIL (${env.OWNER_EMAIL})`);
  cachedOwnerId = row.id;
  return row.id;
}

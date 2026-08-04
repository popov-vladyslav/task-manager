import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closePool, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { contexts, users } from '../db/schema';

let server: TestServer;

before(async () => {
  await resetDb();
  server = await startTestServer();
});

after(async () => {
  await server.close();
  await closePool();
});

test('health endpoint responds without auth', async () => {
  const res = await fetch(`${server.baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('protected route rejects a request with no token', async () => {
  const res = await fetch(`${server.baseUrl}/api/contexts`, { headers: {} });
  assert.equal(res.status, 401);
});

// Round trip through the migrated-from-zero schema. Goes through drizzle rather
// than the HTTP API because the services are not owner-scoped yet — the
// end-to-end HTTP create/read test arrives with step 9.
test('owned rows round-trip through the migrated schema', async () => {
  const [user] = await db
    .insert(users)
    .values({ email: 'smoke@example.test' })
    .returning({ id: users.id });

  await db
    .insert(contexts)
    .values({ userId: user.id, slug: 'smoke', label: 'Smoke', color: '#ABCDEF' });

  const rows = await db.select().from(contexts).where(eq(contexts.userId, user.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, 'smoke');
});

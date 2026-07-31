import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@task-manager/shared';
import { closePool, resetDb, startTestServer, type TestServer } from './harness';
import { env } from '../env';
import { signAccess } from '../lib/jwt';

let server: TestServer;
let auth: Record<string, string>;

before(async () => {
  await resetDb();
  server = await startTestServer();
  auth = {
    Authorization: `Bearer ${signAccess(env.OWNER_EMAIL)}`,
    'Content-Type': 'application/json',
  };
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
  const res = await fetch(`${server.baseUrl}/api/contexts`);
  assert.equal(res.status, 401);
});

// Full round trip through the migrated-from-zero schema: HTTP -> route ->
// service -> Postgres -> back. Proves the harness wires the real app to the
// test branch, which is all step 2 needs to establish.
test('creates and reads back a context over HTTP', async () => {
  const created = await fetch(`${server.baseUrl}/api/contexts`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ label: 'Harness', color: '#ABCDEF' }),
  });
  assert.equal(created.status, 201);
  const ctx = (await created.json()) as Context;
  assert.equal(ctx.label, 'Harness');

  const listed = await fetch(`${server.baseUrl}/api/contexts`, { headers: auth });
  assert.equal(listed.status, 200);
  const all = (await listed.json()) as Context[];
  assert.ok(
    all.some((c) => c.id === ctx.id && c.slug === ctx.slug),
    'created context should appear in the list',
  );
});

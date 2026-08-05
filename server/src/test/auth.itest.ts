// Sign-in, implicit sign-up, session rotation, and the token-type boundary.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { eq, sql } from 'drizzle-orm';
import { closePool, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { contexts, loginCodes, sessions, users } from '../db/schema';
import { env } from '../env';

let server: TestServer;

// The emailed code is not returned by the API, so read the row the request
// wrote. Only its hash is stored, so tests issue their own code instead.
async function issueCodeFor(email: string): Promise<string> {
  const token = `test-code-${Math.round(process.hrtime()[1])}-${email}`;
  const { hashToken } = await import('../lib/tokens');
  await db.insert(loginCodes).values({
    tokenHash: hashToken(token),
    email: email.toLowerCase(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  return token;
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

before(async () => {
  await resetDb();
  server = await startTestServer();
});

after(async () => {
  await server.close();
  await closePool();
});

test('requesting a code never reveals whether an account exists', async () => {
  const unknown = await post('/auth/magic-link', { email: 'nobody@example.test' });
  assert.equal(unknown.status, 200);
  assert.deepEqual(await unknown.json(), { ok: true });
});

test('confirming a code for an unknown email creates the account and its contexts', async () => {
  const code = await issueCodeFor('newcomer@example.test');
  const res = await post('/auth/verify', { token: code, device: 'iPhone' });
  assert.equal(res.status, 200);

  const { jwt: access, refresh } = (await res.json()) as { jwt: string; refresh: string };
  assert.ok(access && refresh);

  const [account] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = 'newcomer@example.test'`);
  assert.ok(account, 'account should have been created on first confirmation');

  const owned = await db.select().from(contexts).where(eq(contexts.userId, account.id));
  assert.ok(owned.length > 0, 'a new account should start with starter contexts');

  // The access token identifies the user, and the app can use it immediately.
  const list = await fetch(`${server.baseUrl}/api/contexts`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  assert.equal(list.status, 200);
});

test('a code is single-use', async () => {
  const code = await issueCodeFor('once@example.test');
  assert.equal((await post('/auth/verify', { token: code })).status, 200);
  assert.equal((await post('/auth/verify', { token: code })).status, 401);
});

test('refresh rotates: the old token dies, the new one works', async () => {
  const code = await issueCodeFor('rotate@example.test');
  const first = (await (await post('/auth/verify', { token: code })).json()) as {
    refresh: string;
  };

  const rotated = await post('/auth/refresh', { refresh: first.refresh });
  assert.equal(rotated.status, 200);
  const second = (await rotated.json()) as { jwt: string; refresh: string };
  assert.notEqual(second.refresh, first.refresh, 'refresh token should be replaced');

  assert.equal((await post('/auth/refresh', { refresh: first.refresh })).status, 401);
  assert.equal((await post('/auth/refresh', { refresh: second.refresh })).status, 200);
});

test('sign-out-all revokes every device for that user only', async () => {
  const mine = (await (
    await post('/auth/verify', { token: await issueCodeFor('multi@example.test') })
  ).json()) as { jwt: string; refresh: string };
  const alsoMine = (await (
    await post('/auth/verify', { token: await issueCodeFor('multi@example.test') })
  ).json()) as { refresh: string };
  const other = (await (
    await post('/auth/verify', { token: await issueCodeFor('bystander@example.test') })
  ).json()) as { refresh: string };

  const res = await fetch(`${server.baseUrl}/auth/signout-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mine.jwt}` },
  });
  assert.equal(res.status, 204);

  assert.equal((await post('/auth/refresh', { refresh: mine.refresh })).status, 401);
  assert.equal((await post('/auth/refresh', { refresh: alsoMine.refresh })).status, 401);
  assert.equal(
    (await post('/auth/refresh', { refresh: other.refresh })).status,
    200,
    'another account must be unaffected',
  );
});

// The vulnerability that existed before this change: app tokens and MCP OAuth
// tokens share JWT_SECRET, and requireAuth only checked the signature — so an
// MCP token handed to a third-party AI client authenticated as a full session.
test('an MCP OAuth token cannot be used as an app session', async () => {
  const [account] = await db.select().from(users).limit(1);
  const mcpToken = jwt.sign(
    { sub: account.id, typ: 'mcp_access', cid: 'some-client', scope: '' },
    env.JWT_SECRET,
    { expiresIn: 3600 },
  );

  const res = await fetch(`${server.baseUrl}/api/contexts`, {
    headers: { Authorization: `Bearer ${mcpToken}` },
  });
  assert.equal(res.status, 401, 'MCP tokens must not authenticate app requests');
});

test('sessions record the device that signed in', async () => {
  const code = await issueCodeFor('device@example.test');
  await post('/auth/verify', { token: code, device: 'Pixel 9' });
  const [account] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = 'device@example.test'`);
  const rows = await db.select().from(sessions).where(eq(sessions.userId, account.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].device, 'Pixel 9');
});

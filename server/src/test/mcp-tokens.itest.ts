// Personal MCP tokens: issue, regenerate, revoke — and the invariants that make
// them safe (hash-only storage, email-only delivery, revocation that bites).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, isNull } from 'drizzle-orm';
import { closePool, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { loginCodes, mcpTokens, users } from '../db/schema';
import { hashToken } from '../lib/tokens';
import { resolveToken } from '../services/mcp-tokens';

let server: TestServer;

interface Account {
  id: string;
  headers: Record<string, string>;
}

let alice: Account;
let bob: Account;

async function signUp(email: string): Promise<Account> {
  const token = `code-${email}`;
  await db.insert(loginCodes).values({
    tokenHash: hashToken(token),
    email,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const res = await fetch(`${server.baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const { jwt } = (await res.json()) as { jwt: string };
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return {
    id: row.id,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  };
}

// The raw token only exists in the email. With no RESEND_API_KEY the sender
// logs it, so tests capture stdout to learn what the user would have received —
// deliberately the only channel available, which is itself the invariant.
async function issueAndCapture(who: Account): Promise<{ raw: string; body: string }> {
  const chunks: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '));
  };
  let body: string;
  try {
    const res = await fetch(`${server.baseUrl}/api/mcp-token`, {
      method: 'POST',
      headers: who.headers,
    });
    assert.equal(res.status, 201);
    body = await res.text();
  } finally {
    console.log = original;
  }

  const line = chunks.find((c) => c.includes('token:'));
  assert.ok(line, 'the token should have been delivered (logged when mail is disabled)');
  const raw = line.split('token:')[1].trim();
  assert.ok(raw.length > 20, 'captured token looks wrong');
  return { raw, body };
}

before(async () => {
  await resetDb();
  server = await startTestServer();
  alice = await signUp('mcp-a@example.test');
  bob = await signUp('mcp-b@example.test');
});

after(async () => {
  await server.close();
  await closePool();
});

test('an account starts with no token', async () => {
  const res = await fetch(`${server.baseUrl}/api/mcp-token`, { headers: alice.headers });
  assert.equal(res.status, 200);
  assert.equal(await res.json(), null);
});

test('the token is never in the API response, and only its hash is stored', async () => {
  const { raw, body } = await issueAndCapture(alice);

  assert.ok(!body.includes(raw), 'the raw token must never appear in a response body');
  assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['createdAt', 'lastUsedAt']);

  const [row] = await db.select().from(mcpTokens).where(eq(mcpTokens.userId, alice.id));
  assert.notEqual(row.tokenHash, raw, 'the raw token must not be stored');
  assert.equal(row.tokenHash, hashToken(raw), 'only the hash is stored');
});

test('the live token resolves to its owner', async () => {
  const [row] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, alice.id), isNull(mcpTokens.revokedAt)));
  assert.ok(row);

  const { raw } = await issueAndCapture(alice); // regenerate, then resolve the new one
  assert.equal((await resolveToken(raw))?.userId, alice.id);
});

test('regenerating invalidates the previous token immediately', async () => {
  const first = await issueAndCapture(bob);
  assert.equal((await resolveToken(first.raw))?.userId, bob.id);

  const second = await issueAndCapture(bob);
  assert.equal((await resolveToken(second.raw))?.userId, bob.id, 'the new token works');
  assert.equal(await resolveToken(first.raw), null, 'the old token stops working at once');

  const live = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, bob.id), isNull(mcpTokens.revokedAt)));
  assert.equal(live.length, 1, 'exactly one live token per account');
});

test('revoking stops the token resolving', async () => {
  const { raw } = await issueAndCapture(bob);
  assert.equal((await resolveToken(raw))?.userId, bob.id);

  const res = await fetch(`${server.baseUrl}/api/mcp-token`, {
    method: 'DELETE',
    headers: bob.headers,
  });
  assert.equal(res.status, 204);

  assert.equal(await resolveToken(raw), null, 'a revoked token must not resolve');
  const meta = await fetch(`${server.baseUrl}/api/mcp-token`, { headers: bob.headers });
  assert.equal(await meta.json(), null, 'Settings shows no live token after revoking');
});

test('a garbage token resolves to nobody', async () => {
  assert.equal(await resolveToken('not-a-real-token'), null);
});

test('last used is recorded, coarsely', async () => {
  const { raw } = await issueAndCapture(alice);
  const before = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, alice.id), isNull(mcpTokens.revokedAt)));
  assert.equal(before[0].lastUsedAt, null, 'unused until it is used');

  await resolveToken(raw);
  const [used] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, alice.id), isNull(mcpTokens.revokedAt)));
  assert.ok(used.lastUsedAt instanceof Date, 'first use is stamped');

  // A second use inside the hour must not write again.
  const stamp = used.lastUsedAt.getTime();
  await resolveToken(raw);
  const [again] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, alice.id), isNull(mcpTokens.revokedAt)));
  assert.equal(again.lastUsedAt?.getTime(), stamp, 'not re-stamped within the hour');
});

test('one account cannot see or revoke another’s token', async () => {
  await issueAndCapture(alice);
  await issueAndCapture(bob);

  const aliceMeta = (await (
    await fetch(`${server.baseUrl}/api/mcp-token`, { headers: alice.headers })
  ).json()) as { createdAt: string };
  const bobMeta = (await (
    await fetch(`${server.baseUrl}/api/mcp-token`, { headers: bob.headers })
  ).json()) as { createdAt: string };
  assert.notEqual(aliceMeta.createdAt, bobMeta.createdAt, 'each sees only their own');

  // A revoking only revokes A's.
  await fetch(`${server.baseUrl}/api/mcp-token`, { method: 'DELETE', headers: alice.headers });
  const bobStillLive = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, bob.id), isNull(mcpTokens.revokedAt)));
  assert.equal(bobStillLive.length, 1, "B's token must survive A's revoke");
});

test('the token endpoints require authentication', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const res = await fetch(`${server.baseUrl}/api/mcp-token`, { method });
    assert.equal(res.status, 401, `${method} /api/mcp-token must require auth`);
  }
});

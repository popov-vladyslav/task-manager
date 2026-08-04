// Cross-account boundary tests: user A actively tries to read and mutate user
// B's data through the HTTP API, and every attempt must fail.
//
// These are the tests the spec requires ("tests that actively attempt to cross
// the boundary and assert failure"). They grow as each module is scoped —
// contexts here (step 9); tasks, comments, timer, calendar and data follow.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closePool, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { contexts, loginCodes, tasks, users } from '../db/schema';
import { hashToken } from '../lib/tokens';

let server: TestServer;

interface Account {
  id: string;
  jwt: string;
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
    jwt,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  };
}

before(async () => {
  await resetDb();
  server = await startTestServer();
  alice = await signUp('alice@example.test');
  bob = await signUp('bob@example.test');
});

after(async () => {
  await server.close();
  await closePool();
});

async function bobsContextId(): Promise<number> {
  const res = await fetch(`${server.baseUrl}/api/contexts`, {
    method: 'POST',
    headers: bob.headers,
    body: JSON.stringify({ label: "Bob's private", color: '#010203' }),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: number }).id;
}

test('two accounts start with their own starter contexts, not shared ones', async () => {
  const a = (await (
    await fetch(`${server.baseUrl}/api/contexts`, { headers: alice.headers })
  ).json()) as { id: number }[];
  const b = (await (
    await fetch(`${server.baseUrl}/api/contexts`, { headers: bob.headers })
  ).json()) as { id: number }[];

  assert.ok(a.length > 0 && b.length > 0);
  const overlap = a.map((c) => c.id).filter((id) => b.some((c) => c.id === id));
  assert.deepEqual(overlap, [], 'no context row may appear in both accounts');
});

test('A cannot see B’s context in the list', async () => {
  const bobId = await bobsContextId();
  const list = (await (
    await fetch(`${server.baseUrl}/api/contexts`, { headers: alice.headers })
  ).json()) as { id: number }[];
  assert.ok(!list.some((c) => c.id === bobId), "B's context leaked into A's list");
});

test('A cannot update B’s context', async () => {
  const bobId = await bobsContextId();
  const res = await fetch(`${server.baseUrl}/api/contexts/${bobId}`, {
    method: 'PATCH',
    headers: alice.headers,
    body: JSON.stringify({ label: 'pwned' }),
  });
  assert.equal(res.status, 404, 'must not be updatable');

  const [row] = await db.select().from(contexts).where(eq(contexts.id, bobId));
  assert.notEqual(row.label, 'pwned', "B's context must be unchanged");
});

test('A cannot delete B’s context', async () => {
  const bobId = await bobsContextId();
  const res = await fetch(`${server.baseUrl}/api/contexts/${bobId}`, {
    method: 'DELETE',
    headers: alice.headers,
  });
  assert.equal(res.status, 404);

  const rows = await db.select().from(contexts).where(eq(contexts.id, bobId));
  assert.equal(rows.length, 1, "B's context must still exist");
});

// ---------------------------------------------------------------- tasks --

async function bobsTaskId(): Promise<string> {
  const res = await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers: bob.headers,
    body: JSON.stringify({ title: "Bob's secret task" }),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: string }).id;
}

test('A cannot list or read B’s task', async () => {
  const taskId = await bobsTaskId();

  const list = (await (
    await fetch(`${server.baseUrl}/api/tasks`, { headers: alice.headers })
  ).json()) as { id: string }[];
  assert.ok(!list.some((t) => t.id === taskId), "B's task leaked into A's list");

  const direct = await fetch(`${server.baseUrl}/api/tasks/${taskId}`, { headers: alice.headers });
  assert.equal(direct.status, 404);
});

test('A cannot update, complete, delete, snooze or reorder B’s task', async () => {
  const taskId = await bobsTaskId();
  const attempts: [string, RequestInit][] = [
    [`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ title: 'pwned' }) }],
    [`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) }],
    [`/api/tasks/${taskId}`, { method: 'DELETE' }],
    [`/api/tasks/${taskId}/snooze`, { method: 'POST', body: JSON.stringify({ minutes: 10 }) }],
    [
      `/api/tasks/${taskId}/reorder`,
      { method: 'POST', body: JSON.stringify({ scope: 'global' }) },
    ],
  ];

  for (const [path, init] of attempts) {
    const res = await fetch(`${server.baseUrl}${path}`, { ...init, headers: alice.headers });
    assert.equal(res.status, 404, `${init.method} ${path} should be refused`);
  }

  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  assert.ok(row, "B's task must still exist");
  assert.equal(row.title, "Bob's secret task", 'unchanged');
  assert.equal(row.status, 'active', 'not completed by A');
});

// The cross-user foreign key the Challenge flagged: owning the row you write is
// not enough — the rows it REFERENCES must be yours too.
test('A cannot attach a task to B’s context', async () => {
  const bobCtx = await bobsContextId();

  const created = await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers: alice.headers,
    body: JSON.stringify({ title: 'trying to borrow', contextId: bobCtx }),
  });
  assert.equal(created.status, 400, 'creating against another account’s context must fail');

  const own = await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers: alice.headers,
    body: JSON.stringify({ title: 'legit' }),
  });
  const mine = (await own.json()) as { id: string };

  const moved = await fetch(`${server.baseUrl}/api/tasks/${mine.id}`, {
    method: 'PATCH',
    headers: alice.headers,
    body: JSON.stringify({ contextId: bobCtx }),
  });
  assert.equal(moved.status, 400, 'moving a task into another account’s context must fail');

  const [row] = await db.select().from(tasks).where(eq(tasks.id, mine.id));
  assert.notEqual(row.contextId, bobCtx);
});

test('both accounts may hold the same slug independently', async () => {
  const mk = async (who: Account) =>
    fetch(`${server.baseUrl}/api/contexts`, {
      method: 'POST',
      headers: who.headers,
      body: JSON.stringify({ label: 'Shared Name', color: '#ABCDEF' }),
    });

  const a = await mk(alice);
  const b = await mk(bob);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201, 'a slug taken by another account must not block sign-up flows');

  const aBody = (await a.json()) as { slug: string };
  const bBody = (await b.json()) as { slug: string };
  assert.equal(aBody.slug, bBody.slug, 'both should get the same un-suffixed slug');
});

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
import { contexts, loginCodes, pushTokens, recurrenceRules, tasks, users } from '../db/schema';
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

// -------------------------------------------- comments / timer / data --

test('A cannot read, add to, or delete comments on B’s task', async () => {
  const taskId = await bobsTaskId();

  const added = await fetch(`${server.baseUrl}/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: bob.headers,
    body: JSON.stringify({ body: 'bob private note' }),
  });
  assert.equal(added.status, 201);
  const bobComment = (await added.json()) as { id: string };

  const read = await fetch(`${server.baseUrl}/api/tasks/${taskId}/comments`, {
    headers: alice.headers,
  });
  assert.deepEqual(await read.json(), [], "B's comments must not be readable by A");

  const write = await fetch(`${server.baseUrl}/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: alice.headers,
    body: JSON.stringify({ body: 'injected' }),
  });
  assert.equal(write.status, 404, 'commenting on another account’s task must fail');

  const del = await fetch(`${server.baseUrl}/api/comments/${bobComment.id}`, {
    method: 'DELETE',
    headers: alice.headers,
  });
  assert.equal(del.status, 404);
});

// The running timer used to be table-wide: one account starting or stopping a
// timer would have closed whoever else's happened to be open.
test('timers are independent per account', async () => {
  const bobTask = await bobsTaskId();
  const aliceTask = (await (
    await fetch(`${server.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: alice.headers,
      body: JSON.stringify({ title: "Alice's task" }),
    })
  ).json()) as { id: string };

  await fetch(`${server.baseUrl}/api/timer/start`, {
    method: 'POST',
    headers: bob.headers,
    body: JSON.stringify({ taskId: bobTask }),
  });

  // A starting their own timer must not close B's, and both must be able to run
  // at once (the per-user unique index, not the old global one).
  const aliceStart = await fetch(`${server.baseUrl}/api/timer/start`, {
    method: 'POST',
    headers: alice.headers,
    body: JSON.stringify({ taskId: aliceTask.id }),
  });
  assert.equal(aliceStart.status, 201, 'A must be able to run a timer while B has one');

  const bobActive = (await (
    await fetch(`${server.baseUrl}/api/timer`, { headers: bob.headers })
  ).json()) as { taskId: string } | null;
  assert.ok(bobActive, "B's timer must still be running");
  assert.equal(bobActive.taskId, bobTask);

  // A stopping only stops A's.
  await fetch(`${server.baseUrl}/api/timer/stop`, { method: 'POST', headers: alice.headers });
  const bobStillRunning = (await (
    await fetch(`${server.baseUrl}/api/timer`, { headers: bob.headers })
  ).json()) as { taskId: string } | null;
  assert.ok(bobStillRunning, "A stopping their timer must not stop B's");

  // A cannot start a timer on B's task.
  const cross = await fetch(`${server.baseUrl}/api/timer/start`, {
    method: 'POST',
    headers: alice.headers,
    body: JSON.stringify({ taskId: bobTask }),
  });
  assert.equal(cross.status, 404);

  await fetch(`${server.baseUrl}/api/timer/stop`, { method: 'POST', headers: bob.headers });
});

test('A’s calendar shows none of B’s blocks', async () => {
  await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers: bob.headers,
    body: JSON.stringify({ title: 'bob scheduled', dueAt: new Date().toISOString() }),
  });

  const from = new Date(Date.now() - 86_400_000).toISOString();
  const to = new Date(Date.now() + 86_400_000).toISOString();
  const res = await fetch(`${server.baseUrl}/api/calendar?from=${from}&to=${to}`, {
    headers: alice.headers,
  });
  const { blocks } = (await res.json()) as { blocks: { title: string }[] };
  assert.ok(!blocks.some((b) => b.title === 'bob scheduled'), "B's block leaked into A's calendar");
});

// resetData was a table-wide TRUNCATE: one account resetting would have wiped
// every account's tasks.
test('A resetting their data leaves B’s tasks intact', async () => {
  const bobTask = await bobsTaskId();

  const res = await fetch(`${server.baseUrl}/api/data`, {
    method: 'DELETE',
    headers: alice.headers,
    body: JSON.stringify({ confirm: 'RESET' }),
  });
  assert.equal(res.status, 204);

  const [row] = await db.select().from(tasks).where(eq(tasks.id, bobTask));
  assert.ok(row, "B's task must survive A's reset");

  const aliceTasks = (await (
    await fetch(`${server.baseUrl}/api/tasks`, { headers: alice.headers })
  ).json()) as unknown[];
  assert.deepEqual(aliceTasks, [], "A's own tasks should be gone");
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

test('A’s morning summary contains none of B’s overdue tasks', async () => {
  const overdue = new Date(Date.now() - 3 * 86_400_000).toISOString();
  await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers: bob.headers,
    body: JSON.stringify({ title: 'bob overdue', dueAt: overdue }),
  });

  const res = await fetch(`${server.baseUrl}/api/summary/morning`, { headers: alice.headers });
  assert.equal(res.status, 200);
  const { yesterday, older } = (await res.json()) as {
    yesterday: { title: string }[];
    older: { title: string }[];
  };
  assert.ok(
    ![...yesterday, ...older].some((t) => t.title === 'bob overdue'),
    "B's overdue task leaked into A's summary",
  );
});

test('a device token re-points to whoever registered it last', async () => {
  const token = 'ExpoPushToken[shared-device]';
  const reg = (who: Account) =>
    fetch(`${server.baseUrl}/api/push/register`, {
      method: 'POST',
      headers: who.headers,
      body: JSON.stringify({ token, device: 'iPhone' }),
    });

  assert.equal((await reg(alice)).status, 200);
  const [afterA] = await db.select().from(pushTokens).where(eq(pushTokens.token, token));
  assert.equal(afterA.userId, alice.id);

  assert.equal((await reg(bob)).status, 200);
  const rows = await db.select().from(pushTokens).where(eq(pushTokens.token, token));
  assert.equal(rows.length, 1, 'one row per device token');
  assert.equal(rows[0].userId, bob.id, 'the device must follow the account that signed in');
});

test('A cannot reach B’s recurrence rule through the task API', async () => {
  const created = await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers: bob.headers,
    body: JSON.stringify({ title: 'bob weekly', recurrence: { rule: 'daily' } }),
  });
  assert.equal(created.status, 201);
  const bobTask = (await created.json()) as { id: string };

  const [rule] = await db.select().from(recurrenceRules).where(eq(recurrenceRules.userId, bob.id));
  assert.ok(rule, 'B should own a rule');

  const attempt = await fetch(`${server.baseUrl}/api/tasks/${bobTask.id}`, {
    method: 'PATCH',
    headers: alice.headers,
    // A VALID rule on purpose: an invalid one is rejected by the route schema
    // before ownership is ever checked, so the 400 would mask an ownership bug
    // rather than prove there isn't one.
    body: JSON.stringify({ recurrence: { rule: 'weekly:mon' } }),
  });
  assert.equal(attempt.status, 404);

  const [after] = await db.select().from(recurrenceRules).where(eq(recurrenceRules.id, rule.id));
  assert.equal(after.rule, 'daily', "B's rule must be unchanged");
});

test('every /api route requires authentication', async () => {
  const routes: [string, string][] = [
    ['GET', '/api/contexts'], ['POST', '/api/contexts'],
    ['PATCH', '/api/contexts/1'], ['DELETE', '/api/contexts/1'],
    ['GET', '/api/tasks'], ['POST', '/api/tasks'],
    ['GET', '/api/tasks/x'], ['PATCH', '/api/tasks/x'], ['DELETE', '/api/tasks/x'],
    ['POST', '/api/tasks/x/reorder'], ['POST', '/api/tasks/x/snooze'],
    ['GET', '/api/tasks/x/comments'], ['POST', '/api/tasks/x/comments'],
    ['DELETE', '/api/comments/x'],
    ['GET', '/api/timer'], ['POST', '/api/timer/start'], ['POST', '/api/timer/stop'],
    ['GET', '/api/calendar'], ['GET', '/api/summary/morning'],
    ['POST', '/api/push/register'], ['DELETE', '/api/data'],
  ];

  for (const [method, path] of routes) {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
    });
    assert.equal(res.status, 401, `${method} ${path} must require auth`);
  }
});

// Account deletion: the store-compliance requirement. Proves that after the
// request returns, nothing of the account survives anywhere.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { closePool, mcpCall, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import {
  comments,
  contexts,
  loginCodes,
  mcpTokens,
  notificationLog,
  pushTokens,
  recurrenceRules,
  sessions,
  settings,
  tasks,
  timeEntries,
  users,
} from '../db/schema';
import { hashToken } from '../lib/tokens';

let server: TestServer;

interface Account {
  id: string;
  headers: Record<string, string>;
  refresh: string;
  mcpToken: string;
}

async function signUp(email: string): Promise<Account> {
  const code = `code-${email}-${Date.now()}`;
  await db.insert(loginCodes).values({
    tokenHash: hashToken(code),
    email,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const verified = await fetch(`${server.baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: code, device: 'test-device' }),
  });
  const { jwt, refresh } = (await verified.json()) as { jwt: string; refresh: string };
  const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));

  const chunks: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '));
  };
  try {
    await fetch(`${server.baseUrl}/api/mcp-token`, { method: 'POST', headers });
  } finally {
    console.log = original;
  }
  const line = chunks.find((c) => c.includes('token:'));
  assert.ok(line);

  return { id: row.id, headers, refresh, mcpToken: line.split('token:')[1].trim() };
}

// Give the account something in every owned table, so "everything is gone" is a
// real assertion rather than a vacuous one over empty tables.
async function populate(account: Account): Promise<void> {
  const ctx = await fetch(`${server.baseUrl}/api/contexts`, {
    method: 'POST',
    headers: account.headers,
    body: JSON.stringify({ label: 'Doomed', color: '#123456' }),
  });
  const { id: contextId } = (await ctx.json()) as { id: number };

  const created = await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers: account.headers,
    body: JSON.stringify({
      title: 'doomed task',
      contextId,
      dueAt: new Date().toISOString(),
      recurrence: { rule: 'daily' },
    }),
  });
  const { id: taskId } = (await created.json()) as { id: string };

  await fetch(`${server.baseUrl}/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: account.headers,
    body: JSON.stringify({ body: 'doomed comment' }),
  });
  await fetch(`${server.baseUrl}/api/timer/start`, {
    method: 'POST',
    headers: account.headers,
    body: JSON.stringify({ taskId }),
  });
  await fetch(`${server.baseUrl}/api/timer/stop`, { method: 'POST', headers: account.headers });
  await fetch(`${server.baseUrl}/api/push/register`, {
    method: 'POST',
    headers: account.headers,
    body: JSON.stringify({ token: `ExpoPushToken[${account.id}]`, device: 'iPhone' }),
  });
  await db.insert(settings).values({ userId: account.id, key: 'repeat_reminders', value: true });
  await db.insert(notificationLog).values({ userId: account.id, taskId, kind: 'initial' });
}

before(async () => {
  await resetDb();
  server = await startTestServer();
});

after(async () => {
  await server.close();
  await closePool();
});

test('deletion requires an explicit confirmation', async () => {
  const doomed = await signUp('confirm@example.test');
  const bare = await fetch(`${server.baseUrl}/api/account`, {
    method: 'DELETE',
    headers: doomed.headers,
  });
  assert.equal(bare.status, 400, 'a bare request must not delete an account');

  const wrong = await fetch(`${server.baseUrl}/api/account`, {
    method: 'DELETE',
    headers: doomed.headers,
    body: JSON.stringify({ confirm: 'yes' }),
  });
  assert.equal(wrong.status, 400);

  const [still] = await db.select().from(users).where(eq(users.id, doomed.id));
  assert.ok(still, 'the account must survive an unconfirmed request');
});

test('deleting wipes every table the account owned', async () => {
  const doomed = await signUp('doomed@example.test');
  const bystander = await signUp('bystander@example.test');
  await populate(doomed);
  await populate(bystander);

  // Sanity: the account really does have data in each table before we delete.
  const before = await db.select().from(tasks).where(eq(tasks.userId, doomed.id));
  assert.ok(before.length > 0, 'fixture should have created data');

  const res = await fetch(`${server.baseUrl}/api/account`, {
    method: 'DELETE',
    headers: doomed.headers,
    body: JSON.stringify({ confirm: 'DELETE' }),
  });
  assert.equal(res.status, 204);

  const owned: [string, unknown][] = [
    ['users', await db.select().from(users).where(eq(users.id, doomed.id))],
    ['contexts', await db.select().from(contexts).where(eq(contexts.userId, doomed.id))],
    ['tasks', await db.select().from(tasks).where(eq(tasks.userId, doomed.id))],
    [
      'recurrence_rules',
      await db.select().from(recurrenceRules).where(eq(recurrenceRules.userId, doomed.id)),
    ],
    ['comments', await db.select().from(comments).where(eq(comments.userId, doomed.id))],
    ['time_entries', await db.select().from(timeEntries).where(eq(timeEntries.userId, doomed.id))],
    [
      'notification_log',
      await db.select().from(notificationLog).where(eq(notificationLog.userId, doomed.id)),
    ],
    ['push_tokens', await db.select().from(pushTokens).where(eq(pushTokens.userId, doomed.id))],
    ['settings', await db.select().from(settings).where(eq(settings.userId, doomed.id))],
    ['sessions', await db.select().from(sessions).where(eq(sessions.userId, doomed.id))],
    ['mcp_tokens', await db.select().from(mcpTokens).where(eq(mcpTokens.userId, doomed.id))],
  ];

  for (const [table, rows] of owned) {
    assert.deepEqual(rows, [], `${table} still holds rows for the deleted account`);
  }

  // ...and pending sign-in codes, which are keyed by email rather than user.
  const codes = await db
    .select()
    .from(loginCodes)
    .where(sql`lower(${loginCodes.email}) = 'doomed@example.test'`);
  assert.deepEqual(codes, [], 'pending sign-in codes must not outlive the account');

  // The other account is entirely untouched.
  const survivor = await db.select().from(tasks).where(eq(tasks.userId, bystander.id));
  assert.ok(survivor.length > 0, "another account's data must survive");
});

test('sessions and the MCP token stop working immediately', async () => {
  const doomed = await signUp('revoked@example.test');
  await fetch(`${server.baseUrl}/api/account`, {
    method: 'DELETE',
    headers: doomed.headers,
    body: JSON.stringify({ confirm: 'DELETE' }),
  });

  const refreshed = await fetch(`${server.baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: doomed.refresh }),
  });
  assert.equal(refreshed.status, 401, 'the refresh token must be dead');

  const mcp = await mcpCall(server.baseUrl, doomed.mcpToken, 'list_contexts');
  assert.equal(mcp.status, 401, 'the MCP token must be dead');
});

test('signing in again creates a fresh empty account, not the old one', async () => {
  const email = 'reborn@example.test';
  const first = await signUp(email);
  await populate(first);
  await fetch(`${server.baseUrl}/api/account`, {
    method: 'DELETE',
    headers: first.headers,
    body: JSON.stringify({ confirm: 'DELETE' }),
  });

  const second = await signUp(email);
  assert.notEqual(second.id, first.id, 'a new account row, not the old one revived');

  const tasksAfter = await db.select().from(tasks).where(eq(tasks.userId, second.id));
  assert.deepEqual(tasksAfter, [], 'the new account starts empty');

  const ctxAfter = await db.select().from(contexts).where(eq(contexts.userId, second.id));
  assert.ok(ctxAfter.length > 0, 'the new account gets its own starter contexts');
  assert.ok(
    !ctxAfter.some((c) => c.label === 'Doomed'),
    'nothing from the deleted account may reappear',
  );
});

// Cross-account isolation of the MCP write surface. Alice points every mutating
// tool at Bob's identifiers; the HTTP layer must answer (200) without moving a
// single row of Bob's. The database, not the tool's prose, is the proof.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, isNull } from 'drizzle-orm';
import { closePool, mcpCall, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { comments, contexts, loginCodes, tasks, timeEntries, users } from '../db/schema';
import { hashToken } from '../lib/tokens';

let server: TestServer;

interface Account {
  id: string;
  headers: Record<string, string>;
  mcpToken: string;
}

let alice: Account;
let bob: Account;
let bobSlug: string;
let bobCtxId: number;
let bobTaskId: string;

async function signUp(email: string): Promise<Account> {
  const code = `code-${email}`;
  await db.insert(loginCodes).values({
    tokenHash: hashToken(code),
    email,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const verified = await fetch(`${server.baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: code }),
  });
  const { jwt } = (await verified.json()) as { jwt: string };
  const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));

  // The token exists only in the delivery channel; with mail disabled it is logged.
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
  assert.ok(line, 'an MCP token should have been issued');

  return { id: row.id, headers, mcpToken: line.split('token:')[1].trim() };
}

before(async () => {
  await resetDb();
  server = await startTestServer();
  alice = await signUp('mcp-iso-a@example.test');
  bob = await signUp('mcp-iso-b@example.test');

  // Bob's world, created through Bob's own token.
  const created = await mcpCall(server.baseUrl, bob.mcpToken, 'create_context', {
    label: 'Bob Ctx',
    color: '#4FB6A9',
  });
  assert.equal(created.status, 200);
  await mcpCall(server.baseUrl, bob.mcpToken, 'create_task', { title: 'bob original' });

  // Both accounts are seeded with the same default contexts, whose slugs collide
  // across users by design — so target the one Bob just created, whose slug is
  // unique to him and therefore a real cross-account identifier.
  const [ctx] = await db
    .select({ id: contexts.id, slug: contexts.slug })
    .from(contexts)
    .where(and(eq(contexts.userId, bob.id), eq(contexts.label, 'Bob Ctx')));
  assert.ok(ctx, "Bob's context should exist");
  bobCtxId = ctx.id;
  bobSlug = ctx.slug;

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, bob.id), eq(tasks.title, 'bob original')));
  assert.ok(task, "Bob's task should exist");
  bobTaskId = task.id;

  // list_contexts must agree with the row we captured.
  const listed = await mcpCall(server.baseUrl, bob.mcpToken, 'list_contexts');
  assert.ok(listed.text.includes(bobSlug), 'list_contexts should show the slug we captured');
});

after(async () => {
  await server.close();
  await closePool();
});

// Each entry: the tool, its arguments aimed at Bob, and the phrase the tool
// would emit if the mutation had actually gone through.
function cases(): { tool: string; args: Record<string, unknown>; successPhrase: string }[] {
  return [
    { tool: 'update_task', args: { id: bobTaskId, title: 'pwned' }, successPhrase: 'Updated:' },
    { tool: 'complete_task', args: { id: bobTaskId }, successPhrase: 'Completed:' },
    { tool: 'delete_task', args: { id: bobTaskId }, successPhrase: 'Deleted:' },
    {
      tool: 'add_comment',
      args: { id: bobTaskId, body: 'injected' },
      successPhrase: 'Comment added',
    },
    { tool: 'start_timer', args: { id: bobTaskId }, successPhrase: 'Timer started' },
    {
      tool: 'update_context',
      args: { slug: bobSlug, label: 'pwned' },
      successPhrase: 'Updated context',
    },
    { tool: 'delete_context', args: { slug: bobSlug }, successPhrase: 'Deleted context' },
  ];
}

test('every mutating tool aimed at another account refuses', async () => {
  for (const c of cases()) {
    const res = await mcpCall(server.baseUrl, alice.mcpToken, c.tool, c.args);
    assert.equal(res.status, 200, `${c.tool} should be answered by the endpoint`);
    assert.ok(
      !res.text.includes(c.successPhrase),
      `${c.tool} reported success on another account's row: ${res.text.slice(0, 300)}`,
    );
  }
});

test("nothing of Bob's moved in the database", async () => {
  const [task] = await db
    .select({ title: tasks.title, status: tasks.status, trackedSec: tasks.trackedSec })
    .from(tasks)
    .where(eq(tasks.id, bobTaskId));
  assert.ok(task, "Bob's task was deleted by another account");
  assert.equal(task.title, 'bob original');
  assert.equal(task.status, 'active');
  assert.equal(task.trackedSec, 0);

  const bobComments = await db.select().from(comments).where(eq(comments.taskId, bobTaskId));
  assert.equal(bobComments.length, 0, "a comment was injected onto Bob's task");

  const [ctx] = await db
    .select({ label: contexts.label })
    .from(contexts)
    .where(eq(contexts.id, bobCtxId));
  assert.ok(ctx, "Bob's context was deleted by another account");
  assert.equal(ctx.label, 'Bob Ctx');

  const entries = await db.select().from(timeEntries).where(eq(timeEntries.taskId, bobTaskId));
  assert.equal(entries.length, 0, "a timer was started on Bob's task by another account");
});

test("list_tasks leaks nothing, filtered or not", async () => {
  // Filtered by another account's slug. Note this alone is a WEAK check: the
  // slug is resolved by the scoped findContextBySlug and rejected before
  // listTasks is ever reached, so it passes even if listTasks itself is
  // unscoped (verified by mutation testing). The unfiltered call below is what
  // actually exercises the task query's owner predicate.
  const filtered = await mcpCall(server.baseUrl, alice.mcpToken, 'list_tasks', {
    context: bobSlug,
  });
  assert.equal(filtered.status, 200);
  assert.ok(!filtered.text.includes('bob original'), `Bob's task leaked: ${filtered.text.slice(0, 300)}`);
  assert.ok(!filtered.text.includes(bobTaskId), `Bob's task id leaked: ${filtered.text.slice(0, 300)}`);

  const unfiltered = await mcpCall(server.baseUrl, alice.mcpToken, 'list_tasks');
  assert.equal(unfiltered.status, 200);
  assert.ok(
    !unfiltered.text.includes('bob original'),
    `Bob's task leaked into an unfiltered list: ${unfiltered.text.slice(0, 300)}`,
  );
  assert.ok(!unfiltered.text.includes(bobTaskId), "Bob's task id leaked into an unfiltered list");
});

test("create_task cannot attach a task to another account's context", async () => {
  const res = await mcpCall(server.baseUrl, alice.mcpToken, 'create_task', {
    title: 'x',
    context: bobSlug,
  });
  assert.equal(res.status, 200);

  const rows = await db
    .select({ id: tasks.id, contextId: tasks.contextId })
    .from(tasks)
    .where(and(eq(tasks.userId, alice.id), eq(tasks.title, 'x')));
  for (const row of rows) {
    assert.notEqual(row.contextId, bobCtxId, "Alice's task was attached to Bob's context");
  }
  // And it certainly must not have landed under Bob's ownership either.
  const bobsX = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, bob.id), eq(tasks.title, 'x')));
  assert.equal(bobsX.length, 0, "Alice's task was created on Bob's account");
});

test("stop_timer stops only the caller's timer", async () => {
  const created = await mcpCall(server.baseUrl, alice.mcpToken, 'create_task', {
    title: 'alice timed',
  });
  assert.equal(created.status, 200);

  const started = await mcpCall(server.baseUrl, alice.mcpToken, 'start_timer', {
    title_match: 'alice timed',
  });
  assert.ok(started.text.includes('Timer started'), `expected a start, got: ${started.text}`);

  await mcpCall(server.baseUrl, bob.mcpToken, 'stop_timer');

  const running = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, alice.id), isNull(timeEntries.endedAt)));
  assert.equal(running.length, 1, "Bob's stop_timer closed Alice's running entry");
});

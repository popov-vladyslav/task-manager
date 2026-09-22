// Phase 4: the rule fields the calendar projection and the spawner read --
// `until`, `tracks_completion` and `duration_min` -- have to survive the trip
// through the task API, because nothing else writes them. The spawn/skip/
// override/split behaviour itself arrives with steps 4.4 and 4.10.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import type { Task } from '@task-manager/shared';
import { closePool, mcpCall, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { loginCodes, recurrenceOverrides, recurrenceRules, tasks, users } from '../db/schema';
import { hashToken } from '../lib/tokens';
import { localDateStr } from '../lib/recurrence-plan';
import { closeEndedOccurrences, spawnDueRecurring } from '../services/recurring';
import * as tasksSvc from '../services/tasks';

let server: TestServer;
let headers: Record<string, string>;
let userId: string;
let mcpToken: string;

async function signUp(email: string): Promise<void> {
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
  userId = row.id;
  headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  // The token is only ever printed, never returned — capture that one line.
  const printed: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  };
  try {
    await fetch(`${server.baseUrl}/api/mcp-token`, { method: 'POST', headers });
  } finally {
    console.log = log;
  }
  const line = printed.find((c) => c.includes('token:'));
  assert.ok(line, 'an MCP token should have been issued');
  mcpToken = line.split('token:')[1].trim();
}

async function createTask(body: Record<string, unknown>): Promise<Task> {
  const res = await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  // Read the body once: an `await res.text()` passed as the assertion message is
  // evaluated eagerly and would consume it before the json() below.
  const payload = await res.text();
  assert.equal(res.status, 201, payload);
  return JSON.parse(payload) as Task;
}

async function patchTask(id: string, body: Record<string, unknown>): Promise<Task> {
  const res = await fetch(`${server.baseUrl}/api/tasks/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  const payload = await res.text();
  assert.equal(res.status, 200, payload);
  return JSON.parse(payload) as Task;
}

async function ruleOf(task: Task) {
  assert.ok(task.recurrenceId, 'task should carry a rule id');
  const [rule] = await db
    .select()
    .from(recurrenceRules)
    .where(eq(recurrenceRules.id, task.recurrenceId));
  return rule;
}

before(async () => {
  await resetDb();
  server = await startTestServer();
  await signUp('recurrence@example.test');
});

after(async () => {
  await server.close();
  await closePool();
});

test('create carries until and tracksCompletion onto the rule and back out', async () => {
  const task = await createTask({
    title: 'water the plants',
    dueAt: '2026-10-01T09:00',
    durationMin: 15,
    recurrence: { rule: 'daily', until: '2026-12-31', tracksCompletion: false },
  });

  assert.equal(task.recurrenceUntil, '2026-12-31');
  assert.equal(task.tracksCompletion, false);

  const rule = await ruleOf(task);
  assert.equal(rule.until, '2026-12-31');
  assert.equal(rule.tracksCompletion, false);
  assert.equal(rule.durationMin, 15, 'the rule projects at the task’s block length');
  assert.equal(rule.userId, userId);
});

test('a rule with no end date is open-ended and tracked by default', async () => {
  const task = await createTask({
    title: 'standup',
    dueAt: '2026-10-01T09:30',
    recurrence: { rule: 'weekly:mon' },
  });

  assert.equal(task.recurrenceUntil, null);
  assert.equal(task.tracksCompletion, true);

  const rule = await ruleOf(task);
  assert.equal(rule.until, null);
  assert.equal(rule.tracksCompletion, true);
  // No duration given, but the task has a deadline, so it gets the default block.
  assert.equal(rule.durationMin, task.durationMin);
});

test('a task with no rule reads as tracked and open-ended', async () => {
  const task = await createTask({ title: 'one-off' });
  assert.equal(task.recurrenceId, null);
  assert.equal(task.recurrenceUntil, null);
  assert.equal(task.tracksCompletion, true);
});

test('update rewrites until and tracksCompletion on an existing rule', async () => {
  const task = await createTask({
    title: 'bins out',
    dueAt: '2026-10-01T20:00',
    recurrence: { rule: 'weekly:sun', until: '2026-11-30', tracksCompletion: false },
  });
  const ruleId = task.recurrenceId;

  const updated = await patchTask(task.id, {
    recurrence: { rule: 'weekly:sun', until: '2027-01-31', tracksCompletion: true },
  });

  assert.equal(updated.recurrenceId, ruleId, 'the same rule is edited, not replaced');
  assert.equal(updated.recurrenceUntil, '2027-01-31');
  assert.equal(updated.tracksCompletion, true);

  const rule = await ruleOf(updated);
  assert.equal(rule.until, '2027-01-31');
  assert.equal(rule.tracksCompletion, true);
});

test('fields left out of an update are kept; an explicit null clears', async () => {
  const task = await createTask({
    title: 'vitamins',
    dueAt: '2026-10-01T08:00',
    recurrence: {
      rule: 'daily',
      until: '2026-10-31',
      tracksCompletion: false,
      remindTime: '07:30',
    },
  });

  const kept = await patchTask(task.id, { recurrence: { rule: 'weekly:mon' } });
  assert.equal(kept.recurrenceRule, 'weekly:mon');
  assert.equal(kept.recurrenceUntil, '2026-10-31');
  assert.equal(kept.tracksCompletion, false);
  assert.equal((await ruleOf(kept)).remindTime?.slice(0, 5), '07:30');

  const cleared = await patchTask(task.id, {
    recurrence: { rule: 'weekly:mon', until: null, remindTime: null, tracksCompletion: true },
  });
  assert.equal(cleared.recurrenceUntil, null);
  assert.equal(cleared.tracksCompletion, true);
  assert.equal((await ruleOf(cleared)).remindTime, null);
});

test('update_task over MCP keeps the end date it was not told about', async () => {
  const task = await createTask({
    title: 'mcp keeps until',
    dueAt: '2026-10-01T08:00',
    recurrence: { rule: 'daily', until: '2026-11-30', tracksCompletion: false },
  });

  const res = await mcpCall(server.baseUrl, mcpToken, 'update_task', {
    id: task.id,
    recurrence: { freq: 'weekly', days: ['tue'] },
  });
  assert.equal(res.status, 200, res.text);

  const rule = await ruleOf(task);
  assert.equal(rule.rule, 'weekly:tue');
  assert.equal(rule.until, '2026-11-30');
  assert.equal(rule.tracksCompletion, false);

  await mcpCall(server.baseUrl, mcpToken, 'update_task', {
    id: task.id,
    recurrence: { freq: 'weekly', days: ['tue'], until: null },
  });
  assert.equal((await ruleOf(task)).until, null, 'null still clears on purpose');
});

test('resizing or rescheduling the task keeps the rule’s duration in sync', async () => {
  const task = await createTask({
    title: 'gym',
    dueAt: '2026-10-01T18:00',
    durationMin: 60,
    recurrence: { rule: 'weekly:tue' },
  });
  assert.equal((await ruleOf(task)).durationMin, 60);

  // Duration alone, rule untouched.
  const resized = await patchTask(task.id, { durationMin: 90 });
  assert.equal((await ruleOf(resized)).durationMin, 90);

  // Deadline alone: the rule's spawn time follows, and so does the duration.
  const moved = await patchTask(task.id, { dueAt: '2026-10-06T07:15' });
  const rule = await ruleOf(moved);
  assert.equal(rule.durationMin, 90);
  assert.equal(rule.defaultDueTime, '07:15:00');
});

test('adding a rule to an existing task copies that task’s duration', async () => {
  const task = await createTask({
    title: 'physio',
    dueAt: '2026-10-02T17:00',
    durationMin: 45,
  });
  assert.equal(task.recurrenceId, null);

  const recurring = await patchTask(task.id, {
    recurrence: { rule: 'weekly:fri', until: '2026-12-01' },
  });

  const rule = await ruleOf(recurring);
  assert.equal(rule.durationMin, 45);
  assert.equal(rule.until, '2026-12-01');
  assert.equal(rule.tracksCompletion, true);
});

// --- the spawner (step 4.4) ---------------------------------------------
// These drive spawnDueRecurring directly against rules inserted here, and
// assert only on their own rules' occurrences: the job is global by design, so
// rules left by the tests above spawn in the same run.

async function occurrencesOf(ruleId: string) {
  return db.select().from(tasks).where(eq(tasks.recurrenceId, ruleId));
}

async function insertRule(values: Partial<typeof recurrenceRules.$inferInsert>) {
  const [rule] = await db
    .insert(recurrenceRules)
    .values({ userId, title: 'spawner rule', rule: 'daily', active: true, ...values })
    .returning();
  return rule;
}

test('the spawned occurrence carries the rule’s block length', async () => {
  const rule = await insertRule({ defaultDueTime: '09:00', durationMin: 25 });

  await spawnDueRecurring();

  const [occurrence] = await occurrencesOf(rule.id);
  assert.ok(occurrence, 'the rule should have spawned');
  assert.equal(occurrence.durationMin, 25);
  assert.equal(occurrence.dueAt?.getHours(), 9);
});

test('a dateless rule spawns an occurrence with no block length', async () => {
  const rule = await insertRule({ defaultDueTime: null, durationMin: 25 });

  await spawnDueRecurring();

  const [occurrence] = await occurrencesOf(rule.id);
  assert.equal(occurrence.dueAt, null);
  assert.equal(occurrence.durationMin, null);
});

test('a rule past its until spawns nothing', async () => {
  const rule = await insertRule({ until: '2020-01-01' });

  await spawnDueRecurring();

  assert.deepEqual(await occurrencesOf(rule.id), []);
  const [after] = await db.select().from(recurrenceRules).where(eq(recurrenceRules.id, rule.id));
  assert.equal(after.lastSpawned, null, 'and it is not stamped as having spawned');
});

test('an untracked rule closes its previous occurrence as skipped, not missed', async () => {
  const rule = await insertRule({ tracksCompletion: false });
  await spawnDueRecurring();
  const [first] = await occurrencesOf(rule.id);
  assert.ok(first);

  // Re-arm so the next run supersedes what it just spawned.
  await db
    .update(recurrenceRules)
    .set({ lastSpawned: null })
    .where(eq(recurrenceRules.id, rule.id));
  await spawnDueRecurring();

  const rows = await occurrencesOf(rule.id);
  assert.equal(rows.length, 2);
  const closed = rows.find((r) => r.id === first.id);
  assert.equal(closed?.status, 'skipped');
  assert.ok(
    rows.some((r) => r.id !== first.id && r.status === 'active'),
    'the fresh occurrence is open',
  );
});

test('a tracked rule still closes its previous occurrence as missed', async () => {
  const rule = await insertRule({});
  await spawnDueRecurring();
  const [first] = await occurrencesOf(rule.id);

  await db
    .update(recurrenceRules)
    .set({ lastSpawned: null })
    .where(eq(recurrenceRules.id, rule.id));
  await spawnDueRecurring();

  const rows = await occurrencesOf(rule.id);
  assert.equal(rows.find((r) => r.id === first.id)?.status, 'missed');
});

test('today’s override spawns the occurrence at the moved time, reminder included', async () => {
  const rule = await insertRule({ defaultDueTime: '09:00', remindTime: '08:30' });
  const today = localDateStr(new Date());
  const movedDue = new Date(`${today}T16:00:00`);
  const movedRemind = new Date(`${today}T15:30:00`);
  await db.insert(recurrenceOverrides).values({
    userId,
    ruleId: rule.id,
    occursOn: today,
    dueAt: movedDue,
    remindAt: movedRemind,
  });

  await spawnDueRecurring();

  const [occurrence] = await occurrencesOf(rule.id);
  assert.equal(occurrence.dueAt?.getTime(), movedDue.getTime());
  assert.equal(occurrence.remindAt?.getTime(), movedRemind.getTime());
});

// --- overdue counts (step 4.5) -------------------------------------------
// A routine nobody ticks off is never late: its occurrences must not show up
// as overdue (spec P4.2). Today's agenda still lists today's own.

test('an untracked routine left open from yesterday is not on today’s agenda', async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterday = new Date(todayStart.getTime() - 12 * 3600_000);

  const untracked = await insertRule({ title: 'untracked rule', tracksCompletion: false });
  const tracked = await insertRule({ title: 'tracked rule' });
  await db.insert(tasks).values([
    {
      userId,
      title: 'untracked yesterday',
      recurrenceId: untracked.id,
      dueAt: yesterday,
      durationMin: 30,
    },
    {
      userId,
      title: 'untracked today',
      recurrenceId: untracked.id,
      dueAt: todayStart,
      durationMin: 30,
    },
    {
      userId,
      title: 'tracked yesterday',
      recurrenceId: tracked.id,
      dueAt: yesterday,
      durationMin: 30,
    },
  ]);

  const titles = (await tasksSvc.tasksDueToday(userId)).map((t) => t.title);

  assert.ok(!titles.includes('untracked yesterday'), 'yesterday’s routine is not overdue');
  assert.ok(titles.includes('untracked today'), 'today’s own routine still belongs on the agenda');
  assert.ok(titles.includes('tracked yesterday'), 'an ordinary recurring task is still overdue');
});

test('list_tasks overdue omits untracked occurrences entirely', async () => {
  const res = await mcpCall(server.baseUrl, mcpToken, 'list_tasks', { overdue: true });
  assert.equal(res.status, 200);

  assert.ok(!res.text.includes('untracked yesterday'));
  assert.ok(
    !res.text.includes('untracked today'),
    'even today’s untracked occurrence is not "overdue" once its time has passed',
  );
  assert.ok(res.text.includes('tracked yesterday'));
});

test('REST rejects an until that is not a plain date', async () => {
  const res = await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'bad until',
      recurrence: { rule: 'daily', until: '2026-12-31T00:00:00Z' },
    }),
  });
  assert.equal(res.status, 400);
});

async function deleteTask(id: string, query = ''): Promise<number> {
  const res = await fetch(`${server.baseUrl}/api/tasks/${id}${query}`, {
    method: 'DELETE',
    headers,
  });
  return res.status;
}

async function ghostTitles(days: number): Promise<string[]> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  const qs = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    ghosts: 'true',
  });
  const res = await fetch(`${server.baseUrl}/api/calendar?${qs}`, { headers });
  const { blocks } = (await res.json()) as { blocks: { title: string; virtual: boolean }[] };
  return blocks.filter((b) => b.virtual).map((b) => b.title);
}

function todayAt(hhmm: string): string {
  return `${localDateStr(new Date())}T${hhmm}`;
}

test('deleting one occurrence keeps the rule and does not re-project today', async () => {
  const task = await createTask({
    title: 'delete once',
    dueAt: todayAt('23:30'),
    durationMin: 15,
    recurrence: { rule: 'daily' },
  });

  assert.equal(await deleteTask(task.id), 204);

  const rule = await ruleOf(task);
  assert.equal(rule.active, true, 'the series goes on');
  assert.equal(rule.lastSpawned, localDateStr(new Date()), 'today counts as handled');

  const ghosts = (await ghostTitles(3)).filter((t) => t === 'delete once');
  assert.equal(ghosts.length, 2, 'tomorrow and the day after, but not the day just deleted');
});

test('deleting the series ends the rule, drops open occurrences and keeps history', async () => {
  const task = await createTask({
    title: 'delete series',
    dueAt: todayAt('23:40'),
    durationMin: 15,
    recurrence: { rule: 'daily' },
  });
  const [history] = await db
    .insert(tasks)
    .values({
      userId,
      title: 'delete series',
      status: 'done',
      recurrenceId: task.recurrenceId,
    })
    .returning({ id: tasks.id });

  assert.equal(await deleteTask(task.id, '?scope=series'), 204);

  const rule = await ruleOf(task);
  assert.equal(rule.active, false);

  const left = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.recurrenceId, rule.id));
  assert.deepEqual(
    left.map((r) => r.id),
    [history.id],
    'only the finished occurrence survives',
  );

  assert.ok(!(await ghostTitles(3)).includes('delete series'), 'nothing is projected any more');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await spawnDueRecurring(tomorrow);
  const after = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.recurrenceId, rule.id));
  assert.equal(after.length, 1, 'the spawner leaves an ended series alone');
});

test('deleting the series from a finished occurrence also removes the open one', async () => {
  const task = await createTask({
    title: 'delete from history',
    dueAt: todayAt('23:50'),
    recurrence: { rule: 'daily' },
  });
  const [history] = await db
    .insert(tasks)
    .values({
      userId,
      title: 'delete from history',
      status: 'done',
      recurrenceId: task.recurrenceId,
    })
    .returning({ id: tasks.id });

  assert.equal(await deleteTask(history.id, '?scope=series'), 204);

  const rule = await ruleOf(task);
  assert.equal(rule.active, false);
  const left = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.recurrenceId, rule.id));
  assert.equal(left.length, 0);
});

test('series scope on a one-off task is a plain delete', async () => {
  const task = await createTask({ title: 'one-off to delete' });
  assert.equal(await deleteTask(task.id, '?scope=series'), 204);
  assert.equal(await deleteTask(task.id), 404);
});

test('an unknown delete scope is rejected before anything is deleted', async () => {
  const task = await createTask({ title: 'survives a bad scope' });
  assert.equal(await deleteTask(task.id, '?scope=everything'), 400);
  assert.equal(await deleteTask(task.id), 204);
});

test('delete_task says a recurring task still repeats, and series: true stops it', async () => {
  const once = await createTask({ title: 'mcp delete once', recurrence: { rule: 'daily' } });
  const kept = await mcpCall(server.baseUrl, mcpToken, 'delete_task', { id: once.id });
  assert.ok(kept.text.includes('still repeats'), kept.text);
  assert.equal((await ruleOf(once)).active, true);

  const all = await createTask({ title: 'mcp delete series', recurrence: { rule: 'daily' } });
  const ended = await mcpCall(server.baseUrl, mcpToken, 'delete_task', {
    id: all.id,
    series: true,
  });
  assert.ok(ended.text.includes('will not repeat'), ended.text);
  assert.equal((await ruleOf(all)).active, false);
});

test('the last occurrence of an ended rule is closed the day after its end date', async () => {
  const today = localDateStr(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const tracked = await createTask({
    title: 'ended tracked',
    dueAt: `${localDateStr(yesterday)}T09:00`,
    recurrence: { rule: 'daily', until: localDateStr(yesterday) },
  });
  const routine = await createTask({
    title: 'ended routine',
    dueAt: `${localDateStr(yesterday)}T09:00`,
    recurrence: { rule: 'daily', until: localDateStr(yesterday), tracksCompletion: false },
  });
  const stillDue = await createTask({
    title: 'ended but moved forward',
    dueAt: `${today}T23:00`,
    recurrence: { rule: 'daily', until: localDateStr(yesterday) },
  });
  const openEnded = await createTask({
    title: 'open-ended',
    dueAt: `${localDateStr(yesterday)}T09:00`,
    recurrence: { rule: 'weekly:mon' },
  });

  const closed = await closeEndedOccurrences();
  assert.equal(closed, 2);

  const statusOf = async (id: string) =>
    (await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, id)))[0].status;
  assert.equal(await statusOf(tracked.id), 'missed');
  assert.equal(await statusOf(routine.id), 'skipped');
  assert.equal(await statusOf(stillDue.id), 'active', 'an occurrence still due today stays');
  assert.equal(await statusOf(openEnded.id), 'active', 'the spawner, not this, handles live rules');

  assert.equal(await closeEndedOccurrences(), 0, 'idempotent');
});

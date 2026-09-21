// Step 4.10: POST /api/recurrence/:ruleId/move. The rule arithmetic is
// unit-tested (lib/recurrence-shift); here it is the wiring that matters — which
// rows change for each scope, that the calendar and the spawner both follow, and
// that nothing crosses accounts.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import type { CalendarBlock, Task } from '@task-manager/shared';
import { closePool, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { loginCodes, recurrenceOverrides, recurrenceRules, tasks, users } from '../db/schema';
import { hashToken } from '../lib/tokens';
import { DOW_ORDER } from '../lib/recurrence';
import { localDateStr } from '../lib/recurrence-plan';
import { spawnDueRecurring } from '../services/recurring';

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

const at = (offsetDays: number, h = 0, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
};
const dayStr = (offsetDays: number) => localDateStr(at(offsetDays));
const dow = (offsetDays: number) => DOW_ORDER[at(offsetDays).getDay()];

async function move(
  account: Account,
  ruleId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; ruleId?: string }> {
  const res = await fetch(`${server.baseUrl}/api/recurrence/${ruleId}/move`, {
    method: 'POST',
    headers: account.headers,
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as { ruleId?: string };
  return { status: res.status, ruleId: payload.ruleId };
}

async function ghostsOf(account: Account, title: string): Promise<CalendarBlock[]> {
  const end = at(7, 23, 59);
  const qs = new URLSearchParams({
    from: at(0).toISOString(),
    to: end.toISOString(),
    ghosts: 'true',
  });
  const res = await fetch(`${server.baseUrl}/api/calendar?${qs}`, { headers: account.headers });
  const { blocks } = (await res.json()) as { blocks: CalendarBlock[] };
  return blocks.filter((b) => b.virtual && b.title === title);
}

const startDays = (blocks: CalendarBlock[]) =>
  blocks.map((b) => localDateStr(new Date(b.startAt))).sort();

async function makeRule(account: Account, values: Record<string, unknown>) {
  const [rule] = await db
    .insert(recurrenceRules)
    .values({
      userId: account.id,
      title: 'untitled',
      rule: 'daily',
      active: true,
      defaultDueTime: '09:00',
      durationMin: 30,
      lastSpawned: dayStr(0),
      ...values,
    })
    .returning();
  return rule;
}

const ruleById = async (id: string) =>
  (await db.select().from(recurrenceRules).where(eq(recurrenceRules.id, id)))[0];

before(async () => {
  await resetDb();
  server = await startTestServer();
  alice = await signUp('move-a@example.test');
  bob = await signUp('move-b@example.test');
});

after(async () => {
  await server.close();
  await closePool();
});

test('only this, on a projected day: an override moves that day and no other', async () => {
  const rule = await makeRule(alice, { title: 'move one ghost', remindTime: '08:30' });

  const res = await move(alice, rule.id, {
    occursOn: dayStr(2),
    dueAt: at(2, 15).toISOString(),
    scope: 'occurrence',
  });
  assert.equal(res.status, 200);
  assert.equal(res.ruleId, rule.id);

  const [override] = await db
    .select()
    .from(recurrenceOverrides)
    .where(eq(recurrenceOverrides.ruleId, rule.id));
  assert.equal(override.occursOn, dayStr(2));
  assert.deepEqual(override.dueAt, at(2, 15));
  assert.deepEqual(override.remindAt, at(2, 14, 30), 'the reminder keeps its 30 minutes');

  const hours = new Map(
    (await ghostsOf(alice, 'move one ghost')).map((b) => [
      localDateStr(new Date(b.startAt)),
      new Date(b.startAt).getHours(),
    ]),
  );
  assert.equal(hours.get(dayStr(2)), 15);
  assert.equal(hours.get(dayStr(1)), 9);
  assert.equal(hours.get(dayStr(3)), 9);

  const after = await ruleById(rule.id);
  assert.equal(after.defaultDueTime?.slice(0, 5), '09:00', 'the rule itself is untouched');

  const again = await move(alice, rule.id, {
    occursOn: dayStr(2),
    dueAt: at(2, 16).toISOString(),
    scope: 'occurrence',
  });
  assert.equal(again.status, 200, 'moving the same day twice updates the one override');
  const rows = await db
    .select()
    .from(recurrenceOverrides)
    .where(eq(recurrenceOverrides.ruleId, rule.id));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].dueAt, at(2, 16));
});

async function createRecurringToday(title: string, rule: string, h: number): Promise<Task> {
  const res = await fetch(`${server.baseUrl}/api/tasks`, {
    method: 'POST',
    headers: alice.headers,
    body: JSON.stringify({
      title,
      dueAt: at(0, h).toISOString(),
      remindAt: at(0, h - 1, 30).toISOString(),
      durationMin: 30,
      recurrence: { rule, remindTime: `${String(h - 1).padStart(2, '0')}:30` },
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as Task;
}

test('only this, on the real occurrence: the task moves and the rule does not', async () => {
  const task = await createRecurringToday('move real once', 'daily', 20);

  const res = await move(alice, task.recurrenceId as string, {
    occursOn: dayStr(0),
    dueAt: at(0, 22).toISOString(),
    scope: 'occurrence',
  });
  assert.equal(res.status, 200);

  const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
  assert.deepEqual(row.dueAt, at(0, 22));
  assert.deepEqual(row.remindAt, at(0, 21, 30));

  const rule = await ruleById(task.recurrenceId as string);
  assert.equal(rule.defaultDueTime?.slice(0, 5), '20:00', 'unlike PATCH, the rule is not synced');
  assert.equal(rule.remindTime?.slice(0, 5), '19:30');
});

test('all following, from the real occurrence: the rule changes in place', async () => {
  const task = await createRecurringToday('move real series', `weekly:${dow(0)}`, 10);

  const res = await move(alice, task.recurrenceId as string, {
    occursOn: dayStr(0),
    dueAt: at(1, 11).toISOString(),
    scope: 'following',
  });
  assert.equal(res.status, 200);
  assert.equal(res.ruleId, task.recurrenceId, 'no split when the series moves from today');

  const rule = await ruleById(task.recurrenceId as string);
  assert.equal(rule.rule, `weekly:${dow(1)}`);
  assert.equal(rule.defaultDueTime?.slice(0, 5), '11:00');
  assert.equal(rule.remindTime?.slice(0, 5), '10:30');
  assert.equal(rule.until, null);

  const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
  assert.deepEqual(row.dueAt, at(1, 11));
  assert.deepEqual(row.remindAt, at(1, 10, 30));
});

test('all following, to a later day: the series splits and no day between is lost', async () => {
  const rule = await makeRule(alice, {
    title: 'split later',
    rule: `weekly:${[dow(2), dow(4), dow(6)].join(',')}`,
    until: dayStr(60),
    tracksCompletion: false,
  });

  const res = await move(alice, rule.id, {
    occursOn: dayStr(2),
    dueAt: at(5, 13).toISOString(),
    scope: 'following',
  });
  assert.equal(res.status, 200);
  assert.notEqual(res.ruleId, rule.id);

  const old = await ruleById(rule.id);
  assert.equal(old.until, dayStr(1), 'the old rule ends the day before the dragged one');

  const next = await ruleById(res.ruleId as string);
  assert.deepEqual(
    new Set(next.rule.replace('weekly:', '').split(',')),
    new Set([dow(4), dow(5), dow(6)]),
  );
  assert.equal(next.lastSpawned, dayStr(1));
  assert.equal(next.until, dayStr(60), 'the end date carries over');
  assert.equal(next.tracksCompletion, false);
  assert.equal(next.userId, alice.id);

  assert.deepEqual(
    startDays(await ghostsOf(alice, 'split later')),
    [dayStr(4), dayStr(5), dayStr(6)],
    'the untouched day +4 is still there, day +2 is gone, nothing is doubled',
  );

  const open = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.recurrenceId, next.id));
  assert.equal(open.length, 0, 'no task is created ahead of its day');
});

test('all following, to an earlier day: the old rule stops before the new one starts', async () => {
  const rule = await makeRule(alice, {
    title: 'split earlier',
    rule: `weekly:${[dow(2), dow(4)].join(',')}`,
  });

  const res = await move(alice, rule.id, {
    occursOn: dayStr(4),
    dueAt: at(1, 9).toISOString(),
    scope: 'following',
  });
  assert.equal(res.status, 200);

  assert.equal((await ruleById(rule.id)).until, dayStr(0));
  assert.deepEqual(
    startDays(await ghostsOf(alice, 'split earlier')),
    [dayStr(1), dayStr(2)],
    'day +2 comes from the new rule only',
  );
});

test('what is not an occurrence of the series is rejected', async () => {
  const rule = await makeRule(alice, {
    title: 'strict',
    rule: `weekly:${dow(3)}`,
    until: dayStr(20),
  });
  const body = { dueAt: at(3, 10).toISOString(), scope: 'occurrence' };

  assert.equal((await move(alice, rule.id, { ...body, occursOn: dayStr(2) })).status, 400);
  assert.equal((await move(alice, rule.id, { ...body, occursOn: dayStr(24) })).status, 400);
  assert.equal(
    (await move(alice, rule.id, { ...body, occursOn: dayStr(3), dueAt: at(-1, 10).toISOString() }))
      .status,
    400,
    'not into the past',
  );
  assert.equal(
    (await move(alice, rule.id, { ...body, occursOn: dayStr(3), scope: 'all' })).status,
    400,
  );
  assert.equal(
    (
      await move(alice, rule.id, {
        occursOn: dayStr(3),
        dueAt: at(25, 10).toISOString(),
        scope: 'following',
      })
    ).status,
    400,
    'not past the end of the series',
  );

  await db.update(recurrenceRules).set({ active: false }).where(eq(recurrenceRules.id, rule.id));
  assert.equal((await move(alice, rule.id, { ...body, occursOn: dayStr(3) })).status, 400);

  const none = await db
    .select()
    .from(recurrenceOverrides)
    .where(eq(recurrenceOverrides.ruleId, rule.id));
  assert.equal(none.length, 0);
});

test('another account cannot move — or learn of — a series', async () => {
  const rule = await makeRule(alice, { title: 'private series' });
  const body = { occursOn: dayStr(1), dueAt: at(1, 12).toISOString() };

  assert.equal((await move(bob, rule.id, { ...body, scope: 'occurrence' })).status, 404);
  assert.equal((await move(bob, rule.id, { ...body, scope: 'following' })).status, 404);

  const rows = await db
    .select()
    .from(recurrenceOverrides)
    .where(eq(recurrenceOverrides.ruleId, rule.id));
  assert.equal(rows.length, 0);
  assert.equal((await ruleById(rule.id)).until, null);
  const bobs = await db.select().from(recurrenceRules).where(eq(recurrenceRules.userId, bob.id));
  assert.equal(bobs.length, 0);
});

test('the spawner creates a moved occurrence at its moved time', async () => {
  const rule = await makeRule(alice, { title: 'spawn moved', remindTime: '08:30' });
  await move(alice, rule.id, {
    occursOn: dayStr(1),
    dueAt: at(1, 17).toISOString(),
    scope: 'occurrence',
  });

  await spawnDueRecurring(at(1, 0, 1));

  const [spawned] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.recurrenceId, rule.id), eq(tasks.userId, alice.id)));
  assert.deepEqual(spawned.dueAt, at(1, 17));
  assert.deepEqual(spawned.remindAt, at(1, 16, 30), 'so the reminder fires at the moved time');
});

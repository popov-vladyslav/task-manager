// Step 4.7: the calendar endpoint projects future occurrences of a rule as
// `virtual` blocks. The projector itself is unit-tested (lib/calendar-expand);
// what matters here is the wiring — opt-in, owner-scoped, read-only, and never
// drawing today twice.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import type { CalendarBlock } from '@task-manager/shared';
import { closePool, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { loginCodes, recurrenceOverrides, recurrenceRules, tasks, users } from '../db/schema';
import { hashToken } from '../lib/tokens';
import { localDateStr } from '../lib/recurrence-plan';

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
  return { id: row.id, headers: { Authorization: `Bearer ${jwt}` } };
}

const midnight = (offsetDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
};

const dayStr = (offsetDays: number) => localDateStr(midnight(offsetDays));

async function calendar(
  account: Account,
  opts: { days?: number; ghosts?: boolean } = {},
): Promise<CalendarBlock[]> {
  const from = midnight(0).toISOString();
  // End of the last day, not its midnight — otherwise a 09:00 block on that day
  // sits just outside the window.
  const end = midnight(opts.days ?? 7);
  end.setHours(23, 59, 59, 999);
  const to = end.toISOString();
  const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
    (opts.ghosts === undefined ? '' : `&ghosts=${opts.ghosts}`);
  const res = await fetch(`${server.baseUrl}/api/calendar?${qs}`, { headers: account.headers });
  assert.equal(res.status, 200);
  const { blocks } = (await res.json()) as { blocks: CalendarBlock[] };
  return blocks;
}

async function dailyRule(account: Account, values: Record<string, unknown> = {}) {
  const [rule] = await db
    .insert(recurrenceRules)
    .values({
      userId: account.id,
      title: 'daily standup',
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

before(async () => {
  await resetDb();
  server = await startTestServer();
  alice = await signUp('cal-a@example.test');
  bob = await signUp('cal-b@example.test');
});

after(async () => {
  await server.close();
  await closePool();
});

test('ghosts are opt-in: without the flag the calendar is unchanged', async () => {
  await dailyRule(alice);

  assert.deepEqual(await calendar(alice), [], 'no flag → no ghosts');
  assert.deepEqual(await calendar(alice, { ghosts: false }), []);
});

test('a rule projects one virtual block per future day', async () => {
  const blocks = await calendar(alice, { ghosts: true });

  assert.equal(blocks.length, 7, 'tomorrow through the end of the window');
  assert.ok(
    blocks.every((b) => b.virtual && b.id === null && b.done === false),
    'every projected block is virtual and has no task row',
  );
  assert.equal(blocks[0].occursOn, dayStr(1), 'today is a real task’s job, not a ghost’s');
  assert.equal(blocks[0].title, 'daily standup');
  assert.equal(new Date(blocks[0].startAt).getHours(), 9);
  assert.equal(
    new Date(blocks[0].endAt).getTime() - new Date(blocks[0].startAt).getTime(),
    30 * 60_000,
  );
});

test('the projection writes nothing', async () => {
  const before = await db.select().from(tasks);
  const rulesBefore = await db.select().from(recurrenceRules);

  await calendar(alice, { ghosts: true });

  assert.equal((await db.select().from(tasks)).length, before.length, 'no task was spawned');
  assert.deepEqual(
    (await db.select().from(recurrenceRules)).map((r) => r.lastSpawned),
    rulesBefore.map((r) => r.lastSpawned),
    'last_spawned untouched',
  );
});

test('today is drawn once: the real occurrence, never also a ghost', async () => {
  // A rule created today has never spawned, but its first task already exists.
  const rule = await dailyRule(alice, { title: 'fresh rule', lastSpawned: null });
  const todayNine = midnight(0);
  todayNine.setHours(9, 0, 0, 0);
  await db.insert(tasks).values({
    userId: alice.id,
    title: 'fresh rule',
    recurrenceId: rule.id,
    dueAt: todayNine,
    durationMin: 30,
  });

  const mine = (await calendar(alice, { ghosts: true })).filter(
    (b) => b.ruleId === rule.id || b.title === 'fresh rule',
  );
  const today = mine.filter((b) => localDateStr(new Date(b.startAt)) === dayStr(0));

  assert.equal(today.length, 1, 'exactly one block for today');
  assert.equal(today[0].virtual, false, 'and it is the real one');
  assert.equal(today[0].ruleId, rule.id, 'a real occurrence still names its rule');
  assert.equal(today[0].occursOn, dayStr(0));
});

test('until cuts the projection short', async () => {
  const rule = await dailyRule(bob, { title: 'ends soon', until: dayStr(2) });

  const days = (await calendar(bob, { ghosts: true }))
    .filter((b) => b.ruleId === rule.id)
    .map((b) => b.occursOn);

  assert.deepEqual(days, [dayStr(1), dayStr(2)]);
});

test('an override moves the ghost to its new time', async () => {
  const rule = await dailyRule(bob, { title: 'moved one', defaultDueTime: '10:00' });
  const moved = midnight(3);
  moved.setHours(17, 45, 0, 0);
  await db.insert(recurrenceOverrides).values({
    userId: bob.id,
    ruleId: rule.id,
    occursOn: dayStr(3),
    dueAt: moved,
  });

  const blocks = (await calendar(bob, { ghosts: true })).filter((b) => b.ruleId === rule.id);
  const overridden = blocks.find((b) => b.occursOn === dayStr(3));
  const ordinary = blocks.find((b) => b.occursOn === dayStr(2));

  assert.equal(new Date(overridden!.startAt).getTime(), moved.getTime());
  assert.equal(new Date(ordinary!.startAt).getHours(), 10, 'other days keep the rule’s time');
});

test('a window longer than the cap gets no ghosts', async () => {
  const blocks = await calendar(alice, { days: 60, ghosts: true });

  assert.ok(!blocks.some((b) => b.virtual), 'too long a window projects nothing (ADR 0010)');
});

test('A’s ghosts never reach B’s calendar', async () => {
  const aliceBlocks = await calendar(alice, { ghosts: true });
  const bobBlocks = await calendar(bob, { ghosts: true });

  assert.ok(aliceBlocks.some((b) => b.virtual), 'precondition: A has ghosts');
  assert.ok(bobBlocks.some((b) => b.virtual), 'precondition: B has ghosts');
  assert.ok(
    !bobBlocks.some((b) => b.title === 'daily standup' || b.title === 'fresh rule'),
    "A's projected occurrences leaked into B's calendar",
  );
  assert.ok(
    !aliceBlocks.some((b) => b.title === 'ends soon' || b.title === 'moved one'),
    "B's projected occurrences leaked into A's calendar",
  );
});

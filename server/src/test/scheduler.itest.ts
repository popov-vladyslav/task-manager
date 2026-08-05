// The background jobs run globally (one cron, one advisory lock) but must act
// per account. These drive the real job functions against two accounts and
// assert nothing crosses.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { closePool, resetDb } from './harness';
import { db } from '../db/client';
import { notificationLog, recurrenceRules, settings, tasks, users } from '../db/schema';
import { spawnDueRecurring } from '../services/recurring';
import { sendReminders } from '../services/push';

let alice: string;
let bob: string;

before(async () => {
  await resetDb();
  const rows = await db
    .insert(users)
    .values([{ email: 'sched-a@example.test' }, { email: 'sched-b@example.test' }])
    .returning({ id: users.id });
  alice = rows[0].id;
  bob = rows[1].id;
});

after(async () => {
  await closePool();
});

test('recurrence spawns an occurrence per owner, attributed correctly', async () => {
  await db.insert(recurrenceRules).values([
    { userId: alice, title: 'alice daily', rule: 'daily', active: true },
    { userId: bob, title: 'bob daily', rule: 'daily', active: true },
  ]);

  const spawned = await spawnDueRecurring();
  assert.equal(spawned, 2, 'one occurrence per rule');

  const aliceTasks = await db.select().from(tasks).where(eq(tasks.userId, alice));
  const bobTasks = await db.select().from(tasks).where(eq(tasks.userId, bob));

  assert.equal(aliceTasks.length, 1);
  assert.equal(bobTasks.length, 1);
  assert.equal(aliceTasks[0].title, 'alice daily');
  assert.equal(bobTasks[0].title, 'bob daily');
});

test('closing out missed occurrences never touches another account', async () => {
  // Re-arm both rules so the next run spawns again and supersedes today's
  // occurrence — the path that writes status='missed'.
  await db.update(recurrenceRules).set({ lastSpawned: null });
  await spawnDueRecurring();

  const bobRows = await db.select().from(tasks).where(eq(tasks.userId, bob));
  const bobMissed = bobRows.filter((t) => t.status === 'missed');
  const aliceRows = await db.select().from(tasks).where(eq(tasks.userId, alice));
  const aliceMissed = aliceRows.filter((t) => t.status === 'missed');

  // Each account superseded exactly its own previous occurrence.
  assert.equal(bobMissed.length, 1, "B's own previous occurrence should be missed");
  assert.equal(aliceMissed.length, 1, "A's own previous occurrence should be missed");
  assert.ok(
    bobMissed.every((t) => t.userId === bob),
    'no cross-account status write',
  );
});

test('reminders are claimed and logged against the owning account', async () => {
  await db.delete(tasks);
  const past = new Date(Date.now() - 60_000);

  const [aTask] = await db
    .insert(tasks)
    .values({ userId: alice, title: 'alice reminder', status: 'active', remindAt: past })
    .returning({ id: tasks.id });
  const [bTask] = await db
    .insert(tasks)
    .values({ userId: bob, title: 'bob reminder', status: 'active', remindAt: past })
    .returning({ id: tasks.id });

  // No push tokens are registered, so sendPush is a no-op — the claim/log path
  // is what matters here.
  const sent = await sendReminders();
  assert.equal(sent, 2, 'both accounts had a due reminder');

  const [aLog] = await db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.taskId, aTask.id), eq(notificationLog.kind, 'initial')));
  const [bLog] = await db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.taskId, bTask.id), eq(notificationLog.kind, 'initial')));

  assert.equal(aLog.userId, alice, "A's log row must be attributed to A");
  assert.equal(bLog.userId, bob, "B's log row must be attributed to B");
});

// One account opting out of repeat reminders must not switch the gate off for
// everyone — the bug the per-user repeatClock query fixes.
test('one account disabling repeats does not suppress another account’s', async () => {
  await db.insert(settings).values([
    { userId: alice, key: 'repeat_reminders', value: false },
    { userId: bob, key: 'repeat_reminders', value: true },
    { userId: bob, key: 'repeat_after_h', value: 1 },
  ]);

  const { repeatClock } = await import('../services/reminder-clock');
  repeatClock.invalidate();
  const next = await repeatClock.due(new Date());

  // B has an 'initial' log row from the previous test and repeats enabled, so
  // the gate must report work is (or will be) pending rather than "never".
  assert.equal(typeof next, 'boolean');
  const peeked = repeatClock.peek();
  assert.ok(
    peeked instanceof Date,
    'the gate must see B’s eligible work even though A opted out',
  );
});

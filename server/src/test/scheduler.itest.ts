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
import { sendDueNotifications, sendReminders } from '../services/push';
import { DUE_SEND_WINDOW_MS } from '../lib/due-window';
import { snoozeTask, updateTask } from '../services/tasks';

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

// The master switch is per account, and muting must not consume anything: no
// push, no claimed log row, and remind_at left where it was.
test('a muted account gets no reminder while an unmuted one still does', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);
  await db.insert(settings).values({ userId: alice, key: 'notifications_enabled', value: false });

  const past = new Date(Date.now() - 60_000);
  const [aTask] = await db
    .insert(tasks)
    .values({ userId: alice, title: 'muted reminder', status: 'active', remindAt: past })
    .returning({ id: tasks.id });
  const [bTask] = await db
    .insert(tasks)
    .values({ userId: bob, title: 'audible reminder', status: 'active', remindAt: past })
    .returning({ id: tasks.id });

  const sent = await sendReminders();
  assert.equal(sent, 1, 'only the unmuted account is notified');

  const aLogs = await db
    .select()
    .from(notificationLog)
    .where(eq(notificationLog.taskId, aTask.id));
  assert.equal(aLogs.length, 0, 'a muted account must not even claim a log row');

  const bLogs = await db
    .select()
    .from(notificationLog)
    .where(eq(notificationLog.taskId, bTask.id));
  assert.equal(bLogs.length, 1, 'the unmuted account’s reminder still fires');

  const [aAfter] = await db
    .select({ remindAt: tasks.remindAt })
    .from(tasks)
    .where(eq(tasks.id, aTask.id));
  assert.ok(aAfter.remindAt, 'a muted reminder is skipped, not consumed');
});

// What makes the switch produce no backfill: a remind_at that aged out while the
// switch was off is skipped forever, even once the account is unmuted again.
test('a reminder older than the send window never fires', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);
  await db.delete(settings).where(eq(settings.key, 'notifications_enabled'));

  const stale = new Date(Date.now() - 3 * 60 * 60 * 1000);
  await db
    .insert(tasks)
    .values({ userId: bob, title: 'aged out', status: 'active', remindAt: stale });

  assert.equal(await sendReminders(), 0, 'a stale remind_at is never sent');
});

// A deadline arriving is its own event: it must notify without consuming the
// reminder the user also set, and it must not re-notify on the next tick.
test('a due_at inside the window fires once and leaves remind_at alone', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);

  const justDue = new Date(Date.now() - 60_000);
  const laterReminder = new Date(Date.now() + 60 * 60 * 1000);
  const [task] = await db
    .insert(tasks)
    .values({
      userId: bob,
      title: 'deadline reached',
      status: 'active',
      dueAt: justDue,
      remindAt: laterReminder,
    })
    .returning({ id: tasks.id });

  assert.equal(await sendDueNotifications(), 1, 'a task due inside the window notifies');

  const logs = await db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.taskId, task.id), eq(notificationLog.kind, 'due')));
  assert.equal(logs.length, 1, "exactly one 'due' log row");
  assert.equal(logs[0].userId, bob, 'the log row is attributed to the owner');

  // Idempotency: a second tick must claim nothing, and the partial unique index
  // is what guarantees that even under concurrency.
  assert.equal(await sendDueNotifications(), 0, 'a second tick does not re-notify');

  const [after] = await db
    .select({ remindAt: tasks.remindAt })
    .from(tasks)
    .where(eq(tasks.id, task.id));
  assert.equal(
    after.remindAt?.getTime(),
    laterReminder.getTime(),
    'the due send must not consume remind_at',
  );
});

// The window is what stops the master switch from backfilling: a deadline that
// passed while notifications were off is never delivered late.
test('a due_at older than the window never fires', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);

  const stale = new Date(Date.now() - DUE_SEND_WINDOW_MS - 60_000);
  await db
    .insert(tasks)
    .values({ userId: bob, title: 'missed deadline', status: 'active', dueAt: stale });

  assert.equal(await sendDueNotifications(), 0, 'a due_at past the window is skipped forever');
});

test('a muted account gets no due notification', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);
  await db
    .insert(settings)
    .values({ userId: alice, key: 'notifications_enabled', value: false })
    .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value: false } });

  const justDue = new Date(Date.now() - 60_000);
  await db
    .insert(tasks)
    .values({ userId: alice, title: 'muted deadline', status: 'active', dueAt: justDue });
  await db
    .insert(tasks)
    .values({ userId: bob, title: 'audible deadline', status: 'active', dueAt: justDue });

  assert.equal(await sendDueNotifications(), 1, 'only the unmuted account is notified');
});

// The due claim is keyed on task_id alone, so without an explicit release the row
// written for the OLD deadline suppresses the new one forever. Rescheduling an
// overdue task is a first-class flow (the morning summary exists to prompt it),
// so this is the difference between the feature working and silently never firing
// again for any task the user has ever moved.
test('moving a due_at to a new deadline lets it notify again', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);

  const [task] = await db
    .insert(tasks)
    .values({
      userId: bob,
      title: 'rescheduled deadline',
      status: 'active',
      dueAt: new Date(Date.now() - 60_000),
    })
    .returning({ id: tasks.id });

  assert.equal(await sendDueNotifications(), 1, 'the original deadline notifies');
  assert.equal(await sendDueNotifications(), 0, 'and does not repeat');

  // The user moves the deadline — through the service the API and MCP both use.
  await updateTask(bob, task.id, { dueAt: new Date(Date.now() - 30_000).toISOString() });

  assert.equal(await sendDueNotifications(), 1, 'the NEW deadline notifies too');

  const rows = await db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.taskId, task.id), eq(notificationLog.kind, 'due')));
  assert.equal(rows.length, 1, 'the stale claim was released, not duplicated');
});

// The due push carries the same snooze actions as a reminder (sendPush sets
// categoryId 'reminder' for both), so snoozing a deadline notification is a
// first-class flow. Snooze does not move due_at, so it must not release the due
// claim — otherwise the every-minute cron re-sends the identical push, once per
// snooze, until the deadline ages out of the window.
test('snoozing does not re-arm the due notification', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);

  const [task] = await db
    .insert(tasks)
    .values({
      userId: bob,
      title: 'deadline then snoozed',
      status: 'active',
      dueAt: new Date(Date.now() - 60_000),
      remindAt: new Date(Date.now() - 60_000),
    })
    .returning({ id: tasks.id });

  assert.equal(await sendReminders(), 1, 'the reminder fires');
  assert.equal(await sendDueNotifications(), 1, 'the deadline fires too');

  await snoozeTask(bob, task.id, 10);

  assert.equal(await sendDueNotifications(), 0, 'the deadline must not fire a second time');

  // ...but the snooze must still work: the reminder claim IS released, so the
  // freshly-set remind_at can fire when it comes due.
  const kinds = await db
    .select({ kind: notificationLog.kind })
    .from(notificationLog)
    .where(eq(notificationLog.taskId, task.id));
  assert.deepEqual(
    kinds.map((k) => k.kind),
    ['due'],
    'the due claim survives, the reminder claim is cleared',
  );
});

// Rewriting the deadline must not resurrect a deadline that has already aged out
// — the release lifts the claim, the send window still decides.
test('moving a due_at outside the window still does not notify', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);

  const [task] = await db
    .insert(tasks)
    .values({
      userId: bob,
      title: 'moved into the distant past',
      status: 'active',
      dueAt: new Date(Date.now() - 60_000),
    })
    .returning({ id: tasks.id });

  assert.equal(await sendDueNotifications(), 1);
  await updateTask(bob, task.id, {
    dueAt: new Date(Date.now() - DUE_SEND_WINDOW_MS - 60_000).toISOString(),
  });

  assert.equal(await sendDueNotifications(), 0, 'an aged-out deadline stays silent');
});

// The repeat gate must read the same kinds repeatReminders itself reads. A 'due'
// row is a different delivery channel that job ignores, so counting it here would
// push the gate past the real eligibility instant and delay the repeat by the
// whole due_at - remind_at gap.
test('a due notification does not push back the repeat gate', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);
  await db.delete(settings).where(eq(settings.key, 'notifications_enabled'));

  const [task] = await db
    .insert(tasks)
    .values({ userId: bob, title: 'reminded then due', status: 'active' })
    .returning({ id: tasks.id });

  // Reminded two hours ago with a one-hour repeat interval (bob is configured
  // for repeats by the test above), so the repeat is already eligible...
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await db
    .insert(notificationLog)
    .values({ taskId: task.id, kind: 'initial', userId: bob, sentAt: twoHoursAgo });

  const { repeatClock } = await import('../services/reminder-clock');
  repeatClock.invalidate();
  assert.equal(await repeatClock.due(new Date()), true, 'the repeat is eligible before the due row');

  // ...and its deadline passing just now must not move that.
  await db.insert(notificationLog).values({ taskId: task.id, kind: 'due', userId: bob });
  repeatClock.invalidate();
  assert.equal(
    await repeatClock.due(new Date()),
    true,
    'a due row must not delay an already-eligible repeat',
  );
});

// What actually makes the due send idempotent under concurrency is the partial
// unique index (drizzle/0011), not the notExists prefilter — the prefilter is a
// cheap optimisation that two simultaneous ticks can both pass. The double-tick
// test above never reaches the claim, so it would stay green with the index
// dropped; this one hits the insert directly and would not.
test('notification_log_due_uniq refuses a second due claim for the same task', async () => {
  await db.delete(notificationLog);
  await db.delete(tasks);

  const [task] = await db
    .insert(tasks)
    .values({ userId: bob, title: 'contended deadline', status: 'active' })
    .returning({ id: tasks.id });

  const claim = () =>
    db
      .insert(notificationLog)
      .values({ taskId: task.id, kind: 'due', userId: bob })
      .onConflictDoNothing()
      .returning({ id: notificationLog.id });

  assert.equal((await claim()).length, 1, 'the first claim wins');
  assert.equal((await claim()).length, 0, 'the second claim is refused by the index');

  // Without onConflictDoNothing the same row must be rejected outright, which is
  // what proves a unique constraint is enforcing this rather than the app.
  await assert.rejects(
    db.insert(notificationLog).values({ taskId: task.id, kind: 'due', userId: bob }),
    'a duplicate due row must violate the unique index',
  );

  // 'repeat' rows are deliberately not covered by any unique index — repeats are
  // meant to recur — so this must NOT be rejected.
  await db.insert(notificationLog).values({ taskId: task.id, kind: 'repeat', userId: bob });
  await db.insert(notificationLog).values({ taskId: task.id, kind: 'repeat', userId: bob });
});

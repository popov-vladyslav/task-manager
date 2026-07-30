import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReminderClock } from './reminder-clock';

// Counts every query so the tests can assert the thing that actually matters:
// how often an idle tick reaches the database.
function fakePorts(nextAt: Date | null) {
  const state = { nextAt, calls: 0, fail: false };
  return {
    state,
    ports: {
      nextAt: async () => {
        state.calls += 1;
        if (state.fail) throw new Error('db unreachable');
        return state.nextAt;
      },
    },
  };
}

const T0 = new Date('2026-07-30T12:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const MINUTE = 60_000;

test('a reminder in the future is answered from memory, without re-querying', async () => {
  const { ports, state } = fakePorts(at(30 * MINUTE));
  const clock = new ReminderClock(ports);

  assert.equal(await clock.due(T0), false);
  assert.equal(state.calls, 1, 'the first tick after boot must sync');

  // The whole point: ten more ticks, still no work due, still one query.
  for (let i = 1; i <= 10; i++) {
    assert.equal(await clock.due(at(i * MINUTE)), false);
  }
  assert.equal(state.calls, 1, 'idle ticks must not touch the database');
});

test('nothing scheduled never fires and never re-queries', async () => {
  const { ports, state } = fakePorts(null);
  const clock = new ReminderClock(ports);

  for (let i = 0; i <= 10; i++) {
    assert.equal(await clock.due(at(i * MINUTE)), false);
  }
  assert.equal(state.calls, 1);
});

test('the tick on which the reminder comes due returns true', async () => {
  const { ports } = fakePorts(at(2 * MINUTE));
  const clock = new ReminderClock(ports);

  assert.equal(await clock.due(at(MINUTE)), false);
  assert.equal(await clock.due(at(2 * MINUTE)), true, 'due exactly at the fire time');
  assert.equal(await clock.due(at(3 * MINUTE)), true);
});

test('invalidate forces exactly one resync, picking up the new time', async () => {
  const { ports, state } = fakePorts(at(60 * MINUTE));
  const clock = new ReminderClock(ports);

  assert.equal(await clock.due(T0), false);
  assert.equal(state.calls, 1);

  // A task is snoozed to a minute from now: without invalidation the cache would
  // keep saying "nothing until 13:00" and the push would be an hour late.
  state.nextAt = at(MINUTE);
  clock.invalidate();

  assert.equal(await clock.due(at(MINUTE)), true);
  assert.equal(state.calls, 2, 'one extra query, not one per tick');

  await clock.due(at(2 * MINUTE));
  assert.equal(state.calls, 2, 'and it goes quiet again afterwards');
});

test('a stale cache resyncs after the max age, catching another process writes', async () => {
  const { ports, state } = fakePorts(null);
  const clock = new ReminderClock(ports, 60 * MINUTE);

  assert.equal(await clock.due(T0), false);
  assert.equal(state.calls, 1);

  // A task created by another process against the same database — this cache was
  // never told about it.
  state.nextAt = at(30 * MINUTE);

  assert.equal(await clock.due(at(59 * MINUTE)), false, 'still trusting the cache');
  assert.equal(state.calls, 1);

  assert.equal(await clock.due(at(60 * MINUTE)), true, 'forced resync finds the missed reminder');
  assert.equal(state.calls, 2);
});

test('a failed sync retries on the next tick instead of going quiet for an hour', async () => {
  const { ports, state } = fakePorts(at(-MINUTE));
  const clock = new ReminderClock(ports);
  state.fail = true;

  await assert.rejects(() => clock.due(T0), /db unreachable/);

  state.fail = false;
  assert.equal(await clock.due(at(MINUTE)), true, 'the overdue reminder is still found');
  assert.equal(state.calls, 2);
});

test('a write landing during a sync is not swallowed', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let calls = 0;
  const clock = new ReminderClock({
    nextAt: async () => {
      calls += 1;
      if (calls === 1) await gate; // hold the first query open
      return calls === 1 ? null : at(MINUTE);
    },
  });

  const inFlight = clock.due(T0);
  clock.invalidate(); // the task is created while the query is still running
  release();
  assert.equal(await inFlight, false);

  // The next tick must re-query rather than trust the result of a query that
  // started before the write.
  assert.equal(await clock.due(at(MINUTE)), true);
  assert.equal(calls, 2);
});

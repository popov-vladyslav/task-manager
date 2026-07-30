import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchReminders, type DispatchPorts } from './reminder-dispatch';

interface Task {
  id: string;
}

// Stands in for notification_log + the partial unique index from drizzle/0009:
// the first claim for a task id wins, every later one loses.
function fakePorts(opts: { failSend?: boolean } = {}) {
  const claimed = new Set<string>();
  const sends: string[] = [];
  const state = { failSend: opts.failSend ?? false };
  const ports: DispatchPorts<Task> = {
    claim: async (t) => {
      // `await` before the check, so two interleaved dispatches genuinely race
      // here rather than being serialised by the test's synchronous execution.
      await Promise.resolve();
      if (claimed.has(t.id)) return false;
      claimed.add(t.id);
      return true;
    },
    send: async (t) => {
      if (state.failSend) throw new Error('push failed');
      sends.push(t.id);
    },
    release: async (t) => {
      claimed.delete(t.id);
    },
  };
  return { ports, sends, claimed, state };
}

const TASK: Task = { id: 'task-1' };

test('dispatching the same due task twice sends exactly one notification', async () => {
  const { ports, sends } = fakePorts();

  const first = await dispatchReminders([TASK], ports);
  const second = await dispatchReminders([TASK], ports);

  assert.deepEqual(sends, ['task-1']);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0, 'the second run must not re-send');
});

test('two concurrent runs of the same due task send exactly one notification', async () => {
  const { ports, sends } = fakePorts();

  // The production failure mode: two processes entering the job at the same
  // instant, both seeing the task as un-notified.
  const [a, b] = await Promise.all([
    dispatchReminders([TASK], ports),
    dispatchReminders([TASK], ports),
  ]);

  assert.deepEqual(sends, ['task-1']);
  assert.equal(a.length + b.length, 1, 'exactly one of the two runs may send');
});

test('a failed send releases the claim so a later run retries', async () => {
  const { ports, sends, claimed, state } = fakePorts({ failSend: true });

  await assert.rejects(() => dispatchReminders([TASK], ports), /push failed/);
  assert.deepEqual(sends, [], 'nothing was delivered');
  assert.equal(claimed.size, 0, 'a failed send must not leave the claim behind');

  // Next tick, with push healthy again: the reminder is still delivered — the
  // claim-first ordering must not turn a transient failure into a lost reminder.
  state.failSend = false;
  const retry = await dispatchReminders([TASK], ports);

  assert.deepEqual(sends, ['task-1']);
  assert.equal(retry.length, 1);
});

test('distinct tasks are each notified once', async () => {
  const { ports, sends } = fakePorts();
  const due = [{ id: 'a' }, { id: 'b' }, { id: 'a' }];

  const sent = await dispatchReminders(due, ports);

  assert.deepEqual(sends, ['a', 'b']);
  assert.equal(sent.length, 2, 'a duplicate inside one batch is still sent once');
});

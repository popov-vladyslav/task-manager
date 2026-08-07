import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REMINDER_SEND_WINDOW_MS, reminderCutoff } from './reminder-window';

const NOW = new Date(2026, 6, 21, 12, 0, 0);
const agoMin = (m: number) => new Date(NOW.getTime() - m * 60_000);

test('cutoff is exactly the send window behind now', () => {
  assert.equal(reminderCutoff(NOW).getTime(), NOW.getTime() - REMINDER_SEND_WINDOW_MS);
});

test('a reminder one minute late is still sendable', () => {
  assert.ok(agoMin(1).getTime() >= reminderCutoff(NOW).getTime());
});

test('a reminder three hours late has aged out', () => {
  assert.ok(agoMin(180).getTime() < reminderCutoff(NOW).getTime());
});

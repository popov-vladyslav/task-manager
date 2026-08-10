import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MAX_SYNC_AGE_MS } from './reminder-clock';
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

// reminderClock takes the default sync age, so tightening this window below it
// would lose reminders written by another process — the same failure the due
// window guards against. Mirrors the assertion in due-window.test.ts.
test('the reminder clock resyncs faster than the send window, or a cross-process write is lost', () => {
  assert.ok(DEFAULT_MAX_SYNC_AGE_MS < REMINDER_SEND_WINDOW_MS);
});

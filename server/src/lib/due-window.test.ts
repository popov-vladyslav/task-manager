import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUE_CLOCK_MAX_SYNC_AGE_MS, DUE_SEND_WINDOW_MS, dueCutoff } from './due-window';

const NOW = new Date(2026, 6, 21, 12, 0, 0);
const agoMin = (m: number) => new Date(NOW.getTime() - m * 60_000);

test('cutoff is exactly the send window behind now', () => {
  assert.equal(dueCutoff(NOW).getTime(), NOW.getTime() - DUE_SEND_WINDOW_MS);
});

test('a due task one minute late is still sendable', () => {
  assert.ok(agoMin(1).getTime() >= dueCutoff(NOW).getTime());
});

test('a due task thirty minutes late has aged out', () => {
  assert.ok(agoMin(30).getTime() < dueCutoff(NOW).getTime());
});

// Tightening DUE_SEND_WINDOW_MS without lowering the sync age silently drops due pushes.
test('the due clock resyncs faster than the send window, or a cross-process write is lost', () => {
  assert.ok(DUE_CLOCK_MAX_SYNC_AGE_MS < DUE_SEND_WINDOW_MS);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTrackedLong, formatTrackedShort } from '@task-manager/shared';

// The formatters live in @task-manager/shared (the app renders them too); this is
// the workspace that has a test runner.

test('zero tracked time renders nothing at all — no "0m" placeholder', () => {
  assert.equal(formatTrackedShort(0), null);
  assert.equal(formatTrackedLong(0), null);
  assert.equal(formatTrackedShort(-5), null);
});

test('compact form for the task card', () => {
  assert.equal(formatTrackedShort(38), '38s');
  assert.equal(formatTrackedShort(60), '1m');
  assert.equal(formatTrackedShort(45 * 60), '45m');
  assert.equal(formatTrackedShort(80 * 60), '1h 20m');
  assert.equal(formatTrackedShort(2 * 3600), '2h'); // exact hours drop the minutes
  assert.equal(formatTrackedShort(3600 + 59), '1h'); // seconds never leak in
});

test('explicit form for the detail view', () => {
  assert.equal(formatTrackedLong(38), '38 sec');
  assert.equal(formatTrackedLong(45 * 60), '45 min');
  assert.equal(formatTrackedLong(80 * 60), '1 h 20 min');
  assert.equal(formatTrackedLong(2 * 3600), '2 h');
});

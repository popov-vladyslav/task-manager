import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DURATION_MIN, type Task } from '@task-manager/shared';
import { fmtDuration, fmtTask } from './mcp-task-format';

const BASE: Task = {
  id: 'task-1',
  title: 'PDP design sync',
  contextId: null,
  status: 'active',
  dueAt: '2026-07-31T09:00:00.000Z',
  remindAt: null,
  durationMin: 45,
  trackedSec: 0,
  sortGlobal: 0,
  sortContext: 0,
  recurrenceId: null,
  recurrenceRule: null,
  completedAt: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  createdVia: 'app',
  commentsCount: 0,
  photosCount: 0,
  nextInstance: null,
};

test('an explicit duration is reported as-is', () => {
  assert.equal(fmtDuration(BASE), 'duration_min=45');
  assert.match(fmtTask(BASE), /duration_min=45/);
});

test('the implicit default is reported, and marked as the default', () => {
  const t = { ...BASE, durationMin: null };
  assert.equal(fmtDuration(t), `duration_min=${DEFAULT_DURATION_MIN} (default)`);
  assert.match(fmtTask(t), /duration_min=30 \(default\)/);
});

test('an explicit 30 is not mislabelled as the default', () => {
  assert.equal(fmtDuration({ ...BASE, durationMin: 30 }), 'duration_min=30');
});

test('a task with no deadline has no block, so no duration is reported', () => {
  const t = { ...BASE, dueAt: null, durationMin: null };
  assert.equal(fmtDuration(t), null);
  assert.doesNotMatch(fmtTask(t), /duration_min/);
});

test('the rest of the line is unchanged', () => {
  const t: Task = {
    ...BASE,
    remindAt: '2026-07-31T08:30:00.000Z',
    recurrenceRule: 'daily',
    nextInstance: '2026-08-01',
    status: 'waiting',
    commentsCount: 2,
  };
  const line = fmtTask(t, 'Work');
  assert.match(line, /^• PDP design sync \[task-1\] \(Work\) due 2026-07-31 09:00 duration_min=45/);
  assert.match(line, /remind 2026-07-31 08:30/);
  assert.match(line, /repeats daily \(next 2026-08-01\)/);
  assert.match(line, /waiting/);
  assert.match(line, /2 comment\(s\)/);
});

test('tracked time appears when there is any, and is omitted at zero', () => {
  assert.doesNotMatch(fmtTask(BASE), /tracked=/);
  assert.match(fmtTask({ ...BASE, trackedSec: 80 * 60 }), /tracked=1h 20m/);
});

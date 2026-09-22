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
  recurrenceUntil: null,
  tracksCompletion: true,
  completedAt: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  createdVia: 'app',
  note: null,
  subtasks: [],
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

test('tracked time appears when there is any, and is omitted at zero', () => {
  assert.doesNotMatch(fmtTask(BASE), /tracked=/);
  assert.match(fmtTask({ ...BASE, trackedSec: 80 * 60 }), /tracked=1h 20m/);
});

test('a note renders as a continuation line, whitespace collapsed and clipped at 200', () => {
  const short = fmtTask({ ...BASE, note: 'Call the  bank\nbefore noon' });
  assert.equal(short.split('\n')[1], '    note: Call the bank before noon');
  const long = fmtTask({ ...BASE, note: 'x'.repeat(250) });
  assert.equal(long.split('\n')[1], `    note: ${'x'.repeat(200)}…`);
  assert.equal(fmtTask({ ...BASE, note: null }).includes('note:'), false);
});

test('subtasks render as checkbox lines with their ids, after the note', () => {
  const sub = (id: string, title: string, done: boolean) => ({
    id,
    taskId: BASE.id,
    title,
    done,
    sortOrder: 0,
    createdAt: BASE.createdAt,
  });
  const out = fmtTask({
    ...BASE,
    note: 'ctx',
    subtasks: [sub('s1', 'first', true), sub('s2', 'second', false)],
  });
  assert.deepEqual(out.split('\n').slice(1), [
    '    note: ctx',
    '    [x] first [s1]',
    '    [ ] second [s2]',
  ]);
  assert.equal(fmtTask(BASE).includes('['), true);
  assert.equal(fmtTask(BASE).split('\n').length, 1);
});

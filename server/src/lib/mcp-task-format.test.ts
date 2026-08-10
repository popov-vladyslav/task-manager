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

const comment = (body: string, createdAt = '2026-07-30T11:00:00.000Z') => ({ body, createdAt });

test('with no comments argument the task stays a single line', () => {
  const line = fmtTask(BASE);
  assert.equal(line.includes('\n'), false);
  assert.doesNotMatch(line, /↳/);
});

test('a comment renders as a continuation line dated by its createdAt', () => {
  const out = fmtTask(BASE, undefined, [comment('Waiting on the vendor')]);
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], '    ↳ 2026-07-30: Waiting on the vendor');
});

test('only the latest two comments are shown, still oldest-first', () => {
  const out = fmtTask(BASE, undefined, [
    comment('oldest', '2026-07-28T09:00:00.000Z'),
    comment('middle', '2026-07-29T09:00:00.000Z'),
    comment('newest', '2026-07-30T09:00:00.000Z'),
  ]);
  const lines = out.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '    ↳ 2026-07-29: middle');
  assert.equal(lines[2], '    ↳ 2026-07-30: newest');
  assert.doesNotMatch(out, /oldest/);
});

test('an over-long body is truncated to 200 chars plus an ellipsis', () => {
  const body = 'x'.repeat(300);
  const out = fmtTask(BASE, undefined, [comment(body)]);
  const shown = out.split('\n')[1].replace('    ↳ 2026-07-30: ', '');
  assert.equal(shown, `${'x'.repeat(200)}…`);
});

test('a body under the cap is left intact', () => {
  const body = 'y'.repeat(150);
  const out = fmtTask(BASE, undefined, [comment(body)]);
  assert.equal(out.split('\n')[1], `    ↳ 2026-07-30: ${body}`);
  assert.doesNotMatch(out, /…/);
});

test('newlines inside a body are collapsed so the preview stays one line', () => {
  const out = fmtTask(BASE, undefined, [comment('first line\nsecond line\n\nthird')]);
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], '    ↳ 2026-07-30: first line second line third');
});

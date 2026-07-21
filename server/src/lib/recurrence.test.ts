import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInstanceTimes, ruleMatchesToday } from './recurrence';

// Jul 20 2026 is a Monday; Jul 21 2026 a Tuesday.
const MONDAY = new Date(2026, 6, 20, 0, 0, 1);

test('dated recurring: due_at at default_due_time on the spawn day', () => {
  const { dueAt, remindAt } = computeInstanceTimes(
    { defaultDueTime: '09:00', remindTime: null, dueOffsetD: 0 },
    MONDAY,
  );
  assert.ok(dueAt);
  assert.equal(dueAt.getHours(), 9);
  assert.equal(dueAt.getMinutes(), 0);
  assert.equal(dueAt.getDate(), 20);
  assert.equal(remindAt, null);
});

test('dateless recurring: no due_at when default_due_time is null', () => {
  const { dueAt } = computeInstanceTimes(
    { defaultDueTime: null, remindTime: null, dueOffsetD: 0 },
    MONDAY,
  );
  assert.equal(dueAt, null);
});

test('remind_at is independent of the due date', () => {
  const { dueAt, remindAt } = computeInstanceTimes(
    { defaultDueTime: null, remindTime: '08:30', dueOffsetD: 0 },
    MONDAY,
  );
  assert.equal(dueAt, null);
  assert.ok(remindAt);
  assert.equal(remindAt.getHours(), 8);
  assert.equal(remindAt.getMinutes(), 30);
});

test('time columns may carry seconds (HH:MM:SS)', () => {
  const { dueAt } = computeInstanceTimes(
    { defaultDueTime: '07:15:00', remindTime: null, dueOffsetD: 0 },
    MONDAY,
  );
  assert.ok(dueAt);
  assert.equal(dueAt.getHours(), 7);
  assert.equal(dueAt.getMinutes(), 15);
});

test('ruleMatchesToday: period starts (daily / weekly:mon / monthly:1)', () => {
  const first = new Date(2026, 6, 1); // Jul 1 2026
  assert.equal(ruleMatchesToday('daily', MONDAY), true);
  assert.equal(ruleMatchesToday('weekly:mon', MONDAY), true);
  assert.equal(ruleMatchesToday('weekly:tue', MONDAY), false);
  assert.equal(ruleMatchesToday('monthly:1', first), true);
  assert.equal(ruleMatchesToday('monthly:1', MONDAY), false);
});

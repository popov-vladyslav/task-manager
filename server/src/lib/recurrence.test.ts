import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInstanceTimes,
  isValidRule,
  nextInstance,
  ruleFromSpec,
  ruleMatchesToday,
} from './recurrence';

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

test('ruleMatchesToday: multi-day weekly (weekly:mon,wed,fri)', () => {
  const WEDNESDAY = new Date(2026, 6, 22, 0, 0, 1); // Jul 22 2026
  assert.equal(ruleMatchesToday('weekly:mon,wed,fri', MONDAY), true);
  assert.equal(ruleMatchesToday('weekly:mon,wed,fri', WEDNESDAY), true);
  const TUESDAY = new Date(2026, 6, 21, 0, 0, 1);
  assert.equal(ruleMatchesToday('weekly:mon,wed,fri', TUESDAY), false);
});

test('nextInstance: multi-day weekly picks the nearest future day', () => {
  assert.equal(nextInstance('weekly:mon,wed,fri', MONDAY), '2026-07-22');
  assert.equal(nextInstance('weekly:mon', MONDAY), '2026-07-27');
});

test('ruleFromSpec: serializes structured recurrence to canonical rules', () => {
  assert.equal(ruleFromSpec({ freq: 'daily' }), 'daily');
  assert.equal(ruleFromSpec({ freq: 'monthly', dayOfMonth: 15 }), 'monthly:15');
  assert.equal(ruleFromSpec({ freq: 'monthly' }), 'monthly:1'); // default day
  // dedupes, lowercases, and sorts into week order (sun..sat)
  assert.equal(
    ruleFromSpec({ freq: 'weekly', days: ['fri', 'MON', 'wed', 'mon'] }),
    'weekly:mon,wed,fri',
  );
  // drops junk weekdays, keeps valid ones
  assert.equal(ruleFromSpec({ freq: 'weekly', days: ['tue', 'nope'] }), 'weekly:tue');
  assert.throws(() => ruleFromSpec({ freq: 'weekly', days: [] }));
  assert.throws(() => ruleFromSpec({ freq: 'weekly' }));
});

test('isValidRule: accepts canonical rules, rejects malformed ones', () => {
  // canonical
  assert.equal(isValidRule('daily'), true);
  assert.equal(isValidRule('weekly:mon'), true);
  assert.equal(isValidRule('weekly:mon,wed,fri'), true);
  assert.equal(isValidRule('monthly:1'), true);
  assert.equal(isValidRule('monthly:31'), true);
  // malformed
  assert.equal(isValidRule('weekly'), false); // no days
  assert.equal(isValidRule('weekly:'), false); // empty day list
  assert.equal(isValidRule('weekly:funday'), false); // junk weekday
  assert.equal(isValidRule('weekly:mon,nope'), false); // one bad weekday
  assert.equal(isValidRule('monthly:0'), false); // out of 1..31
  assert.equal(isValidRule('monthly:32'), false);
  assert.equal(isValidRule('monthly:abc'), false);
  assert.equal(isValidRule('yearly:1'), false); // unknown kind
  assert.equal(isValidRule(''), false);
});

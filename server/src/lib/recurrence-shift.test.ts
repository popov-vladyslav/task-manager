import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addLocalDays, shiftInstant, shiftRule, shiftTimeOfDay } from './recurrence-shift';

// 2026-10-05 is a Monday.
const base = { defaultDueTime: '09:00', remindTime: '08:30', dueOffsetD: 0 };
const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};

test('daily: only the time moves, the occurrence stays on its day', () => {
  const out = shiftRule({ ...base, rule: 'daily' }, '2026-10-05', at('2026-10-07', 14, 15));
  assert.equal(out.rule, 'daily');
  assert.equal(out.defaultDueTime, '14:15');
  assert.equal(out.matchDay, '2026-10-05');
  assert.deepEqual(out.dueAt, at('2026-10-05', 14, 15));
});

test('weekly: the dragged weekday is replaced, the others stay', () => {
  const out = shiftRule({ ...base, rule: 'weekly:mon,wed,fri' }, '2026-10-05', at('2026-10-08', 9));
  assert.equal(out.rule, 'weekly:wed,thu,fri');
  assert.equal(out.matchDay, '2026-10-08');
  assert.deepEqual(out.dueAt, at('2026-10-08', 9));
});

test('weekly: dropping onto a weekday already in the set collapses it', () => {
  const out = shiftRule({ ...base, rule: 'weekly:mon,wed' }, '2026-10-05', at('2026-10-07', 9));
  assert.equal(out.rule, 'weekly:wed');
});

test('weekly: same day, new time keeps the rule string', () => {
  const out = shiftRule({ ...base, rule: 'weekly:mon' }, '2026-10-05', at('2026-10-05', 18));
  assert.equal(out.rule, 'weekly:mon');
  assert.equal(out.defaultDueTime, '18:00');
});

test('weekly: a match day the rule does not cover is a programming error', () => {
  assert.throws(() =>
    shiftRule({ ...base, rule: 'weekly:tue' }, '2026-10-05', at('2026-10-06', 9)),
  );
});

test('monthly: the day of month follows the drop', () => {
  const out = shiftRule({ ...base, rule: 'monthly:5' }, '2026-10-05', at('2026-10-12', 9));
  assert.equal(out.rule, 'monthly:12');
  assert.equal(out.matchDay, '2026-10-12');
});

test('due_offset_d: the rule matches the drop day minus the offset', () => {
  const out = shiftRule(
    { ...base, rule: 'weekly:mon', dueOffsetD: 2 },
    '2026-10-05',
    at('2026-10-08', 9),
  );
  assert.equal(out.rule, 'weekly:tue');
  assert.equal(out.matchDay, '2026-10-06');
});

test('daily with an offset stays on match day + offset', () => {
  const out = shiftRule(
    { ...base, rule: 'daily', dueOffsetD: 1 },
    '2026-10-05',
    at('2026-10-09', 11),
  );
  assert.deepEqual(out.dueAt, at('2026-10-06', 11));
});

test('the reminder keeps its distance from the deadline', () => {
  const out = shiftRule({ ...base, rule: 'daily' }, '2026-10-05', at('2026-10-05', 12));
  assert.equal(out.remindTime, '11:30');
});

test('a reminder cannot leave the day', () => {
  assert.equal(shiftTimeOfDay('00:10', '01:00', '00:20'), '00:00');
  assert.equal(shiftTimeOfDay('23:00', '12:00', '23:30'), '23:59');
});

test('no reminder, or no old deadline to measure from, leaves it alone', () => {
  assert.equal(shiftTimeOfDay(null, '09:00', '10:00'), null);
  assert.equal(shiftTimeOfDay('08:00', null, '10:00'), '08:00');
  assert.equal(shiftInstant(null, at('2026-10-05', 9), at('2026-10-05', 10)), null);
});

test('an instant reminder moves by the same delta, across days too', () => {
  const out = shiftInstant(at('2026-10-05', 8, 30), at('2026-10-05', 9), at('2026-10-07', 15));
  assert.deepEqual(out, at('2026-10-07', 14, 30));
});

test('addLocalDays crosses month ends and the DST change', () => {
  assert.equal(addLocalDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addLocalDays('2026-10-25', 1), '2026-10-26');
  assert.equal(addLocalDays('2026-03-01', -1), '2026-02-28');
});

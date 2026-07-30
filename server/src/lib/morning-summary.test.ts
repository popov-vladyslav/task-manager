import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketOverdue, startOfLocalDay, summaryPushBody } from './morning-summary';

// Thu Jul 30 2026, 07:30 local — the hour the morning push fires.
const NOW = new Date(2026, 6, 30, 7, 30);
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).toISOString();

const t = (id: string, dueAt: string | null) => ({ id, dueAt });

test('yesterday vs older split', () => {
  const b = bucketOverdue(
    [
      t('yest-morning', at(2026, 6, 29, 9)),
      t('yest-late', at(2026, 6, 29, 23)),
      t('two-days', at(2026, 6, 28, 9)),
      t('last-month', at(2026, 5, 2, 9)),
    ],
    NOW,
  );
  assert.deepEqual(
    b.yesterday.map((x) => x.id),
    ['yest-morning', 'yest-late'],
  );
  assert.deepEqual(
    b.older.map((x) => x.id),
    ['two-days', 'last-month'],
  );
});

test("today's and future tasks are not overdue, and neither is a dateless task", () => {
  const b = bucketOverdue(
    [
      t('today-early', at(2026, 6, 30, 0)),
      t('today-later', at(2026, 6, 30, 18)),
      t('tomorrow', at(2026, 6, 31, 9)),
      t('dateless', null),
    ],
    NOW,
  );
  assert.deepEqual(b.yesterday, []);
  assert.deepEqual(b.older, []);
});

test('a task due exactly at midnight belongs to that day', () => {
  const b = bucketOverdue([t('midnight-yest', at(2026, 6, 29, 0))], NOW);
  assert.deepEqual(
    b.yesterday.map((x) => x.id),
    ['midnight-yest'],
  );
});

test('unparseable due dates are skipped rather than throwing', () => {
  const b = bucketOverdue([t('junk', 'not-a-date')], NOW);
  assert.deepEqual(b.yesterday, []);
  assert.deepEqual(b.older, []);
});

test('push body counts, with correct pluralisation', () => {
  assert.equal(
    summaryPushBody({ yesterday: 1, older: 0 }),
    'You have 1 overdue task from yesterday.',
  );
  assert.equal(
    summaryPushBody({ yesterday: 3, older: 0 }),
    'You have 3 overdue tasks from yesterday.',
  );
  assert.equal(summaryPushBody({ yesterday: 0, older: 4 }), 'You have 4 older overdue tasks.');
  assert.equal(
    summaryPushBody({ yesterday: 2, older: 5 }),
    'You have 7 overdue tasks — 2 from yesterday.',
  );
});

test('startOfLocalDay strips the time', () => {
  const s = startOfLocalDay(NOW);
  assert.equal(s.getHours(), 0);
  assert.equal(s.getDate(), 30);
});

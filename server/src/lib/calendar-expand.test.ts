import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DURATION_MIN } from '@task-manager/shared';
import { expandGhosts, occurrenceKey, type ExpandRule } from './calendar-expand';

// Fixed frame of reference for every case: "today" is Mon 2026-07-20.
const NOW = new Date(2026, 6, 20, 10, 0);
const day = (d: number, h = 0, m = 0) => new Date(2026, 6, d, h, m);

const DAILY: ExpandRule = {
  id: 'rule-daily',
  title: 'Ранкова зарядка',
  contextId: 3,
  rule: 'daily',
  defaultDueTime: '09:00',
  dueOffsetD: 0,
  durationMin: 30,
  lastSpawned: '2026-07-20', // already spawned today
  until: null,
  active: true,
};

const window = (fromDay: number, toDay: number) => [day(fromDay), day(toDay, 23, 59)] as const;

// Same as expandGhosts with no overrides and "today" fixed at NOW.
function ghosts(rules: ExpandRule[], from: Date, to: Date, taken?: Set<string>) {
  return expandGhosts(rules, [], from, to, NOW, taken);
}

test('a daily rule fills every day after the last spawn', () => {
  const [from, to] = window(20, 24);
  const out = ghosts([DAILY], from, to);

  assert.deepEqual(
    out.map((g) => g.occursOn),
    ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24'],
    'today is already a real task, so the ghosts start tomorrow',
  );
  assert.equal(out[0].start.getHours(), 9);
  assert.equal(out[0].end.getTime() - out[0].start.getTime(), 30 * 60_000);
  assert.equal(out[0].title, 'Ранкова зарядка');
  assert.equal(out[0].contextId, 3);
});

test('a weekly rule only lands on its weekdays', () => {
  // Jul 2026: 20th is a Monday, so Wed = 22/29, Fri = 24/31.
  const weekly: ExpandRule = { ...DAILY, rule: 'weekly:wed,fri' };
  const [from, to] = window(20, 31);

  assert.deepEqual(
    ghosts([weekly], from, to).map((g) => g.occursOn),
    ['2026-07-22', '2026-07-24', '2026-07-29', '2026-07-31'],
  );
});

test('a monthly rule lands on its day of month', () => {
  const monthly: ExpandRule = { ...DAILY, rule: 'monthly:25' };

  assert.deepEqual(
    ghosts([monthly], day(1), day(31, 23, 59)).map((g) => g.occursOn),
    ['2026-07-25'],
  );
});

test('due_offset_d moves the block off the day the rule matched', () => {
  const offset: ExpandRule = { ...DAILY, rule: 'weekly:wed', dueOffsetD: 2 };
  const [from, to] = window(20, 26);

  const [ghost] = ghosts([offset], from, to);
  assert.equal(ghost.occursOn, '2026-07-22', 'the rule matched Wednesday');
  assert.equal(ghost.start.getDate(), 24, 'but the block sits two days later');
});

test('a block pulled into the window by due_offset_d is still found', () => {
  // Matches Sat the 25th, offset +3 → the block lands Tue the 28th, inside a
  // window that does not contain the match day at all.
  const offset: ExpandRule = { ...DAILY, rule: 'weekly:sat', dueOffsetD: 3 };

  const [ghost] = ghosts([offset], day(27), day(29, 23, 59));
  assert.ok(ghost, 'scanning must look back by the offset');
  assert.equal(ghost.start.getDate(), 28);
});

test('nothing is projected for the past, or for the day already spawned', () => {
  const [from, to] = window(10, 20);

  assert.deepEqual(ghosts([DAILY], from, to), [], 'no ghosts before today');
});

test('a rule that has not spawned today still gets no ghost when a real task covers it', () => {
  // A rule created today: last_spawned is null, but createTask already made the
  // real occurrence — without the `taken` set this day would be drawn twice.
  const fresh: ExpandRule = { ...DAILY, lastSpawned: null };
  const [from, to] = window(20, 21);

  const withReal = ghosts([fresh], from, to, new Set([occurrenceKey(fresh.id, '2026-07-20')]));
  assert.deepEqual(
    withReal.map((g) => g.occursOn),
    ['2026-07-21'],
  );

  // Without a real task for today (the spawner has not run yet), today is fair
  // game — the block is genuinely missing from the calendar otherwise.
  const withoutReal = ghosts([fresh], from, to);
  assert.deepEqual(
    withoutReal.map((g) => g.occursOn),
    ['2026-07-20', '2026-07-21'],
  );
});

test('until is inclusive and stops the projection', () => {
  const ending: ExpandRule = { ...DAILY, until: '2026-07-22' };
  const [from, to] = window(20, 26);

  assert.deepEqual(
    ghosts([ending], from, to).map((g) => g.occursOn),
    ['2026-07-21', '2026-07-22'],
  );
});

test('an inactive rule projects nothing', () => {
  const [from, to] = window(20, 26);
  assert.deepEqual(ghosts([{ ...DAILY, active: false }], from, to), []);
});

test('a rule with no default_due_time has no block to project', () => {
  const [from, to] = window(20, 26);
  assert.deepEqual(ghosts([{ ...DAILY, defaultDueTime: null }], from, to), []);
});

test('a rule with no duration falls back to the default block length', () => {
  const [from, to] = window(20, 21);
  const [ghost] = ghosts([{ ...DAILY, durationMin: null }], from, to);

  assert.equal(ghost.end.getTime() - ghost.start.getTime(), DEFAULT_DURATION_MIN * 60_000);
});

test('an override replaces that day’s block, and only that day’s', () => {
  const [from, to] = window(20, 23);
  const moved = day(22, 16, 30);

  const out = expandGhosts(
    [DAILY],
    [{ ruleId: DAILY.id, occursOn: '2026-07-22', dueAt: moved }],
    from,
    to,
    NOW,
  );

  const overridden = out.find((g) => g.occursOn === '2026-07-22');
  assert.equal(overridden?.start.getTime(), moved.getTime());
  assert.equal(overridden?.end.getTime() - overridden.start.getTime(), 30 * 60_000);
  assert.equal(
    out.find((g) => g.occursOn === '2026-07-21')?.start.getHours(),
    9,
    'other days keep the rule’s own time',
  );
});

test('an override that clears the deadline removes that day’s ghost', () => {
  const [from, to] = window(20, 23);

  const out = expandGhosts(
    [DAILY],
    [{ ruleId: DAILY.id, occursOn: '2026-07-22', dueAt: null }],
    from,
    to,
    NOW,
  );

  assert.ok(!out.some((g) => g.occursOn === '2026-07-22'));
  assert.equal(out.length, 2, 'the 21st and 23rd are untouched');
});

test('an override belonging to another rule is ignored', () => {
  const [from, to] = window(20, 21);

  const [ghost] = expandGhosts(
    [DAILY],
    [{ ruleId: 'someone-elses-rule', occursOn: '2026-07-21', dueAt: day(21, 16, 0) }],
    from,
    to,
    NOW,
  );

  assert.equal(ghost.start.getHours(), 9);
});

test('a move out of the window drops the ghost from it', () => {
  const [from, to] = window(20, 21);

  const out = expandGhosts(
    [DAILY],
    [{ ruleId: DAILY.id, occursOn: '2026-07-21', dueAt: day(30, 9, 0) }],
    from,
    to,
    NOW,
  );

  assert.deepEqual(out, [], 'the 21st moved to the 30th, which is outside');
});

test('a move into the window from a match day outside it is still drawn', () => {
  const weekly: ExpandRule = { ...DAILY, id: 'rule-weekly', rule: 'weekly:fri' };
  const [from, to] = window(27, 31);

  const out = expandGhosts(
    [weekly],
    [{ ruleId: weekly.id, occursOn: '2026-07-24', dueAt: day(28, 14, 0) }],
    from,
    to,
    NOW,
  );

  assert.deepEqual(
    out.map((g) => [g.occursOn, g.start]),
    [
      ['2026-07-24', day(28, 14, 0)],
      ['2026-07-31', day(31, 9, 0)],
    ],
    'Friday the 24th now sits on Tuesday the 28th, next to the 31st’s own block',
  );
});

test('an override from outside the window still obeys the rule’s limits', () => {
  const [from, to] = window(27, 31);
  const moved = (rule: ExpandRule, occursOn: string, taken?: Set<string>) =>
    expandGhosts(
      [rule],
      [{ ruleId: rule.id, occursOn, dueAt: day(28, 14, 0) }],
      from,
      to,
      NOW,
      taken,
    ).filter((g) => g.occursOn === occursOn);

  const weekly: ExpandRule = { ...DAILY, id: 'rule-weekly', rule: 'weekly:fri' };
  assert.equal(moved(weekly, '2026-07-23').length, 0, 'a Thursday is not a match day');
  assert.equal(moved({ ...weekly, until: '2026-07-22' }, '2026-07-24').length, 0, 'past until');
  assert.equal(moved({ ...weekly, lastSpawned: '2026-07-24' }, '2026-07-24').length, 0, 'spawned');
  assert.equal(moved(weekly, '2026-07-17').length, 0, 'before today');
  assert.equal(
    moved(weekly, '2026-07-24', new Set(['rule-weekly@2026-07-24'])).length,
    0,
    'a real occurrence already covers it',
  );
  assert.equal(moved(weekly, '2026-07-24').length, 1);
});

test('an override inside the window is not drawn twice', () => {
  const [from, to] = window(20, 26);
  const out = expandGhosts(
    [DAILY],
    [{ ruleId: DAILY.id, occursOn: '2026-07-22', dueAt: day(22, 15, 0) }],
    from,
    to,
    NOW,
  );

  assert.equal(out.filter((g) => g.occursOn === '2026-07-22').length, 1);
});

test('ghosts come back in chronological order across rules', () => {
  const evening: ExpandRule = { ...DAILY, id: 'rule-evening', defaultDueTime: '19:00' };
  const [from, to] = window(20, 22);

  const out = ghosts([evening, DAILY], from, to);
  const order = out.map((g) => `${g.occursOn} ${g.start.getHours()}`);

  assert.deepEqual(order, ['2026-07-21 9', '2026-07-21 19', '2026-07-22 9', '2026-07-22 19']);
});

test('{month} in a title expands to the projected day’s month', () => {
  const monthly: ExpandRule = {
    ...DAILY,
    rule: 'monthly:5',
    title: 'Іпотека — {month}',
    lastSpawned: '2026-07-05',
  };

  // A window in August, projected from a July "today": the title must name the
  // month the ghost lands in, not the current one.
  const [ghost] = expandGhosts([monthly], [], new Date(2026, 7, 1), new Date(2026, 7, 31), NOW);

  assert.equal(ghost.occursOn, '2026-08-05');
  assert.match(ghost.title, /серп/, 'August, not July');
});

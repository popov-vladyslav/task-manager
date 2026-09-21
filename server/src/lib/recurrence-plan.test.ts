import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DURATION_MIN } from '@task-manager/shared';
import {
  localDateStr,
  planRecurringSpawn,
  type OpenOccurrence,
  type PlanRule,
} from './recurrence-plan';

const DAILY: PlanRule = {
  id: 'rule-daily',
  userId: 'user-1',
  title: 'Молитва, читання',
  contextId: 3,
  rule: 'daily',
  defaultDueTime: null,
  remindTime: null,
  dueOffsetD: 0,
  lastSpawned: null,
  until: null,
  tracksCompletion: true,
  durationMin: null,
};

// Applies a plan the way services/recurring.ts does, against in-memory state:
// close out the superseded occurrences, insert the new one, stamp last_spawned.
function runDay(rules: PlanRule[], open: OpenOccurrence[], now: Date) {
  const missed: string[] = [];
  for (const plan of planRecurringSpawn(rules, open, now)) {
    for (const id of plan.staleOccurrenceIds) {
      const i = open.findIndex((o) => o.id === id);
      if (i >= 0) open.splice(i, 1);
      missed.push(id);
    }
    open.push({ id: `${plan.ruleId}@${plan.today}`, recurrenceId: plan.ruleId, dueAt: null });
    const rule = rules.find((r) => r.id === plan.ruleId);
    if (rule) rule.lastSpawned = plan.today;
  }
  return missed;
}

test('a week of never-completed occurrences leaves exactly one active', () => {
  const rules = [{ ...DAILY }];
  const open: OpenOccurrence[] = [];
  const allMissed: string[] = [];

  for (let day = 20; day <= 26; day++) {
    allMissed.push(...runDay(rules, open, new Date(2026, 6, day, 0, 0, 1)));
  }

  assert.equal(open.length, 1, 'only the current occurrence stays active');
  assert.equal(open[0].id, 'rule-daily@2026-07-26', 'and it is the newest one');
  assert.equal(allMissed.length, 6, 'the six earlier ones were closed out as missed');
});

test('same day twice: idempotent, and it does not miss what it just spawned', () => {
  const rules = [{ ...DAILY }];
  const open: OpenOccurrence[] = [];
  const day = new Date(2026, 6, 20, 0, 0, 1);

  runDay(rules, open, day);
  const secondPass = planRecurringSpawn(rules, open, day);

  assert.equal(secondPass.length, 0, 'a rule that already spawned today does nothing');
  assert.equal(open.length, 1);
});

test('a completed occurrence is simply absent — nothing to close out', () => {
  const rules = [{ ...DAILY, lastSpawned: '2026-07-20' }];
  // Yesterday's occurrence was completed, so it is not in the open set.
  const open: OpenOccurrence[] = [];
  const [plan] = planRecurringSpawn(rules, open, new Date(2026, 6, 21, 0, 0, 1));

  assert.ok(plan);
  assert.deepEqual(plan.staleOccurrenceIds, []);
});

test('cleanup is scoped to the same rule — other rules and one-off tasks are untouched', () => {
  const other: PlanRule = {
    ...DAILY,
    id: 'rule-other',
    title: 'Стендап',
    lastSpawned: '2026-07-21',
  };
  const rules = [{ ...DAILY, lastSpawned: '2026-07-20' }, other];
  const open: OpenOccurrence[] = [
    { id: 'daily-yesterday', recurrenceId: 'rule-daily', dueAt: null },
    { id: 'other-today', recurrenceId: 'rule-other', dueAt: null },
  ];

  const plans = planRecurringSpawn(rules, open, new Date(2026, 6, 21, 0, 0, 1));

  assert.equal(plans.length, 1, 'only the rule that spawns is planned');
  assert.equal(plans[0].ruleId, 'rule-daily');
  assert.deepEqual(plans[0].staleOccurrenceIds, ['daily-yesterday']);
  // One-off tasks carry no recurrence_id and never reach the planner; the other
  // rule's current occurrence is not touched either.
});

test('weekly rule only spawns (and only cleans up) on its weekday', () => {
  const weekly: PlanRule = {
    ...DAILY,
    id: 'rule-weekly',
    rule: 'weekly:mon',
    lastSpawned: '2026-07-13',
  };
  const open: OpenOccurrence[] = [{ id: 'last-monday', recurrenceId: 'rule-weekly', dueAt: null }];

  // Jul 21 2026 is a Tuesday: no spawn, so last Monday's occurrence stays open.
  assert.deepEqual(planRecurringSpawn([{ ...weekly }], open, new Date(2026, 6, 21)), []);

  // Jul 20 2026 is a Monday: spawns, and supersedes the previous occurrence.
  const [plan] = planRecurringSpawn([{ ...weekly }], open, new Date(2026, 6, 20));
  assert.ok(plan);
  assert.deepEqual(plan.staleOccurrenceIds, ['last-monday']);
});

test('until is inclusive: the rule spawns on its last day and never after', () => {
  const ending: PlanRule = { ...DAILY, until: '2026-07-21', lastSpawned: '2026-07-20' };

  const [onLastDay] = planRecurringSpawn([{ ...ending }], [], new Date(2026, 6, 21, 0, 0, 1));
  assert.ok(onLastDay, 'the end date itself still spawns');

  assert.deepEqual(
    planRecurringSpawn([{ ...ending, lastSpawned: '2026-07-21' }], [], new Date(2026, 6, 22)),
    [],
    'the day after until spawns nothing',
  );
});

test('an expired rule leaves its last occurrence open rather than closing it', () => {
  const expired: PlanRule = { ...DAILY, until: '2026-07-20', lastSpawned: '2026-07-20' };
  const open: OpenOccurrence[] = [{ id: 'final', recurrenceId: 'rule-daily', dueAt: null }];

  assert.deepEqual(planRecurringSpawn([expired], open, new Date(2026, 6, 25)), []);
  assert.equal(open.length, 1, 'the last occurrence is still there to be completed');
});

test('an untracked rule closes its stale occurrences as skipped', () => {
  const routine: PlanRule = { ...DAILY, tracksCompletion: false, lastSpawned: '2026-07-20' };
  const open: OpenOccurrence[] = [{ id: 'yesterday', recurrenceId: 'rule-daily', dueAt: null }];

  const [plan] = planRecurringSpawn([routine], open, new Date(2026, 6, 21, 0, 0, 1));

  assert.equal(plan.staleStatus, 'skipped');
  assert.deepEqual(plan.staleOccurrenceIds, ['yesterday']);
});

test('a tracked rule still closes them as missed', () => {
  const [plan] = planRecurringSpawn(
    [{ ...DAILY, lastSpawned: '2026-07-20' }],
    [{ id: 'yesterday', recurrenceId: 'rule-daily', dueAt: null }],
    new Date(2026, 6, 21, 0, 0, 1),
  );

  assert.equal(plan.staleStatus, 'missed');
});

test('an occurrence moved to today or later outlives the spawn; a past one does not', () => {
  const now = new Date(2026, 6, 21, 0, 0, 1);
  const open: OpenOccurrence[] = [
    { id: 'moved-to-tomorrow', recurrenceId: 'rule-daily', dueAt: new Date(2026, 6, 22, 10) },
    { id: 'moved-to-later-today', recurrenceId: 'rule-daily', dueAt: new Date(2026, 6, 21, 18) },
    { id: 'due-yesterday', recurrenceId: 'rule-daily', dueAt: new Date(2026, 6, 20, 23, 59) },
    { id: 'dateless', recurrenceId: 'rule-daily', dueAt: null },
  ];

  const [plan] = planRecurringSpawn([{ ...DAILY, lastSpawned: '2026-07-20' }], open, now);

  assert.deepEqual(plan.staleOccurrenceIds, ['due-yesterday', 'dateless']);
});

test('a moved occurrence is closed by the first spawn after its own day', () => {
  const open: OpenOccurrence[] = [
    { id: 'moved', recurrenceId: 'rule-daily', dueAt: new Date(2026, 6, 22, 10) },
  ];
  const rule = { ...DAILY, lastSpawned: '2026-07-21' };

  const [onItsDay] = planRecurringSpawn([{ ...rule }], open, new Date(2026, 6, 22, 0, 0, 1));
  assert.deepEqual(onItsDay.staleOccurrenceIds, []);

  const [dayAfter] = planRecurringSpawn(
    [{ ...rule, lastSpawned: '2026-07-22' }],
    open,
    new Date(2026, 6, 23, 0, 0, 1),
  );
  assert.deepEqual(dayAfter.staleOccurrenceIds, ['moved']);
});

test('the rule’s duration rides along, but only onto a dated occurrence', () => {
  const dated: PlanRule = { ...DAILY, defaultDueTime: '09:00', durationMin: 45 };
  const [withDeadline] = planRecurringSpawn([dated], [], new Date(2026, 6, 21, 0, 0, 1));
  assert.equal(withDeadline.durationMin, 45);

  // No default_due_time → a dateless occurrence, which carries no block length.
  const [dateless] = planRecurringSpawn(
    [{ ...DAILY, durationMin: 45 }],
    [],
    new Date(2026, 6, 21, 0, 0, 1),
  );
  assert.equal(dateless.dueAt, null);
  assert.equal(dateless.durationMin, null);

  // Dated rule with no duration of its own falls back to the default block.
  const [fallback] = planRecurringSpawn(
    [{ ...DAILY, defaultDueTime: '09:00' }],
    [],
    new Date(2026, 6, 21, 0, 0, 1),
  );
  assert.equal(fallback.durationMin, DEFAULT_DURATION_MIN);
});

test('today’s override moves the spawned occurrence, reminder and all', () => {
  const dated: PlanRule = { ...DAILY, defaultDueTime: '09:00', remindTime: '08:30' };
  const movedDue = new Date(2026, 6, 21, 16, 0);
  const movedRemind = new Date(2026, 6, 21, 15, 30);

  const [plan] = planRecurringSpawn([dated], [], new Date(2026, 6, 21, 0, 0, 1), [
    { ruleId: 'rule-daily', occursOn: '2026-07-21', dueAt: movedDue, remindAt: movedRemind },
  ]);

  assert.equal(plan.dueAt?.getTime(), movedDue.getTime());
  assert.equal(plan.remindAt?.getTime(), movedRemind.getTime());
});

test('an override with no due time means the day was already created elsewhere', () => {
  const timed: PlanRule = { ...DAILY, defaultDueTime: '09:00', lastSpawned: '2026-07-20' };
  const plans = planRecurringSpawn([timed], [], new Date(2026, 6, 21, 0, 0, 1), [
    { ruleId: 'rule-daily', occursOn: '2026-07-21', dueAt: null, remindAt: null },
  ]);

  assert.deepEqual(plans, []);
});

test('an override for another day, or another rule, is ignored', () => {
  const dated: PlanRule = { ...DAILY, defaultDueTime: '09:00' };
  const otherDay = new Date(2026, 6, 25, 16, 0);

  const [plan] = planRecurringSpawn([dated], [], new Date(2026, 6, 21, 0, 0, 1), [
    { ruleId: 'rule-daily', occursOn: '2026-07-25', dueAt: otherDay, remindAt: null },
    { ruleId: 'rule-other', occursOn: '2026-07-21', dueAt: otherDay, remindAt: null },
  ]);

  assert.equal(plan.dueAt?.getHours(), 9, 'the rule’s own time is used');
});

test('localDateStr formats the local calendar day', () => {
  assert.equal(localDateStr(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

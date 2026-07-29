import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDateStr,
  planRecurringSpawn,
  type OpenOccurrence,
  type PlanRule,
} from './recurrence-plan';

const DAILY: PlanRule = {
  id: 'rule-daily',
  title: 'Молитва, читання',
  contextId: 3,
  rule: 'daily',
  defaultDueTime: null,
  remindTime: null,
  dueOffsetD: 0,
  lastSpawned: null,
};

// Applies a plan the way services/recurring.ts does, against in-memory state:
// close out the superseded occurrences, insert the new one, stamp last_spawned.
function runDay(rules: PlanRule[], open: OpenOccurrence[], now: Date) {
  const missed: string[] = [];
  for (const plan of planRecurringSpawn(rules, open, now)) {
    for (const id of plan.missedOccurrenceIds) {
      const i = open.findIndex((o) => o.id === id);
      if (i >= 0) open.splice(i, 1);
      missed.push(id);
    }
    open.push({ id: `${plan.ruleId}@${plan.today}`, recurrenceId: plan.ruleId });
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
  assert.deepEqual(plan.missedOccurrenceIds, []);
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
    { id: 'daily-yesterday', recurrenceId: 'rule-daily' },
    { id: 'other-today', recurrenceId: 'rule-other' },
  ];

  const plans = planRecurringSpawn(rules, open, new Date(2026, 6, 21, 0, 0, 1));

  assert.equal(plans.length, 1, 'only the rule that spawns is planned');
  assert.equal(plans[0].ruleId, 'rule-daily');
  assert.deepEqual(plans[0].missedOccurrenceIds, ['daily-yesterday']);
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
  const open: OpenOccurrence[] = [{ id: 'last-monday', recurrenceId: 'rule-weekly' }];

  // Jul 21 2026 is a Tuesday: no spawn, so last Monday's occurrence stays open.
  assert.deepEqual(planRecurringSpawn([{ ...weekly }], open, new Date(2026, 6, 21)), []);

  // Jul 20 2026 is a Monday: spawns, and supersedes the previous occurrence.
  const [plan] = planRecurringSpawn([{ ...weekly }], open, new Date(2026, 6, 20));
  assert.ok(plan);
  assert.deepEqual(plan.missedOccurrenceIds, ['last-monday']);
});

test('localDateStr formats the local calendar day', () => {
  assert.equal(localDateStr(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeNotificationTitle, nearestEmoji, relativeTime } from './notification-title';

const NOW = new Date(2026, 6, 21, 12, 0, 0);
const inMin = (m: number) => new Date(NOW.getTime() + m * 60_000);

// App context colors → expected emoji (matches CR02 examples).
const BLUE = '#5B8DEF'; // Zoolatech
const AMBER = '#E8A33D'; // Zalando
const GREEN = '#6BBF59'; // Home

test('nearest emoji maps the app palette intuitively', () => {
  assert.equal(nearestEmoji(BLUE), '🔵');
  assert.equal(nearestEmoji(AMBER), '🟠');
  assert.equal(nearestEmoji(GREEN), '🟢');
  assert.equal(nearestEmoji(null), null);
  assert.equal(nearestEmoji('not-a-color'), null);
});

test('relative-time buckets', () => {
  assert.equal(relativeTime(inMin(0), NOW), 'now');
  assert.equal(relativeTime(inMin(4), NOW), 'now'); // within +5
  assert.equal(relativeTime(inMin(-4), NOW), 'now'); // within -5
  assert.equal(relativeTime(inMin(15), NOW), 'in 15 min');
  assert.equal(relativeTime(inMin(45), NOW), 'in 45 min');
  assert.equal(relativeTime(inMin(120), NOW), 'in 2 h');
  assert.equal(relativeTime(inMin(300), NOW), 'in 5 h');
  assert.equal(relativeTime(inMin(2 * 1440), NOW), 'in 2 d');
  assert.equal(relativeTime(inMin(-60), NOW), 'overdue');
});

// ---- 4×2 matrix (context y/n × due y/n × kind reminder/spawn) ----

test('reminder · context yes · due yes', () => {
  assert.equal(
    composeNotificationTitle({ contextName: 'Zoolatech', contextColor: BLUE, dueAt: inMin(30) }, 'reminder', NOW),
    '🔵 Zoolatech · in 30 min',
  );
});

test('reminder · context yes · due no', () => {
  assert.equal(
    composeNotificationTitle({ contextName: 'Zalando', contextColor: AMBER, dueAt: null }, 'reminder', NOW),
    '🟠 Zalando',
  );
});

test('reminder · context no · due yes', () => {
  assert.equal(
    composeNotificationTitle({ contextName: null, contextColor: null, dueAt: inMin(15) }, 'reminder', NOW),
    'in 15 min',
  );
});

test('reminder · context no · due no → Task', () => {
  assert.equal(
    composeNotificationTitle({ contextName: null, contextColor: null, dueAt: null }, 'reminder', NOW),
    'Task',
  );
});

test('spawn · context yes · due yes → · new', () => {
  assert.equal(
    composeNotificationTitle({ contextName: 'Zalando', contextColor: AMBER, dueAt: inMin(30) }, 'spawn', NOW),
    '🟠 Zalando · new',
  );
});

test('spawn · context yes · due no → · new', () => {
  assert.equal(
    composeNotificationTitle({ contextName: 'Zalando', contextColor: AMBER, dueAt: null }, 'spawn', NOW),
    '🟠 Zalando · new',
  );
});

test('spawn · context no · due yes → new', () => {
  assert.equal(
    composeNotificationTitle({ contextName: null, contextColor: null, dueAt: inMin(30) }, 'spawn', NOW),
    'new',
  );
});

test('spawn · context no · due no → new', () => {
  assert.equal(
    composeNotificationTitle({ contextName: null, contextColor: null, dueAt: null }, 'spawn', NOW),
    'new',
  );
});

test('reminder · overdue', () => {
  assert.equal(
    composeNotificationTitle({ contextName: 'Home', contextColor: GREEN, dueAt: inMin(-60) }, 'reminder', NOW),
    '🟢 Home · overdue',
  );
});

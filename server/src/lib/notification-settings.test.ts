import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNotificationsEnabled } from './notification-settings';

test('no settings row (undefined) → notifications enabled by default', () => {
  assert.equal(isNotificationsEnabled(undefined), true);
});

test('explicit false mutes notifications', () => {
  assert.equal(isNotificationsEnabled(false), false);
});

test('explicit true keeps notifications enabled', () => {
  assert.equal(isNotificationsEnabled(true), true);
});

// Only the literal boolean `false` mutes; malformed values must not silently mute.

test('null does not mute', () => {
  assert.equal(isNotificationsEnabled(null), true);
});

test('0 does not mute', () => {
  assert.equal(isNotificationsEnabled(0), true);
});

test("the string 'false' does not mute", () => {
  assert.equal(isNotificationsEnabled('false'), true);
});

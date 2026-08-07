// The master notification switch, kept pure so its default is testable without a
// database. Absent row means ENABLED: a user who has never opened the switch must
// keep receiving notifications, so only an explicit `false` mutes them.

export const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';

export function isNotificationsEnabled(value: unknown): boolean {
  return value !== false;
}

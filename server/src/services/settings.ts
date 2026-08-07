import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { settings } from '../db/schema';
import { NOTIFICATIONS_ENABLED_KEY, isNotificationsEnabled } from '../lib/notification-settings';

export async function notificationsEnabled(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, NOTIFICATIONS_ENABLED_KEY)));
  return isNotificationsEnabled(row?.value);
}

// Only the MUTED users, so the "no row means enabled" default costs nothing:
// the set is normally empty and every account not in it is enabled.
export async function mutedUserIds(): Promise<Set<string>> {
  const rows = await db
    .select({ userId: settings.userId, value: settings.value })
    .from(settings)
    .where(eq(settings.key, NOTIFICATIONS_ENABLED_KEY));
  return new Set(rows.filter((r) => !isNotificationsEnabled(r.value)).map((r) => r.userId));
}

// Upsert on the COMPOSITE key: the live DB's primary key is (user_id, key) since
// drizzle/0010_multi_user.sql, so one row exists per account per setting.
export async function setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  await db
    .insert(settings)
    .values({ userId, key: NOTIFICATIONS_ENABLED_KEY, value: enabled })
    .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value: enabled } });
}

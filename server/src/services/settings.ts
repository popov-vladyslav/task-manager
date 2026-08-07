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

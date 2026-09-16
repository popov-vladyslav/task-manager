import { and, eq, inArray } from 'drizzle-orm';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@task-manager/shared';
import { db } from '../db/client';
import { settings } from '../db/schema';
import { NOTIFICATIONS_ENABLED_KEY, isNotificationsEnabled } from '../lib/notification-settings';

export const LANGUAGE_KEY = 'language';

export interface UserSettings {
  notificationsEnabled: boolean;
  language: Locale | null;
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(
      and(
        eq(settings.userId, userId),
        inArray(settings.key, [NOTIFICATIONS_ENABLED_KEY, LANGUAGE_KEY]),
      ),
    );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const language = byKey.get(LANGUAGE_KEY);
  return {
    notificationsEnabled: isNotificationsEnabled(byKey.get(NOTIFICATIONS_ENABLED_KEY)),
    language: isLocale(language) ? language : null,
  };
}

export async function notificationsEnabled(userId: string): Promise<boolean> {
  return (await getSettings(userId)).notificationsEnabled;
}

export async function languageOf(userId: string): Promise<Locale> {
  return (await getSettings(userId)).language ?? DEFAULT_LOCALE;
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

export async function languagesByUser(): Promise<Map<string, Locale>> {
  const rows = await db
    .select({ userId: settings.userId, value: settings.value })
    .from(settings)
    .where(eq(settings.key, LANGUAGE_KEY));
  const map = new Map<string, Locale>();
  for (const r of rows) if (isLocale(r.value)) map.set(r.userId, r.value);
  return map;
}

async function upsert(userId: string, key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ userId, key, value })
    .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value } });
}

// Upsert on the COMPOSITE key: the live DB's primary key is (user_id, key) since
// drizzle/0010_multi_user.sql, so one row exists per account per setting.
export async function setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  await upsert(userId, NOTIFICATIONS_ENABLED_KEY, enabled);
}

export async function setLanguage(userId: string, language: Locale): Promise<void> {
  await upsert(userId, LANGUAGE_KEY, language);
}

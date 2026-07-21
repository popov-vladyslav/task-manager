import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { and, eq, isNotNull, lte, notExists, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { contexts, notificationLog, pushTokens, settings, tasks } from '../db/schema';
import { composeNotificationTitle } from '../lib/notification-title';

const expo = new Expo();

export async function registerPushToken(token: string, device?: string): Promise<void> {
  await db
    .insert(pushTokens)
    .values({ token, device: device ?? null })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { device: device ?? null, updatedAt: new Date() },
    });
}

async function sendPush(title: string, body: string, data: Record<string, unknown>): Promise<void> {
  const rows = await db.select({ token: pushTokens.token }).from(pushTokens);
  const tokens = rows.map((r) => r.token).filter((t) => Expo.isExpoPushToken(t));
  if (tokens.length === 0) return;

  // categoryId → the app's snooze action buttons. (interruptionLevel 'active';
  // 'time-sensitive' is deferred — it needs the Time Sensitive Notifications
  // capability enabled on the App ID + a regenerated provisioning profile.)
  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    categoryId: 'reminder',
    priority: 'high',
    interruptionLevel: 'active',
  }));
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      console.error('[push] send failed', e);
    }
  }
}

// send-reminders (every minute): active tasks past remind_at without an 'initial' log.
export async function sendReminders(now: Date = new Date()): Promise<number> {
  const due = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      contextName: contexts.label,
      contextColor: contexts.color,
    })
    .from(tasks)
    .leftJoin(contexts, eq(tasks.contextId, contexts.id))
    .where(
      and(
        eq(tasks.status, 'active'),
        isNotNull(tasks.remindAt),
        lte(tasks.remindAt, now),
        notExists(
          db
            .select({ one: sql`1` })
            .from(notificationLog)
            .where(and(eq(notificationLog.taskId, tasks.id), eq(notificationLog.kind, 'initial'))),
        ),
      ),
    );

  for (const t of due) {
    const title = composeNotificationTitle(
      { contextName: t.contextName, contextColor: t.contextColor, dueAt: t.dueAt },
      'reminder',
      now,
    );
    await sendPush(title, t.title, { taskId: t.id });
    await db.insert(notificationLog).values({ taskId: t.id, kind: 'initial' });
  }
  return due.length;
}

// repeat-reminders (every 15 min): opt-in via settings; re-notify tasks whose initial
// push is older than repeat_after_h and that haven't been re-notified within that window.
export async function repeatReminders(now: Date = new Date()): Promise<number> {
  const [enabled] = await db.select().from(settings).where(eq(settings.key, 'repeat_reminders'));
  if (!enabled || enabled.value !== true) return 0;

  const [afterCfg] = await db.select().from(settings).where(eq(settings.key, 'repeat_after_h'));
  const hours = typeof afterCfg?.value === 'number' ? afterCfg.value : 3;
  const cutoff = new Date(now.getTime() - hours * 3_600_000);

  const result = await db.execute(sql`
    select t.id, t.title, t.due_at, c.label as context_name, c.color as context_color
    from tasks t
    left join contexts c on c.id = t.context_id
    where t.status = 'active'
      and exists (select 1 from notification_log n
                  where n.task_id = t.id and n.kind = 'initial' and n.sent_at <= ${cutoff})
      and not exists (select 1 from notification_log n
                      where n.task_id = t.id and n.kind = 'repeat' and n.sent_at > ${cutoff})
  `);

  const rows = result.rows as {
    id: string;
    title: string;
    due_at: Date | string | null;
    context_name: string | null;
    context_color: string | null;
  }[];
  for (const r of rows) {
    const title = composeNotificationTitle(
      { contextName: r.context_name, contextColor: r.context_color, dueAt: r.due_at },
      'reminder',
      now,
    );
    await sendPush(title, r.title, { taskId: r.id });
    await db.insert(notificationLog).values({ taskId: r.id, kind: 'repeat' });
  }
  return rows.length;
}

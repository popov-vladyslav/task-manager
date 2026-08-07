import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { and, eq, gte, inArray, isNotNull, lte, notExists, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { contexts, notificationLog, pushTokens, settings, tasks, users } from '../db/schema';
import { composeNotificationTitle } from '../lib/notification-title';
import { dispatchReminders } from '../lib/reminder-dispatch';
import { summaryPushBody } from '../lib/morning-summary';
import { getMorningSummary } from './summary';
import { invalidateReminderClocks } from './reminder-clock';
import { mutedUserIds } from './settings';
import { reminderCutoff } from '../lib/reminder-window';

const expo = new Expo();

export async function registerPushToken(
  userId: string,
  token: string,
  device?: string,
): Promise<void> {
  await db
    .insert(pushTokens)
    .values({ token, userId, device: device ?? null })
    .onConflictDoUpdate({
      target: pushTokens.token,
      // A device that signs into a different account re-points to that user.
      set: { userId, device: device ?? null, updatedAt: new Date() },
    });
}

// Targets ONE user's devices. Without the owner filter every push would fan
// out to every registered device in the system.
async function sendPush(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));
  const tokens = rows.map((r) => r.token).filter((t) => Expo.isExpoPushToken(t));
  if (tokens.length === 0) return;

  // categoryId → the app's snooze action buttons. channelId → the Android HIGH
  // channel (heads-up + sound). interruptionLevel 'time-sensitive' bypasses
  // Focus/DND on iOS (needs the Time Sensitive Notifications entitlement — see
  // app.json ios.entitlements — and a rebuild). (CR02 §3b)
  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    categoryId: 'reminder',
    channelId: 'tasks-default',
    priority: 'high',
    interruptionLevel: 'time-sensitive',
  }));
  // Tokens Expo reports as no longer registered (app uninstalled / token rotated).
  // Tickets come back in the same order as the chunk, so map by index.
  const dead: string[] = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(chunk[i].to as string);
        }
      });
    } catch (e) {
      console.error('[push] send failed', e);
    }
  }

  // Prune dead tokens so every future send stops targeting them.
  if (dead.length > 0) {
    try {
      await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
      console.log(`[push] pruned ${dead.length} unregistered token(s)`);
    } catch (e) {
      console.error('[push] prune failed', e);
    }
  }
}

// send-reminders (every minute): active tasks past remind_at without an 'initial' log.
//
// Claim-then-send (see lib/reminder-dispatch.ts): the 'initial' log row is
// written *before* the push, and the push only goes out if that write won the
// race. The notExists filter below is just a cheap prefilter now — the partial
// unique index on notification_log(task_id) where kind='initial' (drizzle/0009)
// is what actually makes a second delivery impossible.
export async function sendReminders(now: Date = new Date()): Promise<number> {
  const due = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
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
        gte(tasks.remindAt, reminderCutoff(now)),
        notExists(
          db
            .select({ one: sql`1` })
            .from(notificationLog)
            .where(and(eq(notificationLog.taskId, tasks.id), eq(notificationLog.kind, 'initial'))),
        ),
      ),
    );

  const muted = await mutedUserIds();
  const sendable = muted.size ? due.filter((t) => !muted.has(t.userId)) : due;

  const sent = await dispatchReminders(sendable, {
    claim: async (t) => {
      const claimed = await db
        .insert(notificationLog)
        .values({ taskId: t.id, kind: 'initial', userId: t.userId })
        .onConflictDoNothing()
        .returning({ id: notificationLog.id });
      return claimed.length > 0;
    },
    send: async (t) => {
      const title = composeNotificationTitle(
        { contextName: t.contextName, contextColor: t.contextColor, dueAt: t.dueAt },
        'reminder',
        now,
      );
      await sendPush(t.userId, title, t.title, { taskId: t.id });
    },
    release: async (t) => {
      await db
        .delete(notificationLog)
        .where(and(eq(notificationLog.taskId, t.id), eq(notificationLog.kind, 'initial')));
    },
  });

  // Repeat-reminders key off notification_log, not remind_at, so clearing this is safe.
  // Only the tasks we actually notified about — one we lost the claim on is being
  // handled by the run that won it.
  if (sent.length) {
    await db
      .update(tasks)
      .set({ remindAt: null })
      .where(
        inArray(
          tasks.id,
          sent.map((t) => t.id),
        ),
      );
  }
  // This send consumed the remind_at values it fired on and wrote 'initial' log
  // rows, so both the next-reminder and next-repeat times have moved.
  if (sent.length) invalidateReminderClocks();
  return sent.length;
}

// repeat-reminders (every 15 min): opt-in via settings; re-notify tasks whose initial
// push is older than repeat_after_h and that haven't been re-notified within that window.
export async function repeatReminders(now: Date = new Date()): Promise<number> {
  // Opt-in and the interval are BOTH per user now, so the job can no longer read
  // one global setting and apply it to everyone: it resolves the set of users
  // who enabled repeats, each with their own window, and queries per user.
  const cfg = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ['repeat_reminders', 'repeat_after_h']));

  const enabled = new Map<string, number>();
  for (const row of cfg) {
    if (row.key === 'repeat_reminders' && row.value === true) {
      enabled.set(row.userId, enabled.get(row.userId) ?? 3);
    }
  }
  for (const row of cfg) {
    if (row.key === 'repeat_after_h' && typeof row.value === 'number' && enabled.has(row.userId)) {
      enabled.set(row.userId, row.value);
    }
  }
  const muted = await mutedUserIds();
  for (const userId of muted) enabled.delete(userId);
  if (enabled.size === 0) return 0;

  let notified = 0;

  for (const [userId, hours] of enabled) {
    const cutoff = new Date(now.getTime() - hours * 3_600_000);

    const result = await db.execute(sql`
      select t.id, t.title, t.due_at, c.label as context_name, c.color as context_color
      from tasks t
      left join contexts c on c.id = t.context_id
      where t.status = 'active'
        and t.user_id = ${userId}
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
      await sendPush(userId, title, r.title, { taskId: r.id });
      await db.insert(notificationLog).values({ taskId: r.id, kind: 'repeat', userId });
    }
    notified += rows.length;
  }

  // Each 'repeat' row pushes that task's next eligible repeat out by repeat_after_h.
  if (notified) invalidateReminderClocks();
  return notified;
}

// Key in `settings` holding the last date (YYYY-MM-DD, local) the morning summary
// push went out. Cheaper than a notification_log kind (whose enum would need a
// migration) and enough to make the send idempotent per day — so a restart at
// 07:30 can't double-notify.
const SUMMARY_SENT_KEY = 'morning_summary_last_sent';

function localDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// morning-summary (once a day): how many ordinary tasks were left unfinished.
// The notification carries only the count — tapping it opens the in-app sheet
// (data.kind is what the app's NotificationBridge keys off), which is where the
// per-task actions live. Returns the number of tasks reported, 0 if nothing was
// sent.
export async function sendMorningSummary(now: Date = new Date()): Promise<number> {
  const today = localDateStr(now);

  // Per user: each account has its own overdue pile, its own devices, and its
  // own once-a-day marker. One user having been notified must not suppress
  // anyone else's summary.
  const accounts = await db.select({ id: users.id }).from(users);
  const muted = await mutedUserIds();
  let total = 0;

  for (const account of accounts) {
    if (muted.has(account.id)) continue;

    const [sent] = await db
      .select()
      .from(settings)
      .where(and(eq(settings.userId, account.id), eq(settings.key, SUMMARY_SENT_KEY)));
    if (sent?.value === today) continue; // already notified today

    const { yesterday, older } = await getMorningSummary(account.id, now);
    const count = yesterday.length + older.length;
    // Nothing overdue → stay silent rather than sending "0 tasks".
    if (count === 0) continue;

    await sendPush(
      account.id,
      "Yesterday's leftovers",
      summaryPushBody({ yesterday: yesterday.length, older: older.length }),
      { kind: 'morning-summary' },
    );

    await db
      .insert(settings)
      .values({ userId: account.id, key: SUMMARY_SENT_KEY, value: today })
      .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value: today } });
    total += count;
  }

  return total;
}

import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { recurrenceRules, tasks } from '../db/schema';
import { expandTitle, ruleMatchesToday } from '../lib/recurrence';

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// For each active rule whose day is today (Europe/Warsaw) and that hasn't spawned
// today, create the task instance and stamp last_spawned. Idempotent per day.
export async function spawnDueRecurring(now: Date = new Date()): Promise<number> {
  const today = localDateStr(now);
  const rules = await db
    .select()
    .from(recurrenceRules)
    .where(
      and(
        eq(recurrenceRules.active, true),
        or(isNull(recurrenceRules.lastSpawned), lt(recurrenceRules.lastSpawned, today)),
      ),
    );

  let spawned = 0;
  for (const rule of rules) {
    if (!ruleMatchesToday(rule.rule, now)) continue;

    const dueDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + (rule.dueOffsetD ?? 0),
      12,
      0,
      0,
    );
    let remindAt: Date | null = null;
    if (rule.remindTime) {
      const [hh, mm] = String(rule.remindTime).split(':').map((n) => Number(n));
      remindAt = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), hh || 0, mm || 0, 0);
    }

    const [{ minSort }] = await db
      .select({ minSort: sql<number>`coalesce(min(${tasks.sortGlobal}), 1)` })
      .from(tasks);
    const top = Number(minSort) - 1;

    await db.insert(tasks).values({
      title: expandTitle(rule.title, now),
      contextId: rule.contextId,
      dueAt: dueDate,
      remindAt,
      recurrenceId: rule.id,
      sortGlobal: top,
      sortContext: top,
    });
    await db.update(recurrenceRules).set({ lastSpawned: today }).where(eq(recurrenceRules.id, rule.id));
    spawned += 1;
  }
  return spawned;
}

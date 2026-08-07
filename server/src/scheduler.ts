import cron from 'node-cron';
import { env } from './env';
import { pool } from './db/client';
import { spawnDueRecurring } from './services/recurring';
import {
  repeatReminders,
  sendDueNotifications,
  sendMorningSummary,
  sendReminders,
} from './services/push';
import {
  dueClock,
  invalidateReminderClocks,
  reminderClock,
  repeatClock,
} from './services/reminder-clock';
import type { ReminderClock } from './lib/reminder-clock';

// Postgres advisory-lock keys, one per job. Arbitrary but must stay stable.
const JOB_LOCKS = {
  'spawn-recurring': 4101,
  'morning-summary': 4102,
  'send-reminders': 4103,
  'repeat-reminders': 4104,
  'due-notifications': 4105,
} as const;

// Runs `job` only if no other process is already running it.
//
// Duplicate pushes were traced to two runs of send-reminders entering the job
// within ~250ms of each other — two API processes on the same database (a
// zero-downtime deploy overlaps old and new instances, and a local dev server
// points at this same DB). A tick that can't get the lock is skipped, not
// queued: these jobs are periodic, so the next tick picks the work up anyway.
//
// The lock must be taken and released on one connection, hence the dedicated
// client rather than a pooled query.
async function withJobLock(name: keyof typeof JOB_LOCKS, job: () => Promise<void>): Promise<void> {
  const key = JOB_LOCKS[name];
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [
      key,
    ]);
    if (!rows[0]?.ok) {
      console.log(`[cron] ${name} skipped — another instance is running it`);
      return;
    }
    try {
      await job();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    }
  } finally {
    client.release();
  }
}

// Wraps a job for cron: lock-guarded, and never allowed to reject into node-cron.
function guarded(name: keyof typeof JOB_LOCKS, job: () => Promise<void>): () => void {
  return () => {
    withJobLock(name, job).catch((e) => console.error(`[cron] ${name}`, e));
  };
}

// Like `guarded`, but asks an in-memory clock whether the job can possibly have
// work before doing anything at all.
//
// The check must come *before* withJobLock: taking the advisory lock opens a
// pooled connection and runs a query, so a lock-first gate would still wake the
// database on every tick and the Neon compute would never suspend. With the gate
// here, a tick with nothing due costs zero connections and zero queries.
function gated(
  name: keyof typeof JOB_LOCKS,
  clock: ReminderClock,
  job: () => Promise<void>,
): () => void {
  return () => {
    (async () => {
      const before = clock.peek();
      if (!(await clock.due(new Date()))) {
        // Log only when the cached answer changed — a skip line every minute is
        // noise, but the transitions are what make the gate observable in logs.
        const after = clock.peek();
        if (before?.getTime() !== after?.getTime()) {
          console.log(
            `[cron] ${name} idle until ${after ? after.toISOString() : 'further notice'}`,
          );
        }
        return;
      }
      await withJobLock(name, job);
    })().catch((e) => console.error(`[cron] ${name}`, e));
  };
}

// node-cron jobs (tech_spec §5). Runs in-process on the single API instance.
export function startScheduler(): void {
  const timezone = env.TZ || 'Europe/Warsaw';

  // The recurrence/reminder date math builds dates with process-local `Date`
  // constructors (see recurrence.ts / recurring.ts), so correctness depends on the
  // process actually running in Europe/Warsaw. cron fires at the right wall-clock
  // time via { timezone }, but the spawned due/remind times are process-local — a
  // mismatched TZ silently shifts them. Fail loud instead of drifting quietly.
  const resolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (resolvedTz !== 'Europe/Warsaw') {
    console.warn(
      `[cron] WARNING: process timezone is "${resolvedTz}", not Europe/Warsaw. ` +
        'Recurrence/reminder due-times are computed in process-local time and WILL drift. ' +
        'Set TZ=Europe/Warsaw.',
    );
  }

  // spawn recurring instances at the start of each day (00:00 Europe/Warsaw), so
  // dateless instances appear right at the start of their period (CR02 §1).
  cron.schedule(
    '0 0 * * *',
    guarded('spawn-recurring', async () => {
      const n = await spawnDueRecurring();
      if (n) console.log(`[cron] spawned ${n} recurring task(s)`);
      // Midnight rollover: re-read the reminder clocks unconditionally. Today's
      // spawns carry new remind_at values, and yesterday's occurrences were just
      // closed as 'missed' — both move the next fire time.
      invalidateReminderClocks();
    }),
    { timezone },
  );

  // morning summary at 07:30 Europe/Warsaw: one push with the count of ordinary
  // tasks left unfinished. Tapping it opens the in-app sheet that can reschedule
  // them to today or drop their scheduled time.
  cron.schedule(
    '30 7 * * *',
    guarded('morning-summary', async () => {
      const n = await sendMorningSummary();
      if (n) console.log(`[cron] morning summary: ${n} overdue task(s)`);
    }),
    { timezone },
  );

  // send due reminders every minute — but the tick only reaches the database once
  // the cached next remind_at has actually arrived (services/reminder-clock.ts).
  cron.schedule(
    '* * * * *',
    gated('send-reminders', reminderClock, async () => {
      const n = await sendReminders();
      if (n) console.log(`[cron] sent ${n} reminder(s)`);
    }),
  );

  // due-time pushes every minute, gated on its own cached clock so an idle tick
  // costs no query (services/reminder-clock.ts).
  cron.schedule(
    '* * * * *',
    gated('due-notifications', dueClock, async () => {
      const n = await sendDueNotifications();
      if (n) console.log(`[cron] sent ${n} due notification(s)`);
    }),
  );

  // repeat reminders every 15 minutes (opt-in via settings), likewise gated —
  // while the setting is off, this job never touches the database at all.
  cron.schedule(
    '*/15 * * * *',
    gated('repeat-reminders', repeatClock, async () => {
      const n = await repeatReminders();
      if (n) console.log(`[cron] sent ${n} repeat reminder(s)`);
    }),
  );

  console.log(`[cron] scheduler started (tz ${timezone})`);
}

import cron from 'node-cron';
import { env } from './env';
import { spawnDueRecurring } from './services/recurring';
import { repeatReminders, sendReminders } from './services/push';

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
    () => {
      spawnDueRecurring()
        .then((n) => n && console.log(`[cron] spawned ${n} recurring task(s)`))
        .catch((e) => console.error('[cron] spawn-recurring', e));
    },
    { timezone },
  );

  // send due reminders every minute
  cron.schedule('* * * * *', () => {
    sendReminders()
      .then((n) => n && console.log(`[cron] sent ${n} reminder(s)`))
      .catch((e) => console.error('[cron] send-reminders', e));
  });

  // repeat reminders every 15 minutes (opt-in via settings)
  cron.schedule('*/15 * * * *', () => {
    repeatReminders()
      .then((n) => n && console.log(`[cron] sent ${n} repeat reminder(s)`))
      .catch((e) => console.error('[cron] repeat-reminders', e));
  });

  console.log(`[cron] scheduler started (tz ${timezone})`);
}

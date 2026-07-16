import cron from 'node-cron';
import { env } from './env';
import { spawnDueRecurring } from './services/recurring';
import { repeatReminders, sendReminders } from './services/push';

// node-cron jobs (tech_spec §5). Runs in-process on the single API instance.
export function startScheduler(): void {
  const timezone = env.TZ || 'Europe/Warsaw';

  // spawn recurring instances daily at 00:05 Europe/Warsaw
  cron.schedule(
    '5 0 * * *',
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

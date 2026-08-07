// How stale a remind_at may be and still be sent. A reminder older than this is
// skipped forever — which is what makes the notifications master switch produce
// no backfill: everything that came due while the switch was off simply ages out.
//
// Two hours, not minutes: services/reminder-clock.ts caches the next fire time
// per process and force-resyncs only hourly, so a legitimately-late reminder can
// surface up to an hour after its remind_at. A tighter window would drop those.
export const REMINDER_SEND_WINDOW_MS = 2 * 60 * 60 * 1000;

export function reminderCutoff(now: Date): Date {
  return new Date(now.getTime() - REMINDER_SEND_WINDOW_MS);
}

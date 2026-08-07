// How stale a due_at may be and still produce a push. The cron ticks every
// minute; the rest is grace for a restart or deploy gap.
//
// Deliberately much tighter than REMINDER_SEND_WINDOW_MS: this window is what
// enforces "no backfill" for the notifications master switch. Turning the switch
// back on after days of silence may fire only what came due in the last ten
// minutes — never the whole backlog.
export const DUE_SEND_WINDOW_MS = 10 * 60 * 1000;

export function dueCutoff(now: Date): Date {
  return new Date(now.getTime() - DUE_SEND_WINDOW_MS);
}

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

// How often the due clock must re-check the database. Strictly shorter than the
// send window: the cache is per process and invalidation is an in-process call,
// so a write from another process (a local dev server on the same DB, or the
// other instance during a zero-downtime deploy) is invisible until the next
// forced resync. Were that resync slower than the window, the row would age past
// dueCutoff before this process looked, and the push would be lost forever.
//
// Half the window leaves margin for the 1-minute tick granularity. The cost is
// ~288 idle queries a day instead of 24 — still far below the 1440 the clock
// exists to prevent.
export const DUE_CLOCK_MAX_SYNC_AGE_MS = DUE_SEND_WINDOW_MS / 2;

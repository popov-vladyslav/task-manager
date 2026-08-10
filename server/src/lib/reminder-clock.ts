// When may the next push go out? — cached in memory so idle ticks cost nothing.
//
// The reminder jobs used to query on every tick: send-reminders once a minute,
// repeat-reminders every 15. On a single-user app that fires a handful of pushes
// a day that is ~1500 pointless wakeups, and the Neon compute never stays idle
// long enough to suspend. Caching the *next fire time* lets a tick answer "not
// yet" without touching the database at all.
//
// A timestamp, not a "something is scheduled soon" flag: with a flag, one
// reminder set for tonight would keep every minute-tick querying all day, which
// is the thing we're trying to stop.
//
// Kept as a pure port-based unit (like lib/reminder-dispatch.ts) so the caching
// rules are testable without a database.

export interface ClockPorts {
  // The earliest instant at which the job could have work, or null when it has
  // none at all. Only called when the cache can't answer on its own.
  nextAt(now: Date): Promise<Date | null>;
}

// One hour. The cache is per-process, so a write from *another* process (a
// deploy overlap, or a dev server on the same database) leaves it stale. A
// forced resync bounds how long that can hide a due reminder — 24 wakeups a day
// against 1440, for a worst case of one hour instead of "until restart".
// Exported so each send window can assert it stays wider than this: a window
// tighter than the resync interval loses pushes outright, because a write from
// another process would age past the window's cutoff before this one re-queried.
export const DEFAULT_MAX_SYNC_AGE_MS = 3_600_000;

export class ReminderClock {
  #nextAt: Date | null = null;
  #syncedAt: Date | null = null;
  // Starts dirty: a fresh process knows nothing, so the first tick re-queries.
  #dirty = true;

  constructor(
    private readonly ports: ClockPorts,
    private readonly maxSyncAgeMs = DEFAULT_MAX_SYNC_AGE_MS,
  ) {}

  // Call after any write that can move the next fire time. Cheap and
  // synchronous — the re-query happens on the next tick, not here, so it never
  // sits in the request path.
  invalidate(): void {
    this.#dirty = true;
  }

  // True when the job should run now. Queries only if the cache is dirty, empty,
  // or stale; otherwise this is pure memory and touches no connection.
  async due(now: Date): Promise<boolean> {
    if (this.#needsSync(now)) await this.#sync(now);
    return this.#nextAt !== null && this.#nextAt.getTime() <= now.getTime();
  }

  #needsSync(now: Date): boolean {
    if (this.#dirty || this.#syncedAt === null) return true;
    return now.getTime() - this.#syncedAt.getTime() >= this.maxSyncAgeMs;
  }

  async #sync(now: Date): Promise<void> {
    // Clear the flag first: a write landing *during* the query would otherwise
    // be swallowed by the assignment below, leaving the cache stale until the
    // hourly resync.
    this.#dirty = false;
    try {
      this.#nextAt = await this.ports.nextAt(now);
      this.#syncedAt = now;
    } catch (err) {
      // A failed sync must not leave the cache looking fresh — otherwise a
      // transient database blip would silence reminders for an hour.
      this.#dirty = true;
      throw err;
    }
  }

  // For logging: what the cache currently believes, without triggering a query.
  peek(): Date | null {
    return this.#nextAt;
  }
}

// Formatting for a task's accumulated tracked time (Task.trackedSec).
// Shared so the card, the detail view and the MCP payload agree.
//
// Zero is never rendered anywhere — both helpers return null so callers can drop
// the element entirely rather than print a "0m" placeholder.

// Compact, for the task card: "1h 20m", "45m", "38s".
export function formatTrackedShort(seconds: number): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const totalMin = Math.floor(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Explicit, for the detail view: "1 h 20 min", "45 min", "38 sec".
export function formatTrackedLong(seconds: number): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${Math.floor(seconds)} sec`;
  const totalMin = Math.floor(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

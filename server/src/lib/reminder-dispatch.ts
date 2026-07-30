// Ordering rule for sending a reminder exactly once.
//
// The duplicate-push bug was an ordering bug: send first, write the "already
// notified" row second. Anything that re-ran the job inside that window sent a
// second identical push. Claiming first inverts it — the claim is what decides
// who sends, so re-running can never produce a second delivery.
//
// Kept as a pure port-based unit (like lib/recurrence-plan.ts) so the ordering
// is testable without a database. Exclusivity of `claim` itself is a schema
// guarantee: the partial unique index in drizzle/0009.

export interface DispatchPorts<T> {
  // Take exclusive responsibility for notifying about `task`. Returns false when
  // another run already claimed it — then this run must not send.
  claim(task: T): Promise<boolean>;
  send(task: T): Promise<void>;
  // Give the claim back when the send failed, so a later run can retry it.
  // Without this, claim-first would turn a transient push failure into a
  // permanently swallowed reminder.
  release(task: T): Promise<void>;
}

// Returns the tasks actually notified about — never more than one delivery per
// task across any number of concurrent or repeated calls.
export async function dispatchReminders<T>(
  due: readonly T[],
  ports: DispatchPorts<T>,
): Promise<T[]> {
  const sent: T[] = [];
  for (const task of due) {
    if (!(await ports.claim(task))) continue; // another run is sending this one
    try {
      await ports.send(task);
    } catch (err) {
      await ports.release(task).catch(() => {});
      throw err;
    }
    sent.push(task);
  }
  return sent;
}

import { create } from 'zustand';
import type { Task } from '@task-manager/shared';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import { useTasksStore } from './tasks';

// Morning summary: unfinished ordinary tasks from before today, reviewed in a
// sheet that opens once per day (and on tapping the morning notification).
//
// Recurring occurrences never appear here — the server filters them out, so a
// skipped daily routine can't nag.

const SEEN_KEY = 'log.summarySeen'; // 'YYYY-MM-DD' of the last day the sheet was shown

function todayStr(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Same wall-clock time, moved to today. Keeps the slot the task was scheduled
// for instead of silently retiming it; a task due 09:00 yesterday is due 09:00
// today.
export function todayAtSameTime(dueAt: string | null, now: Date = new Date()): string {
  const prev = dueAt ? new Date(dueAt) : null;
  const h = prev && !Number.isNaN(prev.getTime()) ? prev.getHours() : 9;
  const min = prev && !Number.isNaN(prev.getTime()) ? prev.getMinutes() : 0;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0).toISOString();
}

interface SummaryState {
  yesterday: Task[];
  older: Task[];
  visible: boolean;
  loading: boolean;
  busyIds: string[]; // rows with an action in flight

  load: () => Promise<void>;
  open: () => Promise<void>; // load (if needed) and show — used by the notification tap
  close: () => void;
  maybeShowForToday: () => Promise<void>; // first open of the day
  rescheduleToToday: (task: Task) => Promise<void>;
  clearDueDate: (task: Task) => Promise<void>;
}

export const useSummaryStore = create<SummaryState>((set, get) => ({
  yesterday: [],
  older: [],
  visible: false,
  loading: false,
  busyIds: [],

  async load() {
    set({ loading: true });
    try {
      const { yesterday, older } = await api.getMorningSummary();
      set({ yesterday, older, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async open() {
    await get().load();
    set({ visible: true });
    void storage.set(SEEN_KEY, todayStr());
  },

  close() {
    set({ visible: false });
    // Mark today as reviewed so it doesn't reopen on every tab switch.
    void storage.set(SEEN_KEY, todayStr());
  },

  // Shown at most once per calendar day, and only when there is something to act
  // on — an empty summary must never interrupt.
  async maybeShowForToday() {
    const seen = await storage.get(SEEN_KEY);
    if (seen === todayStr()) return;
    await get().load();
    const { yesterday, older } = get();
    if (yesterday.length + older.length === 0) return;
    set({ visible: true });
    void storage.set(SEEN_KEY, todayStr());
  },

  async rescheduleToToday(task) {
    await withBusy(set, get, task.id, async () => {
      await useTasksStore.getState().patchTask(task.id, { dueAt: todayAtSameTime(task.dueAt) });
    });
  },

  // Keeps the task, drops its schedule — it leaves the calendar and stops being
  // overdue, but stays in the list.
  async clearDueDate(task) {
    await withBusy(set, get, task.id, async () => {
      await useTasksStore.getState().patchTask(task.id, { dueAt: null });
    });
  },
}));

// Runs an action with the row marked busy, then drops the row from the summary —
// it has been dealt with, so it shouldn't linger in the list.
async function withBusy(
  set: (partial: Partial<SummaryState>) => void,
  get: () => SummaryState,
  id: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (get().busyIds.includes(id)) return;
  set({ busyIds: [...get().busyIds, id] });
  try {
    await fn();
    set({
      yesterday: get().yesterday.filter((t) => t.id !== id),
      older: get().older.filter((t) => t.id !== id),
    });
  } catch {
    /* leave the row in place so it can be retried */
  } finally {
    set({ busyIds: get().busyIds.filter((b) => b !== id) });
  }
}

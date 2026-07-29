import { create } from 'zustand';
import type { CalendarData } from '@task-manager/shared';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import {
  rangeFor,
  shiftAnchor,
  startOfDay,
  type CalMode,
} from '../features/calendar/calendar-dates';
import { isPendingDelete, useTasksStore } from './tasks';

const MODE_KEY = 'log.calMode';
const MODES: CalMode[] = ['day', '3day', 'week', 'month'];

// Matches the tasks store: data younger than this needs no refetch on focus.
const STALE_AFTER_MS = 10_000;

// The in-flight load(), keyed by the range being fetched, so repeat loads of the
// same range share one request.
let inFlightLoad: { key: string; promise: Promise<void> } | null = null;

interface CalendarState {
  mode: CalMode;
  anchor: Date; // the focused day (or month, for month mode)
  data: CalendarData | null;
  loading: boolean;
  lastLoadedAt: number | null; // client ms of the last successful load

  load: (opts?: { silent?: boolean }) => Promise<void>;
  refreshIfStale: (maxAgeMs?: number) => Promise<void>;
  hydrateMode: () => Promise<void>; // restore the last-selected mode (defaults to Day)
  setMode: (m: CalMode) => void;
  shift: (dir: number) => void;
  goToDay: (d: Date) => void; // tap a month cell → day view
  goToToday: () => void;
  moveBlock: (id: string, newStartISO: string) => Promise<void>;
  createAt: (title: string, startISO: string, durationMin: number) => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  mode: 'day',
  anchor: startOfDay(new Date()),
  data: null,
  loading: false,
  lastLoadedAt: null,

  async hydrateMode() {
    const saved = await storage.get(MODE_KEY);
    if (saved && MODES.includes(saved as CalMode) && saved !== get().mode) {
      set({ mode: saved as CalMode });
    }
    get().load();
  },

  async load(opts) {
    const { mode, anchor } = get();
    const { from, to } = rangeFor(mode, anchor);
    // Coalesce concurrent loads of the SAME range (focus firing rapidly while
    // tabbing) onto one request. Keyed by range, so changing mode/anchor mid-flight
    // still fetches the new one.
    const key = `${mode}|${anchor.getTime()}`;
    if (inFlightLoad?.key === key) return inFlightLoad.promise;
    // `silent` leaves `loading` alone so a background refresh of an already-drawn
    // grid doesn't flash the spinner.
    if (!opts?.silent) set({ loading: true });
    const promise = (async () => {
      try {
        const data = await api.getCalendar(from.toISOString(), to.toISOString());
        const blocks = data.blocks.filter((b) => !isPendingDelete(b.id));
        set({ data: { ...data, blocks }, loading: false, lastLoadedAt: Date.now() });
      } catch {
        set({ loading: false });
      } finally {
        if (inFlightLoad?.key === key) inFlightLoad = null;
      }
    })();
    inFlightLoad = { key, promise };
    return promise;
  },

  // Silent background refresh, skipped while the current range is still fresh.
  async refreshIfStale(maxAgeMs = STALE_AFTER_MS) {
    const { lastLoadedAt } = get();
    if (lastLoadedAt != null && Date.now() - lastLoadedAt < maxAgeMs) return;
    await get().load({ silent: true });
  },

  setMode(mode) {
    set({ mode });
    void storage.set(MODE_KEY, mode);
    get().load();
  },
  shift(dir) {
    set((s) => ({ anchor: shiftAnchor(s.mode, s.anchor, dir) }));
    get().load();
  },
  goToDay(d) {
    set({ mode: 'day', anchor: startOfDay(d) });
    get().load();
  },
  goToToday() {
    set({ anchor: startOfDay(new Date()) });
    get().load();
  },

  async moveBlock(id, newStartISO) {
    const prev = get().data;
    if (!prev) return;
    const blk = prev.blocks.find((b) => b.id === id);
    if (!blk) return;
    const durMs = new Date(blk.endAt).getTime() - new Date(blk.startAt).getTime();
    const newEnd = new Date(new Date(newStartISO).getTime() + durMs).toISOString();
    // optimistic
    set({
      data: {
        blocks: prev.blocks.map((b) =>
          b.id === id ? { ...b, startAt: newStartISO, endAt: newEnd } : b,
        ),
      },
    });
    try {
      await useTasksStore.getState().patchTask(id, { dueAt: newStartISO });
    } catch {
      set({ data: prev }); // rollback
    }
  },

  async createAt(title, startISO, durationMin) {
    const t = title.trim();
    if (!t) return;
    await api.createTask({ title: t, dueAt: startISO, durationMin });
    await get().load();
    useTasksStore.getState().load();
  },
}));

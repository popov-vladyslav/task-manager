import { create } from 'zustand';
import type { CalendarData } from '@task-manager/shared';
import { api } from '../lib/api';
import { rangeFor, shiftAnchor, startOfDay, type CalMode } from '../features/calendar/calendar-dates';
import { useTasksStore } from './tasks';

interface CalendarState {
  mode: CalMode;
  anchor: Date; // the focused day (or month, for month mode)
  data: CalendarData | null;
  loading: boolean;

  load: () => Promise<void>;
  setMode: (m: CalMode) => void;
  shift: (dir: number) => void;
  goToDay: (d: Date) => void; // tap a month cell → day view
  goToToday: () => void;
  moveBlock: (id: string, newStartISO: string) => Promise<void>;
  createAt: (title: string, startISO: string, durationMin: number) => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  mode: 'week',
  anchor: startOfDay(new Date()),
  data: null,
  loading: false,

  async load() {
    const { mode, anchor } = get();
    const { from, to } = rangeFor(mode, anchor);
    set({ loading: true });
    try {
      const data = await api.getCalendar(from.toISOString(), to.toISOString());
      set({ data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setMode(mode) {
    set({ mode });
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
    set({ data: { blocks: prev.blocks.map((b) => (b.id === id ? { ...b, startAt: newStartISO, endAt: newEnd } : b)) } });
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

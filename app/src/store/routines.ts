import { create } from 'zustand';
import type { Routine } from '@task-manager/shared';
import { api } from '../lib/api';

interface RoutinesState {
  routines: Routine[]; // today's active routines, ordered
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  toggle: (routine: Routine) => Promise<void>;
  add: (title: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useRoutinesStore = create<RoutinesState>((set, get) => ({
  routines: [],
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ routines: await api.listRoutines(), loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' });
    }
  },

  async toggle(routine) {
    // Optimistic flip; reconcile with the server's authoritative row.
    const prev = get().routines;
    set({ routines: prev.map((r) => (r.id === routine.id ? { ...r, done: !r.done } : r)) });
    try {
      const updated = await api.toggleRoutine(routine.id);
      set({ routines: get().routines.map((r) => (r.id === updated.id ? updated : r)) });
    } catch {
      set({ routines: prev }); // rollback
    }
  },

  async add(title) {
    const created = await api.createRoutine({ title });
    set({ routines: [...get().routines, created] });
  },

  async remove(id) {
    const prev = get().routines;
    set({ routines: prev.filter((r) => r.id !== id) });
    try {
      await api.deleteRoutine(id);
    } catch {
      set({ routines: prev }); // rollback
    }
  },
}));

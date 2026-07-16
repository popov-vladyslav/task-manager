import { create } from 'zustand';
import { api } from '../lib/api';

// A focus session shown as a full-screen timer. Pause ends the current backend
// time_entry (recording the worked period) and Resume starts a new one, so the
// big number = total *worked* time this session and the Calendar stays accurate.
interface TimerState {
  session: { taskId: string; taskTitle: string } | null; // non-null => full-screen open
  running: boolean; // a backend entry is currently ticking
  runningSince: number | null; // client ms when the current entry started
  baseMs: number; // accumulated ms from paused periods this session

  load: () => Promise<void>; // on sign-in: adopt a timer already running on the backend
  open: (taskId: string, taskTitle: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  close: () => Promise<void>; // stop tracking + dismiss (does NOT complete the task)
}

export const useTimerStore = create<TimerState>((set, get) => ({
  session: null,
  running: false,
  runningSince: null,
  baseMs: 0,

  async load() {
    if (get().session) return; // already running a local session
    try {
      const active = await api.getActiveTimer(); // also reconciles stale orphans server-side
      if (active && !get().session) {
        // Surface an orphan (hard-kill) or an externally-started (MCP) timer.
        set({
          session: { taskId: active.taskId, taskTitle: active.taskTitle },
          running: true,
          runningSince: Date.parse(active.startedAt),
          baseMs: 0,
        });
      }
    } catch {
      /* ignore */
    }
  },

  async open(taskId, taskTitle) {
    set({ session: { taskId, taskTitle }, baseMs: 0, running: false, runningSince: null });
    try {
      await api.startTimer(taskId);
      set({ running: true, runningSince: Date.now() });
    } catch {
      set({ session: null }); // couldn't start — don't leave an empty timer open
    }
  },

  async pause() {
    const { running, runningSince, baseMs } = get();
    if (!running || runningSince == null) return;
    set({ running: false, runningSince: null, baseMs: baseMs + (Date.now() - runningSince) });
    try {
      await api.stopTimer();
    } catch {
      /* ignore — close() will try again */
    }
  },

  async resume() {
    const { session } = get();
    if (!session) return;
    try {
      await api.startTimer(session.taskId);
      set({ running: true, runningSince: Date.now() });
    } catch {
      /* ignore */
    }
  },

  async close() {
    const wasRunning = get().running;
    set({ session: null, running: false, runningSince: null, baseMs: 0 });
    if (wasRunning) {
      try {
        await api.stopTimer();
      } catch {
        /* ignore */
      }
    }
  },
}));

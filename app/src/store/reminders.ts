import { create } from 'zustand';

// The reminder currently shown in the in-app modal (when a reminder arrives while
// the app is foregrounded). Snooze actions on the OS notification are handled by
// the response listener; this drives the on-screen prompt.
interface ActiveReminder {
  taskId: string;
  title: string;
}

interface RemindersState {
  active: ActiveReminder | null;
  show: (r: ActiveReminder) => void;
  dismiss: () => void;
}

export const useRemindersStore = create<RemindersState>((set) => ({
  active: null,
  show: (r) => set({ active: r }),
  dismiss: () => set({ active: null }),
}));

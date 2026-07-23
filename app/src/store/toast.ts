import { create } from 'zustand';

export const TOAST_DURATION_MS = 4000;

// A single top snackbar (task completed / deleted) with an optional Undo action.
// A newer toast replaces any current one.
export interface AppToast {
  id: number;
  title: string;
  message?: string;
  onUndo?: () => void;
}

interface ToastState {
  toast: AppToast | null;
  show: (t: Omit<AppToast, 'id'>) => void;
  hide: () => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (t) => set({ toast: { ...t, id: (seq += 1) } }),
  hide: () => set({ toast: null }),
}));

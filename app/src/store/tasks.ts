import { create } from 'zustand';
import type { Context, Task } from '@task-manager/shared';
import { api } from '../lib/api';

interface TasksState {
  contexts: Context[];
  tasks: Task[]; // all open tasks (status != done), unfiltered
  activeContextId: number | null; // null = "All"
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  setActiveContext: (id: number | null) => void;
  addTask: (title: string) => Promise<Task | null>;
  toggleComplete: (task: Task) => Promise<void>;
  patchTask: (id: string, patch: Parameters<typeof api.updateTask>[1]) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  contexts: [],
  tasks: [],
  activeContextId: null,
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const [contexts, tasks] = await Promise.all([api.listContexts(), api.listTasks()]);
      set({ contexts, tasks, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' });
    }
  },

  setActiveContext(id) {
    set({ activeContextId: id });
  },

  async addTask(title) {
    const contextId = get().activeContextId ?? undefined;
    const created = await api.createTask({ title, contextId });
    set({ tasks: [created, ...get().tasks] });
    return created;
  },

  async toggleComplete(task) {
    // Optimistic: completing removes the task from the open list.
    const prev = get().tasks;
    set({ tasks: prev.filter((t) => t.id !== task.id) });
    try {
      await api.updateTask(task.id, { completed: true });
    } catch {
      set({ tasks: prev }); // rollback
    }
  },

  async patchTask(id, patch) {
    const updated = await api.updateTask(id, patch);
    const next =
      updated.status === 'done'
        ? get().tasks.filter((t) => t.id !== id)
        : get().tasks.map((t) => (t.id === id ? updated : t));
    set({ tasks: next });
  },

  async removeTask(id) {
    const prev = get().tasks;
    set({ tasks: prev.filter((t) => t.id !== id) });
    try {
      await api.deleteTask(id);
    } catch {
      set({ tasks: prev }); // rollback
    }
  },
}));

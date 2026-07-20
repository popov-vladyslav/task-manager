import { create } from 'zustand';
import type { Context, ReorderScope, Task } from '@task-manager/shared';
import { api } from '../lib/api';

interface TasksState {
  contexts: Context[];
  tasks: Task[]; // all open tasks (status != done), unfiltered
  activeContextId: number | null; // null = "All"
  loading: boolean;
  error: string | null;
  pendingOpenTaskId: string | null; // set by a tapped notification; consumed by the screen

  load: () => Promise<void>;
  setActiveContext: (id: number | null) => void;
  createContext: (label: string, color: string) => Promise<void>;
  updateContext: (id: number, patch: { label?: string; color?: string }) => Promise<void>;
  deleteContext: (id: number) => Promise<void>; // throws (409 message) if still referenced
  resetData: () => Promise<void>; // wipes tasks/recurrence/timers; keeps contexts
  addTask: (title: string) => Promise<Task | null>;
  toggleComplete: (task: Task) => Promise<void>;
  patchTask: (id: string, patch: Parameters<typeof api.updateTask>[1]) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  adjustCommentCount: (id: string, delta: number) => void;
  reorder: (
    id: string,
    afterId: string | null,
    beforeId: string | null,
    scope: ReorderScope,
  ) => Promise<void>;
  requestOpenTask: (id: string | null) => void;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  contexts: [],
  tasks: [],
  activeContextId: null,
  loading: false,
  error: null,
  pendingOpenTaskId: null,

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

  async createContext(label, color) {
    const created = await api.createContext({ label, color });
    set({ contexts: [...get().contexts, created].sort((a, b) => a.sortOrder - b.sortOrder) });
  },

  async updateContext(id, patch) {
    const updated = await api.updateContext(id, patch);
    set({ contexts: get().contexts.map((c) => (c.id === id ? updated : c)) });
  },

  async deleteContext(id) {
    // Let a 409 (context still referenced) propagate — the caller surfaces the message.
    await api.deleteContext(id);
    set({
      contexts: get().contexts.filter((c) => c.id !== id),
      activeContextId: get().activeContextId === id ? null : get().activeContextId,
    });
  },

  async resetData() {
    await api.resetData();
    // Server kept contexts; refresh the now-empty task list.
    set({ tasks: [], activeContextId: null });
    await get().load();
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

  adjustCommentCount(id, delta) {
    set({
      tasks: get().tasks.map((t) =>
        t.id === id ? { ...t, commentsCount: Math.max(0, t.commentsCount + delta) } : t,
      ),
    });
  },

  requestOpenTask(id) {
    set({ pendingOpenTaskId: id });
  },

  async reorder(id, afterId, beforeId, scope) {
    const key = scope === 'context' ? 'sortContext' : 'sortGlobal';
    const current = get().tasks;
    const sortOf = (nid: string | null) =>
      nid ? (current.find((t) => t.id === nid)?.[key] ?? null) : null;
    const a = sortOf(afterId);
    const b = sortOf(beforeId);
    // Fractional index between neighbors — applied optimistically so the list
    // settles in place instead of snapping back during the API round-trip.
    const newSort = a == null && b == null ? 0 : a == null ? b! - 1 : b == null ? a + 1 : (a + b) / 2;
    set({ tasks: current.map((t) => (t.id === id ? { ...t, [key]: newSort } : t)) });
    try {
      const updated = await api.reorderTask(id, { afterId, beforeId, scope });
      set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) });
    } catch {
      get().load(); // resync on failure
    }
  },
}));

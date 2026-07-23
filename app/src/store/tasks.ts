import { create } from 'zustand';
import type { Context, ReorderScope, Task } from '@task-manager/shared';
import { api } from '../lib/api';
import { TOAST_DURATION_MS, useToastStore } from './toast';

// Must exceed the toast duration so the Undo action can never outlive the commit.
const DELETE_UNDO_MS = TOAST_DURATION_MS + 1000;
const pendingDeletes = new Map<string, { task: Task; timer: ReturnType<typeof setTimeout> }>();

export function isPendingDelete(id: string): boolean {
  return pendingDeletes.has(id);
}

interface TasksState {
  contexts: Context[];
  tasks: Task[]; // all open tasks (status != done), unfiltered
  completed: Task[]; // done tasks, loaded lazily for the "Show completed" section
  activeContextId: number | null; // null = "All"
  loading: boolean;
  hydrated: boolean;
  error: string | null;
  pendingOpenTaskId: string | null; // set by a tapped notification; consumed by the screen

  load: () => Promise<void>;
  loadCompleted: () => Promise<void>;
  uncomplete: (task: Task) => Promise<void>;
  setActiveContext: (id: number | null) => void;
  createContext: (label: string, color: string, excludeFromAll?: boolean) => Promise<void>;
  updateContext: (
    id: number,
    patch: { label?: string; color?: string; excludeFromAll?: boolean },
  ) => Promise<void>;
  deleteContext: (id: number) => Promise<void>; // throws (409 message) if still referenced
  resetData: () => Promise<void>; // wipes tasks/recurrence/timers; keeps contexts
  addTask: (
    title: string,
    extra?: { contextId?: number | null; dueAt?: string | null; remindAt?: string | null; durationMin?: number | null },
  ) => Promise<Task | null>;
  toggleComplete: (task: Task) => Promise<void>;
  patchTask: (id: string, patch: Parameters<typeof api.updateTask>[1]) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  undoRemove: (id: string) => void; // restore a task within its delete-undo window
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
  completed: [],
  activeContextId: null,
  loading: false,
  hydrated: false,
  error: null,
  pendingOpenTaskId: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const [contexts, tasks] = await Promise.all([api.listContexts(), api.listTasks()]);
      const open = pendingDeletes.size ? tasks.filter((t) => !pendingDeletes.has(t.id)) : tasks;
      set({ contexts, tasks: open, loading: false, hydrated: true });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' });
    }
  },

  async loadCompleted() {
    try {
      const completed = await api.listTasks({ status: 'done' });
      set({ completed });
    } catch {
      /* ignore — the section just stays empty */
    }
  },

  async uncomplete(task) {
    // Optimistic: move it out of the completed list back into the open list.
    const { completed, tasks } = get();
    set({ completed: completed.filter((t) => t.id !== task.id) });
    try {
      const updated = await api.updateTask(task.id, { status: 'active' });
      set({ tasks: [updated, ...get().tasks] });
    } catch {
      set({ completed, tasks }); // rollback
    }
  },

  setActiveContext(id) {
    set({ activeContextId: id });
  },

  async createContext(label, color, excludeFromAll) {
    const created = await api.createContext({ label, color, excludeFromAll });
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

  async addTask(title, extra) {
    // Default to the active context; an explicit extra.contextId (incl. null) wins.
    const contextId =
      extra && 'contextId' in extra ? extra.contextId : (get().activeContextId ?? undefined);
    const created = await api.createTask({
      title,
      contextId,
      dueAt: extra?.dueAt ?? undefined,
      remindAt: extra?.remindAt ?? undefined,
      durationMin: extra?.durationMin ?? undefined,
    });
    set({ tasks: [created, ...get().tasks] });
    return created;
  },

  async toggleComplete(task) {
    // Optimistic: completing removes the task from the open list and (if the
    // completed section has been loaded) surfaces it there.
    const prev = get().tasks;
    const prevCompleted = get().completed;
    set({
      tasks: prev.filter((t) => t.id !== task.id),
      completed: [{ ...task, status: 'done' }, ...prevCompleted],
    });
    try {
      await api.updateTask(task.id, { completed: true });
    } catch {
      set({ tasks: prev, completed: prevCompleted }); // rollback
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
    const task = get().tasks.find((t) => t.id === id);
    if (!task || pendingDeletes.has(id)) return;
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
    const timer = setTimeout(() => {
      pendingDeletes.delete(id);
      api.deleteTask(id).catch(() => {
        if (!get().tasks.some((t) => t.id === id)) set({ tasks: [task, ...get().tasks] });
        useToastStore.getState().show({ title: 'Couldn’t delete task — restored', message: task.title });
      });
    }, DELETE_UNDO_MS);
    pendingDeletes.set(id, { task, timer });
  },

  undoRemove(id) {
    const pending = pendingDeletes.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeletes.delete(id);
    if (!get().tasks.some((t) => t.id === id)) set({ tasks: [pending.task, ...get().tasks] });
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

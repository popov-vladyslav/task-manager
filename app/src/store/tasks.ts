import { create } from 'zustand';
import type {
  Context,
  RecurrenceInput,
  ReorderScope,
  Subtask,
  Task,
  UpdateContextInput,
  UpdateSubtaskInput,
} from '@task-manager/shared';
import { api } from '../lib/api';
import { currentT } from '../lib/i18n';
import { TOAST_DURATION_MS, useToastStore } from './toast';

// Must exceed the toast duration so the Undo action can never outlive the commit.
const DELETE_UNDO_MS = TOAST_DURATION_MS + 1000;
const pendingDeletes = new Map<string, { task: Task; timer: ReturnType<typeof setTimeout> }>();

// Data younger than this is considered fresh, so a screen regaining focus right
// after boot (or right after you tabbed away and back) doesn't refetch.
const STALE_AFTER_MS = 10_000;

// The single in-flight load(), shared by every caller so focus events, mount and
// pull-to-refresh can never stack up duplicate requests.
let inFlightLoad: Promise<void> | null = null;

export function isPendingDelete(id: string): boolean {
  return pendingDeletes.has(id);
}

interface TasksState {
  contexts: Context[];
  tasks: Task[]; // all open tasks (status != done), unfiltered
  completed: Task[]; // done tasks, loaded lazily for the "Show completed" section
  completedCounts: Record<string, number> | null;
  activeContextId: number | null; // null = "All"
  loading: boolean;
  hydrated: boolean;
  lastLoadedAt: number | null; // client ms of the last successful load
  error: string | null;
  pendingOpenTaskId: string | null; // set by a tapped notification; consumed by the screen

  load: (opts?: { silent?: boolean }) => Promise<void>;
  refreshIfStale: (maxAgeMs?: number) => Promise<void>;
  loadCompleted: () => Promise<void>;
  uncomplete: (task: Task) => Promise<void>;
  setActiveContext: (id: number | null) => void;
  createContext: (
    label: string,
    color: string,
    excludeFromAll?: boolean,
    emoji?: string | null,
  ) => Promise<void>;
  updateContext: (id: number, patch: UpdateContextInput) => Promise<void>;
  reorderContexts: (ids: number[]) => Promise<void>;
  deleteContext: (id: number) => Promise<void>; // throws (409 message) if still referenced
  resetData: () => Promise<void>; // wipes tasks/recurrence/timers; keeps contexts
  addTask: (
    title: string,
    extra?: {
      contextId?: number | null;
      dueAt?: string | null;
      remindAt?: string | null;
      durationMin?: number | null;
      note?: string | null;
      recurrence?: RecurrenceInput | null;
    },
  ) => Promise<Task | null>;
  toggleComplete: (task: Task) => Promise<void>;
  patchTask: (id: string, patch: Parameters<typeof api.updateTask>[1]) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  undoRemove: (id: string) => void; // restore a task within its delete-undo window
  reorder: (
    id: string,
    afterId: string | null,
    beforeId: string | null,
    scope: ReorderScope,
  ) => Promise<void>;
  requestOpenTask: (id: string | null) => void;
  addSubtask: (taskId: string, title: string) => Promise<void>;
  updateSubtask: (taskId: string, id: string, patch: UpdateSubtaskInput) => Promise<void>;
  deleteSubtask: (taskId: string, id: string) => Promise<void>;
  reorderSubtasks: (taskId: string, ids: string[]) => Promise<void>;
}

const replaceIn = (list: Task[], updated: Task) =>
  list.map((t) => (t.id === updated.id ? updated : t));

export const countKey = (contextId: number | null) =>
  contextId == null ? 'none' : String(contextId);

const bump = (counts: Record<string, number> | null, contextId: number | null, delta: number) => {
  if (!counts) return counts;
  const key = countKey(contextId);
  return { ...counts, [key]: Math.max(0, (counts[key] ?? 0) + delta) };
};

export const TEMP_SUBTASK_PREFIX = 'tmp-';

const mapSubtasks = (list: Task[], taskId: string, fn: (subs: Subtask[]) => Subtask[]) =>
  list.map((t) => (t.id === taskId ? { ...t, subtasks: fn(t.subtasks ?? []) } : t));

export const useTasksStore = create<TasksState>((set, get) => ({
  contexts: [],
  tasks: [],
  completed: [],
  completedCounts: null,
  activeContextId: null,
  loading: false,
  hydrated: false,
  lastLoadedAt: null,
  error: null,
  pendingOpenTaskId: null,

  async load(opts) {
    // Coalesce concurrent callers (focus + pull-to-refresh firing together, or
    // focus firing rapidly while tabbing) onto one request.
    if (inFlightLoad) return inFlightLoad;
    // `silent` keeps `loading` false so an already-populated screen never flashes
    // its full-screen spinner on a background refresh.
    if (!opts?.silent) set({ loading: true, error: null });
    inFlightLoad = (async () => {
      try {
        const [contexts, tasks, completedCounts] = await Promise.all([
          api.listContexts(),
          api.listTasks(),
          api.completedCounts().catch(() => null),
        ]);
        const open = pendingDeletes.size ? tasks.filter((t) => !pendingDeletes.has(t.id)) : tasks;
        set({
          contexts,
          tasks: open,
          completedCounts,
          loading: false,
          hydrated: true,
          lastLoadedAt: Date.now(),
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : currentT()('toasts.loadFailed'),
        });
      } finally {
        inFlightLoad = null;
      }
    })();
    return inFlightLoad;
  },

  // Silent background refresh, skipped while the data is still fresh — so
  // returning to a screen you just left costs nothing.
  async refreshIfStale(maxAgeMs = STALE_AFTER_MS) {
    const { lastLoadedAt } = get();
    if (lastLoadedAt != null && Date.now() - lastLoadedAt < maxAgeMs) return;
    await get().load({ silent: true });
  },

  async loadCompleted() {
    try {
      const completed = await api.listTasks({ status: 'done' });
      const counts: Record<string, number> = {};
      for (const t of completed)
        counts[countKey(t.contextId)] = (counts[countKey(t.contextId)] ?? 0) + 1;
      set({ completed, completedCounts: counts });
    } catch {
      /* ignore — the section just stays empty */
    }
  },

  async uncomplete(task) {
    // Optimistic: move it out of the completed list back into the open list.
    const { completed, tasks, completedCounts } = get();
    set({
      completed: completed.filter((t) => t.id !== task.id),
      completedCounts: bump(completedCounts, task.contextId, -1),
    });
    try {
      const updated = await api.updateTask(task.id, { status: 'active' });
      set({ tasks: [updated, ...get().tasks] });
    } catch {
      set({ completed, tasks, completedCounts }); // rollback
    }
  },

  setActiveContext(id) {
    set({ activeContextId: id });
  },

  async createContext(label, color, excludeFromAll, emoji) {
    const created = await api.createContext({
      label,
      color,
      excludeFromAll,
      emoji: emoji ?? undefined,
    });
    set({ contexts: [...get().contexts, created].sort((a, b) => a.sortOrder - b.sortOrder) });
  },

  async updateContext(id, patch) {
    const updated = await api.updateContext(id, patch);
    set({ contexts: get().contexts.map((c) => (c.id === id ? updated : c)) });
  },

  async reorderContexts(ids) {
    const current = get().contexts;
    const position = new Map(ids.map((id, i) => [id, i]));
    set({
      contexts: current
        .map((c) => ({ ...c, sortOrder: position.get(c.id) ?? c.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    });
    try {
      set({ contexts: await api.reorderContexts(ids) });
    } catch {
      get().load();
    }
  },

  async deleteContext(id) {
    // Let a 409 (context still referenced) propagate — the caller surfaces the message.
    await api.deleteContext(id);
    set({
      contexts: get().contexts.filter((c) => c.id !== id),
      activeContextId: get().activeContextId === id ? null : get().activeContextId,
    });
    api
      .completedCounts()
      .then((completedCounts) => set({ completedCounts }))
      .catch(() => {});
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
      note: extra?.note ?? undefined,
      recurrence: extra?.recurrence ?? undefined,
    });
    set({ tasks: [created, ...get().tasks] });
    return created;
  },

  async toggleComplete(task) {
    // Optimistic: completing removes the task from the open list and (if the
    // completed section has been loaded) surfaces it there.
    const prev = get().tasks;
    const prevCompleted = get().completed;
    const prevCounts = get().completedCounts;
    set({
      tasks: prev.filter((t) => t.id !== task.id),
      completed: [{ ...task, status: 'done' }, ...prevCompleted],
      completedCounts: bump(prevCounts, task.contextId, 1),
    });
    try {
      await api.updateTask(task.id, { completed: true });
    } catch {
      set({ tasks: prev, completed: prevCompleted, completedCounts: prevCounts }); // rollback
    }
  },

  async patchTask(id, patch) {
    const before = get().tasks.find((t) => t.id === id) ?? get().completed.find((t) => t.id === id);
    const updated = await api.updateTask(id, patch);
    const done = updated.status === 'done';
    let counts = get().completedCounts;
    if (before?.status === 'done') counts = bump(counts, before.contextId, -1);
    if (done) counts = bump(counts, updated.contextId, 1);
    set({
      completedCounts: counts,
      tasks: done
        ? get().tasks.filter((t) => t.id !== id)
        : get().tasks.some((t) => t.id === id)
          ? replaceIn(get().tasks, updated)
          : [updated, ...get().tasks],
      completed: done
        ? get().completed.some((t) => t.id === id)
          ? replaceIn(get().completed, updated)
          : [updated, ...get().completed]
        : get().completed.filter((t) => t.id !== id),
    });
  },

  async removeTask(id) {
    const task = get().tasks.find((t) => t.id === id) ?? get().completed.find((t) => t.id === id);
    if (!task || pendingDeletes.has(id)) return;
    const wasDone = task.status === 'done';
    set({
      tasks: get().tasks.filter((t) => t.id !== id),
      completed: get().completed.filter((t) => t.id !== id),
      completedCounts: wasDone
        ? bump(get().completedCounts, task.contextId, -1)
        : get().completedCounts,
    });
    const restore = () => {
      if (wasDone) {
        if (!get().completed.some((t) => t.id === id))
          set({
            completed: [task, ...get().completed],
            completedCounts: bump(get().completedCounts, task.contextId, 1),
          });
      } else if (!get().tasks.some((t) => t.id === id)) {
        set({ tasks: [task, ...get().tasks] });
      }
    };
    const timer = setTimeout(() => {
      pendingDeletes.delete(id);
      api.deleteTask(id).catch(() => {
        restore();
        const tr = currentT();
        useToastStore
          .getState()
          .show({ title: tr('toasts.deleteTaskFailed'), message: task.title });
      });
    }, DELETE_UNDO_MS);
    pendingDeletes.set(id, { task, timer });
  },

  undoRemove(id) {
    const pending = pendingDeletes.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeletes.delete(id);
    const list = pending.task.status === 'done' ? 'completed' : 'tasks';
    if (!get()[list].some((t) => t.id === id)) set({ [list]: [pending.task, ...get()[list]] });
    if (list === 'completed')
      set({ completedCounts: bump(get().completedCounts, pending.task.contextId, 1) });
  },

  requestOpenTask(id) {
    set({ pendingOpenTaskId: id });
  },

  async addSubtask(taskId, title) {
    const tempId = `${TEMP_SUBTASK_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const append = (subs: Subtask[]) => [
      ...subs,
      {
        id: tempId,
        taskId,
        title,
        done: false,
        sortOrder: subs.reduce((max, x) => Math.max(max, x.sortOrder), 0) + 1,
        createdAt: new Date().toISOString(),
      },
    ];
    set({
      tasks: mapSubtasks(get().tasks, taskId, append),
      completed: mapSubtasks(get().completed, taskId, append),
    });
    const drop = (subs: Subtask[]) => subs.filter((x) => x.id !== tempId);
    try {
      const updated = await api.addSubtask(taskId, { title });
      const merge = (list: Task[]) =>
        list.map((t) => {
          if (t.id !== taskId) return t;
          const stillPending = (t.subtasks ?? []).filter(
            (x) => x.id.startsWith(TEMP_SUBTASK_PREFIX) && x.id !== tempId,
          );
          return { ...updated, subtasks: [...(updated.subtasks ?? []), ...stillPending] };
        });
      set({ tasks: merge(get().tasks), completed: merge(get().completed) });
    } catch (e) {
      set({
        tasks: mapSubtasks(get().tasks, taskId, drop),
        completed: mapSubtasks(get().completed, taskId, drop),
      });
      throw e;
    }
  },

  async updateSubtask(taskId, id, patch) {
    const prev = { tasks: get().tasks, completed: get().completed };
    const apply = (subs: Subtask[]) => subs.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({
      tasks: mapSubtasks(prev.tasks, taskId, apply),
      completed: mapSubtasks(prev.completed, taskId, apply),
    });
    try {
      const updated = await api.updateSubtask(taskId, id, patch);
      set({
        tasks: replaceIn(get().tasks, updated),
        completed: replaceIn(get().completed, updated),
      });
    } catch {
      set(prev);
    }
  },

  async deleteSubtask(taskId, id) {
    const prev = { tasks: get().tasks, completed: get().completed };
    const apply = (subs: Subtask[]) => subs.filter((s) => s.id !== id);
    set({
      tasks: mapSubtasks(prev.tasks, taskId, apply),
      completed: mapSubtasks(prev.completed, taskId, apply),
    });
    try {
      const updated = await api.deleteSubtask(taskId, id);
      set({
        tasks: replaceIn(get().tasks, updated),
        completed: replaceIn(get().completed, updated),
      });
    } catch {
      set(prev);
    }
  },

  async reorderSubtasks(taskId, ids) {
    const position = new Map(ids.map((id, i) => [id, i]));
    const apply = (subs: Subtask[]) =>
      subs
        .map((s) => ({ ...s, sortOrder: position.get(s.id) ?? s.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    set({
      tasks: mapSubtasks(get().tasks, taskId, apply),
      completed: mapSubtasks(get().completed, taskId, apply),
    });
    try {
      const updated = await api.reorderSubtasks(taskId, ids);
      set({
        tasks: replaceIn(get().tasks, updated),
        completed: replaceIn(get().completed, updated),
      });
    } catch {
      get().load();
    }
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
    const newSort =
      a == null && b == null ? 0 : a == null ? b! - 1 : b == null ? a + 1 : (a + b) / 2;
    set({ tasks: current.map((t) => (t.id === id ? { ...t, [key]: newSort } : t)) });
    try {
      const updated = await api.reorderTask(id, { afterId, beforeId, scope });
      set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) });
    } catch {
      get().load(); // resync on failure
    }
  },
}));

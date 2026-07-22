import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronRight } from 'lucide-react-native';
import { DraggableTaskList } from './draggable-task-list';
import { QuickAddInput, QuickAddBar } from './quick-add';
import type { Context, Task } from '@task-manager/shared';
import { colors, headerDate, monoFont, WIDE_BREAKPOINT } from '../../theme';
import { haptics } from '../../lib/haptics';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { SideNavLinks } from '../nav/nav-chrome';
import { TaskCard } from './task-card';
import { ContextChips } from './context-chips';
import { TaskDetail } from './task-detail';

export function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const {
    contexts,
    tasks,
    completed,
    activeContextId,
    loading,
    load,
    loadCompleted,
    uncomplete,
    setActiveContext,
    addTask,
    toggleComplete,
    patchTask,
    removeTask,
    reorder,
    pendingOpenTaskId,
    requestOpenTask,
  } = useTasksStore();

  const [selected, setSelected] = useState<Task | null>(null);
  const [focusTitle, setFocusTitle] = useState(false); // autofocus the title for a just-created task
  const [toast, setToast] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Data is normally prefetched under the splash screen (see _layout). Only load
  // here if that hasn't happened yet (e.g. a fast in-app remount before boot).
  useEffect(() => {
    if (!useTasksStore.getState().hydrated) load();
  }, [load]);

  // Keep the open detail in sync with store updates (e.g. after a patch).
  useEffect(() => {
    if (!selected) return;
    const fresh = tasks.find((t) => t.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [tasks, selected]);

  // Open the task from a tapped notification once its data is loaded.
  useEffect(() => {
    if (!pendingOpenTaskId) return;
    const t = tasks.find((x) => x.id === pendingOpenTaskId);
    if (t) {
      setFocusTitle(false);
      setSelected(t);
      requestOpenTask(null);
    }
  }, [pendingOpenTaskId, tasks, requestOpenTask]);

  const contextById = useMemo(() => {
    const m = new Map<number, Context>();
    for (const c of contexts) m.set(c.id, c);
    return m;
  }, [contexts]);

  // Contexts flagged "exclude from All" — their tasks are kept out of the All
  // view (and its count), but stay visible when that context's chip is selected.
  const excludedIds = useMemo(() => {
    const s = new Set<number>();
    for (const c of contexts) if (c.excludeFromAll) s.add(c.id);
    return s;
  }, [contexts]);

  const inAll = useCallback(
    (t: Task) => t.contextId == null || !excludedIds.has(t.contextId),
    [excludedIds],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const t of tasks) {
      if (t.contextId != null) c[String(t.contextId)] = (c[String(t.contextId)] ?? 0) + 1;
      if (inAll(t)) c.all += 1;
    }
    return c;
  }, [tasks, inAll]);

  const visible = useMemo(() => {
    const list =
      activeContextId == null
        ? tasks.filter(inAll)
        : tasks.filter((t) => t.contextId === activeContextId);
    const key = activeContextId == null ? 'sortGlobal' : 'sortContext';
    return list.sort((a, b) => a[key] - b[key]);
  }, [tasks, activeContextId, inAll]);

  // Completed tasks shown under the collapsible section, scoped to the same view.
  const visibleCompleted = useMemo(
    () =>
      activeContextId == null
        ? completed.filter(inAll)
        : completed.filter((t) => t.contextId === activeContextId),
    [completed, activeContextId, inAll],
  );

  // Grouped once per change instead of on every render (it was called inline in JSX).
  const completedGroups = useMemo(() => groupCompletedByDay(visibleCompleted), [visibleCompleted]);

  const toggleShowCompleted = () => {
    const next = !showCompleted;
    setShowCompleted(next);
    if (next) loadCompleted();
  };

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // Stable per-row handlers (parameterized by task/id) so TaskCard's memo holds and
  // rows don't all re-render when the parent does.
  const onToggle = useCallback(
    (task: Task) => {
      haptics.success();
      toggleComplete(task);
      flash(task.recurrenceId ? 'Done. Next instance scheduled.' : 'Done ✓');
    },
    [toggleComplete, flash],
  );

  const onOpenDetail = useCallback((task: Task) => {
    setFocusTitle(false);
    setSelected(task);
  }, []);

  const onPatchTitle = useCallback(
    (id: string, title: string) => patchTask(id, { title }),
    [patchTask],
  );
  const onDeleteTask = useCallback((id: string) => removeTask(id), [removeTask]);

  // Quick-add: create straight from the top input with any attributes picked in
  // the keyboard-accessory panels. Stays on the list (no auto-open of the detail).
  const onQuickCreate = async (input: {
    title: string;
    contextId?: number | null;
    dueAt?: string | null;
    remindAt?: string | null;
    durationMin?: number | null;
  }) => {
    await addTask(input.title, {
      contextId: input.contextId,
      dueAt: input.dueAt,
      remindAt: input.remindAt,
      durationMin: input.durationMin,
    });
  };

  const completedSection = (
    <View style={styles.completedWrap}>
      <Pressable onPress={toggleShowCompleted} style={styles.completedToggle}>
        {showCompleted ? (
          <ChevronDown size={14} color={colors.textMuted} />
        ) : (
          <ChevronRight size={14} color={colors.textMuted} />
        )}
        <Text style={styles.completedToggleLabel}>
          {showCompleted ? 'HIDE COMPLETED' : 'SHOW COMPLETED'}
        </Text>
      </Pressable>
      {showCompleted ? (
        visibleCompleted.length === 0 ? (
          <Text style={styles.noCompleted}>No completed tasks</Text>
        ) : (
          completedGroups.map((g) => (
            <View key={g.key || 'earlier'} style={styles.completedGroup}>
              <Text style={styles.completedGroupLabel}>{g.label.toUpperCase()}</Text>
              {g.tasks.map((t) => (
                <CompletedRow
                  key={t.id}
                  task={t}
                  onUncomplete={() => {
                    haptics.select();
                    uncomplete(t);
                  }}
                  onOpen={() => {
                    setFocusTitle(false);
                    setSelected(t);
                  }}
                />
              ))}
            </View>
          ))
        )
      ) : null}
    </View>
  );

  const renderCard = useCallback(
    (item: Task, drag: () => void) => (
      <TaskCard
        task={item}
        context={item.contextId != null ? contextById.get(item.contextId) : undefined}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
        onPatchTitle={onPatchTitle}
        onDelete={onDeleteTask}
        onDrag={drag}
      />
    ),
    [contextById, onToggle, onOpenDetail, onPatchTitle, onDeleteTask],
  );

  const list =
    loading && visible.length === 0 ? (
      <ActivityIndicator color={colors.accentPrimary} style={styles.listSpinner} />
    ) : (
      <DraggableTaskList
        tasks={visible}
        onReorder={(movedId, afterId, beforeId) =>
          reorder(movedId, afterId, beforeId, activeContextId == null ? 'global' : 'context')
        }
        footer={completedSection}
        empty={<Text style={styles.emptyText}>No open tasks</Text>}
        renderCard={renderCard}
      />
    );

  const toastNode = toast ? (
    // Full-width absolute row so the pill centers on web too: `alignSelf` doesn't
    // center an out-of-flow element on react-native-web (it collapsed bottom-left).
    <View pointerEvents="none" style={styles.toastWrap}>
      <View style={styles.toastPill}>
        <Text style={styles.toastText}>{toast}</Text>
      </View>
    </View>
  ) : null;

  const detailNode = selected ? (
    <TaskDetail
      task={selected}
      contexts={contexts}
      autoFocusTitle={focusTitle}
      onClose={() => setSelected(null)}
      onPatch={patchTask}
      onDelete={removeTask}
    />
  ) : null;

  // ---- WEB / WIDE: sidebar + main ----
  if (wide) {
    const activeLabel =
      activeContextId == null ? 'All tasks' : (contextById.get(activeContextId)?.label ?? '');
    return (
      <View style={styles.wideRoot}>
        <View style={[styles.sidebar, { paddingTop: insets.top + 16 }]}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarLogLabel}>LOG</Text>
            <Text style={styles.sidebarDate}>{headerDate().replace('LOG — ', '')}</Text>
          </View>

          <SideNavLinks />

          <Text style={styles.sidebarContextsLabel}>CONTEXTS</Text>
          <SidebarContext
            label="All"
            dot={colors.textSecondary}
            count={counts.all ?? 0}
            active={activeContextId == null}
            onPress={() => setActiveContext(null)}
          />
          {contexts.map((c) => (
            <SidebarContext
              key={c.id}
              label={c.label}
              dot={c.color}
              count={counts[String(c.id)] ?? 0}
              active={activeContextId === c.id}
              onPress={() => setActiveContext(c.id)}
            />
          ))}

          <View style={styles.flex1} />
          <Pressable onPress={() => useAuthStore.getState().signOut()} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={[styles.wideMain, { paddingTop: insets.top + 24 }]}>
          <Text style={styles.wideTitle}>{activeLabel}</Text>
          <QuickAddInput activeContextId={activeContextId} onCreate={onQuickCreate} />
          <View style={styles.wideListWrap}>{list}</View>
        </View>

        {toastNode}
        {detailNode}
      </View>
    );
  }

  // ---- MOBILE / NARROW: header + chips + quick-add + list + tabs ----
  // Plain View (NOT KeyboardAvoidingView): the quick-add input sits at the top
  // (never covered) and the accessory row rides the keyboard via QuickAddBar's
  // KeyboardStickyView. A KeyboardAvoidingView here would double-compensate with
  // the sticky view and fling the accessory to the top of the screen.
  return (
    <View style={[styles.mobileRoot, { paddingTop: insets.top + 8 }]}>
      <View style={styles.mobileHeader}>
        <Text style={styles.mobileHeaderDate}>{headerDate()}</Text>
        <Text style={styles.mobileHeaderTitle}>
          {tasks.length} open {tasks.length === 1 ? 'task' : 'tasks'}
        </Text>
      </View>

      <ContextChips
        contexts={contexts}
        counts={counts}
        activeContextId={activeContextId}
        onSelect={setActiveContext}
      />

      <QuickAddInput activeContextId={activeContextId} onCreate={onQuickCreate} />

      <View style={styles.flex1}>{list}</View>

      <QuickAddBar contexts={contexts} />

      {toastNode}
      {detailNode}
    </View>
  );
}

function SidebarContext({
  label,
  dot,
  count,
  active,
  onPress,
}: {
  label: string;
  dot: string;
  count: number;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      // eslint-disable-next-line react-native/no-inline-styles
      style={[styles.sidebarRow, { backgroundColor: active ? colors.bgCard : 'transparent' }]}
    >
      <View style={[styles.sidebarDot, { backgroundColor: dot }]} />
      <Text
        style={[
          styles.sidebarRowLabel,
          { color: active ? colors.textPrimary : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
      <Text style={styles.sidebarCount}>{count}</Text>
    </Pressable>
  );
}

// ---- Completed tasks grouped by completion day (Europe/Warsaw, the app's tz) ----
const WARSAW_TZ = 'Europe/Warsaw';

// YYYY-MM-DD for an instant, in the app's scheduling timezone. Falls back to the
// device-local day if the JS engine lacks tz data (older Hermes without full ICU).
function warsawDayKey(iso: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: WARSAW_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
}

function completedDayLabel(key: string): string {
  if (!key) return 'Earlier';
  const now = Date.now();
  if (key === warsawDayKey(new Date(now).toISOString())) return 'Today';
  if (key === warsawDayKey(new Date(now - 86_400_000).toISOString())) return 'Yesterday';
  // key is YYYY-MM-DD; noon avoids any DST edge when re-parsing for the label.
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface CompletedGroup {
  key: string;
  label: string;
  tasks: Task[];
}

// Newest day first; within a day, newest completion first. Rows with no
// completedAt (legacy) fall into an 'Earlier' bucket that sorts last.
function groupCompletedByDay(tasks: Task[]): CompletedGroup[] {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.completedAt ? warsawDayKey(t.completedAt) : '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, ts]) => ({
      key,
      label: completedDayLabel(key),
      tasks: ts.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    }));
}

// A completed task row (dimmed, strikethrough). The check un-completes it; the
// row opens the detail.
function CompletedRow({
  task,
  onUncomplete,
  onOpen,
}: {
  task: Task;
  onUncomplete: () => void;
  onOpen: () => void;
}) {
  return (
    <Pressable onPress={onOpen} style={styles.completedRow}>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onUncomplete();
        }}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityLabel={`Reopen ${task.title}`}
        style={styles.completedCheck}
      >
        <Check size={12} color={colors.bgBase} />
      </Pressable>
      <Text style={styles.completedRowTitle} numberOfLines={1}>
        {task.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  completedWrap: { marginTop: 8 },
  completedToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  completedToggleLabel: {
    fontFamily: monoFont,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textMuted,
  },
  noCompleted: { color: colors.textFaint, fontSize: 13, paddingVertical: 6 },
  completedGroup: { marginTop: 4 },
  completedGroupLabel: {
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textFaint,
    marginTop: 10,
    marginBottom: 2,
  },
  listSpinner: { marginTop: 40 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center' },
  toastPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  toastText: { fontSize: 12, color: colors.textPrimary },
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.bgBase },
  sidebar: {
    width: 240,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#10141B',
    borderRightWidth: 1,
    borderRightColor: colors.bgCard,
  },
  sidebarHeader: { paddingHorizontal: 8, paddingBottom: 20 },
  sidebarLogLabel: {
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textMuted,
  },
  sidebarDate: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  sidebarContextsLabel: {
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textFaint,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  flex1: { flex: 1 },
  signOut: { paddingHorizontal: 8, paddingVertical: 8 },
  signOutText: { fontSize: 12, color: colors.textMuted },
  wideMain: { flex: 1, paddingHorizontal: 24 },
  wideTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  wideListWrap: { flex: 1, minHeight: 0 },
  mobileRoot: { flex: 1, backgroundColor: colors.bgSurface },
  mobileHeader: { paddingHorizontal: 20, paddingBottom: 12 },
  mobileHeaderDate: {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  mobileHeaderTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  sidebarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 2,
  },
  sidebarDot: { width: 8, height: 8, borderRadius: 4 },
  sidebarRowLabel: { flex: 1, fontSize: 12.5 },
  sidebarCount: {
    fontFamily: monoFont,
    fontSize: 10,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    opacity: 0.6,
  },
  completedCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentTimer,
  },
  completedRowTitle: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Context, Task } from '@task-manager/shared';
import { Header } from '../../components/header';
import { haptics } from '../../lib/haptics';
import { useRefreshOnFocus } from '../../lib/use-refresh-on-focus';
import { useAuthStore } from '../../store/auth';
import { useTasksStore } from '../../store/tasks';
import { excludedContextIds, isInAll } from '../../store/task-selectors';
import { useToastStore } from '../../store/toast';
import { useUiStore } from '../../store/ui';
import { useTheme, type Theme } from '../../theme';
import { DrawerContent } from '../nav/drawer';
import { SideNavLinks } from '../nav/nav-chrome';
import { CompletedSection } from '../tasks/completed-section';
import { DraggableTaskList } from '../tasks/draggable-task-list';
import { QuickAddBar, QuickAddInput } from '../tasks/quick-add';
import { TaskCard } from '../tasks/task-card';
import { TaskDetail } from '../tasks/task-detail';

export function ContextScreen() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= t.sizes.wideBreakpoint;

  const contexts = useTasksStore((s) => s.contexts);
  const tasks = useTasksStore((s) => s.tasks);
  const completed = useTasksStore((s) => s.completed);
  const activeContextId = useTasksStore((s) => s.activeContextId);
  const loading = useTasksStore((s) => s.loading);
  const load = useTasksStore((s) => s.load);
  const refreshIfStale = useTasksStore((s) => s.refreshIfStale);
  const loadCompleted = useTasksStore((s) => s.loadCompleted);
  const uncomplete = useTasksStore((s) => s.uncomplete);
  const addTask = useTasksStore((s) => s.addTask);
  const toggleComplete = useTasksStore((s) => s.toggleComplete);
  const patchTask = useTasksStore((s) => s.patchTask);
  const removeTask = useTasksStore((s) => s.removeTask);
  const undoRemove = useTasksStore((s) => s.undoRemove);
  const reorder = useTasksStore((s) => s.reorder);
  const pendingOpenTaskId = useTasksStore((s) => s.pendingOpenTaskId);
  const requestOpenTask = useTasksStore((s) => s.requestOpenTask);
  const openDrawer = useUiStore((s) => s.openDrawer);
  const openContextMenu = useUiStore((s) => s.openContextMenu);

  const [selected, setSelected] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    if (!useTasksStore.getState().hydrated) load();
  }, [load]);

  useRefreshOnFocus(refreshIfStale);

  useEffect(() => {
    if (!selected) return;
    const fresh = tasks.find((x) => x.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [tasks, selected]);

  useEffect(() => {
    if (!pendingOpenTaskId) return;
    const task = tasks.find((x) => x.id === pendingOpenTaskId);
    if (task) {
      setSelected(task);
      requestOpenTask(null);
    }
  }, [pendingOpenTaskId, tasks, requestOpenTask]);

  const contextById = useMemo(() => {
    const m = new Map<number, Context>();
    for (const c of contexts) m.set(c.id, c);
    return m;
  }, [contexts]);
  const activeContext = activeContextId == null ? null : contextById.get(activeContextId);
  const excluded = useMemo(() => excludedContextIds(contexts), [contexts]);

  const inView = useCallback(
    (task: Task) =>
      activeContextId == null ? isInAll(task, excluded) : task.contextId === activeContextId,
    [activeContextId, excluded],
  );

  const visible = useMemo(() => {
    const key = activeContextId == null ? 'sortGlobal' : 'sortContext';
    return tasks.filter(inView).sort((a, b) => a[key] - b[key]);
  }, [tasks, activeContextId, inView]);

  const visibleCompleted = useMemo(() => completed.filter(inView), [completed, inView]);

  const toggleShowCompleted = () => {
    const next = !showCompleted;
    setShowCompleted(next);
    if (next) loadCompleted();
  };

  const onToggle = useCallback(
    (task: Task) => {
      haptics.success();
      toggleComplete(task);
      useToastStore.getState().show({
        title: task.recurrenceId ? 'Completed · next instance scheduled' : 'Task completed',
        message: task.title,
        onUndo: () => uncomplete(task),
      });
    },
    [toggleComplete, uncomplete],
  );

  const onOpenDetail = useCallback((task: Task) => setSelected(task), []);

  const onPatchTitle = useCallback(
    (id: string, title: string) => patchTask(id, { title }),
    [patchTask],
  );

  const onDeleteTask = useCallback(
    (id: string) => {
      const task = useTasksStore.getState().tasks.find((x) => x.id === id);
      removeTask(id);
      useToastStore.getState().show({
        title: 'Task deleted',
        message: task?.title,
        onUndo: () => undoRemove(id),
      });
    },
    [removeTask, undoRemove],
  );

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
    useToastStore.getState().show({ title: 'Task created', message: input.title });
  };

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

  const completedSection = (
    <CompletedSection
      tasks={visibleCompleted}
      open={showCompleted}
      onToggle={toggleShowCompleted}
      onUncomplete={(task) => {
        haptics.select();
        uncomplete(task);
      }}
      onOpen={setSelected}
    />
  );

  const list =
    loading && visible.length === 0 ? (
      <ActivityIndicator color={t.colors.accentPrimary} style={styles.spinner} />
    ) : (
      <DraggableTaskList
        tasks={visible}
        onRefresh={load}
        onReorder={(movedId, afterId, beforeId) =>
          reorder(movedId, afterId, beforeId, activeContextId == null ? 'global' : 'context')
        }
        footer={completedSection}
        empty={<Text style={styles.empty}>No open tasks</Text>}
        renderCard={renderCard}
      />
    );

  const detailNode = selected ? (
    <TaskDetail
      task={selected}
      contexts={contexts}
      onClose={() => setSelected(null)}
      onPatch={patchTask}
      onDelete={onDeleteTask}
    />
  ) : null;

  const title = activeContext?.label ?? 'All';
  const inset = useMemo(
    () => StyleSheet.create({ sidebar: { paddingTop: insets.top + 16 } }),
    [insets.top],
  );

  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <View style={[styles.sidebar, inset.sidebar]}>
          <View style={styles.sidebarNav}>
            <SideNavLinks />
          </View>
          <View style={styles.flex1}>
            <DrawerContent />
          </View>
          <Pressable onPress={() => useAuthStore.getState().signOut()} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
        <View style={styles.wideMain}>
          <Header
            title={title}
            emoji={activeContext?.emoji}
            leftNode={<View style={styles.headerSpacer} />}
            right={activeContext ? undefined : <View style={styles.headerSpacer} />}
            onMorePress={openContextMenu}
            align="start"
          />
          <QuickAddInput activeContextId={activeContextId} onCreate={onQuickCreate} />
          <View style={styles.wideListWrap}>{list}</View>
        </View>
        {detailNode}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Header
        title={title}
        emoji={activeContext?.emoji}
        onLeftPress={openDrawer}
        right={activeContext ? undefined : <View style={styles.headerSpacer} />}
        onMorePress={openContextMenu}
      />
      <QuickAddInput activeContextId={activeContextId} onCreate={onQuickCreate} />
      <View style={styles.flex1}>{list}</View>
      <QuickAddBar contexts={contexts} />
      {detailNode}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    root: { flex: 1, backgroundColor: t.colors.bgBase },
    headerSpacer: { width: 38, height: 38 },
    spinner: { marginTop: 40 },
    empty: { color: t.colors.textMuted, textAlign: 'center', marginTop: 40 },
    wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: t.colors.bgBase },
    sidebar: {
      width: 280,
      paddingBottom: 16,
      backgroundColor: t.colors.bgSurface,
      borderRightWidth: 1,
      borderRightColor: t.colors.borderSubtle,
    },
    sidebarNav: { paddingHorizontal: 16 },
    signOut: { paddingHorizontal: 24, paddingVertical: 8 },
    signOutText: { fontSize: 12, color: t.colors.textMuted },
    wideMain: { flex: 1, paddingHorizontal: 12 },
    wideListWrap: { flex: 1, minHeight: 0 },
  });

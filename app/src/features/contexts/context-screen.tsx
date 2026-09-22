import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Context, Task } from '@task-manager/shared';
import { Header } from '../../components/header';
import { haptics } from '../../lib/haptics';
import { useT } from '../../lib/i18n';
import { useRefreshOnFocus } from '../../lib/use-refresh-on-focus';
import { useTasksStore } from '../../store/tasks';
import { completedCountFor, excludedContextIds, isInAll } from '../../store/task-selectors';
import { useToastStore } from '../../store/toast';
import { useUiStore } from '../../store/ui';
import { useTheme, type Theme } from '../../theme';
import { WideSidebar } from '../nav/wide-sidebar';
import { EmptyState } from '../../components/empty-state';
import { CompletedSection } from '../tasks/completed-section';
import { DraggableTaskList } from '../tasks/draggable-task-list';
import { AddTaskRow } from '../tasks/add-task-row';
import { QuickCreateSheet } from '../tasks/quick-create-sheet';
import { TaskCard } from '../tasks/task-card';
import { useTaskCard } from '../tasks/task-card-host';
import { useDeleteTask } from '../tasks/use-delete-task';

export function ContextScreen() {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
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
  const toggleComplete = useTasksStore((s) => s.toggleComplete);
  const { requestDelete, deleteDialogNode } = useDeleteTask();
  const reorder = useTasksStore((s) => s.reorder);
  const pendingOpenTaskId = useTasksStore((s) => s.pendingOpenTaskId);
  const requestOpenTask = useTasksStore((s) => s.requestOpenTask);
  const openDrawer = useUiStore((s) => s.openDrawer);
  const openContextMenu = useUiStore((s) => s.openContextMenu);

  const { openTask, taskCardNode } = useTaskCard();
  const [showCompleted, setShowCompleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!useTasksStore.getState().hydrated) load();
  }, [load]);

  useRefreshOnFocus(refreshIfStale);

  useEffect(() => {
    if (!pendingOpenTaskId) return;
    if (tasks.some((x) => x.id === pendingOpenTaskId)) {
      openTask(pendingOpenTaskId);
      requestOpenTask(null);
    }
  }, [pendingOpenTaskId, tasks, requestOpenTask, openTask]);

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

  const completedCounts = useTasksStore((s) => s.completedCounts);
  const completedCount = completedCountFor(completedCounts, activeContextId, excluded);
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
        title: task.recurrenceId ? tr('toasts.taskCompletedNext') : tr('toasts.taskCompleted'),
        message: task.title,
        onUndo: () => uncomplete(task),
      });
    },
    [toggleComplete, uncomplete, tr],
  );

  const onOpenDetail = useCallback((task: Task) => openTask(task.id), [openTask]);

  const onDeleteTask = useCallback(
    (id: string) => {
      const { tasks, completed } = useTasksStore.getState();
      const task = tasks.find((x) => x.id === id) ?? completed.find((x) => x.id === id);
      if (task) requestDelete(task);
    },
    [requestDelete],
  );

  const renderCard = useCallback(
    (item: Task, drag: () => void) => (
      <TaskCard
        task={item}
        context={item.contextId != null ? contextById.get(item.contextId) : undefined}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
        onDelete={onDeleteTask}
        onDrag={drag}
      />
    ),
    [contextById, onToggle, onOpenDetail, onDeleteTask],
  );

  const completedSection =
    completedCount === 0 ? null : (
      <CompletedSection
        count={completedCount}
        tasks={visibleCompleted}
        open={showCompleted}
        onToggle={toggleShowCompleted}
        onUncomplete={(task) => {
          haptics.select();
          uncomplete(task);
        }}
        onOpen={(task) => openTask(task.id)}
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
        empty={<EmptyState label={tr('contexts.screen.noOpenTasks')} />}
        renderCard={renderCard}
      />
    );

  const title = activeContext?.label ?? tr('common.all');

  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <WideSidebar />
        <View style={styles.wideMain}>
          <Header
            title={title}
            emoji={activeContext?.emoji}
            leftNode={null}
            right={activeContext ? undefined : <View style={styles.headerSpacer} />}
            onMorePress={openContextMenu}
            align="start"
            horizontalPadding={20}
          />
          <AddTaskRow onPress={() => setCreateOpen(true)} />
          <View style={styles.wideListWrap}>{list}</View>
        </View>
        {taskCardNode}
        {deleteDialogNode}
        <QuickCreateSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onOpenCard={openTask}
        />
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
      <AddTaskRow onPress={() => setCreateOpen(true)} />
      <View style={styles.flex1}>{list}</View>
      {taskCardNode}
      {deleteDialogNode}
      <QuickCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onOpenCard={openTask}
      />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    root: { flex: 1, backgroundColor: t.colors.bgBase },
    headerSpacer: { width: 38, height: 38 },
    spinner: { marginTop: 40 },
    wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: t.colors.bgBase },
    wideMain: { flex: 1, paddingHorizontal: 12 },
    wideListWrap: { flex: 1, minHeight: 0 },
  });

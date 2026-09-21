import { useCallback, useMemo, useState } from 'react';
import type { Task } from '@task-manager/shared';
import { ChoiceDialog, type ChoiceOption } from '../../components/choice-dialog';
import { useT } from '../../lib/i18n';
import { useTasksStore } from '../../store/tasks';
import { useToastStore } from '../../store/toast';

interface Pending {
  task: Task;
  onDone?: () => void;
}

export function useDeleteTask() {
  const tr = useT();
  const removeTask = useTasksStore((s) => s.removeTask);
  const undoRemove = useTasksStore((s) => s.undoRemove);
  const removeSeries = useTasksStore((s) => s.removeSeries);
  const [pending, setPending] = useState<Pending | null>(null);

  const removeOne = useCallback(
    (task: Task, onDone?: () => void) => {
      removeTask(task.id);
      useToastStore.getState().show({
        title: tr('toasts.taskDeleted'),
        message: task.title,
        onUndo: () => undoRemove(task.id),
      });
      onDone?.();
    },
    [removeTask, undoRemove, tr],
  );

  const requestDelete = useCallback(
    (task: Task, onDone?: () => void) => {
      if (task.recurrenceId) setPending({ task, onDone });
      else removeOne(task, onDone);
    },
    [removeOne],
  );

  const options = useMemo<ChoiceOption[]>(() => {
    if (!pending) return [];
    const { task, onDone } = pending;
    return [
      {
        key: 'occurrence',
        label: tr('tasks.deleteScope.occurrence'),
        onPress: () => {
          setPending(null);
          removeOne(task, onDone);
        },
      },
      {
        key: 'series',
        label: tr('tasks.deleteScope.series'),
        danger: true,
        onPress: async () => {
          setPending(null);
          if (!(await removeSeries(task.id))) return;
          useToastStore.getState().show({ title: tr('toasts.seriesDeleted'), message: task.title });
          onDone?.();
        },
      },
    ];
  }, [pending, removeOne, removeSeries, tr]);

  const deleteDialogNode = (
    <ChoiceDialog
      open={pending !== null}
      title={tr('tasks.deleteScope.title')}
      message={tr('tasks.deleteScope.message')}
      options={options}
      onCancel={() => setPending(null)}
    />
  );

  return { requestDelete, deleteDialogNode };
}

import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskCardScreen } from '../../features/tasks/task-card-screen';
import { useTasksStore } from '../../store/tasks';

export default function TaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!useTasksStore.getState().hydrated) useTasksStore.getState().load();
  }, []);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return <TaskCardScreen taskId={String(id)} onClose={close} />;
}

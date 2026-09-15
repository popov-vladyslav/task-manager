import { useCallback, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { BottomSheet } from '../../components/bottom-sheet';
import { useTheme } from '../../theme';
import { TaskCardScreen } from './task-card-screen';

export function useTaskCard(): { openTask: (id: string) => void; taskCardNode: ReactNode } {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= t.sizes.wideBreakpoint;
  const [openId, setOpenId] = useState<string | null>(null);

  const openTask = useCallback(
    (id: string) => {
      if (wide) setOpenId(id);
      else router.push(`/task/${id}`);
    },
    [wide, router],
  );

  const close = useCallback(() => setOpenId(null), []);

  const taskCardNode = wide ? (
    <BottomSheet open={openId !== null} onClose={close} padded={false}>
      {openId ? <TaskCardScreen taskId={openId} onClose={close} /> : null}
    </BottomSheet>
  ) : null;

  return { openTask, taskCardNode };
}

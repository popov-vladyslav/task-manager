import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { Task } from '@task-manager/shared';

interface Props {
  tasks: Task[];
  renderCard: (task: Task, drag: () => void) => ReactNode;
  onReorder: (movedId: string, afterId: string | null, beforeId: string | null) => void;
}

const noop = () => {};

// Web: plain scrollable list (the web design has no drag handle; reordering is a
// mobile-primary interaction). Matches the sidebar layout's task column.
export function DraggableTaskList({ tasks, renderCard }: Props) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {tasks.map((t) => (
        <View key={t.id}>{renderCard(t, noop)}</View>
      ))}
    </ScrollView>
  );
}

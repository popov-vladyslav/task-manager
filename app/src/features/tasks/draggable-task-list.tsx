import { memo, useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';
import ReorderableList, {
  type ReorderableListReorderEvent,
  useReorderableDrag,
} from 'react-native-reorderable-list';
import type { Task } from '@task-manager/shared';
import { haptics } from '../../lib/haptics';
import { colors } from '../../theme';

interface Props {
  tasks: Task[];
  renderCard: (task: Task, drag: () => void) => ReactNode;
  onReorder: (movedId: string, afterId: string | null, beforeId: string | null) => void;
  footer?: ReactNode; // rendered below the list (e.g. the "Show completed" section)
  empty?: ReactNode; // rendered when there are no open tasks
  onRefresh?: () => void | Promise<void>; // pull-to-refresh handler
}

// memo'd so an unchanged row skips re-render when the list re-renders — relies on
// `renderCard` being a stable ref from the parent (see TasksScreen useCallback).
const DragRow = memo(function DragRow({
  item,
  renderCard,
}: {
  item: Task;
  renderCard: Props['renderCard'];
}) {
  const drag = useReorderableDrag();
  const startDrag = useCallback(() => {
    haptics.impact('medium');
    drag();
  }, [drag]);
  return <>{renderCard(item, startDrag)}</>;
});

// Variable-height reorderable list. Drag starts on a long-press of the card
// (tap still opens it — no tap/drag conflict). `flex: 1` gives it a bounded
// height so it scrolls internally (esp. on web) instead of overflowing.
//
// The list owns a local `data` copy that it reorders synchronously on drop, so
// its internal indices never point past the array (the crash we saw on drag-off).
// The store is updated in parallel to persist; when it re-emits, we re-sync.
export function DraggableTaskList({ tasks, renderCard, onReorder, footer, empty, onRefresh }: Props) {
  const [data, setData] = useState(tasks);
  useEffect(() => setData(tasks), [tasks]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleReorder = ({ from, to }: ReorderableListReorderEvent) => {
    if (from === to) return;
    const moved = data[from];
    if (!moved) return;
    haptics.impact('medium');
    const order = [...data];
    order.splice(from, 1);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, moved);
    setData(order); // update the list synchronously so it settles in place

    const idx = order.findIndex((t) => t.id === moved.id);
    const afterId = idx > 0 ? order[idx - 1].id : null; // item above (smaller sort)
    const beforeId = idx < order.length - 1 ? order[idx + 1].id : null; // item below
    onReorder(moved.id, afterId, beforeId);
  };

  return (
    <ReorderableList
      data={data}
      keyExtractor={(item, index) => item?.id ?? `__${index}`}
      onReorder={handleReorder}
      renderItem={({ item }) => <DragRow item={item} renderCard={renderCard} />}
      ListFooterComponent={footer as ReactElement}
      ListEmptyComponent={empty as ReactElement}
      style={styles.list}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentPrimary}
            colors={[colors.accentPrimary]}
          />
        ) : undefined
      }
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    />
  );
}

const styles = StyleSheet.create({
  // absolute-fill inside a flex:1 parent so the list bounds + scrolls on web
  // (react-native-web needs this; flex min-height:0 alone doesn't work here).
  list: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
});

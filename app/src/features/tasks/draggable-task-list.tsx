import { useEffect, useState, type ReactNode } from 'react';
import ReorderableList, {
  type ReorderableListReorderEvent,
  useReorderableDrag,
} from 'react-native-reorderable-list';
import type { Task } from '@task-manager/shared';

interface Props {
  tasks: Task[];
  renderCard: (task: Task, drag: () => void) => ReactNode;
  onReorder: (movedId: string, afterId: string | null, beforeId: string | null) => void;
}

function DragRow({ item, renderCard }: { item: Task; renderCard: Props['renderCard'] }) {
  const drag = useReorderableDrag();
  return <>{renderCard(item, drag)}</>;
}

// Variable-height reorderable list. Drag starts on a long-press of the card
// (tap still opens it — no tap/drag conflict). `flex: 1` gives it a bounded
// height so it scrolls internally (esp. on web) instead of overflowing.
//
// The list owns a local `data` copy that it reorders synchronously on drop, so
// its internal indices never point past the array (the crash we saw on drag-off).
// The store is updated in parallel to persist; when it re-emits, we re-sync.
export function DraggableTaskList({ tasks, renderCard, onReorder }: Props) {
  const [data, setData] = useState(tasks);
  useEffect(() => setData(tasks), [tasks]);

  const handleReorder = ({ from, to }: ReorderableListReorderEvent) => {
    if (from === to) return;
    const moved = data[from];
    if (!moved) return;
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
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

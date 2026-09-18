import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import ReorderableList, {
  type ReorderableListReorderEvent,
  useReorderableDrag,
} from 'react-native-reorderable-list';
import { GripHorizontal, Pencil, Trash2 } from 'lucide-react-native';
import type { Section } from '@task-manager/shared';
import { BottomSheet } from '../../components/bottom-sheet';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { haptics } from '../../lib/haptics';
import { useT } from '../../lib/i18n';
import { useTasksStore } from '../../store/tasks';
import { sectionsOf } from '../../store/task-selectors';
import { useUiStore } from '../../store/ui';
import { useTheme, type Theme } from '../../theme';
import { SectionNameSheet } from './section-name-sheet';

function Row({
  section,
  onRename,
  onDelete,
}: {
  section: Section;
  onRename: (s: Section) => void;
  onDelete: (s: Section) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const drag = useReorderableDrag();
  const startDrag = useCallback(() => {
    haptics.impact('medium');
    drag();
  }, [drag]);
  return (
    <Pressable
      onLongPress={startDrag}
      delayLongPress={220}
      accessibilityLabel={tr('contexts.section.reorder')}
      style={styles.row}
    >
      <GripHorizontal size={16} color={t.colors.textMuted} strokeWidth={1.8} />
      <Text style={styles.name} numberOfLines={1}>
        {section.name}
      </Text>
      <Pressable
        onPress={() => onRename(section)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={tr('common.edit')}
        style={styles.action}
      >
        <Pencil size={16} color={t.colors.textControl} strokeWidth={1.8} />
      </Pressable>
      <Pressable
        onPress={() => onDelete(section)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={tr('common.delete')}
        style={styles.action}
      >
        <Trash2 size={16} color={t.colors.accentNow} strokeWidth={1.8} />
      </Pressable>
    </Pressable>
  );
}

const MemoRow = memo(Row);

export function SectionsSheet({ contextId }: { contextId: number | null }) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const open = useUiStore((s) => s.sectionsSheetOpen);
  const close = useUiStore((s) => s.closeSectionsSheet);
  const all = useTasksStore((s) => s.sections);
  const createSection = useTasksStore((s) => s.createSection);
  const renameSection = useTasksStore((s) => s.renameSection);
  const reorderSection = useTasksStore((s) => s.reorderSection);
  const deleteSection = useTasksStore((s) => s.deleteSection);

  const sections = useMemo(
    () => (contextId == null ? [] : sectionsOf(all, contextId)),
    [all, contextId],
  );
  const [data, setData] = useState(sections);
  useEffect(() => setData(sections), [sections]);
  const [naming, setNaming] = useState<{ section: Section | null } | null>(null);
  const [confirm, setConfirm] = useState<Section | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleReorder = ({ from, to }: ReorderableListReorderEvent) => {
    if (from === to) return;
    const order = [...data];
    if (from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    setData(order);
    haptics.impact('medium');
    reorderSection(moved.id, order[to - 1]?.id ?? null, order[to + 1]?.id ?? null);
  };

  const target = confirm ? sections.find((s) => s.id !== confirm.id) : undefined;
  const confirmMessage = !confirm
    ? undefined
    : target
      ? tr('contexts.section.deleteConfirm', { name: confirm.name, target: target.name })
      : tr('contexts.section.deleteConfirmLast', { name: confirm.name });

  const onRename = useCallback((s: Section) => setNaming({ section: s }), []);
  const onDelete = useCallback((s: Section) => setConfirm(s), []);

  const confirmDelete = async () => {
    if (!confirm || deleting) return;
    setDeleting(true);
    await deleteSection(confirm.id).catch(() => {});
    setDeleting(false);
    setConfirm(null);
  };

  return (
    <>
      <BottomSheet open={open && contextId != null} onClose={close} plain>
        <Text style={styles.title}>{tr('contexts.section.manage')}</Text>
        {data.length === 0 ? (
          <Text style={styles.empty}>{tr('contexts.section.none')}</Text>
        ) : (
          <ReorderableList
            data={data}
            keyExtractor={(s, i) => (s ? s.id : `i${i}`)}
            onReorder={handleReorder}
            renderItem={({ item }) => (
              <MemoRow section={item} onRename={onRename} onDelete={onDelete} />
            )}
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        )}
        <Pressable
          onPress={() => setNaming({ section: null })}
          accessibilityRole="button"
          style={styles.add}
        >
          <Text style={styles.addText}>{tr('contexts.section.new')}</Text>
        </Pressable>

        <ConfirmDialog
          open={confirm != null}
          title={tr('common.delete')}
          message={confirmMessage}
          confirmLabel={tr('common.delete')}
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setConfirm(null)}
        />

        <SectionNameSheet
          open={naming != null}
          title={naming?.section ? tr('common.edit') : tr('contexts.section.new')}
          initialName={naming?.section?.name ?? ''}
          plain
          onClose={() => setNaming(null)}
          onSubmit={(name) =>
            naming?.section
              ? renameSection(naming.section.id, name)
              : contextId == null
                ? Promise.resolve()
                : createSection(contextId, name)
          }
        />
      </BottomSheet>
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    title: { fontSize: 16, fontWeight: '700', color: t.colors.textPrimary, marginBottom: 8 },
    empty: { fontSize: 13.5, color: t.colors.textMuted, paddingVertical: 12 },
    list: { maxHeight: 6 * 46, marginHorizontal: -18 },
    listContent: { paddingHorizontal: 18 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46 },
    name: { flex: 1, fontSize: 15, fontWeight: '600', color: t.colors.textPrimary },
    action: { padding: 6 },
    add: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
    addText: { fontSize: 14, fontWeight: '700', color: t.colors.accentPrimary },
  });

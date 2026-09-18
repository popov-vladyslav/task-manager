import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { contextEmoji, type Context } from '@task-manager/shared';
import { Popover, type AnchorRect } from '../../components/popover';
import { useT } from '../../lib/i18n';
import { useTasksStore } from '../../store/tasks';
import { openCounts, sectionsOf } from '../../store/task-selectors';
import { Chip } from '../../components/chip';
import { useTheme, type Theme } from '../../theme';

interface ContextPopoverProps {
  anchor: AnchorRect | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
  sectionId?: string | null;
  onSelectSection?: (id: string | null) => void;
}

export function ContextPopover({
  anchor,
  selectedId,
  onSelect,
  onClose,
  sectionId,
  onSelectSection,
}: ContextPopoverProps) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const contexts = useTasksStore((s) => s.contexts);
  const tasks = useTasksStore((s) => s.tasks);
  const allSections = useTasksStore((s) => s.sections);
  const counts = useMemo(() => openCounts(tasks, contexts), [tasks, contexts]);
  const sections = useMemo(
    () => (selectedId == null ? [] : sectionsOf(allSections, selectedId)),
    [allSections, selectedId],
  );
  const selectedContext = contexts.find((c) => c.id === selectedId);

  const pick = (id: number | null) => {
    onSelect(id);
    onClose();
  };

  return (
    <Popover anchor={anchor} onClose={onClose}>
      {contexts.map((c) => (
        <ContextRow
          key={c.id}
          context={c}
          count={counts[String(c.id)] ?? 0}
          selected={selectedId === c.id}
          onPress={() => pick(c.id)}
        />
      ))}
      <View style={styles.separator} />
      <Pressable
        onPress={() => pick(null)}
        accessibilityRole="button"
        accessibilityState={{ selected: selectedId == null }}
        style={({ pressed }) => [styles.row, (pressed || selectedId == null) && styles.rowOn]}
      >
        <View style={[styles.emojiBox, styles.emojiBoxNone]} />
        <Text style={styles.name}>{tr('common.noContext')}</Text>
        {selectedId == null ? (
          <Check size={14} color={t.colors.accentPrimary} strokeWidth={2.6} />
        ) : null}
      </Pressable>
      {onSelectSection && selectedContext && sections.length > 0 ? (
        <>
          <View style={styles.separator} />
          <View style={styles.chips}>
            <Chip
              label={tr('contexts.section.unsorted')}
              selected={sectionId == null}
              tint={selectedContext.color}
              onPress={() => {
                onSelectSection(null);
                onClose();
              }}
            />
            {sections.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={sectionId === s.id}
                tint={selectedContext.color}
                onPress={() => {
                  onSelectSection(s.id);
                  onClose();
                }}
              />
            ))}
          </View>
        </>
      ) : null}
    </Popover>
  );
}

function ContextRow({
  context,
  count,
  selected,
  onPress,
}: {
  context: Context;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const tint = useMemo(
    () => StyleSheet.create({ emoji: { backgroundColor: `${context.color}26` } }),
    [context.color],
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.row, (pressed || selected) && styles.rowOn]}
    >
      <View style={[styles.emojiBox, tint.emoji]}>
        <Text style={styles.emoji}>{contextEmoji(context) ?? ''}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {context.label}
      </Text>
      {selected ? (
        <Check size={14} color={t.colors.accentPrimary} strokeWidth={2.6} />
      ) : (
        <Text style={styles.count}>{count}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    rowOn: { backgroundColor: t.colors.bgControl },
    emojiBox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiBoxNone: { borderWidth: 1, borderColor: t.colors.borderStrong, borderStyle: 'dashed' },
    emoji: { fontSize: 12 },
    name: { flex: 1, fontSize: 14, fontWeight: '600', color: t.colors.textPrimary },
    count: {
      fontFamily: t.fonts.mono,
      fontSize: 11.5,
      fontWeight: '700',
      color: t.colors.textMuted,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 8,
      paddingBottom: 6,
    },
    separator: {
      height: 1,
      backgroundColor: t.colors.borderPopover,
      marginVertical: 7,
      marginHorizontal: 10,
    },
  });

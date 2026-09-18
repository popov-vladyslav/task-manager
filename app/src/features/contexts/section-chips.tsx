import { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Section } from '@task-manager/shared';
import { AddChip, Chip } from '../../components/chip';
import { useT } from '../../lib/i18n';
import { useTheme, type Theme } from '../../theme';

interface SectionChipsProps {
  sections: Section[];
  counts: Record<string, number>;
  color: string;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
}

export function SectionChips({
  sections,
  counts,
  color,
  activeId,
  onSelect,
  onAdd,
}: SectionChipsProps) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { width } = useWindowDimensions();
  const wide = width >= t.sizes.wideBreakpoint;

  const chips = (
    <>
      <Chip
        label={tr('contexts.section.unsorted')}
        count={counts.unsorted ?? 0}
        selected={activeId == null}
        tint={color}
        onPress={() => onSelect(null)}
      />
      {sections.map((s) => (
        <Chip
          key={s.id}
          label={s.name}
          count={counts[s.id] ?? 0}
          selected={activeId === s.id}
          tint={color}
          onPress={() => onSelect(s.id)}
        />
      ))}
      <AddChip onPress={onAdd} accessibilityLabel={tr('contexts.section.addChip')} />
    </>
  );

  if (wide) return <View style={styles.wrap}>{chips}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {chips}
    </ScrollView>
  );
}

const makeStyles = (_t: Theme) =>
  StyleSheet.create({
    scrollView: { flexGrow: 0 },
    scroll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 6,
    },
    wrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 6,
    },
  });

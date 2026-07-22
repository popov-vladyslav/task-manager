import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { Context } from '@task-manager/shared';
import { colors, monoFont } from '../../theme';

// Translucent dark fill behind the count pill when a chip is active.
const activeCountBg = 'rgba(11,14,19,0.25)';

interface Props {
  contexts: Context[];
  counts: Record<string, number>; // 'all' | String(contextId) -> count
  activeContextId: number | null;
  onSelect: (id: number | null) => void;
}

export function ContextChips({ contexts, counts, activeContextId, onSelect }: Props) {
  // Hide contexts with no open tasks (CR §6). "All" is always shown; the active
  // context stays visible even if it's empty (so you can see where you are).
  const items: { id: number | null; label: string; color: string }[] = [
    { id: null, label: 'All', color: colors.textSecondary },
    ...contexts
      .filter((c) => (counts[String(c.id)] ?? 0) > 0 || activeContextId === c.id)
      .map((c) => ({ id: c.id, label: c.label, color: c.color })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {items.map((it) => {
        const active = activeContextId === it.id;
        const count = counts[it.id == null ? 'all' : String(it.id)] ?? 0;
        return (
          <Pressable
            key={it.id == null ? 'all' : it.id}
            onPress={() => onSelect(it.id)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? it.color : colors.bgCard,
                borderColor: active ? it.color : colors.borderSubtle,
              },
            ]}
          >
            <Text
              style={[styles.chipLabel, { color: active ? colors.bgBase : colors.textPrimary }]}
            >
              {it.label}
            </Text>
            <Text
              style={[
                styles.chipCount,
                {
                  color: active ? colors.bgBase : colors.textSecondary,
                  backgroundColor: active ? activeCountBg : colors.bgElevated,
                },
              ]}
            >
              {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  content: { gap: 8, paddingHorizontal: 20, paddingBottom: 12, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 12, fontWeight: '500' },
  chipCount: {
    fontFamily: monoFont,
    fontSize: 10,
    paddingHorizontal: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontVariant: ['tabular-nums'],
  },
});

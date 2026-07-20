import { Pressable, ScrollView, Text } from 'react-native';
import type { Context } from '@task-manager/shared';
import { colors, monoFont } from '../../theme';

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
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12, alignItems: 'center' }}
    >
      {items.map((it) => {
        const active = activeContextId === it.id;
        const count = counts[it.id == null ? 'all' : String(it.id)] ?? 0;
        return (
          <Pressable
            key={it.id == null ? 'all' : it.id}
            onPress={() => onSelect(it.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: active ? it.color : colors.bgCard,
              borderWidth: 1,
              borderColor: active ? it.color : colors.borderSubtle,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '500', color: active ? colors.bgBase : colors.textPrimary }}>
              {it.label}
            </Text>
            <Text
              style={{
                fontFamily: monoFont,
                fontSize: 10,
                color: active ? colors.bgBase : colors.textSecondary,
                backgroundColor: active ? 'rgba(11,14,19,0.25)' : colors.bgElevated,
                paddingHorizontal: 6,
                borderRadius: 999,
                overflow: 'hidden',
                fontVariant: ['tabular-nums'],
              }}
            >
              {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

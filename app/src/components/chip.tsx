import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme, type Theme } from '../theme';

const HEIGHT = 34;

interface ChipProps {
  label: string;
  count?: number;
  icon?: ReactNode;
  selected?: boolean;
  tint?: string;
  onPress?: () => void;
}

export function Chip({ label, count, icon, selected = false, tint, onPress }: ChipProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const accent = tint ?? t.colors.accentPrimary;
  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        selected: { backgroundColor: `${accent}26`, borderColor: `${accent}80` },
        text: { color: selected ? accent : t.colors.textControl },
      }),
    [accent, selected, t],
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && dynamic.selected,
        pressed && styles.pressed,
      ]}
    >
      {icon}
      <Text style={[styles.label, dynamic.text]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? <Text style={[styles.count, dynamic.text]}>{count}</Text> : null}
    </Pressable>
  );
}

export function AddChip({
  onPress,
  accessibilityLabel,
}: {
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.add, pressed && styles.pressed]}
    >
      <Plus size={14} color={t.colors.textControl} strokeWidth={2.3} />
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return <View style={styles.row}>{children}</View>;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: HEIGHT,
      paddingHorizontal: 13,
      borderRadius: HEIGHT / 2,
      backgroundColor: t.colors.bgControl,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
    },
    label: { fontSize: 13.5, fontWeight: '600' },
    count: { fontFamily: t.fonts.mono, fontSize: 11.5, fontWeight: '700', opacity: 0.75 },
    add: {
      width: HEIGHT,
      height: HEIGHT,
      borderRadius: HEIGHT / 2,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
  });

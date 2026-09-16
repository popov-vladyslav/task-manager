import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useT } from '../../lib/i18n';
import { useTheme, type Theme } from '../../theme';

export function AddTaskRow({ label, onPress }: { label?: string; onPress: () => void }) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Plus size={16} color={t.colors.accentPrimary} strokeWidth={2.2} />
      <Text style={styles.label}>{label ?? tr('tasks.list.addTask')}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 14,
      height: 44,
      borderRadius: 12,
      backgroundColor: t.colors.bgSurface,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.colors.borderStrong,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 13,
    },
    pressed: { opacity: 0.8 },
    label: { fontSize: 13.5, color: t.colors.textMuted },
  });

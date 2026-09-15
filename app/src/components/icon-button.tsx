import { useMemo, type ComponentType } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { LucideProps } from 'lucide-react-native';
import { useTheme, type Theme } from '../theme';

const SIZE = 38;

interface IconButtonProps {
  icon: ComponentType<LucideProps>;
  onPress?: () => void;
  accessibilityLabel: string;
  iconSize?: number;
  color?: string;
}

export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  iconSize = 18,
  color,
}: IconButtonProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon size={iconSize} color={color ?? t.colors.textPrimary} strokeWidth={2} />
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    button: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: t.colors.bgControl,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
  });

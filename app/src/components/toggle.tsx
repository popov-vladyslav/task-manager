import { Switch } from 'react-native';
import { useTheme } from '../theme';

const isWeb = process.env.EXPO_OS === 'web';

interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

// react-native-web paints the "on" thumb with its own activeThumbColor
// (teal) unless told otherwise; the prop is web-only so it is spread in.
export function Toggle({ value, onValueChange }: ToggleProps) {
  const t = useTheme();
  const webOnly = isWeb ? { activeThumbColor: t.colors.textPrimary } : {};
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: t.colors.bgElevated, true: t.colors.accentPrimary }}
      thumbColor={t.colors.textPrimary}
      {...webOnly}
    />
  );
}

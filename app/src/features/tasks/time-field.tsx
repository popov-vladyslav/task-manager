import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useTheme, type Theme } from '../../theme';

const isAndroid = process.env.EXPO_OS === 'android';

interface TimeFieldProps {
  minutes: number | null;
  onChange: (minutes: number) => void;
}

export function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '—';
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function TimeField({ minutes, onChange }: TimeFieldProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [open, setOpen] = useState(false);
  const value = new Date(2000, 0, 1, Math.floor((minutes ?? 540) / 60), (minutes ?? 540) % 60);

  const onPick = (_e: DateTimePickerChangeEvent, d: Date) => {
    if (isAndroid) setOpen(false);
    onChange(d.getHours() * 60 + d.getMinutes());
  };

  if (!isAndroid) {
    return (
      <DateTimePicker
        value={value}
        mode="time"
        display="compact"
        themeVariant="dark"
        accentColor={t.colors.accentPrimary}
        onValueChange={onPick}
      />
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Time"
        style={styles.value}
      >
        <Text style={styles.valueText}>{formatMinutes(minutes)}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={value}
          mode="time"
          onValueChange={onPick}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    value: { paddingVertical: 2 },
    valueText: {
      fontFamily: t.fonts.mono,
      fontSize: 13.5,
      fontWeight: '700',
      color: t.colors.accentPrimary,
    },
  });

import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { INTL_TAG } from '@task-manager/shared';
import { useT } from '../../lib/i18n';
import { useLocaleStore } from '../../store/locale';
import { useTheme, type Theme } from '../../theme';

const isAndroid = process.env.EXPO_OS === 'android';
const PICKER_WIDTH = 96;
const PICKER_HEIGHT = 34;
const TEXT_HEIGHT = 18;

export interface TimeFieldHandle {
  open: () => void;
}

interface TimeFieldProps {
  minutes: number | null;
  onChange: (minutes: number) => void;
}

export function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '—';
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  const tag = INTL_TAG[useLocaleStore.getState().locale];
  return d.toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit' });
}

export const TimeField = forwardRef<TimeFieldHandle, TimeFieldProps>(function TimeField(
  { minutes, onChange },
  ref,
) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const value = new Date(2000, 0, 1, Math.floor((minutes ?? 540) / 60), (minutes ?? 540) % 60);

  useImperativeHandle(ref, () => ({
    open: () => {
      if (isAndroid) setDialogOpen(true);
    },
  }));

  const onPick = (_e: DateTimePickerChangeEvent, d: Date) => {
    if (isAndroid) setDialogOpen(false);
    onChange(d.getHours() * 60 + d.getMinutes());
  };

  if (isAndroid) {
    return (
      <>
        <Pressable
          onPress={() => setDialogOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={tr('when.row.time')}
          style={styles.value}
        >
          <Text style={styles.valueText}>{formatMinutes(minutes)}</Text>
        </Pressable>
        {dialogOpen ? (
          <DateTimePicker
            value={value}
            mode="time"
            onValueChange={onPick}
            onDismiss={() => setDialogOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.native}>
      <Text style={styles.valueText}>{formatMinutes(minutes)}</Text>
      <DateTimePicker
        value={value}
        mode="time"
        display="compact"
        themeVariant="dark"
        accentColor={t.colors.accentPrimary}
        style={styles.overlay}
        onValueChange={onPick}
      />
    </View>
  );
});

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    value: { paddingVertical: 2 },
    valueText: {
      fontFamily: t.fonts.mono,
      fontSize: 13.5,
      fontWeight: '700',
      color: t.colors.accentPrimary,
    },
    native: {
      width: PICKER_WIDTH,
      height: TEXT_HEIGHT,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    overlay: {
      position: 'absolute',
      top: (TEXT_HEIGHT - PICKER_HEIGHT) / 2,
      right: 0,
      width: PICKER_WIDTH,
      height: PICKER_HEIGHT,
      opacity: 0.02,
    },
  });

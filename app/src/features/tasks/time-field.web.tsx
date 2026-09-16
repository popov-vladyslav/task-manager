import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { INTL_TAG } from '@task-manager/shared';
import { useT } from '../../lib/i18n';
import { useLocaleStore } from '../../store/locale';
import { useTheme, type Theme } from '../../theme';

export interface TimeFieldHandle {
  open: () => void;
}

interface TimeFieldProps {
  minutes: number | null;
  onChange: (minutes: number) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

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
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ open: () => inputRef.current?.focus() }));
  const inputStyle = useMemo(
    () =>
      ({
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: 0,
        color: t.colors.accentPrimary,
        fontFamily: t.fonts.mono,
        fontSize: 13.5,
        fontWeight: 700,
        textAlign: 'right',
        colorScheme: 'dark',
        cursor: 'text',
      }) as const,
    [t],
  );
  const value = minutes == null ? '' : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  return (
    <View style={styles.wrap}>
      <input
        ref={inputRef}
        type="time"
        value={value}
        step={300}
        aria-label={tr('when.row.time')}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map(Number);
          if (Number.isFinite(h) && Number.isFinite(m)) onChange(h * 60 + m);
        }}
        style={inputStyle}
      />
    </View>
  );
});

const makeStyles = (_t: Theme) => StyleSheet.create({ wrap: { paddingVertical: 2 } });

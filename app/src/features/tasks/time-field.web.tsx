import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme, type Theme } from '../../theme';

interface TimeFieldProps {
  minutes: number | null;
  onChange: (minutes: number) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '—';
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function TimeField({ minutes, onChange }: TimeFieldProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const inputStyle = useMemo(
    () =>
      ({
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: t.colors.accentPrimary,
        fontFamily: t.fonts.mono,
        fontSize: 13.5,
        fontWeight: 700,
        colorScheme: 'dark',
        cursor: 'pointer',
      }) as const,
    [t],
  );
  const value = minutes == null ? '' : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  return (
    <View style={styles.wrap}>
      <input
        type="time"
        value={value}
        aria-label="Time"
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map(Number);
          if (Number.isFinite(h) && Number.isFinite(m)) onChange(h * 60 + m);
        }}
        style={inputStyle}
      />
    </View>
  );
}

const makeStyles = (_t: Theme) => StyleSheet.create({ wrap: { paddingVertical: 2 } });

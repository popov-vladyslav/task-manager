import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, monoFont } from '../../theme';

// Duration presets (minutes) for a scheduled task's calendar block. Chips work
// identically on native and web (no DateTimePicker), so this lives in one file
// imported by both date-fields-section variants. Shown only when a deadline is
// set — a task with a deadline always has a duration (defaults to 30).
const PRESETS = [15, 30, 45, 60, 90, 120];
const DEFAULT_DURATION_MIN = 30;

export function DurationField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (min: number) => void;
}) {
  const active = value ?? DEFAULT_DURATION_MIN;
  return (
    <View>
      <Text style={styles.label}>Duration</Text>
      <View style={styles.row}>
        {PRESETS.map((m) => {
          const on = active === m;
          return (
            <Pressable
              key={m}
              onPress={() => onChange(m)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? colors.bgElevated : colors.bgCard,
                  borderColor: on ? colors.borderStrong : colors.borderSubtle,
                },
              ]}
            >
              <Text
                style={[styles.chipText, { color: on ? colors.textPrimary : colors.textSecondary }]}
              >
                {m < 60
                  ? `${m}m`
                  : m % 60 === 0
                    ? `${m / 60}h`
                    : `${Math.floor(m / 60)}h ${m % 60}m`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '500' },
});

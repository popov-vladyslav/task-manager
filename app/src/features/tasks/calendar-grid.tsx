import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { IconButton } from '../../components/icon-button';
import { useTheme, type Theme } from '../../theme';
import { sameDay, startOfDay, visibleDays } from '../calendar/calendar-dates';

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

interface CalendarGridProps {
  value: Date | null;
  onChange: (day: Date) => void;
}

export function CalendarGrid({ value, onChange }: CalendarGridProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [anchor, setAnchor] = useState(() => startOfDay(value ?? new Date()));
  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => visibleDays('month', anchor), [anchor]);
  const monthLabel = anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const shift = (n: number) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1));

  return (
    <View>
      <View style={styles.monthRow}>
        <Text style={styles.monthName}>{monthLabel}</Text>
        <View style={styles.arrows}>
          <IconButton
            icon={ChevronLeft}
            onPress={() => shift(-1)}
            accessibilityLabel="Previous month"
            iconSize={16}
            color={t.colors.textSecondary}
          />
          <IconButton
            icon={ChevronRight}
            onPress={() => shift(1)}
            accessibilityLabel="Next month"
            iconSize={16}
            color={t.colors.textSecondary}
          />
        </View>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const selected = value != null && sameDay(day, value);
          const isToday = sameDay(day, today);
          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => onChange(day)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={day.toDateString()}
              style={[styles.cell, selected && styles.cellSelected]}
            >
              <Text
                style={[
                  styles.day,
                  !inMonth && styles.dayMuted,
                  isToday && !selected && styles.dayToday,
                  selected && styles.daySelected,
                ]}
              >
                {day.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 9,
    },
    monthName: { fontSize: 13.5, fontWeight: '700', color: t.colors.textPrimary },
    arrows: { flexDirection: 'row', gap: 6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    weekday: {
      width: `${100 / 7}%`,
      textAlign: 'center',
      fontFamily: t.fonts.mono,
      fontSize: 9.5,
      letterSpacing: 0.6,
      color: t.colors.textMuted,
      paddingBottom: 3,
    },
    cell: {
      width: `${100 / 7}%`,
      height: 31,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9,
      marginVertical: 1,
    },
    cellSelected: { backgroundColor: t.colors.accentPrimary },
    day: { fontSize: 12.5, fontWeight: '600', color: t.colors.textPrimary },
    dayMuted: { color: t.colors.textFaint },
    dayToday: { color: t.colors.accentPrimary },
    daySelected: { color: t.colors.bgBase, fontWeight: '800' },
  });

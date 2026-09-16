import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { IconButton } from '../../components/icon-button';
import { useIntlTag, useT } from '../../lib/i18n';
import { useTheme, type Theme } from '../../theme';
import { sameDay, startOfDay, visibleDays } from '../calendar/calendar-dates';

const REFERENCE_MONDAY_YEAR = 2024;

export function shortWeekdays(tag: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(REFERENCE_MONDAY_YEAR, 0, 1 + i).toLocaleDateString(tag, { weekday: 'short' }),
  );
}

interface CalendarGridProps {
  value: Date | null;
  onChange: (day: Date) => void;
}

export function CalendarGrid({ value, onChange }: CalendarGridProps) {
  const t = useTheme();
  const tr = useT();
  const tag = useIntlTag();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [anchor, setAnchor] = useState(() => startOfDay(value ?? new Date()));
  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => visibleDays('month', anchor), [anchor]);
  const weekdays = useMemo(() => shortWeekdays(tag).map((w) => w.toUpperCase()), [tag]);
  const monthLabel = anchor.toLocaleDateString(tag, { month: 'long', year: 'numeric' });
  const shift = (n: number) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1));

  return (
    <View>
      <View style={styles.monthRow}>
        <Text style={styles.monthName}>{monthLabel}</Text>
        <View style={styles.arrows}>
          <IconButton
            icon={ChevronLeft}
            onPress={() => shift(-1)}
            accessibilityLabel={tr('when.calendar.prevMonth')}
            iconSize={16}
            color={t.colors.textSecondary}
          />
          <IconButton
            icon={ChevronRight}
            onPress={() => shift(1)}
            accessibilityLabel={tr('when.calendar.nextMonth')}
            iconSize={16}
            color={t.colors.textSecondary}
          />
        </View>
      </View>
      <View style={styles.grid}>
        {weekdays.map((w) => (
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
              accessibilityLabel={day.toLocaleDateString(tag, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
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

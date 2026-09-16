import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Clock, Repeat, Timer } from 'lucide-react-native';
import type { RecurrenceInput } from '@task-manager/shared';
import { BottomSheet } from '../../components/bottom-sheet';
import { Chip } from '../../components/chip';
import { useTheme, type Theme } from '../../theme';
import { addDays, sameDay, startOfDay, startOfWeek } from '../calendar/calendar-dates';
import { CalendarGrid } from './calendar-grid';
import { DurationField } from './duration-field';
import { TimeField } from './time-field';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABEL: Record<string, string> = {
  mon: 'M',
  tue: 'T',
  wed: 'W',
  thu: 'T',
  fri: 'F',
  sat: 'S',
  sun: 'S',
};
type RecKind = 'none' | 'daily' | 'weekly' | 'monthly';
const REC_OPTIONS: { k: RecKind; label: string }[] = [
  { k: 'none', label: 'No repeat' },
  { k: 'daily', label: 'Daily' },
  { k: 'weekly', label: 'Weekly' },
  { k: 'monthly', label: 'Monthly' },
];
const REMINDER_OPTIONS: { v: number | null; label: string }[] = [
  { v: null, label: 'None' },
  { v: 0, label: 'At time' },
  { v: 30, label: '30 min before' },
  { v: 60, label: '1 h before' },
  { v: 1440, label: '1 day before' },
];
const DEFAULT_TIME_MIN = 12 * 60;

export interface WhenValue {
  dueAt: string | null;
  durationMin: number | null;
  remindAt: string | null;
  recurrenceRule: string | null;
}

export interface WhenPatch {
  dueAt: string | null;
  durationMin: number | null;
  remindAt: string | null;
  recurrence: RecurrenceInput | null;
}

function recKind(rule: string | null): RecKind {
  if (!rule) return 'none';
  if (rule === 'daily') return 'daily';
  if (rule.startsWith('weekly')) return 'weekly';
  if (rule.startsWith('monthly')) return 'monthly';
  return 'none';
}

function weeklyDays(rule: string | null): string[] {
  if (!rule?.startsWith('weekly:')) return [];
  return rule
    .slice(7)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

function reminderOffset(dueAt: string | null, remindAt: string | null): number | null {
  if (!remindAt) return null;
  if (!dueAt) return 0;
  return Math.round((new Date(dueAt).getTime() - new Date(remindAt).getTime()) / 60_000);
}

export function describeWhen(v: WhenValue): { main: string | null; sub: string | null } {
  const main = v.dueAt ? dueLine(v.dueAt, v.durationMin) : null;
  const kind = recKind(v.recurrenceRule);
  const sub =
    kind === 'none'
      ? null
      : kind === 'daily'
        ? 'Daily'
        : kind === 'weekly'
          ? `Weekly on ${weeklyDays(v.recurrenceRule)
              .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
              .join(', ')}`
          : `Monthly on the ${v.recurrenceRule?.slice(8)}`;
  return { main, sub };
}

function dueLine(iso: string, durationMin: number | null): string {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const day = sameDay(d, today)
    ? 'Today'
    : sameDay(d, addDays(today, 1))
      ? 'Tomorrow'
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}${durationMin ? ` · ${durationMin} min` : ''}`;
}

interface WhenSheetProps {
  open: boolean;
  value: WhenValue;
  onClose: () => void;
  onSave: (patch: WhenPatch) => void;
}

export function WhenSheet({ open, value, onClose, onSave }: WhenSheetProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const [day, setDay] = useState<Date | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [reminder, setReminder] = useState<number | null>(null);
  const [kind, setKind] = useState<RecKind>('none');
  const [days, setDays] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<'duration' | 'reminder' | 'repeat' | null>(null);

  useEffect(() => {
    if (!open) return;
    const due = value.dueAt ? new Date(value.dueAt) : null;
    setDay(due ? startOfDay(due) : null);
    setMinutes(due ? due.getHours() * 60 + due.getMinutes() : null);
    setDuration(value.durationMin);
    setReminder(reminderOffset(value.dueAt, value.remindAt));
    setKind(recKind(value.recurrenceRule));
    setDays(weeklyDays(value.recurrenceRule));
    setExpanded(null);
  }, [open, value]);

  const today = startOfDay(new Date());
  const nextMonday = addDays(startOfWeek(today), 7);
  const quick: { label: string; day: Date | null }[] = [
    { label: 'Today', day: today },
    { label: 'Tomorrow', day: addDays(today, 1) },
    { label: 'Mon', day: nextMonday },
    { label: 'No date', day: null },
  ];

  const toggleWeekday = (d: string) => {
    const set = new Set(days);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    if (set.size === 0) return;
    setDays(WEEK_ORDER.filter((x) => set.has(x)));
  };

  const save = () => {
    const due = day
      ? new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          Math.floor((minutes ?? DEFAULT_TIME_MIN) / 60),
          (minutes ?? DEFAULT_TIME_MIN) % 60,
        )
      : null;
    const remindAt =
      reminder == null || !due ? null : new Date(due.getTime() - reminder * 60_000).toISOString();
    const base = due ?? today;
    const recurrence: RecurrenceInput | null =
      kind === 'none'
        ? null
        : kind === 'daily'
          ? { rule: 'daily' }
          : kind === 'weekly'
            ? { rule: `weekly:${(days.length ? days : [WEEKDAYS[base.getDay()]]).join(',')}` }
            : { rule: `monthly:${base.getDate()}` };
    onSave({
      dueAt: due ? due.toISOString() : null,
      durationMin: due ? (duration ?? 30) : null,
      remindAt,
      recurrence,
    });
  };

  const toggle = (k: typeof expanded) => setExpanded((e) => (e === k ? null : k));
  const reminderLabel =
    REMINDER_OPTIONS.find((o) => o.v === reminder)?.label ?? `${reminder} min before`;
  const repeatLabel =
    kind === 'none'
      ? 'Never'
      : kind === 'weekly'
        ? `Weekly, ${days.map((d) => DAY_LABEL[d]).join('')}`
        : (REC_OPTIONS.find((o) => o.k === kind)?.label ?? 'Never');

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={styles.quick}>
        {quick.map((q) => (
          <Chip
            key={q.label}
            label={q.label}
            selected={q.day ? day != null && sameDay(day, q.day) : day == null}
            onPress={() => setDay(q.day)}
          />
        ))}
      </View>

      <CalendarGrid
        key={`${value.dueAt ?? 'none'}-${day?.getMonth() ?? 'x'}`}
        value={day}
        onChange={setDay}
      />

      <View style={styles.rows}>
        <Row
          icon={<Clock size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
          label="Time"
          value="—"
          control={
            day ? <TimeField minutes={minutes ?? DEFAULT_TIME_MIN} onChange={setMinutes} /> : null
          }
        />
        <Row
          icon={<Timer size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
          label="Duration"
          value={day ? `${duration ?? 30} min` : '—'}
          onPress={() => day && toggle('duration')}
        />
        {expanded === 'duration' && day ? (
          <View style={styles.expand}>
            <DurationField value={duration} onChange={setDuration} />
          </View>
        ) : null}
        <Row
          icon={<Bell size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
          label="Reminder"
          value={day ? reminderLabel : '—'}
          onPress={() => day && toggle('reminder')}
        />
        {expanded === 'reminder' && day ? (
          <View style={styles.expandChips}>
            {REMINDER_OPTIONS.map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                selected={reminder === o.v}
                onPress={() => setReminder(o.v)}
              />
            ))}
          </View>
        ) : null}
        <Row
          icon={<Repeat size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
          label="Repeat"
          value={repeatLabel}
          onPress={() => toggle('repeat')}
          last
        />
        {expanded === 'repeat' ? (
          <View style={styles.expand}>
            <View style={styles.expandChips}>
              {REC_OPTIONS.map((o) => (
                <Chip
                  key={o.k}
                  label={o.label}
                  selected={kind === o.k}
                  onPress={() => {
                    setKind(o.k);
                    if (o.k === 'weekly' && days.length === 0) {
                      setDays([WEEKDAYS[(day ?? today).getDay()]]);
                    }
                  }}
                />
              ))}
            </View>
            {kind === 'weekly' ? (
              <View style={styles.weekRow}>
                {WEEK_ORDER.map((d) => {
                  const on = days.includes(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => toggleWeekday(d)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.weekday, on && styles.weekdayOn]}
                    >
                      <Text style={[styles.weekdayText, on && styles.weekdayTextOn]}>
                        {DAY_LABEL[d]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} accessibilityRole="button" style={styles.save}>
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function Row({
  icon,
  label,
  value,
  control,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  control?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      style={[styles.row, last && styles.rowLast]}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
      {control ?? <Text style={styles.rowValue}>{value}</Text>}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    quick: { flexDirection: 'row', gap: 7, marginBottom: 14 },
    rows: { marginTop: 14, borderTopWidth: 1, borderColor: t.colors.borderSubtle },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 12,
      paddingHorizontal: 2,
      borderBottomWidth: 1,
      borderColor: t.colors.borderSubtle,
    },
    rowLast: { borderBottomWidth: 0 },
    rowIcon: { width: 20, alignItems: 'center' },
    rowLabel: { flex: 1, fontSize: 13.5, fontWeight: '500', color: t.colors.textControl },
    rowValue: { fontSize: 13.5, fontWeight: '700', color: t.colors.textPrimary },
    expand: { paddingVertical: 10, gap: 10 },
    expandChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingVertical: 8 },
    weekRow: { flexDirection: 'row', gap: 8 },
    weekday: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bgCard,
      borderWidth: 1,
      borderColor: t.colors.borderSubtle,
    },
    weekdayOn: { backgroundColor: t.colors.accentPrimary, borderColor: t.colors.accentPrimary },
    weekdayText: { fontSize: 12, fontWeight: '700', color: t.colors.textSecondary },
    weekdayTextOn: { color: t.colors.bgBase },
    actions: { flexDirection: 'row', gap: 9, marginTop: 4 },
    cancel: {
      flex: 1,
      height: 46,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bgControl,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
    },
    cancelText: { fontSize: 14, fontWeight: '700', color: t.colors.textControl },
    save: {
      flex: 1,
      height: 46,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.accentPrimary,
    },
    saveText: { fontSize: 14, fontWeight: '700', color: t.colors.bgBase },
  });

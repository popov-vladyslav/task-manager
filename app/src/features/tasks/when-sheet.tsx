import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, CalendarOff, CircleCheck, Clock, Repeat, Timer } from 'lucide-react-native';
import {
  DEFAULT_DURATION_MIN,
  INTL_TAG,
  type RecurrenceInput,
  type TranslationKey,
} from '@task-manager/shared';
import { BottomSheet } from '../../components/bottom-sheet';
import { Chip } from '../../components/chip';
import { Toggle } from '../../components/toggle';
import { currentT, useIntlTag, useT, type T } from '../../lib/i18n';
import { useLocaleStore } from '../../store/locale';
import { useTheme, type Theme } from '../../theme';
import { addDays, sameDay, startOfDay, startOfWeek } from '../calendar/calendar-dates';
import { CalendarGrid, shortWeekdays } from './calendar-grid';
import { DurationField, type DurationFieldHandle } from './duration-field';
import { OptionField, type Option, type OptionFieldHandle } from '../../components/option-field';
import { TimeField, type TimeFieldHandle } from './time-field';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABEL_KEY: Record<string, TranslationKey> = {
  mon: 'common.weekdayMon',
  tue: 'common.weekdayTue',
  wed: 'common.weekdayWed',
  thu: 'common.weekdayThu',
  fri: 'common.weekdayFri',
  sat: 'common.weekdaySat',
  sun: 'common.weekdaySun',
};
type RecKind = 'none' | 'daily' | 'weekly' | 'monthly';
type EndsKind = 'never' | 'date';
const recOptions = (tr: T): Option<RecKind>[] => [
  { value: 'none', label: tr('when.repeat.none') },
  { value: 'daily', label: tr('when.repeat.daily') },
  { value: 'weekly', label: tr('when.repeat.weekly') },
  { value: 'monthly', label: tr('when.repeat.monthly') },
];
const reminderOptions = (tr: T): Option<number | null>[] => [
  { value: null, label: tr('common.none') },
  { value: 0, label: tr('when.reminder.atTime') },
  { value: 30, label: tr('when.reminder.minBefore', { n: 30 }) },
  { value: 60, label: tr('when.reminder.hourBefore') },
  { value: 1440, label: tr('when.reminder.dayBefore') },
];
const DEFAULT_TIME_MIN = 12 * 60;

function currentIntlTag(): string {
  return INTL_TAG[useLocaleStore.getState().locale];
}

function weekdayName(token: string, tag: string): string {
  const index = (WEEK_ORDER as readonly string[]).indexOf(token);
  return index < 0 ? token : shortWeekdays(tag)[index];
}

export interface WhenValue {
  dueAt: string | null;
  durationMin: number | null;
  remindAt: string | null;
  recurrenceRule: string | null;
  recurrenceUntil: string | null;
  tracksCompletion: boolean;
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

function toDayStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDayStr(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function untilLabel(day: string, tag: string): string {
  return fromDayStr(day).toLocaleDateString(tag, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// A rule's remind_time is a time of day on the occurrence's own day, so a
// reminder that falls on the day before cannot be carried onto the rule.
function ruleRemindTime(due: Date | null, reminder: number | null): string | null {
  if (!due || reminder == null) return null;
  const at = due.getHours() * 60 + due.getMinutes() - reminder;
  if (at < 0) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(at / 60))}:${pad(at % 60)}`;
}

function reminderOffset(dueAt: string | null, remindAt: string | null): number | null {
  if (!remindAt) return null;
  if (!dueAt) return 0;
  return Math.round((new Date(dueAt).getTime() - new Date(remindAt).getTime()) / 60_000);
}

export function describeWhen(v: WhenValue): { main: string | null; sub: string | null } {
  const tr = currentT();
  const tag = currentIntlTag();
  const main = v.dueAt ? dueLine(v.dueAt, v.durationMin) : null;
  const kind = recKind(v.recurrenceRule);
  const rule =
    kind === 'none'
      ? null
      : kind === 'daily'
        ? tr('when.repeat.daily')
        : kind === 'weekly'
          ? tr('when.repeat.weeklyOn', {
              days: weeklyDays(v.recurrenceRule)
                .map((d) => weekdayName(d, tag))
                .join(', '),
            })
          : tr('when.repeat.monthlyOn', { day: v.recurrenceRule?.slice(8) ?? '' });
  const sub =
    rule && v.recurrenceUntil
      ? tr('when.repeat.until', { rule, date: untilLabel(v.recurrenceUntil, tag) })
      : rule;
  return { main, sub };
}

function dueLine(iso: string, durationMin: number | null): string {
  const tr = currentT();
  const tag = currentIntlTag();
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const day = sameDay(d, today)
    ? tr('common.today')
    : sameDay(d, addDays(today, 1))
      ? tr('common.tomorrow')
      : d.toLocaleDateString(tag, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit' });
  const line = tr('when.due.line', { day, time });
  return durationMin ? `${line} · ${tr('common.minutesShort', { n: durationMin })}` : line;
}

interface WhenSheetProps {
  open: boolean;
  value: WhenValue;
  onClose: () => void;
  onSave: (patch: WhenPatch) => void;
}

export function WhenSheet({ open, value, onClose, onSave }: WhenSheetProps) {
  const t = useTheme();
  const tr = useT();
  const tag = useIntlTag();
  const styles = useMemo(() => makeStyles(t), [t]);
  const options = useMemo(
    () => ({
      repeat: recOptions(tr),
      reminder: reminderOptions(tr),
      ends: [
        { value: 'never', label: tr('when.ends.never') },
        { value: 'date', label: tr('when.ends.onDate') },
      ] satisfies Option<EndsKind>[],
    }),
    [tr],
  );

  const [day, setDay] = useState<Date | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [reminder, setReminder] = useState<number | null>(null);
  const [kind, setKind] = useState<RecKind>('none');
  const [days, setDays] = useState<string[]>([]);
  const [until, setUntil] = useState<Date | null>(null);
  const [tracks, setTracks] = useState(true);
  const endsRef = useRef<OptionFieldHandle>(null);
  const timeRef = useRef<TimeFieldHandle>(null);
  const durationRef = useRef<DurationFieldHandle>(null);
  const reminderRef = useRef<OptionFieldHandle>(null);
  const repeatRef = useRef<OptionFieldHandle>(null);

  useEffect(() => {
    if (!open) return;
    const due = value.dueAt ? new Date(value.dueAt) : null;
    setDay(due ? startOfDay(due) : null);
    setMinutes(due ? due.getHours() * 60 + due.getMinutes() : null);
    setDuration(value.durationMin);
    setReminder(reminderOffset(value.dueAt, value.remindAt));
    setKind(recKind(value.recurrenceRule));
    setDays(weeklyDays(value.recurrenceRule));
    setUntil(value.recurrenceUntil ? fromDayStr(value.recurrenceUntil) : null);
    setTracks(value.tracksCompletion);
  }, [open, value]);

  const today = startOfDay(new Date());
  const nextMonday = addDays(startOfWeek(today), 7);
  const quick: { label: string; day: Date | null }[] = [
    { label: tr('common.today'), day: today },
    { label: tr('common.tomorrow'), day: addDays(today, 1) },
    { label: nextMonday.toLocaleDateString(tag, { weekday: 'short' }), day: nextMonday },
    { label: tr('when.quick.noDate'), day: null },
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
    const rule =
      kind === 'none'
        ? null
        : kind === 'daily'
          ? 'daily'
          : kind === 'weekly'
            ? `weekly:${(days.length ? days : [WEEKDAYS[base.getDay()]]).join(',')}`
            : `monthly:${base.getDate()}`;
    const recurrence: RecurrenceInput | null = rule
      ? {
          rule,
          remindTime: ruleRemindTime(due, reminder),
          until: until ? toDayStr(until) : null,
          tracksCompletion: tracks,
        }
      : null;
    onSave({
      dueAt: due ? due.toISOString() : null,
      durationMin: due ? (duration ?? DEFAULT_DURATION_MIN) : null,
      remindAt,
      recurrence,
    });
  };

  const reminderLabel =
    options.reminder.find((o) => o.value === reminder)?.label ??
    tr('when.reminder.minBefore', { n: reminder ?? 0 });
  const repeatLabel =
    kind === 'none'
      ? tr('common.never')
      : kind === 'weekly'
        ? tr('when.repeat.weeklyDays', { days: days.map((d) => tr(DAY_LABEL_KEY[d])).join('') })
        : (options.repeat.find((o) => o.value === kind)?.label ?? tr('common.never'));

  const endsLabel = until ? untilLabel(toDayStr(until), tag) : tr('when.ends.never');
  const pickEnds = (k: EndsKind) =>
    setUntil(k === 'never' ? null : (until ?? addDays(day ?? today, 30)));
  const untilPicker = until ? (
    <View style={styles.untilGrid}>
      <CalendarGrid key={`until-${open}`} value={until} onChange={setUntil} />
    </View>
  ) : null;

  const pickKind = (k: RecKind) => {
    setKind(k);
    if (k === 'weekly' && days.length === 0) setDays([WEEKDAYS[(day ?? today).getDay()]]);
  };

  const weekdayPicker =
    kind === 'weekly' ? (
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
                {tr(DAY_LABEL_KEY[d])}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

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
          label={tr('when.row.time')}
          value="—"
          control={
            day ? (
              <TimeField
                ref={timeRef}
                minutes={minutes ?? DEFAULT_TIME_MIN}
                onChange={setMinutes}
              />
            ) : null
          }
          onPress={day ? () => timeRef.current?.open() : undefined}
        />
        <Row
          icon={<Timer size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
          label={tr('when.row.duration')}
          value="—"
          control={
            day ? (
              <DurationField
                ref={durationRef}
                value={duration ?? DEFAULT_DURATION_MIN}
                onChange={setDuration}
              />
            ) : null
          }
          onPress={day ? () => durationRef.current?.open() : undefined}
        />
        <Row
          icon={<Bell size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
          label={tr('when.row.reminder')}
          value="—"
          control={
            day ? (
              <OptionField
                ref={reminderRef}
                value={reminder}
                label={reminderLabel}
                options={options.reminder}
                onChange={setReminder}
              />
            ) : null
          }
          onPress={day ? () => reminderRef.current?.open() : undefined}
        />
        <Row
          icon={<Repeat size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
          label={tr('when.row.repeat')}
          value="—"
          control={
            <OptionField
              ref={repeatRef}
              value={kind}
              label={repeatLabel}
              options={options.repeat}
              onChange={pickKind}
              closeOnPick={(k) => k !== 'weekly'}
              footer={weekdayPicker}
              width={260}
            />
          }
          onPress={() => repeatRef.current?.open()}
          last={kind === 'none'}
        />
        {kind !== 'none' ? (
          <>
            <Row
              icon={<CalendarOff size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
              label={tr('when.row.ends')}
              value="—"
              control={
                <OptionField
                  ref={endsRef}
                  value={until ? 'date' : 'never'}
                  label={endsLabel}
                  options={options.ends}
                  onChange={pickEnds}
                  closeOnPick={(k) => k === 'never'}
                  footer={untilPicker}
                  width={280}
                />
              }
              onPress={() => endsRef.current?.open()}
            />
            <Row
              icon={<CircleCheck size={15} color={t.colors.textSecondary} strokeWidth={1.8} />}
              label={tr('when.row.trackCompletion')}
              value="—"
              control={<Toggle value={tracks} onValueChange={setTracks} />}
              last
            />
          </>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
          <Text style={styles.cancelText}>{tr('common.cancel')}</Text>
        </Pressable>
        <Pressable onPress={save} accessibilityRole="button" style={styles.save}>
          <Text style={styles.saveText}>{tr('common.save')}</Text>
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
  const rowStyle = [styles.row, last && styles.rowLast];
  const inner = (
    <>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
      {control ?? <Text style={styles.rowValue}>{value}</Text>}
    </>
  );
  if (!onPress) return <View style={rowStyle}>{inner}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={control ? undefined : 'button'}
      style={rowStyle}
    >
      {inner}
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
    untilGrid: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 },
    rowIcon: { width: 20, alignItems: 'center' },
    rowLabel: { flex: 1, fontSize: 13.5, fontWeight: '500', color: t.colors.textControl },
    rowValue: { fontSize: 13.5, fontWeight: '700', color: t.colors.textPrimary },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 0,
      paddingTop: 10,
      paddingBottom: 4,
      borderTopWidth: 1,
      borderColor: t.colors.borderPopover,
      marginTop: 6,
    },
    weekday: {
      width: 28,
      height: 28,
      borderRadius: 14,
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

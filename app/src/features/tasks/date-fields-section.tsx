import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { Bell, Clock, X } from 'lucide-react-native';
import { colors, monoFont, radius, shortDateTime } from '../../theme';
import { DurationField } from './duration-field';

const isAndroid = process.env.EXPO_OS === 'android';

export function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={styles.fieldLabel}>
      {children}
    </Text>
  );
}

function FieldButton({
  label,
  icon,
  display,
  active,
  onPress,
  onClear,
}: {
  label: string;
  icon: ReactNode;
  display: string | null;
  active: boolean;
  onPress: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.fieldButtonWrap}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={onPress}
        style={[
          styles.fieldButton,
          { borderColor: active ? colors.accentPrimary : colors.borderSubtle },
        ]}
      >
        {icon}
        <Text
          style={[styles.fieldButtonText, { color: display ? colors.textPrimary : colors.textMuted }]}
          numberOfLines={1}
        >
          {display ?? 'Add'}
        </Text>
        {display ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onClear();
            }}
            hitSlop={8}
          >
            <X size={13} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

interface Props {
  dueAt: string | null;
  remindAt: string | null;
  durationMin: number | null;
  onChangeDue: (iso: string | null) => void;
  onChangeRemind: (iso: string | null) => void;
  onChangeDuration: (min: number) => void;
  showReminder?: boolean; // hide the Reminder field (e.g. the calendar create sheet)
}

// Two field buttons side by side; tapping one opens a single full-width picker
// below the row (mutually exclusive — never two spinners at once). Deadline and
// Reminder are both date+time. When a deadline is set, a Duration picker appears
// (the deadline + duration define the task's calendar block).
export function DateFieldsSection({
  dueAt,
  remindAt,
  durationMin,
  onChangeDue,
  onChangeRemind,
  onChangeDuration,
  showReminder = true,
}: Props) {
  const [picker, setPicker] = useState<null | 'due' | 'remind'>(null);
  const isDue = picker === 'due';
  const value = isDue ? dueAt : remindAt;
  const onChange = isDue ? onChangeDue : onChangeRemind;
  const mode: 'date' | 'datetime' = 'datetime';

  const minReminder = picker === 'remind' ? new Date() : undefined;
  const rawPickerValue = value ? new Date(value) : new Date();
  const pickerValue = minReminder && rawPickerValue < minReminder ? minReminder : rawPickerValue;

  // onValueChange fires only when a value is picked (Android cancel → onDismiss).
  const onPickerChange = (_e: DateTimePickerChangeEvent, d: Date) => {
    if (isAndroid) setPicker(null); // the dialog closes after a pick
    const m = new Date(d);
    m.setSeconds(0, 0); // minute precision — no stray seconds from new Date()
    onChange(m.toISOString()); // iOS inline spinner commits live
  };

  return (
    <View>
      <View style={styles.row}>
        <FieldButton
          label="Deadline"
          icon={<Clock size={13} color={colors.textSecondary} />}
          display={shortDateTime(dueAt)}
          active={isDue}
          onPress={() => setPicker((p) => (p === 'due' ? null : 'due'))}
          onClear={() => {
            onChangeDue(null);
            if (isDue) setPicker(null);
          }}
        />
        {showReminder ? (
        <FieldButton
          label="Reminder"
          icon={<Bell size={13} color={remindAt ? colors.accentReminder : colors.textSecondary} />}
          display={shortDateTime(remindAt)}
          active={picker === 'remind'}
          onPress={() => setPicker((p) => (p === 'remind' ? null : 'remind'))}
          onClear={() => {
            onChangeRemind(null);
            if (picker === 'remind') setPicker(null);
          }}
        />
        ) : null}
      </View>

      {picker && !isAndroid ? (
        <View style={styles.pickerBox}>
          <DateTimePicker
            value={pickerValue}
            minimumDate={minReminder}
            mode={mode}
            display="spinner"
            themeVariant="dark"
            style={styles.picker}
            onValueChange={onPickerChange}
          />
          <Pressable
            onPress={() => setPicker(null)}
            style={styles.doneBtn}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      {picker && isAndroid ? (
        <DateTimePicker
          value={pickerValue}
          minimumDate={minReminder}
          mode={mode === 'datetime' ? 'date' : mode}
          onValueChange={onPickerChange}
          onDismiss={() => setPicker(null)}
        />
      ) : null}

      {dueAt ? (
        <View style={styles.durationWrap}>
          <DurationField value={durationMin} onChange={onChangeDuration} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 8,
  },
  fieldButtonWrap: { flex: 1 },
  fieldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
  },
  fieldButtonText: { flex: 1, fontSize: 13 },
  row: { flexDirection: 'row', gap: 12 },
  pickerBox: {
    marginTop: 12,
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  picker: { alignSelf: 'stretch' },
  doneBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.card,
    backgroundColor: colors.accentPrimary,
  },
  doneText: { fontSize: 13, fontWeight: '600', color: colors.bgSurface },
  durationWrap: { marginTop: 16 },
});

import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Bell, Clock, X } from 'lucide-react-native';
import { colors, monoFont, radius, shortDateTime } from '../../theme';
import { DurationField } from './duration-field';

const isAndroid = process.env.EXPO_OS === 'android';

export function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: monoFont,
        fontSize: 10.5,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: colors.textMuted,
        marginBottom: 8,
      }}
    >
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
    <View style={{ flex: 1 }}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: radius.card,
          borderCurve: 'continuous',
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: colors.bgCard,
          borderWidth: 1,
          borderColor: active ? colors.accentPrimary : colors.borderSubtle,
        }}
      >
        {icon}
        <Text
          style={{ flex: 1, fontSize: 13, color: display ? colors.textPrimary : colors.textMuted }}
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

  const onPickerChange = (e: DateTimePickerEvent, d?: Date) => {
    if (isAndroid) {
      setPicker(null);
      if (e.type === 'set' && d) onChange(d.toISOString());
      return;
    }
    if (d) onChange(d.toISOString()); // iOS inline spinner commits live
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
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
        <View
          style={{
            marginTop: 12,
            gap: 8,
            paddingHorizontal: 8,
            paddingVertical: 8,
            borderRadius: radius.card,
            borderCurve: 'continuous',
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
          }}
        >
          <DateTimePicker
            value={value ? new Date(value) : new Date()}
            mode={mode}
            display="spinner"
            themeVariant="dark"
            style={{ alignSelf: 'stretch' }}
            onChange={onPickerChange}
          />
          <Pressable
            onPress={() => setPicker(null)}
            style={{
              alignItems: 'center',
              paddingVertical: 10,
              borderRadius: radius.card,
              backgroundColor: colors.accentPrimary,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.bgSurface }}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      {picker && isAndroid ? (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode={mode === 'datetime' ? 'date' : mode}
          onChange={onPickerChange}
        />
      ) : null}

      {dueAt ? (
        <View style={{ marginTop: 16 }}>
          <DurationField value={durationMin} onChange={onChangeDuration} />
        </View>
      ) : null}
    </View>
  );
}

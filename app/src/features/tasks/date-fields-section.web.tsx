import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Bell, Clock } from 'lucide-react-native';
import { colors, monoFont, radius } from '../../theme';
import { DurationField } from './duration-field';

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

const pad = (n: number) => String(n).padStart(2, '0');

function toInputValue(iso: string | null, mode: 'date' | 'datetime'): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return mode === 'date' ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function WebField({
  label,
  icon,
  mode,
  value,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  mode: 'date' | 'datetime';
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const onInput = (e: { target: { value: string } }) => {
    const v = e.target.value;
    if (!v) {
      onChange(null);
      return;
    }
    const d = new Date(v);
    onChange(Number.isNaN(d.getTime()) ? null : d.toISOString());
  };

  return (
    <View style={{ flex: 1 }}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: radius.card,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: colors.bgCard,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
        }}
      >
        {icon}
        <input
          type={mode === 'date' ? 'date' : 'datetime-local'}
          value={toInputValue(value, mode)}
          onChange={onInput}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: colors.textPrimary,
            fontSize: 13,
            colorScheme: 'dark',
          }}
        />
      </View>
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
}

export function DateFieldsSection({
  dueAt,
  remindAt,
  durationMin,
  onChangeDue,
  onChangeRemind,
  onChangeDuration,
}: Props) {
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <WebField
          label="Deadline"
          icon={<Clock size={13} color={colors.textSecondary} />}
          mode="datetime"
          value={dueAt}
          onChange={onChangeDue}
        />
        <WebField
          label="Reminder"
          icon={<Bell size={13} color={remindAt ? colors.accentReminder : colors.textSecondary} />}
          mode="datetime"
          value={remindAt}
          onChange={onChangeRemind}
        />
      </View>
      {dueAt ? <DurationField value={durationMin} onChange={onChangeDuration} /> : null}
    </View>
  );
}

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bell, Clock } from 'lucide-react-native';
import { colors, monoFont, radius } from '../../theme';
import { DurationField } from './duration-field';

export function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={styles.fieldLabel}>
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
    <View style={styles.fieldWrap}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.fieldRow}>
        {icon}
        <input
          type={mode === 'date' ? 'date' : 'datetime-local'}
          value={toInputValue(value, mode)}
          onChange={onInput}
          style={inputStyle}
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
  showReminder?: boolean; // hide the Reminder field (e.g. the calendar create sheet)
}

export function DateFieldsSection({
  dueAt,
  remindAt,
  durationMin,
  onChangeDue,
  onChangeRemind,
  onChangeDuration,
  showReminder = true,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <WebField
          label="Deadline"
          icon={<Clock size={13} color={colors.textSecondary} />}
          mode="datetime"
          value={dueAt}
          onChange={onChangeDue}
        />
        {showReminder ? (
          <WebField
            label="Reminder"
            icon={<Bell size={13} color={remindAt ? colors.accentReminder : colors.textSecondary} />}
            mode="datetime"
            value={remindAt}
            onChange={onChangeRemind}
          />
        ) : null}
      </View>
      {dueAt ? <DurationField value={durationMin} onChange={onChangeDuration} /> : null}
    </View>
  );
}

// The date input is a DOM <input> (web), not an RN component — its style takes
// web CSS props that StyleSheet.create can't type, so it lives as a plain const.
const inputStyle = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: colors.textPrimary,
  fontSize: 13,
  colorScheme: 'dark',
} as const;

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 8,
  },
  fieldWrap: { flex: 1 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  container: { gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
});

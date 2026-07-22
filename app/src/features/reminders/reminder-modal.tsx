import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { colors, monoFont, radius } from '../../theme';
import { api } from '../../lib/api';
import { SNOOZE_ACTIONS } from '../../lib/push';
import { useRemindersStore } from '../../store/reminders';

// Blocking in-app reminder prompt shown when a reminder arrives while the app is
// open. Offers the same snooze options as the OS notification, plus Dismiss.
export function ReminderModal() {
  const active = useRemindersStore((s) => s.active);
  const dismiss = useRemindersStore((s) => s.dismiss);
  if (!active) return null;

  const snooze = async (minutes: number) => {
    try {
      await api.snoozeTask(active.taskId, minutes);
    } catch {
      /* ignore — leave the reminder in place if the snooze failed */
    }
    dismiss();
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Bell size={16} color={colors.accentReminder} />
            <Text style={styles.label}>REMINDER</Text>
          </View>
          <Text style={styles.title}>{active.title}</Text>
          <View style={styles.actions}>
            {SNOOZE_ACTIONS.map((a) => (
              <Pressable
                key={a.identifier}
                onPress={() => snooze(a.minutes)}
                style={styles.snoozeBtn}
              >
                <Text style={styles.snoozeText}>{a.buttonTitle}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={dismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,6,10,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCardWeb,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 24,
    gap: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1.5, color: colors.textMuted },
  title: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  actions: { gap: 8 },
  snoozeBtn: {
    paddingVertical: 12,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
  },
  snoozeText: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  dismissBtn: {
    paddingVertical: 12,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
  },
  dismissText: { fontSize: 14, fontWeight: '600', color: colors.bgSurface },
});

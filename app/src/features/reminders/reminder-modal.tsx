import { Modal, Pressable, Text, View } from 'react-native';
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
      <View style={{ flex: 1, backgroundColor: 'rgba(5,6,10,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 20,
            borderCurve: 'continuous',
            backgroundColor: colors.bgCardWeb,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            padding: 24,
            gap: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Bell size={16} color={colors.accentReminder} />
            <Text style={{ fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1.5, color: colors.textMuted }}>REMINDER</Text>
          </View>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary }}>{active.title}</Text>
          <View style={{ gap: 8 }}>
            {SNOOZE_ACTIONS.map((a) => (
              <Pressable
                key={a.identifier}
                onPress={() => snooze(a.minutes)}
                style={{ paddingVertical: 12, borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>{a.buttonTitle}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={dismiss}
            style={{ paddingVertical: 12, borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: colors.accentPrimary, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.bgSurface }}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { colors, radius, shortDateTime, webInputReset } from '../../theme';
import { DateFieldsSection } from './date-fields-section';

const WIDE = 768;
const isIOS = process.env.EXPO_OS === 'ios';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Minimal create form for the calendar ghost-create flow. Holds state locally and
// persists only via onCreate (title required). Deadline/Duration prefilled to the slot.
export function NewTaskSheet({
  startISO,
  durationMin,
  onCreate,
  onClose,
}: {
  startISO: string;
  durationMin: number;
  onCreate: (title: string, startISO: string, durationMin: number) => Promise<void>;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<string | null>(startISO);
  const [dur, setDur] = useState<number>(durationMin);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || busy || !due) return;
    setBusy(true);
    try {
      await onCreate(title, due, dur);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={{ flex: 1 }}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(5,6,10,0.6)', justifyContent: wide ? 'center' : 'flex-end', alignItems: wide ? 'center' : 'stretch' }}>
        <AnimatedPressable
          entering={wide ? undefined : SlideInDown.duration(260)}
          onPress={(e) => e.stopPropagation?.()}
          style={wide
            ? { width: 460, maxWidth: '92%', borderRadius: 20, borderCurve: 'continuous', backgroundColor: colors.bgCardWeb, borderWidth: 1, borderColor: colors.borderSubtle }
            : { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderCurve: 'continuous', backgroundColor: colors.bgCardWeb }}
        >
          <View style={{ padding: 20, gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>New task · {shortDateTime(startISO)}</Text>
                <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6, borderRadius: 8, backgroundColor: colors.bgElevated }}>
                  <X size={15} color={colors.textSecondary} />
                </Pressable>
              </View>
              <TextInput
                autoFocus
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={submit}
                placeholder="Task title…"
                placeholderTextColor={colors.textMuted}
                style={{ fontSize: 16, color: colors.textPrimary, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, ...webInputReset }}
              />
              <DateFieldsSection
                dueAt={due}
                remindAt={null}
                durationMin={dur}
                showReminder={false}
                onChangeDue={setDue}
                onChangeRemind={() => {}}
                onChangeDuration={setDur}
              />
              <Pressable onPress={submit} disabled={!title.trim()} style={{ alignItems: 'center', paddingVertical: 12, borderRadius: radius.card, backgroundColor: title.trim() ? colors.accentPrimary : colors.bgElevated }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: title.trim() ? colors.bgSurface : colors.textMuted }}>Create</Text>
              </Pressable>
            </View>
        </AnimatedPressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

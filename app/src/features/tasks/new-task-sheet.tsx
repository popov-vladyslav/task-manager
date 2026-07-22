import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { colors, radius, webInputReset } from '../../theme';
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
  const overlayJustify = wide ? 'center' : 'flex-end';
  const overlayAlign = wide ? 'center' : 'stretch';
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
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.flex}>
        <Pressable
          onPress={onClose}
          style={[styles.overlay, { justifyContent: overlayJustify, alignItems: overlayAlign }]}
        >
          <AnimatedPressable
            entering={wide ? undefined : SlideInDown.duration(260)}
            onPress={(e) => e.stopPropagation?.()}
            style={wide ? styles.sheetWide : styles.sheetMobile}
          >
            <View style={styles.content}>
              {/* No header/close — tap the overlay to dismiss. */}
              <TextInput
                autoFocus
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={submit}
                placeholder="Task title…"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, webInputReset]}
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
              <Pressable
                onPress={submit}
                disabled={!title.trim()}
                style={[
                  styles.createBtn,
                  { backgroundColor: title.trim() ? colors.accentPrimary : colors.bgElevated },
                ]}
              >
                <Text
                  style={[
                    styles.createText,
                    { color: title.trim() ? colors.bgSurface : colors.textMuted },
                  ]}
                >
                  Create
                </Text>
              </Pressable>
            </View>
          </AnimatedPressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(5,6,10,0.6)' },
  sheetWide: {
    width: 460,
    maxWidth: '92%',
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCardWeb,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sheetMobile: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCardWeb,
  },
  content: { padding: 20, gap: 16 },
  input: {
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  createBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: radius.card },
  createText: { fontSize: 14, fontWeight: '600' },
});

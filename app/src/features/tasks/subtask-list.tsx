import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useReorderableDrag } from 'react-native-reorderable-list';
import { Check, GripHorizontal } from 'lucide-react-native';
import type { Subtask } from '@task-manager/shared';
import { haptics } from '../../lib/haptics';
import { useTheme, webInputReset, type Theme } from '../../theme';

const isWeb = process.env.EXPO_OS === 'web';
export const DRAG_GUTTER = 8;
const LINE_HEIGHT = 20;
const BOX = 22;
const INPUT_TOP_INSET = process.env.EXPO_OS === 'ios' ? 2 : 0;
const BOX_TOP = (LINE_HEIGHT - BOX) / 2 + INPUT_TOP_INSET;

const submitOnEnter =
  (run: () => void) =>
  (e: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>) => {
    if (e.nativeEvent.key !== 'Enter' || e.nativeEvent.shiftKey) return;
    e.preventDefault();
    run();
  };

interface SubtaskRowProps {
  subtask: Subtask;
  onToggle: (subtask: Subtask) => void;
  onRename: (subtask: Subtask, title: string) => void;
  onDelete: (subtask: Subtask) => void;
}

function SubtaskRowBase({ subtask, onToggle, onRename, onDelete }: SubtaskRowProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const drag = useReorderableDrag();
  const inputRef = useRef<TextInput>(null);
  const [title, setTitle] = useState(subtask.title);
  useEffect(() => setTitle(subtask.title), [subtask.title]);

  const startDrag = useCallback(() => {
    haptics.impact('medium');
    drag();
  }, [drag]);

  const commit = () => {
    const next = title.trim();
    if (!next) onDelete(subtask);
    else if (next !== subtask.title) onRename(subtask, next);
  };

  return (
    <Pressable onLongPress={startDrag} delayLongPress={220} style={styles.row}>
      <Pressable
        onPress={() => onToggle(subtask)}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: subtask.done }}
        style={[styles.box, subtask.done && styles.boxDone]}
      >
        {subtask.done ? <Check size={11} color={t.colors.bgBase} strokeWidth={3} /> : null}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={title}
        onChangeText={setTitle}
        onBlur={commit}
        onSubmitEditing={commit}
        onKeyPress={isWeb ? submitOnEnter(() => inputRef.current?.blur()) : undefined}
        submitBehavior="blurAndSubmit"
        multiline
        scrollEnabled={false}
        style={[styles.text, subtask.done && styles.textDone, webInputReset]}
      />
      <Pressable
        onLongPress={startDrag}
        delayLongPress={120}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Reorder"
        style={styles.grip}
      >
        <GripHorizontal size={16} color={t.colors.textMuted} strokeWidth={1.8} />
      </Pressable>
    </Pressable>
  );
}

export const SubtaskRow = memo(SubtaskRowBase);

interface AddSubtaskRowProps {
  onAdd: (title: string) => Promise<void> | void;
  onDismiss?: () => void;
}

export const AddSubtaskRow = forwardRef<TextInput, AddSubtaskRowProps>(function AddSubtaskRow(
  { onAdd, onDismiss },
  ref,
) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [title, setTitle] = useState('');

  const submit = () => {
    const next = title.trim();
    if (!next) {
      onDismiss?.();
      return;
    }
    setTitle('');
    onAdd(next);
  };

  return (
    <View style={styles.row}>
      <View style={styles.boxEmpty} />
      <TextInput
        ref={ref}
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        onBlur={submit}
        onKeyPress={isWeb ? submitOnEnter(submit) : undefined}
        submitBehavior="submit"
        multiline
        scrollEnabled={false}
        placeholder="New subtask"
        placeholderTextColor={t.colors.textFaint}
        style={[styles.text, webInputReset]}
      />
    </View>
  );
});

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: DRAG_GUTTER,
    },
    grip: { height: LINE_HEIGHT, marginTop: INPUT_TOP_INSET, justifyContent: 'center' },
    box: {
      width: BOX,
      height: BOX,
      marginTop: BOX_TOP,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: t.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxDone: { backgroundColor: t.colors.accentPrimary, borderColor: t.colors.accentPrimary },
    boxEmpty: {
      width: BOX,
      height: BOX,
      marginTop: BOX_TOP,
      borderRadius: 7,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: t.colors.borderSubtle,
    },
    text: {
      flex: 1,
      fontSize: 14.5,
      lineHeight: LINE_HEIGHT,
      color: t.colors.textPrimary,
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: 0,
    },
    textDone: { color: t.colors.textMuted, textDecorationLine: 'line-through' },
  });

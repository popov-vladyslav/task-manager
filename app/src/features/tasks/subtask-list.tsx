import { forwardRef, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useReorderableDrag } from 'react-native-reorderable-list';
import { Check, GripHorizontal } from 'lucide-react-native';
import type { Subtask } from '@task-manager/shared';
import { haptics } from '../../lib/haptics';
import { useTheme, webInputReset, type Theme } from '../../theme';

export const DRAG_GUTTER = 8;

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
        value={title}
        onChangeText={setTitle}
        onBlur={commit}
        onSubmitEditing={commit}
        submitBehavior="blurAndSubmit"
        style={[styles.text, subtask.done && styles.textDone, webInputReset]}
      />
      <Pressable
        onLongPress={startDrag}
        delayLongPress={120}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Reorder"
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
        submitBehavior="submit"
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
      alignItems: 'center',
      gap: 12,
      height: 40,
      paddingHorizontal: DRAG_GUTTER,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: t.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxDone: { backgroundColor: t.colors.accentPrimary, borderColor: t.colors.accentPrimary },
    boxEmpty: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: t.colors.borderSubtle,
    },
    text: {
      flex: 1,
      alignSelf: 'stretch',
      fontSize: 14.5,
      color: t.colors.textPrimary,
      paddingVertical: 0,
      paddingHorizontal: 0,
    },
    textDone: { color: t.colors.textMuted, textDecorationLine: 'line-through' },
  });

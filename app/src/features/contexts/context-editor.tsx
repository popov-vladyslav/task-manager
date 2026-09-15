import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Trash2, X } from 'lucide-react-native';
import {
  contextPalette,
  EMOJI_MAX_LENGTH,
  firstGrapheme,
  nearestEmoji,
  type Context,
} from '@task-manager/shared';
import { BottomSheet, SheetInput } from '../../components/bottom-sheet';
import { useTasksStore } from '../../store/tasks';
import { useUiStore } from '../../store/ui';
import { useTheme, webInputReset, type Theme } from '../../theme';

export function ContextEditorSheet() {
  const editorId = useUiStore((s) => s.contextEditorId);
  const close = useUiStore((s) => s.closeContextEditor);
  const contexts = useTasksStore((s) => s.contexts);
  const context = editorId == null ? undefined : contexts.find((c) => c.id === editorId);
  const open = editorId !== undefined;
  return (
    <BottomSheet open={open} onClose={close}>
      {open ? (
        <ContextEditorForm key={editorId ?? 'new'} context={context} onClose={close} />
      ) : null}
    </BottomSheet>
  );
}

function ContextEditorForm({ context, onClose }: { context?: Context; onClose: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const createContext = useTasksStore((s) => s.createContext);
  const updateContext = useTasksStore((s) => s.updateContext);
  const deleteContext = useTasksStore((s) => s.deleteContext);

  const [label, setLabel] = useState(context?.label ?? '');
  const [color, setColor] = useState<string>(context?.color ?? contextPalette[0]);
  const [emoji, setEmoji] = useState(context?.emoji ?? '');
  const [excludeFromAll, setExcludeFromAll] = useState(context?.excludeFromAll ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = label.trim().length > 0 && !busy;
  const derived = nearestEmoji(color) ?? '';
  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        emojiBox: { backgroundColor: `${color}26` },
        save: { backgroundColor: canSave ? t.colors.accentPrimary : t.colors.bgElevated },
        saveText: { color: canSave ? t.colors.bgBase : t.colors.textMuted },
      }),
    [color, canSave, t],
  );

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const trimmedEmoji = emoji.trim() || null;
    try {
      if (context) {
        await updateContext(context.id, {
          label: label.trim(),
          color,
          emoji: trimmedEmoji,
          excludeFromAll,
        });
      } else {
        await createContext(label.trim(), color, excludeFromAll, trimmedEmoji);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!context || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteContext(context.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <View style={[styles.emojiBox, dynamic.emojiBox]}>
          <SheetInput
            value={emoji}
            onChangeText={(v) => setEmoji(firstGrapheme(v))}
            placeholder={derived}
            placeholderTextColor={t.colors.textMuted}
            maxLength={EMOJI_MAX_LENGTH}
            accessibilityLabel="Emoji"
            style={[styles.emojiInput, webInputReset]}
          />
        </View>
        <SheetInput
          value={label}
          onChangeText={setLabel}
          placeholder="Context name"
          placeholderTextColor={t.colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          style={[styles.input, webInputReset]}
        />
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" style={styles.close}>
          <X size={16} color={t.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.hideRow}>
        <View style={styles.flex1}>
          <Text style={styles.hideTitle}>Hide from All</Text>
          <Text style={styles.hideSubtitle}>
            Still listed in the drawer; tasks stay out of All.
          </Text>
        </View>
        <Switch
          value={excludeFromAll}
          onValueChange={setExcludeFromAll}
          trackColor={{ false: t.colors.bgElevated, true: t.colors.accentPrimary }}
          thumbColor={t.colors.textPrimary}
        />
      </View>

      <View>
        <Text style={styles.colorLabel}>COLOUR</Text>
        <View style={styles.colorGrid}>
          {contextPalette.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: color === c }}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
            />
          ))}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.row}>
        {context ? (
          <Pressable onPress={remove} disabled={busy} style={styles.remove}>
            <Trash2 size={15} color={t.colors.accentNow} />
            <Text style={styles.removeText}>Delete</Text>
          </Pressable>
        ) : null}
        <View style={styles.flex1} />
        <Pressable onPress={save} disabled={!canSave} style={[styles.save, dynamic.save]}>
          {busy ? (
            <ActivityIndicator size="small" color={t.colors.bgBase} />
          ) : (
            <Text style={[styles.saveText, dynamic.saveText]}>Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    form: { gap: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    emojiBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiInput: {
      width: 40,
      height: 40,
      textAlign: 'center',
      fontSize: 18,
      color: t.colors.textPrimary,
      padding: 0,
    },
    input: {
      flex: 1,
      height: 40,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: t.colors.bgCard,
      borderWidth: 1,
      borderColor: t.colors.borderSubtle,
      fontSize: 15,
      color: t.colors.textPrimary,
    },
    close: { padding: 7, borderRadius: 9, backgroundColor: t.colors.bgCard },
    hideRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: t.colors.bgCard,
    },
    hideTitle: { fontSize: 13.5, color: t.colors.textPrimary },
    hideSubtitle: { fontSize: 11, color: t.colors.textMuted, marginTop: 2 },
    colorLabel: {
      fontSize: 10.5,
      letterSpacing: 1.2,
      color: t.colors.textMuted,
      marginBottom: 10,
    },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    swatch: { width: 30, height: 30, borderRadius: 15 },
    swatchOn: { borderWidth: 2, borderColor: t.colors.textPrimary },
    error: { fontSize: 12.5, color: t.colors.accentNow },
    remove: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
    removeText: { fontSize: 13, fontWeight: '500', color: t.colors.accentNow },
    save: { height: 40, paddingHorizontal: 20, borderRadius: 20, justifyContent: 'center' },
    saveText: { fontSize: 14, fontWeight: '700' },
  });

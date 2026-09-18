import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Trash2, X } from 'lucide-react-native';
import {
  contextPalette,
  EMOJI_MAX_LENGTH,
  firstGrapheme,
  type Context,
} from '@task-manager/shared';
import { BottomSheet, SheetInput } from '../../components/bottom-sheet';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { Toggle } from '../../components/toggle';
import { ApiError } from '../../lib/api';
import { useT } from '../../lib/i18n';
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

const webCaretHidden: object | undefined =
  process.env.EXPO_OS === 'web' ? { caretColor: 'transparent' } : undefined;

function ContextEditorForm({ context, onClose }: { context?: Context; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
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
  const [emojiFocused, setEmojiFocused] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canSave = label.trim().length > 0 && !busy;
  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        emojiBox: { backgroundColor: `${color}26` },
        emojiDot: { backgroundColor: color },
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
      setError(e instanceof Error ? e.message : tr('contexts.editor.saveFailed'));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!context || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteContext(context.id);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      setConfirmDelete(false);
      setError(
        e instanceof ApiError && e.status === 409
          ? tr('contexts.menu.deleteBlocked')
          : e instanceof Error
            ? e.message
            : tr('contexts.editor.deleteFailed'),
      );
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <View style={[styles.emojiBox, dynamic.emojiBox]}>
          {!emoji && !emojiFocused ? (
            <View pointerEvents="none" style={[styles.emojiDot, dynamic.emojiDot]} />
          ) : null}
          <SheetInput
            value={emoji}
            onChangeText={(v) => setEmoji(firstGrapheme(v))}
            onFocus={() => setEmojiFocused(true)}
            onBlur={() => setEmojiFocused(false)}
            maxLength={EMOJI_MAX_LENGTH}
            caretHidden
            selectionColor="transparent"
            accessibilityLabel={tr('contexts.editor.emoji')}
            style={[styles.emojiInput, webInputReset, webCaretHidden]}
          />
        </View>
        <SheetInput
          value={label}
          onChangeText={setLabel}
          placeholder={tr('contexts.editor.namePlaceholder')}
          placeholderTextColor={t.colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          style={[styles.input, webInputReset]}
        />
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel={tr('common.close')}
          style={styles.close}
        >
          <X size={16} color={t.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.hideRow}>
        <View style={styles.flex1}>
          <Text style={styles.hideTitle}>{tr('contexts.editor.hideFromAll')}</Text>
          <Text style={styles.hideSubtitle}>{tr('contexts.editor.hideFromAllHint')}</Text>
        </View>
        <Toggle value={excludeFromAll} onValueChange={setExcludeFromAll} />
      </View>

      <View>
        <Text style={styles.colorLabel}>{tr('contexts.editor.colour')}</Text>
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
          <Pressable
            onPress={() => {
              setError(null);
              setConfirmDelete(true);
            }}
            disabled={busy}
            style={styles.remove}
          >
            <Trash2 size={15} color={t.colors.accentNow} />
            <Text style={styles.removeText}>{tr('common.delete')}</Text>
          </Pressable>
        ) : null}
        <View style={styles.flex1} />
        <Pressable onPress={save} disabled={!canSave} style={[styles.save, dynamic.save]}>
          {busy ? (
            <ActivityIndicator size="small" color={t.colors.bgBase} />
          ) : (
            <Text style={[styles.saveText, dynamic.saveText]}>{tr('common.save')}</Text>
          )}
        </Pressable>
      </View>

      {context ? (
        <ConfirmDialog
          open={confirmDelete}
          title={tr('contexts.menu.delete')}
          message={tr('contexts.menu.deleteConfirm', { name: context.label })}
          confirmLabel={tr('common.delete')}
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
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
    emojiDot: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
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

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet, SheetInput } from '../../components/bottom-sheet';
import { ApiError } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useTheme, webInputReset, type Theme } from '../../theme';

interface SectionNameSheetProps {
  open: boolean;
  title: string;
  initialName?: string;
  plain?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
}

export function SectionNameSheet({
  open,
  title,
  initialName = '',
  plain = false,
  onClose,
  onSubmit,
}: SectionNameSheetProps) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError(null);
    setBusy(false);
  }, [open, initialName]);

  const Input = plain ? TextInput : SheetInput;
  const canSave = name.trim().length > 0 && !busy;
  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        save: { backgroundColor: canSave ? t.colors.accentPrimary : t.colors.bgElevated },
        saveText: { color: canSave ? t.colors.bgBase : t.colors.textMuted },
      }),
    [canSave, t],
  );

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? tr('contexts.section.duplicate')
          : e instanceof Error
            ? e.message
            : tr('common.error'),
      );
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} plain={plain}>
      <Text style={styles.title}>{title}</Text>
      <Input
        value={name}
        onChangeText={setName}
        placeholder={tr('contexts.section.namePlaceholder')}
        placeholderTextColor={t.colors.textMuted}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        style={[styles.input, webInputReset]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
          <Text style={styles.cancelText}>{tr('common.cancel')}</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          style={[styles.save, dynamic.save]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={t.colors.bgBase} />
          ) : (
            <Text style={[styles.saveText, dynamic.saveText]}>{tr('common.save')}</Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    title: { fontSize: 16, fontWeight: '700', color: t.colors.textPrimary, marginBottom: 12 },
    input: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: t.colors.bgCard,
      borderWidth: 1,
      borderColor: t.colors.borderSubtle,
      fontSize: 15,
      color: t.colors.textPrimary,
    },
    error: { fontSize: 12.5, color: t.colors.accentNow, marginTop: 8 },
    actions: { flexDirection: 'row', gap: 9, marginTop: 16 },
    cancel: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bgControl,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
    },
    cancelText: { fontSize: 14, fontWeight: '700', color: t.colors.textControl },
    save: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    saveText: { fontSize: 14, fontWeight: '700' },
  });

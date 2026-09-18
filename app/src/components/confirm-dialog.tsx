import { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../lib/i18n';
import { useTheme, type Theme } from '../theme';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const accent = danger ? t.colors.accentNow : t.colors.accentPrimary;
  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        confirm: { backgroundColor: danger ? `${accent}26` : accent },
        confirmText: { color: danger ? accent : t.colors.bgBase },
      }),
    [accent, danger, t],
  );

  return (
    <Modal
      transparent
      visible={open}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable onPress={onCancel} style={styles.overlay}>
        <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>{cancelLabel ?? tr('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.confirm, dynamic.confirm]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Text style={[styles.confirmText, dynamic.confirmText]}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: t.colors.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      width: 400,
      maxWidth: '100%',
      borderRadius: 18,
      borderCurve: 'continuous',
      backgroundColor: t.colors.bgSurface,
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
      padding: 20,
    },
    title: { fontSize: 16, fontWeight: '700', color: t.colors.textPrimary },
    message: { fontSize: 13.5, lineHeight: 19, color: t.colors.textSecondary, marginTop: 8 },
    actions: { flexDirection: 'row', gap: 9, marginTop: 18 },
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
    confirm: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmText: { fontSize: 14, fontWeight: '700' },
  });

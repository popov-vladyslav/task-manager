import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../lib/i18n';
import { useTheme, type Theme } from '../theme';

export interface ChoiceOption {
  key: string;
  label: string;
  danger?: boolean;
  onPress: () => void;
}

interface ChoiceDialogProps {
  open: boolean;
  title: string;
  message?: string;
  options: ChoiceOption[];
  onCancel: () => void;
}

export function ChoiceDialog({ open, title, message, options, onCancel }: ChoiceDialogProps) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);

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
            {options.map((o) => (
              <Pressable
                key={o.key}
                onPress={o.onPress}
                accessibilityRole="button"
                style={[styles.option, o.danger ? styles.optionDanger : null]}
              >
                <Text style={[styles.optionText, o.danger ? styles.optionDangerText : null]}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={onCancel} accessibilityRole="button" style={styles.cancel}>
              <Text style={styles.cancelText}>{tr('common.cancel')}</Text>
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
    actions: { gap: 9, marginTop: 18 },
    option: {
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bgControl,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
    },
    optionText: { fontSize: 14, fontWeight: '700', color: t.colors.textPrimary },
    optionDanger: { backgroundColor: `${t.colors.accentNow}26`, borderColor: 'transparent' },
    optionDangerText: { color: t.colors.accentNow },
    cancel: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontSize: 14, fontWeight: '700', color: t.colors.textControl },
  });

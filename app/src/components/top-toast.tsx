import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TOAST_DURATION_MS, useToastStore } from '../store/toast';
import { colors, radius } from '../theme';


export function TopToast() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToastStore((s) => s.toast);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [toast, hide]);

  if (!toast) return null;

  return (
    <Animated.View
      key={toast.id}
      entering={FadeInDown.duration(240)}
      exiting={FadeOutUp.duration(180)}
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 8 }]}
    >
      <View style={[styles.card, { maxWidth: Math.min(width - 24, 460) }]}>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {toast.title}
          </Text>
          {toast.message ? (
            <Text style={styles.message} numberOfLines={1}>
              {toast.message}
            </Text>
          ) : null}
        </View>
        {toast.onUndo ? (
          <Pressable
            onPress={() => {
              toast.onUndo?.();
              hide();
            }}
            hitSlop={8}
            style={styles.undoBtn}
          >
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12 },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  message: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  undoBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.bgCard },
  undoText: { fontSize: 13, fontWeight: '700', color: colors.accentPrimary },
});

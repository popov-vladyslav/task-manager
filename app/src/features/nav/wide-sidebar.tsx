import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';
import { useAuthStore } from '../../store/auth';
import { useTheme, type Theme } from '../../theme';
import { DrawerContent } from './drawer';
import { SideNavLinks } from './nav-chrome';

export function WideSidebar() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const inset = useMemo(
    () => StyleSheet.create({ root: { paddingTop: insets.top + 16 } }),
    [insets.top],
  );
  return (
    <View style={[styles.root, inset.root]}>
      <View style={styles.nav}>
        <SideNavLinks />
      </View>
      <View style={styles.flex1}>
        <DrawerContent />
      </View>
      <View style={styles.footer}>
        <Pressable
          onPress={() => useAuthStore.getState().signOut()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.footerRow, pressed && styles.pressed]}
        >
          <LogOut size={16} color={t.colors.textMuted} strokeWidth={1.9} />
          <Text style={styles.footerMuted}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    root: {
      width: 280,
      paddingBottom: 12,
      backgroundColor: t.colors.bgSurface,
      borderRightWidth: 1,
      borderRightColor: t.colors.borderSubtle,
    },
    nav: { paddingHorizontal: 16 },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      borderTopWidth: 1,
      borderColor: t.colors.borderSubtle,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    footerMuted: { fontSize: 13.5, fontWeight: '500', color: t.colors.textSecondary },
    pressed: { opacity: 0.7 },
  });

import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { useAuthStore } from '../../store/auth';
import { registerForPush } from '../../lib/push';
import { useTimerStore } from '../../store/timer';
import { MobileTabBar } from '../../features/nav/nav-chrome';
import { TimerScreen } from '../../features/timer/timer-screen';
import { colors, WIDE_BREAKPOINT } from '../../theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const ready = useAuthStore((s) => s.ready);
  const jwt = useAuthStore((s) => s.jwt);

  // Once signed in: register for push, and adopt any timer already running on
  // the backend (an orphan after a crash, or one started from the MCP tools).
  useEffect(() => {
    if (jwt) {
      registerForPush();
      useTimerStore.getState().load();
    }
  }, [jwt]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }
  if (!jwt) return <Redirect href="/sign-in" />;

  return (
    <Tabs style={styles.tabs}>
      <View style={styles.slot}>
        <TabSlot />
      </View>

      {/* Mobile keeps the bottom bar here; wide viewports use each screen's sidebar. */}
      {!wide ? <MobileTabBar bottomInset={insets.bottom} /> : null}

      {/* Route registration for the custom bar — declared but not displayed. */}
      <TabList style={styles.hidden}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="calendar" href="/calendar" />
        <TabTrigger name="settings" href="/settings" />
      </TabList>

      {/* Full-screen focus timer — overlays everything when a session is open. */}
      <TimerScreen />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: { flex: 1, backgroundColor: colors.bgBase },
  slot: { flex: 1 },
  hidden: { display: 'none' },
});

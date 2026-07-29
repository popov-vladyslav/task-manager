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
        {/* TabSlot's ScreenContainer ships `flexShrink: 0`. On native that is
            harmless — a ScrollView's content is measured in its own pass and
            never grows its parent. On web an RNW ScrollView is a plain div, so
            its content DOES feed the ancestors' intrinsic height: the container
            grew past this bounded slot, nothing could shrink, and the overflow
            was clipped by `body { overflow: hidden }` instead of scrolled.
            Letting it shrink again keeps every screen's height bounded, so the
            ScrollView inside scrolls itself. Inert on native. */}
        <TabSlot style={styles.slotScreens} />
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
  slotScreens: { flexShrink: 1, minHeight: 0 },
  hidden: { display: 'none' },
});

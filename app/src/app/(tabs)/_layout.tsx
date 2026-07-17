import { useEffect } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { useAuthStore } from '../../store/auth';
import { registerForPush } from '../../lib/push';
import { useTimerStore } from '../../store/timer';
import { MobileTabBar } from '../../features/nav/nav-chrome';
import { TimerScreen } from '../../features/timer/timer-screen';
import { colors } from '../../theme';

const WIDE_BREAKPOINT = 768;

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
      <View style={{ flex: 1, backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }
  if (!jwt) return <Redirect href="/sign-in" />;

  return (
    <Tabs style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <View style={{ flex: 1 }}>
        <TabSlot />
      </View>

      {/* Mobile keeps the bottom bar here; wide viewports use each screen's sidebar. */}
      {!wide ? <MobileTabBar bottomInset={insets.bottom} /> : null}

      {/* Route registration for the custom bar — declared but not displayed. */}
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="routines" href="/routines" />
        <TabTrigger name="calendar" href="/calendar" />
      </TabList>

      {/* Full-screen focus timer — overlays everything when a session is open. */}
      <TimerScreen />
    </Tabs>
  );
}

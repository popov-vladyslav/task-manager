import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { useAuthStore } from '../../store/auth';
import { registerForPush } from '../../lib/push';
import { MobileTabBar } from '../../features/nav/nav-chrome';
import { colors } from '../../theme';

const WIDE_BREAKPOINT = 768;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const ready = useAuthStore((s) => s.ready);
  const jwt = useAuthStore((s) => s.jwt);

  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // Register this device for reminder push notifications once signed in.
  useEffect(() => {
    if (jwt) registerForPush();
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
      {!wide ? <MobileTabBar bottomInset={insets.bottom} onUnavailable={flash} /> : null}

      {/* Route registration for the custom bar — declared but not displayed. */}
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="routines" href="/routines" />
      </TabList>

      {toast ? (
        <View
          style={{
            position: 'absolute',
            alignSelf: 'center',
            bottom: insets.bottom + 72,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: colors.bgElevated,
            borderWidth: 1,
            borderColor: colors.borderStrong,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.textPrimary }}>{toast}</Text>
        </View>
      ) : null}
    </Tabs>
  );
}

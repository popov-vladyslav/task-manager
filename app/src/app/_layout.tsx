import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useAuthStore } from '../store/auth';
import { ReminderModal } from '../features/reminders/reminder-modal';
import { NotificationBridge } from '../features/reminders/notification-bridge';

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bgBase).catch(() => {});

export default function RootLayout() {
  // Restore the persisted session on cold start.
  useEffect(() => {
    useAuthStore.getState().load();
  }, []);

  // App config allows all orientations (so the timer can rotate); lock everything
  // else to portrait. The timer screen unlocks/relocks around itself.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  // Reveal the app only once the root view has laid out — closes the splash→app
  // gap so there's no white flash between them.
  const onLayoutRootView = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgBase }} onLayout={onLayoutRootView}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bgBase },
              }}
            />
            {Platform.OS !== 'web' ? <NotificationBridge /> : null}
            <ReminderModal />
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

import { useEffect } from 'react';
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
import { useTasksStore } from '../store/tasks';
import { ReminderModal } from '../features/reminders/reminder-modal';
import { NotificationBridge } from '../features/reminders/notification-bridge';

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bgBase).catch(() => {});

export default function RootLayout() {
  // Cold-start boot: restore the session and prefetch the task list *under the
  // splash screen*, then reveal — so there's no post-launch spinner. hideAsync
  // runs even if a request fails (load() resolves on error), so we never hang.
  useEffect(() => {
    (async () => {
      try {
        await useAuthStore.getState().load();
        if (useAuthStore.getState().jwt) await useTasksStore.getState().load();
      } finally {
        SplashScreen.hideAsync().catch(() => {});
      }
    })();
  }, []);

  // App config allows all orientations (so the timer can rotate); lock everything
  // else to portrait. The timer screen unlocks/relocks around itself.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgBase }}>
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

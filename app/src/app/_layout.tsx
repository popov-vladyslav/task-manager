import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useAuthStore } from '../store/auth';
import { ReminderModal } from '../features/reminders/reminder-modal';
import { NotificationBridge } from '../features/reminders/notification-bridge';

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

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bgBase },
          }}
        />
        {Platform.OS !== 'web' ? <NotificationBridge /> : null}
        <ReminderModal />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

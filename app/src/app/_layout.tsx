import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useTasksStore } from '../store/tasks';

export default function RootLayout() {
  // Tapping a reminder notification opens that task.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const taskId = response.notification.request.content.data?.taskId;
      if (typeof taskId === 'string') useTasksStore.getState().requestOpenTask(taskId);
    });
    return () => sub.remove();
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

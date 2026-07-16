import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

// How notifications appear while the app is foregrounded (SDK 54+ shape).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Registers this device's Expo push token with the API. No-ops on web, the
// simulator, or when no EAS projectId is configured — remote push needs a real
// device + a dev build (Expo Go no longer supports remote push) + `eas init`.
export async function registerForPush(): Promise<void> {
  if (process.env.EXPO_OS === 'web' || !Device.isDevice) return;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[push] no EAS projectId — run `eas init` to enable push');
      return;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.registerPush(token, Device.modelName ?? undefined);
  } catch (e) {
    console.warn('[push] registration skipped:', e);
  }
}

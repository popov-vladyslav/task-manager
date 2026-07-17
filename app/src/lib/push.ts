import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

// How notifications appear while the app is foregrounded (SDK 54+ shape).
// No banner in the foreground — a reminder that arrives while the app is open is
// surfaced as the blocking in-app ReminderModal instead (still logged + sounded).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Snooze actions shown on a reminder notification (category 'reminder').
export const SNOOZE_ACTIONS = [
  { identifier: 'snooze_10', minutes: 10, buttonTitle: 'Snooze 10 min' },
  { identifier: 'snooze_30', minutes: 30, buttonTitle: 'Snooze 30 min' },
  { identifier: 'snooze_60', minutes: 60, buttonTitle: 'Snooze 1 hour' },
];

export function snoozeMinutesFor(actionIdentifier: string): number | null {
  return SNOOZE_ACTIONS.find((a) => a.identifier === actionIdentifier)?.minutes ?? null;
}

// Register the reminder category so the push (sent with categoryId 'reminder')
// shows the snooze action buttons. Call once at startup.
export async function registerReminderCategory(): Promise<void> {
  if (process.env.EXPO_OS === 'web') return;
  try {
    await Notifications.setNotificationCategoryAsync(
      'reminder',
      SNOOZE_ACTIONS.map((a) => ({
        identifier: a.identifier,
        buttonTitle: a.buttonTitle,
        options: { opensAppToForeground: false },
      })),
    );
  } catch {
    /* ignore — categories are a no-op on web / unsupported platforms */
  }
}

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

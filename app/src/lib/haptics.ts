import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Device from 'expo-device';

// Haptics only exist on real hardware: simulators/emulators have no haptic engine
// (iOS logs a warning) and web has no API. Gate once, fire-and-forget everywhere.
// NOTE: expo-haptics is a native module — it only works in a build that includes
// it, not via an OTA/Metro reload of an older binary.
const enabled = Platform.OS !== 'web' && Device.isDevice;

export const haptics = {
  // Subtle tick for a discrete selection/commit (e.g. adding a task).
  select() {
    if (enabled) Haptics.selectionAsync().catch(() => {});
  },
  // Physical bump for a picked-up / settling action (e.g. reorder pickup + drop).
  impact(strength: 'light' | 'medium' | 'heavy' = 'light') {
    if (!enabled) return;
    const style =
      strength === 'heavy'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : strength === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(style).catch(() => {});
  },
  // Affirmative buzz for completing something.
  success() {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};

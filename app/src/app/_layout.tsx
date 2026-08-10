import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ObserveRoot, useObserve } from 'expo-observe';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useAuthStore } from '../store/auth';
import { useTasksStore } from '../store/tasks';
import { useSummaryStore } from '../store/summary';
import { ReminderModal } from '../features/reminders/reminder-modal';
import { TopToast } from '../components/top-toast';
import { SplashOverlay } from '../components/splash-overlay';
import { NotificationBridge } from '../features/reminders/notification-bridge';
import { MorningSummarySheet } from '../features/summary/morning-summary-sheet';
import { OtaUpdater } from '../features/updates/ota-updater';

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bgBase).catch(() => {});

// react-native-web turns showsVerticalScrollIndicator={false} into `scrollbar-width`
// only, which Safari and Chrome <121 ignore — they need a ::-webkit-scrollbar rule,
// and RN style objects cannot express pseudo-elements.
if (process.env.EXPO_OS === 'web' && typeof document !== 'undefined') {
  const id = 'hide-scrollbar-style';
  if (!document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent =
      '#settings-scroll-wide::-webkit-scrollbar,#settings-scroll-mobile::-webkit-scrollbar{display:none}';
    document.head.appendChild(el);
  }
}

function RootLayout() {
  // Cold-start boot: restore the session and prefetch the task list *under the
  // splash overlay*, then reveal — so there's no post-launch spinner. `booted`
  // flips even if a request fails (load() resolves on error), so we never hang.
  //
  // SplashOverlay is a React copy of the native launch screen; it hides the
  // native splash itself once it has laid out, which avoids the size jump
  // expo-splash-screen's own loading view introduces. `splashGone` unmounts it
  // after the fade so it stops covering the app.
  const [booted, setBooted] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const handleSplashHidden = useCallback(() => setSplashGone(true), []);

  useEffect(() => {
    (async () => {
      try {
        await useAuthStore.getState().load();
        if (useAuthStore.getState().jwt) await useTasksStore.getState().load();
      } finally {
        setBooted(true);
      }
    })();
  }, []);

  // First open of the day: review what was left unfinished. Runs after boot so it
  // never competes with the splash, and no-ops when signed out, when there is
  // nothing overdue, or when today's summary was already seen.
  useEffect(() => {
    if (!booted || !useAuthStore.getState().jwt) return;
    void useSummaryStore.getState().maybeShowForToday();
  }, [booted]);

  // EAS Observe TTI. The app isn't usable the moment boot work resolves — the
  // splash overlay still covers the whole UI until it has faded out, so marking
  // interactive at `booted` would report a TTI the user never experienced.
  // Signal it when both are true. Web renders no overlay (so `splashGone` never
  // flips there), hence the platform branch.
  //
  // This lives at the root rather than per-screen on purpose: the overlay is
  // global, so a screen-level call would fire underneath it, and only the first
  // markInteractive() of a session is recorded — the early one would win and
  // under-report TTI. Every entry route mounts through this layout, so no
  // session is left without the mark.
  const { markInteractive } = useObserve();
  const interactive = booted && (Platform.OS === 'web' || splashGone);
  useEffect(() => {
    if (interactive) markInteractive();
  }, [interactive, markInteractive]);

  // App config allows all orientations (so the timer can rotate); lock everything
  // else to portrait. The timer screen unlocks/relocks around itself.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
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
            {Platform.OS !== 'web' ? <OtaUpdater /> : null}
            <ReminderModal />
            <MorningSummarySheet />
            <TopToast />
            {Platform.OS !== 'web' && !splashGone ? (
              <SplashOverlay visible={!booted} onHidden={handleSplashHidden} />
            ) : null}
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

// ObserveRoot measures Time to First Render automatically; TTI is the
// markInteractive() call above.
export default ObserveRoot.wrap(RootLayout);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
});

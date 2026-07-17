import { useEffect, useState } from 'react';
import { AppState, Modal, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Pause, Play, X } from 'lucide-react-native';
import { useTimerStore } from '../../store/timer';

const DIGIT = '#C7CCD4';
const MUTED = '#5A6272';

// Re-render every 250ms while `active` so the number ticks smoothly.
function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [active]);
}

export function TimerScreen() {
  const open = useTimerStore((s) => s.session !== null);
  return open ? <TimerModal /> : null;
}

function TimerModal() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  // Allow the timer to rotate freely; lock back to portrait when it closes.
  // (Native only — screen orientation isn't a thing on web.)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const running = useTimerStore((s) => s.running);
  const runningSince = useTimerStore((s) => s.runningSince);
  const baseMs = useTimerStore((s) => s.baseMs);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const close = useTimerStore((s) => s.close);

  useKeepAwake(); // keep the screen awake while the timer is up
  useTick(running);

  // Backgrounding the app pauses the timer — persists the worked period so a kill
  // from the app switcher can't leave an open (unbounded) entry behind.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        const s = useTimerStore.getState();
        if (s.running) s.pause();
      }
    });
    return () => sub.remove();
  }, []);

  const totalMs = baseMs + (running && runningSince != null ? Date.now() - runningSince : 0);
  const totalSec = Math.floor(totalMs / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const mm = pad(Math.floor(totalSec / 60));
  const ss = pad(totalSec % 60);

  // One MM:SS line; adjustsFontSizeToFit caps it to fit the (padded) width, so it
  // reads the same in portrait and landscape without filling the whole screen.
  const maxSize = landscape ? 240 : 108;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Pressable
          onPress={close}
          hitSlop={14}
          accessibilityLabel="Stop timer"
          style={{ position: 'absolute', top: insets.top + 14, right: 20, padding: 8, zIndex: 2 }}
        >
          <X size={26} color={MUTED} />
        </Pressable>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            allowFontScaling={false}
            style={{
              alignSelf: 'stretch',
              textAlign: 'center',
              fontSize: maxSize,
              fontWeight: '200',
              color: DIGIT,
              fontVariant: ['tabular-nums'],
              letterSpacing: 2,
            }}
          >
            {mm}:{ss}
          </Text>
        </View>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 44, alignItems: 'center' }}>
          <Pressable
            onPress={running ? pause : resume}
            hitSlop={10}
            accessibilityLabel={running ? 'Pause' : 'Resume'}
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: '#2A2F38',
            }}
          >
            {running ? (
              <Pause size={30} color={DIGIT} fill={DIGIT} />
            ) : (
              <Play size={30} color={DIGIT} fill={DIGIT} style={{ marginLeft: 3 }} />
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

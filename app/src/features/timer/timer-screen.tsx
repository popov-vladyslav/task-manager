import { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
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
  const { width } = useWindowDimensions();
  const wide = width >= 768;

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

  const size = wide ? 210 : 148;
  const digitStyle = {
    fontSize: size,
    lineHeight: size * 1.08,
    fontWeight: '200' as const,
    color: DIGIT,
    fontVariant: ['tabular-nums' as const],
    letterSpacing: 2,
  };

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

        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: wide ? 'row' : 'column',
            gap: wide ? 48 : 0,
          }}
        >
          <Text style={digitStyle}>{mm}</Text>
          <Text style={digitStyle}>{ss}</Text>
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

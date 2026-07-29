import { useCallback, useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '../theme';

// Matches the `imageWidth` passed to the expo-splash-screen config plugin in
// app.json. The native launch screen draws the same asset at this width, so
// keep the two in sync or the handoff below stops being seamless.
const IMAGE_WIDTH = 200;

const FADE_MS = 220;

const SPLASH_IMAGE = require('../../assets/images/splash-icon.png');

type Props = {
  /** While true the overlay covers the app; flipping to false fades it out. */
  visible: boolean;
  /** Called once the fade-out has finished and the overlay can be unmounted. */
  onHidden: () => void;
};

/**
 * A React copy of the native launch screen.
 *
 * iOS shows two splashes: the launch storyboard (drawn by the OS before RN
 * exists) and expo-splash-screen's "loading view", which re-instantiates that
 * storyboard inside the RN root view and holds it until hideAsync(). The
 * second one lays out against the root view rather than the screen and renders
 * the mark ~0.67x smaller, so the splash visibly jumps between them.
 *
 * Rendering our own copy sidesteps the second presenter entirely: we draw the
 * same asset at the same width on the same background, and only once it is on
 * screen do we hide the native splash. The OS -> React handoff is invisible,
 * and the overlay stays up until boot data has loaded.
 */
export function SplashOverlay({ visible, onHidden }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const nativeSplashHidden = useRef(false);

  // Hide the native splash only after our copy has been laid out, otherwise
  // there is a frame of bare app between the two. onLayout fires again on
  // rotation, so only the first pass does the handoff.
  const handleLayout = useCallback(() => {
    if (nativeSplashHidden.current) return;
    nativeSplashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) return;
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onHidden();
    });
    return () => animation.stop();
  }, [visible, opacity, onHidden]);

  return (
    // Deliberately interactive: the overlay swallows taps so nothing
    // underneath can be pressed before boot finishes.
    <Animated.View style={[styles.root, { opacity }]} onLayout={handleLayout}>
      <Image source={SPLASH_IMAGE} style={styles.image} resizeMode="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    backgroundColor: colors.bgBase,
    justifyContent: 'center',
  },
  image: {
    height: IMAGE_WIDTH,
    width: IMAGE_WIDTH,
  },
});

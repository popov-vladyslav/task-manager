import { useCallback, useEffect, useMemo, useRef, type ComponentType, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTheme, type Theme } from '../theme';

const isIOS = process.env.EXPO_OS === 'ios';
const isWeb = process.env.EXPO_OS === 'web';

// BottomSheetTextInput coordinates the keyboard with the sheet on native, but on
// web it calls TextInput.State.currentlyFocusedInput (missing in react-native-web)
// and crashes — so use a plain TextInput inside the sheet on web.
export const SheetInput = (isWeb ? TextInput : BottomSheetTextInput) as ComponentType<
  TextInputProps & { ref?: React.Ref<TextInput> }
>;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  padded?: boolean;
  // A plain Modal panel instead of the gorhom sheet: for content that owns a
  // drag-to-reorder list (the sheet's gestures break it) and for anything that
  // must stack above such a panel.
  plain?: boolean;
}

export function BottomSheet(props: BottomSheetProps) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= t.sizes.wideBreakpoint;
  if (wide) return <WideModal {...props} />;
  return props.plain ? <MobilePanel {...props} /> : <MobileSheet {...props} />;
}

function MobilePanel({ open, onClose, children, padded = true }: BottomSheetProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const inset = useMemo(
    () => StyleSheet.create({ pad: { paddingBottom: Math.max(insets.bottom, 22) } }),
    [insets.bottom],
  );
  return (
    <Modal
      transparent
      visible={open}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.flex1}>
        <Pressable onPress={onClose} style={styles.panelBackdrop}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.panel}>
            <View style={styles.panelHandle} />
            <View style={[padded ? styles.sheetContentPadded : styles.sheetContent, inset.pad]}>
              {children}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MobileSheet({ open, onClose, children, padded = true }: BottomSheetProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const ref = useRef<BottomSheetModal>(null);
  const presented = useRef(false);

  useEffect(() => {
    if (open) {
      presented.current = true;
      ref.current?.present();
    } else if (presented.current) {
      presented.current = false;
      ref.current?.dismiss();
    }
  }, [open]);

  const handleDismiss = useCallback(() => {
    presented.current = false;
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...p}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.7}
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      stackBehavior="push"
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetScrollView
        contentContainerStyle={padded ? styles.sheetContentPadded : styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function WideModal({ open, onClose, children, padded = true, plain = false }: BottomSheetProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Modal
      transparent
      visible={open}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.flex1}>
        <Pressable onPress={onClose} style={styles.backdrop}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.card}>
            {!plain ? (
              <ScrollView
                contentContainerStyle={padded ? styles.cardContentPadded : styles.cardContent}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              <View style={padded ? styles.cardContentPadded : styles.cardContent}>{children}</View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    handle: { width: 38, height: 4, backgroundColor: t.colors.handle },
    sheetBackground: {
      backgroundColor: t.colors.bgSurface,
      borderTopLeftRadius: t.radius.sheet,
      borderTopRightRadius: t.radius.sheet,
      borderTopWidth: 1,
      borderColor: t.colors.borderStrong,
    },
    sheetContent: { paddingBottom: 22 },
    panelBackdrop: { flex: 1, backgroundColor: t.colors.scrim, justifyContent: 'flex-end' },
    panel: {
      backgroundColor: t.colors.bgSurface,
      borderTopLeftRadius: t.radius.sheet,
      borderTopRightRadius: t.radius.sheet,
      borderTopWidth: 1,
      borderColor: t.colors.borderStrong,
    },
    panelHandle: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      marginTop: 8,
      backgroundColor: t.colors.handle,
    },
    sheetContentPadded: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 22, gap: 14 },
    backdrop: {
      flex: 1,
      backgroundColor: t.colors.scrim,
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      width: 560,
      maxWidth: '92%',
      maxHeight: '85%',
      borderRadius: t.radius.sheet,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.bgSurface,
      overflow: 'hidden',
    },
    cardContent: { paddingBottom: 8 },
    cardContentPadded: { padding: 20, paddingBottom: 24, gap: 14 },
  });

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useTheme, type Theme } from '../theme';

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MARGIN = 12;
const GAP = 8;
const ARROW = 11;

interface PopoverProps {
  anchor: AnchorRect | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function Popover({ anchor, onClose, children, width = 286 }: PopoverProps) {
  const t = useTheme();
  const window = useWindowDimensions();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [cardHeight, setCardHeight] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setCardHeight(e.nativeEvent.layout.height);
  }, []);

  const placement = useMemo(() => {
    if (!anchor) return null;
    const w = Math.min(width, window.width - MARGIN * 2);
    const left = Math.min(Math.max(anchor.x, MARGIN), window.width - MARGIN - w);
    const below = anchor.y + anchor.height + GAP;
    const fitsBelow = below + cardHeight <= window.height - MARGIN;
    const above = anchor.y - GAP - cardHeight;
    const flipped = !fitsBelow && above >= MARGIN;
    const top = flipped
      ? above
      : Math.max(MARGIN, Math.min(below, window.height - MARGIN - cardHeight));
    const arrowLeft = Math.min(
      Math.max(anchor.x + anchor.width / 2 - left - ARROW / 2, 14),
      w - 14 - ARROW,
    );
    return {
      flipped,
      styles: StyleSheet.create({
        card: { position: 'absolute', left, top, width: w, opacity: cardHeight ? 1 : 0 },
        arrow: { left: arrowLeft },
      }),
    };
  }, [anchor, cardHeight, width, window.width, window.height]);

  return (
    <Modal transparent visible={anchor !== null} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop} accessibilityLabel="Close">
        {placement ? (
          <View onLayout={onLayout} style={[styles.card, placement.styles.card]}>
            <View
              style={[
                placement.flipped ? styles.arrowBottom : styles.arrowTop,
                placement.styles.arrow,
              ]}
            />
            {children}
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

export function usePopoverAnchor() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const open = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }, []);
  const close = useCallback(() => setAnchor(null), []);
  return { ref, anchor, open, close };
}

const makeStyles = (t: Theme) => {
  const arrow = {
    position: 'absolute' as const,
    width: ARROW,
    height: ARROW,
    backgroundColor: t.colors.bgPopover,
    borderColor: t.colors.borderPopover,
    transform: [{ rotate: '45deg' }],
  };
  return StyleSheet.create({
    backdrop: { flex: 1 },
    card: {
      backgroundColor: t.colors.bgPopover,
      borderWidth: 1,
      borderColor: t.colors.borderPopover,
      borderRadius: t.radius.popover,
      borderCurve: 'continuous',
      padding: 8,
      shadowColor: t.colors.bgBase,
      shadowOpacity: 0.7,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 18 },
      elevation: 12,
    },
    arrowTop: { ...arrow, top: -ARROW / 2 - 1, borderLeftWidth: 1, borderTopWidth: 1 },
    arrowBottom: { ...arrow, bottom: -ARROW / 2 - 1, borderRightWidth: 1, borderBottomWidth: 1 },
  });
};

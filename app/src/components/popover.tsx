import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
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

  const placement = useMemo(() => {
    if (!anchor) return null;
    const maxWidth = window.width - MARGIN * 2;
    const w = Math.min(width, maxWidth);
    const left = Math.min(Math.max(anchor.x, MARGIN), window.width - MARGIN - w);
    const top = anchor.y + anchor.height + GAP;
    const arrowLeft = Math.min(
      Math.max(anchor.x + anchor.width / 2 - left - ARROW / 2, 14),
      w - 14 - ARROW,
    );
    return StyleSheet.create({
      card: { position: 'absolute', left, top, width: w },
      arrow: { left: arrowLeft },
    });
  }, [anchor, width, window.width]);

  return (
    <Modal transparent visible={anchor !== null} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop} accessibilityLabel="Close">
        {placement ? (
          <View style={[styles.card, placement.card]}>
            <View style={[styles.arrow, placement.arrow]} />
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1 },
    card: {
      backgroundColor: t.colors.bgPopover,
      borderWidth: 1,
      borderColor: t.colors.borderPopover,
      borderRadius: t.radius.popover,
      borderCurve: 'continuous',
      padding: 8,
      shadowColor: '#000',
      shadowOpacity: 0.55,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 18 },
      elevation: 12,
    },
    arrow: {
      position: 'absolute',
      top: -ARROW / 2 - 1,
      width: ARROW,
      height: ARROW,
      backgroundColor: t.colors.bgPopover,
      borderLeftWidth: 1,
      borderTopWidth: 1,
      borderColor: t.colors.borderPopover,
      transform: [{ rotate: '45deg' }],
    },
  });

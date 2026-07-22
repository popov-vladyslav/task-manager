import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { HOUR_H } from './calendar-dates';

// A static preview rectangle for the snapped landing slot + the lifted block.
// Positioned by the parent via absolute left/top/width/height.
export function DragPreview({
  left,
  top,
  width,
  height,
  color,
  title,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  title: string;
}) {
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.slot,
          { left, top, width, height, borderColor: color, backgroundColor: `${color}18` },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.block,
          { left, top, width, height, backgroundColor: `${color}40`, borderLeftColor: color },
        ]}
      >
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', borderRadius: 5, borderWidth: 1.5, borderStyle: 'dashed' },
  block: {
    position: 'absolute',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingTop: 2,
    borderLeftWidth: 2.5,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { fontSize: 10, color: colors.textPrimary },
});

export const overlayHeightForMin = (durMin: number, hourH: number = HOUR_H) =>
  (durMin / 60) * hourH;

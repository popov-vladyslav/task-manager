import { Text, View } from 'react-native';
import { colors } from '../../theme';
import { HOUR_H } from './calendar-dates';

// A static preview rectangle for the snapped landing slot + the lifted block.
// Positioned by the parent via absolute left/top/width/height.
export function DragPreview({
  left, top, width, height, color, title,
}: { left: number; top: number; width: number; height: number; color: string; title: string }) {
  return (
    <>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left, top, width, height, borderRadius: 5, borderWidth: 1.5, borderColor: color, borderStyle: 'dashed', backgroundColor: `${color}18` }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left, top, width, height, borderRadius: 5, paddingHorizontal: 5, paddingTop: 2, backgroundColor: `${color}40`, borderLeftWidth: 2.5, borderLeftColor: color, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
      >
        <Text numberOfLines={2} style={{ fontSize: 10, color: colors.textPrimary }}>{title}</Text>
      </View>
    </>
  );
}

export const overlayHeightForMin = (durMin: number, hourH: number = HOUR_H) => (durMin / 60) * hourH;

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ContextMarkProps {
  emoji: string | null | undefined;
  color: string;
  size: number;
}

export function ContextMark({ emoji, color, size }: ContextMarkProps) {
  const styles = useMemo(
    () =>
      StyleSheet.create({
        emoji: { fontSize: size },
        dot: { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      }),
    [size, color],
  );
  return emoji ? <Text style={styles.emoji}>{emoji}</Text> : <View style={styles.dot} />;
}

import { useMemo, type ReactNode, type Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronsUpDown, Menu, MoreHorizontal } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './icon-button';
import { useTheme, type Theme } from '../theme';

interface HeaderProps {
  title: string;
  emoji?: string | null;
  left?: 'menu' | 'back';
  leftNode?: ReactNode;
  onLeftPress?: () => void;
  right?: ReactNode;
  onMorePress?: () => void;
  onTitlePress?: () => void;
  titleRef?: Ref<View>;
  align?: 'center' | 'start';
}

export function Header({
  title,
  emoji,
  left = 'menu',
  leftNode: leftOverride,
  onLeftPress,
  right,
  onMorePress,
  onTitlePress,
  titleRef,
  align = 'center',
}: HeaderProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(t), [t]);
  const inset = useMemo(
    () => StyleSheet.create({ row: { paddingTop: insets.top + 8 } }),
    [insets.top],
  );

  const leftNode =
    leftOverride !== undefined ? (
      leftOverride
    ) : left === 'menu' ? (
      <IconButton icon={Menu} onPress={onLeftPress} accessibilityLabel="Open menu" />
    ) : (
      <IconButton
        icon={ChevronLeft}
        onPress={onLeftPress}
        accessibilityLabel="Back"
        iconSize={20}
      />
    );

  const rightNode =
    right !== undefined ? (
      right
    ) : (
      <IconButton
        icon={MoreHorizontal}
        onPress={onMorePress}
        accessibilityLabel="More"
        iconSize={17}
      />
    );

  return (
    <View style={[styles.row, inset.row]}>
      {leftNode}
      <Pressable
        ref={titleRef}
        collapsable={false}
        onPress={onTitlePress}
        disabled={!onTitlePress}
        accessibilityRole={onTitlePress ? 'button' : 'header'}
        style={[styles.title, align === 'start' ? styles.titleStart : styles.titleCenter]}
      >
        {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        {onTitlePress ? (
          <ChevronsUpDown size={13} color={t.colors.textMuted} strokeWidth={2} />
        ) : null}
      </Pressable>
      {rightNode}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 8,
      gap: 10,
    },
    title: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    titleCenter: { justifyContent: 'center' },
    titleStart: { justifyContent: 'flex-start' },
    emoji: { fontSize: 16 },
    name: {
      fontSize: 17,
      fontWeight: '700',
      color: t.colors.textPrimary,
      flexShrink: 1,
    },
  });

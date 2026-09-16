import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import ReorderableList, {
  type ReorderableListReorderEvent,
  useReorderableDrag,
} from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EyeOff, List, Plus } from 'lucide-react-native';
import { contextEmoji, type Context } from '@task-manager/shared';
import { haptics } from '../../lib/haptics';
import { useTasksStore } from '../../store/tasks';
import { useUiStore } from '../../store/ui';
import { openCounts } from '../../store/task-selectors';
import { useTheme, type Theme } from '../../theme';

const WIDTH = 306;
const EDGE = 24;
const DURATION = 220;

function ContextRow({
  context,
  count,
  active,
  onPress,
}: {
  context: Context;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const drag = useReorderableDrag();
  const startDrag = useCallback(() => {
    haptics.impact('medium');
    drag();
  }, [drag]);
  const tint = useMemo(
    () => StyleSheet.create({ emoji: { backgroundColor: `${context.color}26` } }),
    [context.color],
  );
  return (
    <Pressable
      onPress={onPress}
      onLongPress={startDrag}
      delayLongPress={220}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.row, active && styles.rowActive, context.excludeFromAll && styles.rowMuted]}
    >
      <View style={[styles.emojiBox, tint.emoji]}>
        <Text style={styles.emoji}>{contextEmoji(context) ?? ''}</Text>
      </View>
      <Text style={[styles.label, context.excludeFromAll && styles.labelMuted]} numberOfLines={1}>
        {context.label}
      </Text>
      {context.excludeFromAll ? (
        <EyeOff size={14} color={t.colors.textMuted} strokeWidth={1.7} />
      ) : null}
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

const MemoRow = memo(ContextRow);

export function DrawerContent({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const contexts = useTasksStore((s) => s.contexts);
  const tasks = useTasksStore((s) => s.tasks);
  const activeContextId = useTasksStore((s) => s.activeContextId);
  const setActiveContext = useTasksStore((s) => s.setActiveContext);
  const reorderContexts = useTasksStore((s) => s.reorderContexts);
  const openContextEditor = useUiStore((s) => s.openContextEditor);

  const counts = useMemo(() => openCounts(tasks, contexts), [tasks, contexts]);
  const [data, setData] = useState(contexts);
  useEffect(() => setData(contexts), [contexts]);

  const select = useCallback(
    (id: number | null) => {
      setActiveContext(id);
      onNavigate?.();
    },
    [setActiveContext, onNavigate],
  );

  const handleReorder = ({ from, to }: ReorderableListReorderEvent) => {
    if (from === to) return;
    const order = [...data];
    if (from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    setData(order);
    haptics.impact('medium');
    reorderContexts(order.map((c) => c.id));
  };

  return (
    <View style={styles.content}>
      <Pressable
        onPress={() => select(null)}
        accessibilityRole="button"
        accessibilityState={{ selected: activeContextId == null }}
        style={[styles.row, styles.allRow, activeContextId == null && styles.rowActive]}
      >
        <List size={16} color={t.colors.textPrimary} strokeWidth={1.9} />
        <Text style={styles.label}>All</Text>
        <Text style={styles.count}>{counts.all}</Text>
      </Pressable>

      <View style={styles.divider} />

      <View style={styles.caption}>
        <Text style={styles.captionText}>CONTEXTS</Text>
        <Pressable
          onPress={() => openContextEditor(null)}
          accessibilityRole="button"
          accessibilityLabel="New context"
          hitSlop={8}
          style={styles.captionAdd}
        >
          <Plus size={12} color={t.colors.accentPrimary} strokeWidth={2.6} />
        </Pressable>
      </View>

      <ReorderableList
        data={data}
        keyExtractor={(c, i) => (c ? String(c.id) : `i${i}`)}
        onReorder={handleReorder}
        renderItem={({ item }) => (
          <MemoRow
            context={item}
            count={counts[String(item.id)] ?? 0}
            active={activeContextId === item.id}
            onPress={() => select(item.id)}
          />
        )}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <Text style={styles.hiddenNote}>
            Hidden contexts stay listed here; their tasks are left out of All.
          </Text>
        }
      />
    </View>
  );
}

export function Drawer() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const open = useUiStore((s) => s.drawerOpen);
  const openDrawer = useUiStore((s) => s.openDrawer);
  const closeDrawer = useUiStore((s) => s.closeDrawer);

  const x = useSharedValue(-WIDTH);
  const dragStart = useSharedValue(-WIDTH);

  useEffect(() => {
    x.value = withTiming(open ? 0 : -WIDTH, { duration: DURATION });
  }, [open, x]);

  const settle = useCallback(
    (shouldOpen: boolean) => (shouldOpen ? openDrawer() : closeDrawer()),
    [openDrawer, closeDrawer],
  );

  const [edgePan, panelPan] = useMemo(() => {
    const makePan = () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-12, 12])
        .failOffsetY([-16, 16])
        .onStart(() => {
          dragStart.value = x.value;
        })
        .onUpdate((e) => {
          x.value = Math.min(0, Math.max(-WIDTH, dragStart.value + e.translationX));
        })
        .onEnd((e) => {
          const shouldOpen = e.velocityX > 300 || (e.velocityX > -300 && x.value > -WIDTH / 2);
          x.value = withTiming(shouldOpen ? 0 : -WIDTH, { duration: DURATION });
          settle(shouldOpen);
        });
    return [makePan(), makePan()];
  }, [dragStart, settle, x]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: (x.value + WIDTH) / WIDTH }));
  const inset = useMemo(
    () =>
      StyleSheet.create({
        panel: { paddingTop: insets.top + 14 },
        edge: { top: insets.top + 60, bottom: insets.bottom + 72 },
      }),
    [insets.top, insets.bottom],
  );

  if (width >= t.sizes.wideBreakpoint) return null;

  return (
    <>
      {!open ? (
        <GestureDetector gesture={edgePan}>
          <View style={[styles.edge, inset.edge]} />
        </GestureDetector>
      ) : null}
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.scrim, scrimStyle]}>
        <Pressable onPress={closeDrawer} accessibilityLabel="Close menu" style={styles.flex1} />
      </Animated.View>
      <GestureDetector gesture={panelPan}>
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[styles.panel, inset.panel, panelStyle]}
        >
          <DrawerContent onNavigate={closeDrawer} />
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    edge: { position: 'absolute', left: 0, width: EDGE },
    scrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: t.colors.scrim,
    },
    panel: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: WIDTH,
      backgroundColor: t.colors.bgSurface,
      borderRightWidth: 1,
      borderColor: t.colors.borderSubtle,
    },
    content: { flex: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      padding: 10,
      borderRadius: 10,
      marginHorizontal: 8,
      marginBottom: 1,
    },
    allRow: { marginTop: 8 },
    rowActive: { backgroundColor: t.colors.bgControl },
    rowMuted: { opacity: 0.55 },
    label: { flex: 1, fontSize: 14.5, fontWeight: '600', color: t.colors.textPrimary },
    labelMuted: { fontWeight: '500' },
    count: {
      fontFamily: t.fonts.mono,
      fontSize: 12,
      fontWeight: '700',
      color: t.colors.textControl,
    },
    emojiBox: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: { fontSize: 13 },
    divider: {
      height: 1,
      backgroundColor: t.colors.borderSubtle,
      marginVertical: 12,
      marginHorizontal: 16,
    },
    caption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 6,
    },
    captionText: {
      flex: 1,
      fontSize: 10.5,
      letterSpacing: 1.2,
      color: t.colors.textMuted,
    },
    captionAdd: {
      width: 22,
      height: 22,
      borderRadius: 7,
      backgroundColor: t.colors.bgControl,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { flex: 1 },
    listContent: { paddingBottom: 8 },
    hiddenNote: {
      paddingHorizontal: 20,
      paddingTop: 10,
      fontSize: 11,
      lineHeight: 16,
      color: t.colors.textFaint,
    },
  });

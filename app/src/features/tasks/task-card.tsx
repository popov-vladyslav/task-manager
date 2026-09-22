import { memo, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  AlignLeft,
  Bell,
  Clock,
  ListChecks,
  Play,
  Repeat,
  Timer,
  Trash2,
} from 'lucide-react-native';
import { formatTrackedShort, type Context, type Task } from '@task-manager/shared';
import {
  colors,
  contextStripWidth,
  monoFont,
  nextInstanceLabel,
  radius,
  shortDate,
  shortTime,
} from '../../theme';
import { useT } from '../../lib/i18n';
import { isOverdue, subtaskProgress } from '../../store/task-selectors';
import { useTimerStore } from '../../store/timer';

const isWeb = process.env.EXPO_OS === 'web';

interface Props {
  task: Task;
  context?: Context;
  // Handlers take the task/id so the parent can pass stable (useCallback) refs and
  // keep the memo effective — closing over `task` per row would defeat it.
  onToggle: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
  onDelete: (id: string) => void; // swipe-left → delete
  onDrag?: () => void; // long-press the card to start a reorder drag
}

function Badge({ icon, text, color }: { icon: ReactNode; text: string; color: string }) {
  return (
    <View style={styles.badge}>
      {icon}
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

function TaskCardBase({ task, context, onToggle, onOpenDetail, onDelete, onDrag }: Props) {
  const tr = useT();
  const color = context?.color ?? colors.textMuted;
  const due = shortDate(task.dueAt);
  const overdue = isOverdue(task);
  const dueColor = overdue ? colors.accentNow : colors.textSecondary;
  const remind = shortTime(task.remindAt);
  const next = task.recurrenceId ? nextInstanceLabel(task.nextInstance) : null;
  // Accumulated timer time — compact, and absent entirely when nothing was tracked.
  const tracked = formatTrackedShort(task.trackedSec);

  const openTimer = useTimerStore((s) => s.open);
  const swipeRef = useRef<SwipeableMethods>(null);
  const title = task.title;

  const toggle = (e: GestureResponderEvent) => {
    e.stopPropagation?.();
    onToggle(task);
  };

  const onPlay = (e: GestureResponderEvent) => {
    e.stopPropagation?.(); // Play never opens the detail (per the design)
    openTimer(task.id, task.title);
  };

  const progress = subtaskProgress(task);
  const hasMeta = !!(context || due || remind || next || tracked || task.note || progress);

  const renderRightActions = () => (
    <View style={styles.actions}>
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onDelete(task.id);
        }}
        style={[styles.actionBtn, { backgroundColor: colors.accentNow }]}
      >
        <Trash2 size={16} color={colors.bgSurface} />
        <Text style={[styles.actionText, { color: colors.bgSurface }]}>{tr('common.delete')}</Text>
      </Pressable>
    </View>
  );

  const inner = (
    <Pressable
      onPress={() => onOpenDetail(task)}
      onLongPress={onDrag}
      delayLongPress={220}
      style={[styles.card, { borderLeftColor: color }]}
    >
      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityLabel={tr('tasks.card.completeTask', { title: task.title })}
        style={styles.checkbox}
      />

      <View style={styles.body}>
        <Text style={styles.titleText}>{title}</Text>
        {hasMeta ? (
          <View style={styles.metaRow}>
            {context ? (
              <Text style={[styles.contextTag, { color, backgroundColor: `${color}1A` }]}>
                {context.label}
              </Text>
            ) : null}
            {due ? (
              <Badge icon={<Clock size={9} color={dueColor} />} text={due} color={dueColor} />
            ) : null}
            {remind ? (
              <Badge
                icon={<Bell size={9} color={colors.accentReminder} />}
                text={remind}
                color={colors.accentReminder}
              />
            ) : null}
            {next ? (
              <Badge
                icon={<Repeat size={9} color={colors.textMuted} />}
                text={next}
                color={colors.textMuted}
              />
            ) : null}
            {tracked ? (
              <Badge
                icon={<Timer size={9} color={colors.accentTimer} />}
                text={tracked}
                color={colors.accentTimer}
              />
            ) : null}
            {progress ? (
              <Badge
                icon={<ListChecks size={9} color={colors.textMuted} />}
                text={`${progress.done}/${progress.total}`}
                color={colors.textMuted}
              />
            ) : null}
            {task.note ? <AlignLeft size={11} color={colors.textMuted} strokeWidth={1.8} /> : null}
          </View>
        ) : null}
      </View>

      {/* Play → full-screen focus timer for this task. */}
      <Pressable
        onPress={onPlay}
        hitSlop={6}
        accessibilityLabel={tr('tasks.card.startTimerFor', { title: task.title })}
        style={styles.playBtn}
      >
        <Play
          size={11}
          color={colors.textSecondary}
          fill={colors.textSecondary}
          style={styles.playIcon}
        />
      </Pressable>
    </Pressable>
  );

  if (isWeb) return <View style={styles.swipeContainer}>{inner}</View>;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootFriction={8}
      containerStyle={styles.swipeContainer}
    >
      {inner}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  badgeText: { fontSize: 10 },
  actions: { flexDirection: 'row', gap: 6, marginLeft: 6 },
  actionBtn: {
    width: 72,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionText: { fontSize: 11, fontWeight: '600' },
  swipeContainer: { marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    padding: 12,
    backgroundColor: colors.bgCard,
    borderLeftWidth: contextStripWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  body: { flex: 1, minWidth: 0 },
  titleText: { fontSize: 14, lineHeight: 19, color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  contextTag: {
    fontFamily: monoFont,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  playBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  playIcon: { marginLeft: 1 },
});

export const TaskCard = memo(TaskCardBase);

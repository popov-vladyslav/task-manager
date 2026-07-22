import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Bell, Clock, Info, MessageSquare, Play, Repeat, Trash2 } from 'lucide-react-native';
import type { Context, Task } from '@task-manager/shared';
import {
  colors,
  contextStripWidth,
  monoFont,
  nextInstanceLabel,
  radius,
  shortDate,
  shortTime,
  webInputReset,
} from '../../theme';
import { useTimerStore } from '../../store/timer';

const isWeb = process.env.EXPO_OS === 'web';

interface Props {
  task: Task;
  context?: Context;
  // Handlers take the task/id so the parent can pass stable (useCallback) refs and
  // keep the memo effective — closing over `task` per row would defeat it.
  onToggle: (task: Task) => void;
  onOpenDetail: (task: Task) => void; // swipe-right → full detail sheet
  onPatchTitle: (id: string, title: string) => void; // commit the inline title edit
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

function TaskCardBase({
  task,
  context,
  onToggle,
  onOpenDetail,
  onPatchTitle,
  onDelete,
  onDrag,
}: Props) {
  const color = context?.color ?? colors.textMuted;
  const due = shortDate(task.dueAt);
  const remind = shortTime(task.remindAt);
  const next = task.recurrenceId ? nextInstanceLabel(task.nextInstance) : null;

  const openTimer = useTimerStore((s) => s.open);
  const inputRef = useRef<TextInput>(null);
  const swipeRef = useRef<SwipeableMethods>(null);
  const [title, setTitle] = useState(task.title);
  // Auto-grow height so the always-rendered input is exactly content-height
  // (no swap, so focused and blurred are identical — no jump).
  const [titleHeight, setTitleHeight] = useState<number>();

  useEffect(() => setTitle(task.title), [task.id, task.title]);

  const toggle = (e: GestureResponderEvent) => {
    e.stopPropagation?.();
    onToggle(task);
  };

  const onPlay = (e: GestureResponderEvent) => {
    e.stopPropagation?.(); // Play never opens the detail (per the design)
    openTimer(task.id, task.title);
  };

  const commit = () => {
    const t = title.trim();
    if (t && t !== task.title) onPatchTitle(task.id, t);
    else if (!t) setTitle(task.title); // don't allow an empty title
  };

  const hasMeta = !!(context || due || remind || next || task.commentsCount);

  // Swipe left → reveal two actions: Details (open the sheet) and Delete.
  const renderRightActions = () => (
    <View style={styles.actions}>
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onOpenDetail(task);
        }}
        style={[styles.actionBtn, { backgroundColor: colors.bgElevated }]}
      >
        <Info size={16} color={colors.accentPrimary} />
        <Text style={[styles.actionText, { color: colors.accentPrimary }]}>Details</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onDelete(task.id);
        }}
        style={[styles.actionBtn, { backgroundColor: colors.accentNow }]}
      >
        <Trash2 size={16} color={colors.bgSurface} />
        <Text style={[styles.actionText, { color: colors.bgSurface }]}>Delete</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootFriction={8}
      containerStyle={styles.swipeContainer}
    >
      <Pressable
        onPress={() => inputRef.current?.focus()}
        onLongPress={onDrag}
        delayLongPress={220}
        style={[styles.card, { borderLeftColor: color }]}
      >
        <Pressable
          onPress={toggle}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityLabel={`Complete ${task.title}`}
          style={styles.checkbox}
        />

        <View style={styles.body}>
          {/* One always-rendered input, auto-grown to content height. No Text↔input
              swap, so focus/blur have identical size (no jump); wraps long titles;
              blurAndSubmit → Enter commits instead of inserting a newline. */}
          <TextInput
            ref={inputRef}
            value={title}
            onChangeText={setTitle}
            onBlur={commit}
            onSubmitEditing={commit}
            submitBehavior="blurAndSubmit"
            multiline
            // Web only: the RN-web <textarea> has a 2-row min-height (dead space);
            // rows=1 collapses it and onContentSizeChange still grows it to wrap.
            // On native, numberOfLines truncates a multiline input — so omit it.
            numberOfLines={isWeb ? 1 : undefined}
            scrollEnabled={false}
            onContentSizeChange={(e) => setTitleHeight(e.nativeEvent.contentSize.height)}
            style={[styles.titleInput, { height: titleHeight }, webInputReset]}
          />
          {hasMeta ? (
            <View style={styles.metaRow}>
              {context ? (
                <Text style={[styles.contextTag, { color, backgroundColor: `${color}1A` }]}>
                  {context.label}
                </Text>
              ) : null}
              {due ? (
                <Badge
                  icon={<Clock size={9} color={colors.textSecondary} />}
                  text={due}
                  color={colors.textSecondary}
                />
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
              {task.commentsCount > 0 ? (
                <Badge
                  icon={<MessageSquare size={9} color={colors.textMuted} />}
                  text={String(task.commentsCount)}
                  color={colors.textMuted}
                />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Play → full-screen focus timer for this task. */}
        <Pressable
          onPress={onPlay}
          hitSlop={6}
          accessibilityLabel={`Start timer for ${task.title}`}
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
  titleInput: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.textPrimary,
    padding: 0,
  },
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

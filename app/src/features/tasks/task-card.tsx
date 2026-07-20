import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
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
  onToggle: () => void;
  onOpenDetail: () => void; // swipe-right → full detail sheet
  onPatchTitle: (title: string) => void; // commit the inline title edit
  onDelete: () => void; // swipe-left → delete
  onDrag?: () => void; // long-press the card to start a reorder drag
}

function Badge({ icon, text, color }: { icon: ReactNode; text: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {icon}
      <Text style={{ fontSize: 10, color }}>{text}</Text>
    </View>
  );
}

function TaskCardBase({ task, context, onToggle, onOpenDetail, onPatchTitle, onDelete, onDrag }: Props) {
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
    onToggle();
  };

  const onPlay = (e: GestureResponderEvent) => {
    e.stopPropagation?.(); // Play never opens the detail (per the design)
    openTimer(task.id, task.title);
  };

  const commit = () => {
    const t = title.trim();
    if (t && t !== task.title) onPatchTitle(t);
    else if (!t) setTitle(task.title); // don't allow an empty title
  };

  const hasMeta = !!(context || due || remind || next || task.commentsCount);

  // Swipe left → reveal two actions: Details (open the sheet) and Delete.
  const renderRightActions = () => (
    <View style={{ flexDirection: 'row', gap: 6, marginLeft: 6 }}>
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onOpenDetail();
        }}
        style={{
          width: 72,
          borderRadius: radius.card,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          backgroundColor: colors.bgElevated,
        }}
      >
        <Info size={16} color={colors.accentPrimary} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accentPrimary }}>Details</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onDelete();
        }}
        style={{
          width: 72,
          borderRadius: radius.card,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          backgroundColor: colors.accentNow,
        }}
      >
        <Trash2 size={16} color={colors.bgSurface} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.bgSurface }}>Delete</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootFriction={8}
      containerStyle={{ marginBottom: 8 }}
    >
      <Pressable
        onPress={() => inputRef.current?.focus()}
        onLongPress={onDrag}
        delayLongPress={220}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: radius.card,
          borderCurve: 'continuous',
          padding: 12,
          backgroundColor: colors.bgCard,
          borderLeftWidth: contextStripWidth,
          borderLeftColor: color,
        }}
      >
        <Pressable
          onPress={toggle}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityLabel={`Complete ${task.title}`}
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1.5,
            borderColor: colors.borderStrong,
          }}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
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
            style={{
              fontSize: 14,
              lineHeight: 19,
              color: colors.textPrimary,
              padding: 0,
              height: titleHeight,
              ...webInputReset,
            }}
          />
          {hasMeta ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {context ? (
                <Text
                  style={{
                    fontFamily: monoFont,
                    fontSize: 10,
                    color,
                    backgroundColor: `${color}1A`,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  {context.label}
                </Text>
              ) : null}
              {due ? <Badge icon={<Clock size={9} color={colors.textSecondary} />} text={due} color={colors.textSecondary} /> : null}
              {remind ? <Badge icon={<Bell size={9} color={colors.accentReminder} />} text={remind} color={colors.accentReminder} /> : null}
              {next ? <Badge icon={<Repeat size={9} color={colors.textMuted} />} text={next} color={colors.textMuted} /> : null}
              {task.commentsCount > 0 ? (
                <Badge icon={<MessageSquare size={9} color={colors.textMuted} />} text={String(task.commentsCount)} color={colors.textMuted} />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Play → full-screen focus timer for this task. */}
        <Pressable
          onPress={onPlay}
          hitSlop={6}
          accessibilityLabel={`Start timer for ${task.title}`}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgElevated,
          }}
        >
          <Play size={11} color={colors.textSecondary} fill={colors.textSecondary} style={{ marginLeft: 1 }} />
        </Pressable>
      </Pressable>
    </Swipeable>
  );
}

export const TaskCard = memo(TaskCardBase);

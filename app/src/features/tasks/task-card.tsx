import { memo, type ReactNode } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { Bell, Clock, Image as ImageIcon, MessageSquare, Play, Repeat } from 'lucide-react-native';
import type { Context, Task } from '@task-manager/shared';
import {
  colors,
  contextStripWidth,
  monoFont,
  nextInstanceLabel,
  radius,
  shortDate,
  shortTime,
} from '../../theme';
import { useTimerStore } from '../../store/timer';

interface Props {
  task: Task;
  context?: Context;
  onToggle: () => void;
  onOpen: () => void;
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

function TaskCardBase({ task, context, onToggle, onOpen, onDrag }: Props) {
  const color = context?.color ?? colors.textMuted;
  const due = shortDate(task.dueAt);
  const remind = shortTime(task.remindAt);
  const next = task.recurrenceId ? nextInstanceLabel(task.nextInstance) : null;

  const openTimer = useTimerStore((s) => s.open);

  const toggle = (e: GestureResponderEvent) => {
    e.stopPropagation?.();
    onToggle();
  };

  const onPlay = (e: GestureResponderEvent) => {
    e.stopPropagation?.(); // Play never opens the detail (per the design)
    openTimer(task.id, task.title);
  };

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onDrag}
      delayLongPress={220}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        padding: 12,
        marginBottom: 8,
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
          marginTop: 2,
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 1.5,
          borderColor: colors.borderStrong,
        }}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, lineHeight: 19, color: colors.textPrimary }}>{task.title}</Text>
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
          {task.photosCount > 0 ? (
            <Badge icon={<ImageIcon size={9} color={colors.textMuted} />} text={String(task.photosCount)} color={colors.textMuted} />
          ) : null}
        </View>
      </View>

      {/* Tap Play → full-screen focus timer for this task. */}
      <Pressable
        onPress={onPlay}
        hitSlop={6}
        accessibilityLabel={`Start timer for ${task.title}`}
        style={{
          marginTop: 2,
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
  );
}

export const TaskCard = memo(TaskCardBase);

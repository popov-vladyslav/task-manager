import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlignLeft, Clock, Play, Repeat } from 'lucide-react-native';
import { formatTrackedShort, type Context, type Task } from '@task-manager/shared';
import { INTL_TAG } from '@task-manager/shared';
import { currentT, useT } from '../lib/i18n';
import { useLocaleStore } from '../store/locale';
import { isOverdue } from '../store/task-selectors';
import { useTheme, type Theme } from '../theme';

interface TaskRowProps {
  task: Task;
  context?: Context | null;
  showContext?: boolean;
  hasNote?: boolean;
  onPress?: () => void;
  onToggle?: () => void;
  onPlay?: () => void;
}

export function TaskRow({
  task,
  context,
  showContext = false,
  hasNote = false,
  onPress,
  onToggle,
  onPlay,
}: TaskRowProps) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const color = context?.color ?? t.colors.textMuted;
  const overdue = isOverdue(task);
  const due = dueLabel(task);
  const tracked = formatTrackedShort(task.trackedSec);
  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        bar: { backgroundColor: color },
        badge: { color, backgroundColor: `${color}1F` },
        due: { color: overdue ? t.colors.accentNow : t.colors.textSecondary },
      }),
    [color, overdue, t],
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.bar, dynamic.bar]} />
      <Pressable
        onPress={onToggle}
        disabled={!onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.status === 'done' }}
        style={[styles.check, task.status === 'done' && styles.checkDone]}
      />
      <View style={styles.body}>
        <Text style={[styles.title, task.status === 'done' && styles.titleDone]} numberOfLines={3}>
          {task.title}
        </Text>
        <View style={styles.meta}>
          {showContext && context ? (
            <Text style={[styles.badge, dynamic.badge]}>{context.slug}</Text>
          ) : null}
          <View style={styles.due}>
            {overdue ? <Clock size={11} color={t.colors.accentNow} strokeWidth={2} /> : null}
            <Text style={[styles.dueText, dynamic.due]}>{due}</Text>
          </View>
          {tracked ? <Text style={styles.tracked}>{tracked}</Text> : null}
          {task.recurrenceId ? (
            <Repeat size={12} color={t.colors.textMuted} strokeWidth={1.8} />
          ) : null}
          {hasNote ? <AlignLeft size={12} color={t.colors.textMuted} strokeWidth={1.8} /> : null}
        </View>
      </View>
      {onPlay ? (
        <Pressable
          onPress={onPlay}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={tr('tasks.card.startTimer')}
          style={({ pressed }) => [styles.play, pressed && styles.pressed]}
        >
          <Play size={11} color={t.colors.textControl} fill={t.colors.textControl} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function dueLabel(task: Task): string {
  if (!task.dueAt) return currentT()('common.noDeadline');
  const d = new Date(task.dueAt);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const intl = INTL_TAG[useLocaleStore.getState().locale];
  const time = d.toLocaleTimeString(intl, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) {
    const duration = task.durationMin ? ` · ${task.durationMin} min` : '';
    return `${currentT()('common.today')}, ${time}${duration}`;
  }
  const date = d.toLocaleDateString(intl, { month: 'short', day: 'numeric' });
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return hasTime ? `${date}, ${time}` : date;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      backgroundColor: t.colors.bgCard,
      borderWidth: 1,
      borderColor: t.colors.borderSubtle,
      borderRadius: t.radius.card,
      borderCurve: 'continuous',
      paddingTop: 12,
      paddingBottom: 12,
      paddingRight: 12,
      paddingLeft: 15,
      overflow: 'hidden',
    },
    pressed: { opacity: 0.8 },
    bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: t.sizes.contextStripWidth },
    check: {
      width: 21,
      height: 21,
      borderRadius: 11,
      borderWidth: 1.8,
      borderColor: t.colors.borderStrong,
      marginTop: 1,
    },
    checkDone: { backgroundColor: t.colors.accentTimer, borderColor: t.colors.accentTimer },
    body: { flex: 1, minWidth: 0, gap: 6 },
    title: { fontSize: 14.5, fontWeight: '600', lineHeight: 19, color: t.colors.textPrimary },
    titleDone: { color: t.colors.textMuted, textDecorationLine: 'line-through' },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    badge: {
      fontFamily: t.fonts.mono,
      fontSize: 10,
      fontWeight: '600',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    due: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dueText: { fontSize: 11 },
    tracked: { fontFamily: t.fonts.mono, fontSize: 11, color: t.colors.accentTimer },
    play: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: t.colors.bgControl,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

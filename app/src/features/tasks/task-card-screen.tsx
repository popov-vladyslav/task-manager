import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlignLeft, Bell, Check, MoreHorizontal, Play, Repeat, Trash2 } from 'lucide-react-native';
import { formatTrackedShort } from '@task-manager/shared';
import { Header } from '../../components/header';
import { IconButton } from '../../components/icon-button';
import { Popover, usePopoverAnchor } from '../../components/popover';
import { haptics } from '../../lib/haptics';
import { useTasksStore } from '../../store/tasks';
import { useTimerStore } from '../../store/timer';
import { useToastStore } from '../../store/toast';
import { useTheme, webInputReset, type Theme } from '../../theme';
import { ContextPopover } from './context-popover';
import { describeWhen, WhenSheet } from './when-sheet';

const isWeb = process.env.EXPO_OS === 'web';

interface TaskCardScreenProps {
  taskId: string;
  onClose: () => void;
  compact?: boolean;
}

export function TaskCardScreen({ taskId, onClose, compact = false }: TaskCardScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t, compact), [t, compact]);
  const task = useTasksStore(
    (s) => s.tasks.find((x) => x.id === taskId) ?? s.completed.find((x) => x.id === taskId),
  );
  const contexts = useTasksStore((s) => s.contexts);
  const load = useTasksStore((s) => s.load);
  const loadCompleted = useTasksStore((s) => s.loadCompleted);
  const patchTask = useTasksStore((s) => s.patchTask);
  const removeTask = useTasksStore((s) => s.removeTask);
  const undoRemove = useTasksStore((s) => s.undoRemove);
  const toggleComplete = useTasksStore((s) => s.toggleComplete);
  const uncomplete = useTasksStore((s) => s.uncomplete);
  const openTimer = useTimerStore((s) => s.open);

  const popover = usePopoverAnchor();
  const menu = usePopoverAnchor();
  const [whenOpen, setWhenOpen] = useState(false);
  const [title, setTitle] = useState(task?.title ?? '');
  const [note, setNote] = useState(task?.note ?? '');
  const [titleHeight, setTitleHeight] = useState<number>();
  const noteRef = useRef<TextInput>(null);

  const fetched = useRef(false);
  useEffect(() => {
    if (task || fetched.current) return;
    fetched.current = true;
    load({ silent: true });
    loadCompleted();
  }, [task, load, loadCompleted]);

  useEffect(() => setTitle(task?.title ?? ''), [task?.id, task?.title]);
  useEffect(() => setNote(task?.note ?? ''), [task?.id, task?.note]);

  const context = task?.contextId != null ? contexts.find((c) => c.id === task.contextId) : null;
  const done = task?.status === 'done';
  const when = useMemo(
    () =>
      task
        ? describeWhen({
            dueAt: task.dueAt,
            durationMin: task.durationMin,
            remindAt: task.remindAt,
            recurrenceRule: task.recurrenceRule,
          })
        : { main: null, sub: null },
    [task],
  );
  const tracked = task ? formatTrackedShort(task.trackedSec) : null;

  const commitTitle = useCallback(() => {
    if (!task) return;
    const next = title.trim();
    if (next && next !== task.title) patchTask(task.id, { title: next });
    else if (!next) setTitle(task.title);
  }, [task, title, patchTask]);

  const commitNote = useCallback(() => {
    if (!task) return;
    const next = note.trim() || null;
    if (next !== (task.note ?? null)) patchTask(task.id, { note: next });
  }, [task, note, patchTask]);

  const toggle = () => {
    if (!task) return;
    haptics.success();
    if (done) {
      uncomplete(task);
    } else {
      toggleComplete(task);
      useToastStore.getState().show({
        title: task.recurrenceId ? 'Completed · next instance scheduled' : 'Task completed',
        message: task.title,
        onUndo: () => uncomplete(task),
      });
    }
  };

  const remove = () => {
    if (!task) return;
    menu.close();
    removeTask(task.id);
    useToastStore.getState().show({
      title: 'Task deleted',
      message: task.title,
      onUndo: () => undoRemove(task.id),
    });
    onClose();
  };

  if (!task) {
    return (
      <View style={styles.root}>
        <Header
          title="Task"
          left="back"
          onLeftPress={onClose}
          right={<View style={styles.spacer} />}
        />
        <Text style={styles.missing}>This task is no longer here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Header
        title={context?.label ?? 'No context'}
        emoji={context?.emoji}
        left="back"
        onLeftPress={onClose}
        onTitlePress={popover.open}
        titleRef={popover.ref}
        right={
          <View ref={menu.ref} collapsable={false}>
            <IconButton
              icon={MoreHorizontal}
              onPress={menu.open}
              accessibilityLabel="More"
              iconSize={17}
            />
          </View>
        }
        align="start"
        horizontalPadding={compact ? 16 : 12}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setWhenOpen(true)} accessibilityRole="button" style={styles.when}>
          <View style={styles.whenIcon}>
            <Bell
              size={14}
              color={task.remindAt ? t.colors.accentPrimary : t.colors.textMuted}
              strokeWidth={1.8}
            />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.whenMain, !when.main && styles.whenEmpty]}>
              {when.main ?? 'No deadline'}
            </Text>
            {when.sub ? (
              <View style={styles.whenSubRow}>
                <Text style={styles.whenSub}>{when.sub}</Text>
                <Repeat size={13} color={t.colors.textSecondary} strokeWidth={1.8} />
              </View>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.titleRow}>
          <Pressable
            onPress={toggle}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            style={[styles.check, done && styles.checkDone]}
          >
            {done ? <Check size={14} color={t.colors.bgBase} strokeWidth={3} /> : null}
          </Pressable>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={commitTitle}
            onSubmitEditing={commitTitle}
            submitBehavior="blurAndSubmit"
            multiline
            numberOfLines={isWeb ? 1 : undefined}
            scrollEnabled={false}
            onContentSizeChange={(e) => setTitleHeight(e.nativeEvent.contentSize.height)}
            style={[
              styles.title,
              done && styles.titleDone,
              titleHeight ? { height: titleHeight } : null,
              webInputReset,
            ]}
          />
        </View>

        <TextInput
          ref={noteRef}
          value={note}
          onChangeText={setNote}
          onBlur={commitNote}
          multiline
          placeholder="Add a note…"
          placeholderTextColor={t.colors.textFaint}
          scrollEnabled={false}
          style={[styles.note, webInputReset]}
        />
      </ScrollView>

      <View style={styles.toolbar}>
        <View style={styles.tools}>
          <ToolButton
            label="Note"
            onPress={() => noteRef.current?.focus()}
            icon={<AlignLeft size={18} color={t.colors.textControl} strokeWidth={1.9} />}
          />
          <ToolButton
            label="Reminder"
            onPress={() => setWhenOpen(true)}
            icon={
              <Bell
                size={18}
                color={task.remindAt ? t.colors.accentPrimary : t.colors.textControl}
                strokeWidth={1.8}
              />
            }
          />
          <ToolButton
            label="Delete"
            onPress={remove}
            icon={<Trash2 size={18} color={t.colors.textControl} strokeWidth={1.8} />}
          />
        </View>
        <Pressable
          onPress={() => openTimer(task.id, task.title)}
          accessibilityRole="button"
          accessibilityLabel="Start timer"
          style={styles.timer}
        >
          <Play size={12} color={t.colors.accentTimer} fill={t.colors.accentTimer} />
          <Text style={styles.timerText}>{tracked ?? 'Start'}</Text>
        </Pressable>
      </View>

      <ContextPopover
        anchor={popover.anchor}
        selectedId={task.contextId}
        onSelect={(id) => patchTask(task.id, { contextId: id })}
        onClose={popover.close}
      />

      <WhenSheet
        open={whenOpen}
        value={{
          dueAt: task.dueAt,
          durationMin: task.durationMin,
          remindAt: task.remindAt,
          recurrenceRule: task.recurrenceRule,
        }}
        onClose={() => setWhenOpen(false)}
        onSave={(patch) => {
          setWhenOpen(false);
          patchTask(task.id, patch);
        }}
      />

      <Popover anchor={menu.anchor} onClose={menu.close} width={200}>
        <Pressable onPress={remove} accessibilityRole="button" style={styles.menuItem}>
          <Trash2 size={17} color={t.colors.accentNow} strokeWidth={1.8} />
          <Text style={styles.menuDanger}>Delete task</Text>
        </Pressable>
      </Popover>
    </View>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tool, pressed && styles.toolPressed]}
    >
      {icon}
    </Pressable>
  );
}

const makeStyles = (t: Theme, compact: boolean) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    root: {
      flex: compact ? undefined : 1,
      backgroundColor: compact ? t.colors.bgSurface : t.colors.bgBase,
    },
    spacer: { width: 38, height: 38 },
    missing: { padding: 24, color: t.colors.textMuted },
    content: {
      paddingHorizontal: compact ? 22 : 18,
      paddingTop: 6,
      paddingBottom: compact ? 16 : 24,
    },
    when: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    whenIcon: {
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    whenMain: { fontSize: 15, fontWeight: '600', color: t.colors.accentPrimary },
    whenEmpty: { color: t.colors.textMuted },
    whenSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    whenSub: { fontSize: 12.5, color: t.colors.textSecondary },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 20 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: t.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    checkDone: { backgroundColor: t.colors.accentPrimary, borderColor: t.colors.accentPrimary },
    title: {
      flex: 1,
      fontSize: compact ? 19 : 22,
      fontWeight: '700',
      lineHeight: compact ? 25 : 29,
      letterSpacing: -0.2,
      color: t.colors.textPrimary,
      padding: 0,
    },
    titleDone: { color: t.colors.textMuted, textDecorationLine: 'line-through' },
    note: {
      fontSize: 14,
      lineHeight: 22,
      color: t.colors.textSecondary,
      marginTop: 14,
      marginLeft: 34,
      padding: 0,
      minHeight: 44,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: compact ? 20 : 16,
      paddingTop: compact ? 4 : 12,
      paddingBottom: compact ? 18 : 22,
    },
    tools: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 44,
      paddingHorizontal: 6,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: t.colors.borderControl,
    },
    tool: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolPressed: { backgroundColor: t.colors.bgControl },
    timer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: `${t.colors.accentTimer}1F`,
      borderWidth: 1,
      borderColor: `${t.colors.accentTimer}59`,
    },
    timerText: {
      fontFamily: t.fonts.mono,
      fontSize: 13,
      fontWeight: '700',
      color: t.colors.accentTimer,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    menuDanger: { fontSize: 14, fontWeight: '600', color: t.colors.accentNow },
  });

import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import { AlignLeft, ArrowRight, Bell, ChevronUp, Clock, Repeat } from 'lucide-react-native';
import { contextEmoji } from '@task-manager/shared';
import { BottomSheet, SheetInput } from '../../components/bottom-sheet';
import { Chip } from '../../components/chip';
import { usePopoverAnchor } from '../../components/popover';
import { haptics } from '../../lib/haptics';
import { useT } from '../../lib/i18n';
import { useTasksStore } from '../../store/tasks';
import { useToastStore } from '../../store/toast';
import { useTheme, webInputReset, type Theme } from '../../theme';
import { ContextPopover } from './context-popover';
import { describeWhen, WhenSheet, type WhenPatch } from './when-sheet';

export interface QuickCreateInitial {
  dueAt?: string | null;
  durationMin?: number | null;
  contextId?: number | null;
  sectionId?: string | null;
}

interface QuickCreateSheetProps {
  open: boolean;
  onClose: () => void;
  initial?: QuickCreateInitial;
  onCreated?: (taskId: string) => void;
  onOpenCard?: (taskId: string) => void;
}

const EMPTY_WHEN: WhenPatch = { dueAt: null, durationMin: null, remindAt: null, recurrence: null };
const SHEET_DISMISS_MS = 300;

function afterKeyboardHidden(run: () => void) {
  if (!Keyboard.isVisible()) {
    run();
    return;
  }
  const sub = Keyboard.addListener('keyboardDidHide', () => {
    sub.remove();
    run();
  });
  Keyboard.dismiss();
}

export function QuickCreateSheet({
  open,
  onClose,
  initial,
  onCreated,
  onOpenCard,
}: QuickCreateSheetProps) {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const contexts = useTasksStore((s) => s.contexts);
  const activeContextId = useTasksStore((s) => s.activeContextId);
  const addTask = useTasksStore((s) => s.addTask);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [contextId, setContextId] = useState<number | null>(null);
  const initialContextId = initial?.contextId !== undefined ? initial.contextId : activeContextId;
  const [when, setWhen] = useState<WhenPatch>(EMPTY_WHEN);
  const [whenOpen, setWhenOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const popover = usePopoverAnchor();
  const titleRef = useRef<TextInput>(null);
  const noteRef = useRef<TextInput>(null);
  const focusNoteOnShow = useRef(false);
  useEffect(() => {
    if (showNote && focusNoteOnShow.current) {
      focusNoteOnShow.current = false;
      noteRef.current?.focus();
    }
  }, [showNote]);

  const focusTitle = (delay = 0) => {
    setTimeout(() => titleRef.current?.focus(), delay);
  };
  const openWhen = () => {
    Keyboard.dismiss();
    setWhenOpen(true);
  };
  const closeWhen = () => {
    setWhenOpen(false);
    focusTitle(SHEET_DISMISS_MS);
  };
  const openContextPopover = () => afterKeyboardHidden(popover.open);
  const closeContextPopover = () => {
    popover.close();
    focusTitle();
  };

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setNote('');
    setShowNote(false);
    setContextId(initial?.contextId !== undefined ? initial.contextId : activeContextId);
    setWhen({
      dueAt: initial?.dueAt ?? null,
      durationMin: initial?.dueAt ? (initial?.durationMin ?? 30) : null,
      remindAt: null,
      recurrence: null,
    });
  }, [open, initial, activeContextId]);

  const context = contextId != null ? contexts.find((c) => c.id === contextId) : null;
  const whenText = describeWhen({
    dueAt: when.dueAt,
    durationMin: when.durationMin,
    remindAt: when.remindAt,
    recurrenceRule: when.recurrence?.rule ?? null,
  });
  const canSend = title.trim().length > 0 && !busy;

  const create = async (openCard: boolean) => {
    if (!canSend) return;
    setBusy(true);
    try {
      const created = await addTask(title.trim(), {
        contextId,
        dueAt: when.dueAt,
        remindAt: when.remindAt,
        durationMin: when.durationMin,
        recurrence: when.recurrence,
        note: note.trim() || null,
        sectionId:
          contextId != null && contextId === initialContextId ? (initial?.sectionId ?? null) : null,
      });
      haptics.success();
      if (!openCard)
        useToastStore.getState().show({ title: tr('toasts.taskCreated'), message: title.trim() });
      onClose();
      if (created) {
        onCreated?.(created.id);
        if (openCard) onOpenCard?.(created.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const chipTint = { context: context?.color };

  return (
    <BottomSheet open={open} onClose={onClose}>
      {onOpenCard ? (
        <Pressable
          onPress={() => create(true)}
          disabled={!canSend}
          accessibilityRole="button"
          style={styles.hint}
        >
          <ChevronUp size={16} color={t.colors.textFaint} strokeWidth={2.4} />
          <Text style={styles.hintText}>{tr('when.create.hint')}</Text>
        </Pressable>
      ) : null}

      <SheetInput
        ref={titleRef}
        value={title}
        onChangeText={setTitle}
        placeholder={tr('when.create.titlePlaceholder')}
        placeholderTextColor={t.colors.textMuted}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => create(false)}
        style={[styles.title, webInputReset]}
      />

      <View style={styles.chips}>
        <Chip
          label={whenText.main ?? tr('when.create.due')}
          icon={
            <Clock
              size={14}
              color={when.dueAt ? t.colors.accentPrimary : t.colors.textControl}
              strokeWidth={1.8}
            />
          }
          selected={!!when.dueAt}
          onPress={openWhen}
        />
        <Chip
          label={when.remindAt ? tr('when.create.reminderSet') : tr('when.create.remind')}
          icon={
            <Bell
              size={14}
              color={when.remindAt ? t.colors.accentPrimary : t.colors.textControl}
              strokeWidth={1.7}
            />
          }
          selected={!!when.remindAt}
          onPress={openWhen}
        />
        <View ref={popover.ref} collapsable={false}>
          <Chip
            label={
              context
                ? `${contextEmoji(context) ?? ''} ${context.label}`.trim()
                : tr('when.create.context')
            }
            selected={!!context}
            tint={chipTint.context}
            onPress={openContextPopover}
          />
        </View>
        <Chip
          label={whenText.sub ?? tr('when.row.repeat')}
          icon={
            <Repeat
              size={14}
              color={when.recurrence ? t.colors.accentPrimary : t.colors.textControl}
              strokeWidth={1.7}
            />
          }
          selected={!!when.recurrence}
          onPress={openWhen}
        />
      </View>

      {showNote ? (
        <SheetInput
          ref={noteRef}
          value={note}
          onChangeText={setNote}
          placeholder={tr('when.create.notePlaceholder')}
          placeholderTextColor={t.colors.textFaint}
          multiline
          style={[styles.note, webInputReset]}
        />
      ) : null}

      <View style={styles.foot}>
        <Pressable
          onPress={() => {
            if (showNote) {
              noteRef.current?.focus();
              return;
            }
            focusNoteOnShow.current = true;
            setShowNote(true);
          }}
          accessibilityRole="button"
          style={styles.more}
        >
          <AlignLeft size={15} color={t.colors.textControl} strokeWidth={1.8} />
          <Text style={styles.moreText}>{tr('when.create.note')}</Text>
        </Pressable>
        <Pressable
          onPress={() => create(false)}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={tr('when.create.submit')}
          style={[styles.send, !canSend && styles.sendDisabled]}
        >
          <ArrowRight size={18} color={t.colors.bgBase} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ContextPopover
        anchor={popover.anchor}
        selectedId={contextId}
        onSelect={setContextId}
        onClose={closeContextPopover}
      />
      <WhenSheet
        open={whenOpen}
        value={{
          dueAt: when.dueAt,
          durationMin: when.durationMin,
          remindAt: when.remindAt,
          recurrenceRule: when.recurrence?.rule ?? null,
        }}
        onClose={closeWhen}
        onSave={(patch) => {
          setWhen(patch);
          closeWhen();
        }}
      />
    </BottomSheet>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    hint: { alignItems: 'center', gap: 3, paddingBottom: 4 },
    hintText: { fontSize: 10.5, fontWeight: '600', color: t.colors.textMuted, letterSpacing: 0.2 },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: t.colors.textPrimary,
      paddingVertical: 6,
      paddingHorizontal: 2,
      borderBottomWidth: 1.5,
      borderColor: t.colors.accentPrimary,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    note: {
      fontSize: 14,
      lineHeight: 21,
      color: t.colors.textSecondary,
      minHeight: 44,
      paddingHorizontal: 2,
    },
    foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    more: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 },
    moreText: { fontSize: 12.5, fontWeight: '600', color: t.colors.textControl },
    send: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: t.colors.accentPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.4 },
  });

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { ChevronRight, MessageSquare, Trash2, X } from 'lucide-react-native';
import type {
  Comment,
  Context,
  RecurrenceInput,
  Task,
  UpdateTaskInput,
} from '@task-manager/shared';
import {
  colors,
  monoFont,
  nextInstanceLabel,
  radius,
  shortDateTime,
  webInputReset,
  WIDE_BREAKPOINT,
} from '../../theme';
import { api } from '../../lib/api';
import { useTasksStore } from '../../store/tasks';
import { DateFieldsSection, FieldLabel } from './date-fields-section';

interface Props {
  task: Task;
  contexts: Context[];
  onClose: () => void;
  onPatch: (id: string, patch: UpdateTaskInput) => void;
  onDelete: (id: string) => void;
  autoFocusTitle?: boolean; // focus the title on open (e.g. just-created task)
}

const isIOS = process.env.EXPO_OS === 'ios';
const isWeb = process.env.EXPO_OS === 'web';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type InputComponent = ComponentType<TextInputProps>;

// BottomSheetTextInput coordinates the keyboard with the sheet on native, but on
// web it calls TextInput.State.currentlyFocusedInput (missing in react-native-web)
// and crashes — so use a plain TextInput inside the sheet on web.
const SheetInput: InputComponent = isWeb ? TextInput : BottomSheetTextInput;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// Weekly multi-select: Monday-first display order + single-letter labels.
const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABEL: Record<string, string> = {
  mon: 'M',
  tue: 'T',
  wed: 'W',
  thu: 'T',
  fri: 'F',
  sat: 'S',
  sun: 'S',
};
// Selected weekdays parsed from a 'weekly:mon,wed' rule.
function weeklyDays(rule: string | null): string[] {
  if (!rule?.startsWith('weekly:')) return [];
  return rule
    .slice(7)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}
type RecKind = 'none' | 'daily' | 'weekly' | 'monthly';
const REC_OPTIONS: { k: RecKind; label: string }[] = [
  { k: 'none', label: 'No repeat' },
  { k: 'daily', label: 'Daily' },
  { k: 'weekly', label: 'Weekly' },
  { k: 'monthly', label: 'Monthly' },
];

function recKind(rule: string | null): RecKind {
  if (!rule) return 'none';
  if (rule === 'daily') return 'daily';
  if (rule.startsWith('weekly')) return 'weekly';
  if (rule.startsWith('monthly')) return 'monthly';
  return 'none';
}
function recInput(kind: RecKind, base: Date, hasDue: boolean): RecurrenceInput | null {
  switch (kind) {
    case 'daily':
      return { rule: 'daily' };
    // With a deadline, recur on its weekday/day-of-month. Without one, default to
    // the period start — Monday / the 1st — so dateless instances land there (CR02 §1).
    case 'weekly':
      return { rule: `weekly:${hasDue ? WEEKDAYS[base.getDay()] : 'mon'}` };
    case 'monthly':
      return { rule: `monthly:${hasDue ? base.getDate() : 1}` };
    default:
      return null;
  }
}

function Pill({
  active,
  color,
  label,
  onPress,
}: {
  active: boolean;
  color?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? (color ?? colors.bgElevated) : colors.bgCard,
          borderColor: active ? (color ?? colors.borderStrong) : colors.borderSubtle,
        },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: active ? (color ? colors.bgBase : colors.textPrimary) : colors.textSecondary,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// The scrollable field content, shared by the web modal and the mobile sheet.
// `Input` is the TextInput to use (plain on web; BottomSheetTextInput in the
// sheet, so the keyboard coordinates with the sheet). Grouped Date & time /
// Organization per the design.
function DetailContent({
  task,
  contexts,
  onClose,
  onPatch,
  onDelete,
  autoFocusTitle,
  wide,
  Input,
}: Props & { wide: boolean; Input: InputComponent }) {
  const adjustCommentCount = useTasksStore((s) => s.adjustCommentCount);
  const [title, setTitle] = useState(task.title);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => setTitle(task.title), [task.id, task.title]);

  useEffect(() => {
    let alive = true;
    api
      .listComments(task.id)
      .then((c) => {
        if (alive) setComments(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [task.id]);

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== task.title) onPatch(task.id, { title: next });
  };

  const base = task.dueAt ? new Date(task.dueAt) : new Date();
  const activeKind = recKind(task.recurrenceRule);
  const selectedWeekdays = weeklyDays(task.recurrenceRule);
  const toggleWeekday = (d: string) => {
    const set = new Set(selectedWeekdays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    if (set.size === 0) return; // keep at least one day
    onPatch(task.id, {
      recurrence: { rule: `weekly:${WEEK_ORDER.filter((x) => set.has(x)).join(',')}` },
    });
  };

  const addComment = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    Keyboard.dismiss(); // dismiss on submit
    try {
      const c = await api.addComment(task.id, body);
      setComments((prev) => [...prev, c]);
      adjustCommentCount(task.id, 1);
    } catch {
      /* ignore */
    }
  };

  const removeComment = async (id: string) => {
    const prev = comments;
    setComments(prev.filter((c) => c.id !== id));
    adjustCommentCount(task.id, -1);
    try {
      await api.deleteComment(id);
    } catch {
      setComments(prev);
      adjustCommentCount(task.id, 1);
    }
  };

  return (
    <>
      {wide ? (
        <View style={styles.titleRow}>
          <Input
            value={title}
            onChangeText={setTitle}
            onEndEditing={commitTitle}
            onBlur={commitTitle}
            autoFocus={autoFocusTitle}
            selectTextOnFocus={autoFocusTitle}
            multiline
            scrollEnabled={false}
            style={[styles.wideTitleInput, webInputReset]}
          />
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <X size={15} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <Input
          value={title}
          onChangeText={setTitle}
          onEndEditing={commitTitle}
          onBlur={commitTitle}
          autoFocus={autoFocusTitle}
          multiline
          scrollEnabled={false}
          style={[styles.narrowTitleInput, webInputReset]}
        />
      )}

      <View>
        <DateFieldsSection
          dueAt={task.dueAt}
          remindAt={task.remindAt}
          durationMin={task.durationMin}
          onChangeDue={(iso) => onPatch(task.id, { dueAt: iso })}
          onChangeRemind={(iso) => onPatch(task.id, { remindAt: iso })}
          onChangeDuration={(min) => onPatch(task.id, { durationMin: min })}
        />
      </View>

      <View>
        <View style={styles.orgGroup}>
          <View>
            <FieldLabel>Context</FieldLabel>
            <View style={styles.rowWrap}>
              {contexts.map((c) => {
                const active = task.contextId === c.id;
                return (
                  <Pill
                    key={c.id}
                    active={active}
                    color={active ? c.color : undefined}
                    label={c.label}
                    onPress={() => onPatch(task.id, { contextId: active ? null : c.id })}
                  />
                );
              })}
            </View>
          </View>

          <View>
            <FieldLabel>Repeat</FieldLabel>
            <View style={styles.rowWrap}>
              {REC_OPTIONS.map((o) => (
                <Pill
                  key={o.k}
                  active={activeKind === o.k}
                  label={o.label}
                  onPress={() =>
                    onPatch(task.id, { recurrence: recInput(o.k, base, !!task.dueAt) })
                  }
                />
              ))}
            </View>
            {activeKind === 'weekly' ? (
              <View style={styles.weekRow}>
                {WEEK_ORDER.map((d) => {
                  const on = selectedWeekdays.includes(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => toggleWeekday(d)}
                      style={[
                        styles.weekday,
                        {
                          backgroundColor: on ? colors.accentPrimary : colors.bgCard,
                          borderColor: on ? colors.accentPrimary : colors.borderSubtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.weekdayText,
                          {
                            color: on ? colors.bgBase : colors.textSecondary,
                          },
                        ]}
                      >
                        {DAY_LABEL[d]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {task.recurrenceId && task.nextInstance ? (
              <Text style={styles.nextInstance}>
                Next instance: {nextInstanceLabel(task.nextInstance)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View>
        <FieldLabel>Comments</FieldLabel>
        {comments.map((c) => (
          <View key={c.id} style={styles.comment}>
            <View style={styles.titleRow}>
              <Text selectable style={styles.commentBody}>
                {c.body}
              </Text>
              <Pressable
                onPress={() => removeComment(c.id)}
                hitSlop={8}
                style={styles.commentRemove}
              >
                <X size={12} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.commentTime}>{shortDateTime(c.createdAt)}</Text>
          </View>
        ))}
        <View style={styles.commentRow}>
          <View style={styles.commentInputWrap}>
            <MessageSquare size={13} color={colors.textMuted} />
            <Input
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addComment}
              placeholder="Add a comment…"
              placeholderTextColor={colors.textMuted}
              style={[styles.commentInput, webInputReset]}
            />
          </View>
          <Pressable onPress={addComment} style={styles.sendBtn}>
            <ChevronRight size={15} color={colors.bgSurface} />
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => {
          onDelete(task.id);
          onClose();
        }}
        style={styles.deleteBtn}
      >
        <Trash2 size={14} color={colors.accentNow} />
        <Text style={styles.deleteText}>Delete task</Text>
      </Pressable>
    </>
  );
}

// ---- Web / wide: centered popup (RN Modal), unchanged behavior ----
function WebModalDetail(props: Props) {
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.flex1}>
        <Pressable onPress={props.onClose} style={styles.backdrop}>
          <AnimatedPressable onPress={(e) => e.stopPropagation?.()} style={styles.modalCard}>
            <ScrollView
              contentContainerStyle={styles.webScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <DetailContent {...props} wide Input={TextInput} />
            </ScrollView>
          </AnimatedPressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---- Mobile: real draggable @gorhom bottom sheet (snap 60/92, swipe-dismiss) ----
function MobileSheetDetail(props: Props) {
  const ref = useRef<BottomSheetModal>(null);

  // Present on mount; dismissing (pan-down / backdrop / X) calls onClose.
  useEffect(() => {
    ref.current?.present();
  }, []);

  const close = useCallback(() => ref.current?.dismiss(), []);
  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      onDismiss={props.onClose}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      {/* Dynamic sizing: the sheet grows to fit the content (capped at the
          screen). BottomSheetScrollView still scrolls if it overflows. */}
      <BottomSheetScrollView
        contentContainerStyle={styles.sheetScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <DetailContent {...props} onClose={close} wide={false} Input={SheetInput} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// Bottom sheet on mobile, centered popup on web/wide — per the design bundles.
export function TaskDetail(props: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  return wide ? <WebModalDetail {...props} /> : <MobileSheetDetail {...props} />;
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  wideTitleInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    marginLeft: 8,
  },
  narrowTitleInput: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  orgGroup: { gap: 18 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  weekday: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  nextInstance: { marginTop: 8, fontSize: 11, color: colors.textMuted },
  comment: {
    borderRadius: radius.card,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: colors.bgCard,
  },
  commentBody: { flex: 1, fontSize: 13, lineHeight: 18, color: '#B8BFCC' },
  commentRemove: { marginLeft: 8 },
  commentTime: { fontFamily: monoFont, fontSize: 10, marginTop: 4, color: colors.textMuted },
  commentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  commentInput: { flex: 1, fontSize: 13, color: colors.textPrimary },
  sendBtn: {
    padding: 10,
    borderRadius: radius.card,
    backgroundColor: colors.accentPrimary,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    paddingVertical: 11,
    backgroundColor: 'rgba(217,102,139,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217,102,139,0.25)',
  },
  deleteText: { fontSize: 13, fontWeight: '500', color: colors.accentNow },
  flex1: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,6,10,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: 560,
    maxWidth: '92%',
    maxHeight: '85%',
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCardWeb,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  webScrollContent: { padding: 20, paddingBottom: 28, gap: 16 },
  handleIndicator: { backgroundColor: colors.borderStrong },
  sheetBackground: { backgroundColor: colors.bgCardWeb },
  sheetScrollContent: { padding: 20, paddingBottom: 40, gap: 16 },
});

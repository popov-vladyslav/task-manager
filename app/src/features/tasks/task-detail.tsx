import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { ChevronRight, MessageSquare, Trash2, X } from 'lucide-react-native';
import type { Comment, Context, RecurrenceInput, Task, UpdateTaskInput } from '@task-manager/shared';
import { colors, monoFont, nextInstanceLabel, radius, shortDateTime, webInputReset } from '../../theme';
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

const WIDE_BREAKPOINT = 768;
const isIOS = process.env.EXPO_OS === 'ios';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
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
function recInput(kind: RecKind, base: Date): RecurrenceInput | null {
  switch (kind) {
    case 'daily':
      return { rule: 'daily' };
    case 'weekly':
      return { rule: `weekly:${WEEKDAYS[base.getDay()]}` };
    case 'monthly':
      return { rule: `monthly:${base.getDate()}` };
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
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: active ? (color ?? colors.bgElevated) : colors.bgCard,
        borderWidth: 1,
        borderColor: active ? (color ?? colors.borderStrong) : colors.borderSubtle,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '500',
          color: active ? (color ? colors.bgBase : colors.textPrimary) : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DetailBody({ task, contexts, onClose, onPatch, onDelete, autoFocusTitle, wide }: Props & { wide: boolean }) {
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

  const addComment = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
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
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 28, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
        {wide ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onEndEditing={commitTitle}
              onBlur={commitTitle}
              autoFocus={autoFocusTitle}
              multiline
              scrollEnabled={false}
              style={{ flex: 1, fontSize: 18, fontWeight: '600', color: colors.textPrimary, ...webInputReset }}
            />
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6, borderRadius: 8, backgroundColor: colors.bgElevated, marginLeft: 8 }}>
              <X size={15} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <TextInput
            value={title}
            onChangeText={setTitle}
            onEndEditing={commitTitle}
            onBlur={commitTitle}
            autoFocus={autoFocusTitle}
            multiline
            scrollEnabled={false}
            style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, ...webInputReset }}
          />
        )}

        <View>
          <FieldLabel>Context</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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

        <DateFieldsSection
          dueAt={task.dueAt}
          remindAt={task.remindAt}
          durationMin={task.durationMin}
          onChangeDue={(iso) => onPatch(task.id, { dueAt: iso })}
          onChangeRemind={(iso) => onPatch(task.id, { remindAt: iso })}
          onChangeDuration={(min) => onPatch(task.id, { durationMin: min })}
        />

        <View>
          <FieldLabel>Repeat</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REC_OPTIONS.map((o) => (
              <Pill
                key={o.k}
                active={activeKind === o.k}
                label={o.label}
                onPress={() => onPatch(task.id, { recurrence: recInput(o.k, base) })}
              />
            ))}
          </View>
          {task.recurrenceId && task.nextInstance ? (
            <Text style={{ marginTop: 8, fontSize: 11, color: colors.textMuted, flexDirection: 'row' }}>
              Next instance: {nextInstanceLabel(task.nextInstance)}
            </Text>
          ) : null}
        </View>

        <View>
          <FieldLabel>Comments</FieldLabel>
          {comments.map((c) => (
            <View
              key={c.id}
              style={{ borderRadius: radius.card, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, backgroundColor: colors.bgCard }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text selectable style={{ flex: 1, fontSize: 13, lineHeight: 18, color: '#B8BFCC' }}>
                  {c.body}
                </Text>
                <Pressable onPress={() => removeComment(c.id)} hitSlop={8} style={{ marginLeft: 8 }}>
                  <X size={12} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={{ fontFamily: monoFont, fontSize: 10, marginTop: 4, color: colors.textMuted }}>
                {shortDateTime(c.createdAt)}
              </Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
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
              }}
            >
              <MessageSquare size={13} color={colors.textMuted} />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={addComment}
                placeholder="Add a comment…"
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, fontSize: 13, color: colors.textPrimary, ...webInputReset }}
              />
            </View>
            <Pressable onPress={addComment} style={{ padding: 10, borderRadius: radius.card, backgroundColor: colors.accentPrimary }}>
              <ChevronRight size={15} color={colors.bgSurface} />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => {
            onDelete(task.id);
            onClose();
          }}
          style={{
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
          }}
        >
          <Trash2 size={14} color={colors.accentNow} />
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.accentNow }}>Delete task</Text>
        </Pressable>
      </ScrollView>
  );
}

// Bottom sheet on mobile, centered popup on web/wide — per the design bundles.
export function TaskDetail(props: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  // `fade` fades the dim backdrop in/out; the sheet additionally slides up via
  // Reanimated (so it's a bottom-sheet, but the backdrop no longer slides).
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={props.onClose}>
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={{ flex: 1 }}>
      <Pressable
        onPress={props.onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(5,6,10,0.6)',
          justifyContent: wide ? 'center' : 'flex-end',
          alignItems: wide ? 'center' : 'stretch',
        }}
      >
        <AnimatedPressable
          entering={wide ? undefined : SlideInDown.duration(280)}
          onPress={(e) => e.stopPropagation?.()}
          style={
            wide
              ? {
                  width: 560,
                  maxWidth: '92%',
                  maxHeight: '85%',
                  borderRadius: 20,
                  borderCurve: 'continuous',
                  backgroundColor: colors.bgCardWeb,
                  borderWidth: 1,
                  borderColor: colors.borderSubtle,
                }
              : {
                  maxHeight: '90%',
                  borderTopLeftRadius: radius.sheet,
                  borderTopRightRadius: radius.sheet,
                  borderCurve: 'continuous',
                  backgroundColor: colors.bgCardWeb,
                }
          }
        >
          {!wide ? (
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
            </View>
          ) : null}
          <DetailBody {...props} wide={wide} />
        </AnimatedPressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

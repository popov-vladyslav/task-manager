import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Bell, Clock, Repeat, Trash2, X } from 'lucide-react-native';
import type { Context, Task, UpdateTaskInput } from '@task-manager/shared';
import { colors, monoFont, nextInstanceLabel, radius, shortDate, shortTime } from '../../theme';

interface Props {
  task: Task;
  contexts: Context[];
  onClose: () => void;
  onPatch: (id: string, patch: UpdateTaskInput) => void;
  onDelete: (id: string) => void;
}

const WIDE_BREAKPOINT = 768;

function Label({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: monoFont,
        fontSize: 10.5,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: colors.textMuted,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

function ReadonlyField({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
      }}
    >
      {icon}
      <Text style={{ fontSize: 13, color: value === '—' ? colors.textMuted : colors.textPrimary }}>{value}</Text>
    </View>
  );
}

function DetailBody({ task, contexts, onClose, onPatch, onDelete, wide }: Props & { wide: boolean }) {
  const [title, setTitle] = useState(task.title);
  useEffect(() => setTitle(task.title), [task.id, task.title]);

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== task.title) onPatch(task.id, { title: next });
  };

  const due = shortDate(task.dueAt) ?? '—';
  const remind = shortTime(task.remindAt) ?? '—';
  const recurrence = task.recurrenceId
    ? `Repeats · next ${nextInstanceLabel(task.nextInstance) ?? '—'}`
    : 'No repeat';

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28, gap: 16 }}>
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onEndEditing={commitTitle}
            onBlur={commitTitle}
            style={{ flex: 1, fontSize: 18, fontWeight: '600', color: colors.textPrimary }}
          />
          <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6, borderRadius: 8, backgroundColor: colors.bgElevated }}>
            <X size={15} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <TextInput
          value={title}
          onChangeText={setTitle}
          onEndEditing={commitTitle}
          onBlur={commitTitle}
          style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary }}
        />
      )}

      <View>
        <Label>Context</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {contexts.map((c) => {
            const active = task.contextId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => onPatch(task.id, { contextId: active ? null : c.id })}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: active ? c.color : colors.bgCard,
                  borderWidth: 1,
                  borderColor: active ? c.color : colors.borderSubtle,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: active ? colors.bgBase : colors.textSecondary }}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Label>Deadline</Label>
          <ReadonlyField icon={<Clock size={13} color={colors.textSecondary} />} value={due} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Reminder</Label>
          <ReadonlyField
            icon={<Bell size={13} color={task.remindAt ? colors.accentReminder : colors.textSecondary} />}
            value={remind}
          />
        </View>
      </View>

      <View>
        <Label>Repeat</Label>
        <ReadonlyField icon={<Repeat size={13} color={colors.textSecondary} />} value={recurrence} />
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

  return (
    <Modal transparent visible animationType={wide ? 'fade' : 'slide'} onRequestClose={props.onClose}>
      <Pressable
        onPress={props.onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(5,6,10,0.6)',
          justifyContent: wide ? 'center' : 'flex-end',
          alignItems: wide ? 'center' : 'stretch',
        }}
      >
        <Pressable
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
                  maxHeight: '88%',
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

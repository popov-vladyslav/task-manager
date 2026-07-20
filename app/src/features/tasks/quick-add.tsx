import { useRef } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { create } from 'zustand';
import { Bell, CalendarClock, Hourglass, Plus, Tag, X } from 'lucide-react-native';
import type { Context } from '@task-manager/shared';
import { colors, radius, shortDateTime, webInputReset } from '../../theme';
import { DurationField } from './duration-field';

const isWeb = process.env.EXPO_OS === 'web';
const isAndroid = process.env.EXPO_OS === 'android';
const PANEL_HEIGHT = 300;
// The Tasks screen ends at the top of the bottom tab bar, so the sticky accessory
// lands one tab-bar-height above the keyboard — push it back down by that much.
const TAB_BAR_CONTENT = 52;

type Panel = 'deadline' | 'reminder' | 'duration' | 'context' | null;

export interface QuickAddDraft {
  title: string;
  dueAt: string | null;
  remindAt: string | null;
  durationMin: number | null;
  contextId: number | null;
  panel: Panel;
  focused: boolean;
}

interface QuickAddStore extends QuickAddDraft {
  patch: (p: Partial<QuickAddDraft>) => void;
  reset: (contextId: number | null) => void;
}

// Shared draft so the top input and the bottom accessory/panel stay in sync.
export const useQuickAdd = create<QuickAddStore>((set) => ({
  title: '',
  dueAt: null,
  remindAt: null,
  durationMin: null,
  contextId: null,
  panel: null,
  focused: false,
  patch: (p) => set(p),
  reset: (contextId) =>
    set({ title: '', dueAt: null, remindAt: null, durationMin: null, contextId, panel: null }),
}));

// Shared ref so the bottom bar can refocus the top input after a panel closes.
const inputRef: { current: TextInput | null } = { current: null };

type CreateInput = {
  title: string;
  contextId?: number | null;
  dueAt?: string | null;
  remindAt?: string | null;
  durationMin?: number | null;
};

// ---- Top input (in the list header). Web = plain input; native pairs with the bar. ----
export function QuickAddInput({
  activeContextId,
  onCreate,
}: {
  activeContextId: number | null;
  onCreate: (input: CreateInput) => Promise<void>;
}) {
  const { title, dueAt, remindAt, durationMin, patch, reset } = useQuickAdd();
  const ref = useRef<TextInput>(null);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    const { contextId } = useQuickAdd.getState();
    await onCreate({
      title: t,
      contextId: contextId ?? activeContextId ?? undefined,
      dueAt,
      remindAt,
      durationMin: dueAt ? (durationMin ?? 30) : undefined,
    });
    reset(activeContextId);
    if (!isWeb) ref.current?.focus(); // keep adding on mobile
  };

  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
      {/* Sized to match a single-line task card exactly: a card is padding(12*2)
          + its tallest child (the 26px Play button) = 50. Fixing the height also
          caps the native single-line TextInput, which otherwise bloats the box. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: radius.card,
          borderCurve: 'continuous',
          paddingHorizontal: 12,
          height: 50,
          backgroundColor: colors.bgCard,
        }}
      >
        <Plus size={20} color={colors.accentPrimary} />
        <TextInput
          ref={(r) => {
            ref.current = r;
            inputRef.current = r;
          }}
          value={title}
          onChangeText={(t) => patch({ title: t })}
          onFocus={() => patch({ focused: true, contextId: useQuickAdd.getState().contextId ?? activeContextId })}
          onBlur={() => patch({ focused: false })}
          onSubmitEditing={submit}
          submitBehavior="submit"
          placeholder="Add task…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          style={{ flex: 1, fontSize: 14, lineHeight: 19, color: colors.textPrimary, padding: 0, ...webInputReset }}
        />
        {title.trim() ? (
          <Pressable onPress={submit} hitSlop={8} style={{ paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accentPrimary }}>Add</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ---- Bottom bar: keyboard-accessory shortcuts + swap-in picker panel (native only) ----
export function QuickAddBar({ contexts }: { contexts: Context[] }) {
  const { focused, panel, dueAt, remindAt, durationMin, contextId, patch } = useQuickAdd();
  const insets = useSafeAreaInsets();

  const openPanel = (p: Panel) => {
    Keyboard.dismiss();
    patch({ panel: p });
  };
  const closePanel = () => {
    patch({ panel: null });
    inputRef.current?.focus();
  };

  const shortcuts: { key: Panel; icon: typeof Bell; on: boolean }[] = [
    { key: 'deadline', icon: CalendarClock, on: !!dueAt },
    { key: 'reminder', icon: Bell, on: !!remindAt },
    { key: 'duration', icon: Hourglass, on: dueAt != null && durationMin != null },
    { key: 'context', icon: Tag, on: contextId != null },
  ];

  return (
    <>
      {focused && !panel ? (
        <KeyboardStickyView offset={{ opened: TAB_BAR_CONTENT + insets.bottom }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 24,
              paddingVertical: 8,
              backgroundColor: colors.bgSurface,
              borderTopWidth: 1,
              borderTopColor: colors.bgCard,
            }}
          >
            {shortcuts.map(({ key, icon: Icon, on }) => (
              <Pressable
                key={key}
                onPress={() => openPanel(key)}
                hitSlop={6}
                style={{
                  width: 44,
                  height: 34,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? colors.bgElevated : 'transparent',
                }}
              >
                <Icon size={18} color={on ? colors.accentPrimary : colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </KeyboardStickyView>
      ) : null}

      {panel ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: PANEL_HEIGHT,
            backgroundColor: colors.bgSurface,
            borderTopWidth: 1,
            borderTopColor: colors.bgCard,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.bgCard,
            }}
          >
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
              {PANEL_TITLE[panel]}
            </Text>
            <Pressable onPress={closePanel} hitSlop={8} style={{ padding: 4 }}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={{ flex: 1, padding: 16 }}>
            <PanelBody panel={panel} dueAt={dueAt} remindAt={remindAt} durationMin={durationMin} contextId={contextId} contexts={contexts} patch={patch} />
          </View>
        </View>
      ) : null}
    </>
  );
}

const PANEL_TITLE: Record<Exclude<Panel, null>, string> = {
  deadline: 'Deadline',
  reminder: 'Reminder',
  duration: 'Duration',
  context: 'Context',
};

function atNoon(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function PanelBody({
  panel,
  dueAt,
  remindAt,
  durationMin,
  contextId,
  contexts,
  patch,
}: {
  panel: Exclude<Panel, null>;
  dueAt: string | null;
  remindAt: string | null;
  durationMin: number | null;
  contextId: number | null;
  contexts: Context[];
  patch: (p: Partial<QuickAddDraft>) => void;
}) {
  if (panel === 'duration') {
    return <DurationField value={durationMin} onChange={(m) => patch({ durationMin: m })} />;
  }

  if (panel === 'context') {
    return (
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {contexts.map((c) => {
          const on = contextId === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => patch({ contextId: on ? null : c.id })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: on ? c.color : colors.bgCard,
                borderWidth: 1,
                borderColor: on ? c.color : colors.borderSubtle,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? colors.bgBase : c.color }} />
              <Text style={{ fontSize: 13, fontWeight: '500', color: on ? colors.bgBase : colors.textSecondary }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  // deadline | reminder → quick chips + a date+time picker
  const value = panel === 'deadline' ? dueAt : remindAt;
  const setValue = (iso: string | null) =>
    patch(panel === 'deadline' ? { dueAt: iso, durationMin: iso ? (durationMin ?? 30) : durationMin } : { remindAt: iso });

  const onPickerChange = (_e: DateTimePickerChangeEvent, d: Date) => {
    setValue(d.toISOString());
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[
          { label: 'Today', v: atNoon(0) },
          { label: 'Tomorrow', v: atNoon(1) },
          { label: '+7 days', v: atNoon(7) },
          ...(value ? [{ label: 'Clear', v: null as string | null }] : []),
        ].map((chip) => (
          <Pressable
            key={chip.label}
            onPress={() => setValue(chip.v)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: colors.bgCard,
              borderWidth: 1,
              borderColor: colors.borderSubtle,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '500', color: colors.textSecondary }}>{chip.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>
        {value ? shortDateTime(value) : 'No date set'}
      </Text>
      {Platform.OS !== 'web' ? (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode={isAndroid ? 'date' : 'datetime'}
          display="spinner"
          themeVariant="dark"
          style={{ alignSelf: 'stretch' }}
          onValueChange={onPickerChange}
        />
      ) : null}
    </View>
  );
}

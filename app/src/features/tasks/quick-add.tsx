import { useEffect } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { create } from 'zustand';
import { Bell, CalendarClock, Hourglass, Plus, Tag, X } from 'lucide-react-native';
import type { Context } from '@task-manager/shared';
import { colors, radius, shortDateTime, webInputReset } from '../../theme';
import { haptics } from '../../lib/haptics';
import { DurationField } from './duration-field';

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

  // Keep the draft's context aligned with the active view. Switching context
  // chips clears any stale per-task override (a picked context no longer leaks
  // into the next view); within one view an explicit panel pick is preserved.
  useEffect(() => {
    useQuickAdd.getState().patch({ contextId: activeContextId });
  }, [activeContextId]);

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
    haptics.select();
    reset(activeContextId);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.inputContainer}>
      {/* Sized to match a single-line task card exactly: a card is padding(12*2)
          + its tallest child (the 26px Play button) = 50. Fixing the height also
          caps the native single-line TextInput, which otherwise bloats the box. */}
      <View style={styles.inputRow}>
        <Plus size={20} color={colors.accentPrimary} />
        <TextInput
          ref={(r) => {
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
          style={[styles.input, webInputReset]}
        />
        {title.trim() ? (
          <Pressable onPress={submit} hitSlop={8} style={styles.addBtn}>
            <Text style={styles.addText}>Add</Text>
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
          <View style={styles.bar}>
            {shortcuts.map(({ key, icon: Icon, on }) => {
              const bg = on ? colors.bgElevated : 'transparent';
              return (
                <Pressable
                  key={key}
                  onPress={() => openPanel(key)}
                  hitSlop={6}
                  style={[styles.shortcut, { backgroundColor: bg }]}
                >
                  <Icon size={18} color={on ? colors.accentPrimary : colors.textSecondary} />
                </Pressable>
              );
            })}
          </View>
        </KeyboardStickyView>
      ) : null}

      {panel ? (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>
              {PANEL_TITLE[panel]}
            </Text>
            <Pressable onPress={closePanel} hitSlop={8} style={styles.panelClose}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.panelBody}>
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
      <ScrollView contentContainerStyle={styles.wrapRow}>
        {contexts.map((c) => {
          const on = contextId === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => patch({ contextId: on ? null : c.id })}
              style={[styles.contextChip, { backgroundColor: on ? c.color : colors.bgCard, borderColor: on ? c.color : colors.borderSubtle }]}
            >
              <View style={[styles.contextDot, { backgroundColor: on ? colors.bgBase : c.color }]} />
              <Text style={[styles.contextChipText, { color: on ? colors.bgBase : colors.textSecondary }]}>
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
    const m = new Date(d);
    m.setSeconds(0, 0); // minute precision — no stray seconds from new Date()
    setValue(m.toISOString());
  };

  return (
    <View style={styles.dateBody}>
      <View style={styles.wrapRow}>
        {[
          { label: 'Today', v: atNoon(0) },
          { label: 'Tomorrow', v: atNoon(1) },
          { label: '+7 days', v: atNoon(7) },
          ...(value ? [{ label: 'Clear', v: null as string | null }] : []),
        ]
          .filter((chip) => panel !== 'reminder' || chip.v == null || new Date(chip.v).getTime() > Date.now())
          .map((chip) => (
          <Pressable
            key={chip.label}
            onPress={() => setValue(chip.v)}
            style={styles.dateChip}
          >
            <Text style={styles.dateChipText}>{chip.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.dateValue}>
        {value ? shortDateTime(value) : 'No date set'}
      </Text>
      {Platform.OS !== 'web' ? (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          minimumDate={panel === 'reminder' ? new Date() : undefined}
          mode={isAndroid ? 'date' : 'datetime'}
          display="spinner"
          themeVariant="dark"
          style={styles.picker}
          onValueChange={onPickerChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: { paddingHorizontal: 20, paddingBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    height: 50,
    backgroundColor: colors.bgCard,
  },
  input: { flex: 1, fontSize: 14, lineHeight: 19, color: colors.textPrimary, padding: 0 },
  addBtn: { paddingHorizontal: 4 },
  addText: { fontSize: 13, fontWeight: '600', color: colors.accentPrimary },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.bgCard,
  },
  shortcut: {
    width: 44,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: PANEL_HEIGHT,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.bgCard,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.bgCard,
  },
  panelTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  panelClose: { padding: 4 },
  panelBody: { flex: 1, padding: 16 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  contextDot: { width: 8, height: 8, borderRadius: 4 },
  contextChipText: { fontSize: 13, fontWeight: '500' },
  dateBody: { gap: 12 },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  dateChipText: { fontSize: 12.5, fontWeight: '500', color: colors.textSecondary },
  dateValue: { fontSize: 12, color: colors.textMuted },
  picker: { alignSelf: 'stretch' },
});

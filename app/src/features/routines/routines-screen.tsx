import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronRight, Plus, Trash2, X } from 'lucide-react-native';
import type { Routine } from '@task-manager/shared';
import { colors, headerDate, monoFont, webInputReset } from '../../theme';
import { useRoutinesStore } from '../../store/routines';
import { useAuthStore } from '../../store/auth';
import { SideNavLinks } from '../nav/nav-chrome';

const WIDE_BREAKPOINT = 768;

export function RoutinesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const { routines, loading, load, toggle, add, remove } = useRoutinesStore();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const done = useMemo(() => routines.filter((r) => r.done).length, [routines]);

  const submitAdd = async () => {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    setDraft('');
    setAdding(false);
    await add(title);
  };

  const progress =
    routines.length > 0 ? (
      <View style={{ gap: 6, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1, color: colors.textMuted }}>
            {done} OF {routines.length} DONE
          </Text>
        </View>
        <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.bgElevated, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${(done / routines.length) * 100}%`,
              borderRadius: 999,
              backgroundColor: colors.accentTimer,
            }}
          />
        </View>
      </View>
    ) : null;

  const list =
    loading && routines.length === 0 ? (
      <ActivityIndicator color={colors.accentPrimary} style={{ marginTop: 40 }} />
    ) : routines.length === 0 ? (
      <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>No routines yet</Text>
    ) : (
      <ScrollView showsVerticalScrollIndicator={false}>
        {routines.map((r) => (
          <RoutineRow
            key={r.id}
            routine={r}
            confirming={confirmingId === r.id}
            onToggle={() => toggle(r)}
            onLongPress={() => setConfirmingId(r.id)}
            onCancelConfirm={() => setConfirmingId(null)}
            onDelete={() => {
              setConfirmingId(null);
              remove(r.id);
            }}
          />
        ))}
      </ScrollView>
    );

  // The inline add input — a roomy field on one line with the submit / cancel buttons.
  const addInput = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 12,
        borderCurve: 'continuous',
        paddingLeft: 14,
        paddingRight: 6,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: inputFocused ? colors.accentPrimary : colors.borderStrong,
      }}
    >
      <TextInput
        autoFocus
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submitAdd}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        placeholder="New routine…"
        placeholderTextColor={colors.textMuted}
        style={{ flex: 1, paddingVertical: 14, fontSize: 16, color: colors.textPrimary, ...webInputReset }}
      />
      <Pressable onPress={submitAdd} style={{ padding: 10, borderRadius: 8, backgroundColor: colors.accentPrimary }}>
        <ChevronRight size={16} color={colors.bgSurface} />
      </Pressable>
      <Pressable
        onPress={() => {
          setAdding(false);
          setDraft('');
        }}
        style={{ padding: 10, borderRadius: 8, backgroundColor: colors.bgElevated }}
      >
        <X size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );

  const bigAddButton = (
    <Pressable
      onPress={() => setAdding(true)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        borderCurve: 'continuous',
        paddingVertical: 13,
        backgroundColor: colors.accentPrimary,
      }}
    >
      <Plus size={16} color={colors.bgSurface} />
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.bgSurface }}>Add routine</Text>
    </Pressable>
  );

  // ---- WEB / WIDE: sidebar + main ----
  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bgBase }}>
        <View
          style={{
            width: 240,
            paddingTop: insets.top + 16,
            paddingHorizontal: 16,
            paddingBottom: 16,
            backgroundColor: '#10141B',
            borderRightWidth: 1,
            borderRightColor: colors.bgCard,
          }}
        >
          <View style={{ paddingHorizontal: 8, paddingBottom: 20 }}>
            <Text style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: 2, color: colors.textMuted }}>LOG</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
              {headerDate().replace('LOG — ', '')}
            </Text>
          </View>

          <SideNavLinks />

          <View style={{ flex: 1 }} />
          <Pressable onPress={() => useAuthStore.getState().signOut()} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Sign out</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, paddingTop: insets.top + 24, paddingHorizontal: 24 }}>
          {/* When adding, the input takes over the header line; otherwise title + add button.
              Fixed min-height so switching between the two states doesn't shift the list. */}
          <View style={{ marginBottom: 16, minHeight: 50, justifyContent: 'center' }}>
            {adding ? (
              addInput
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: colors.textPrimary }}>Daily routine</Text>
                <Pressable
                  onPress={() => setAdding(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.accentPrimary }}
                >
                  <Plus size={14} color={colors.bgSurface} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.bgSurface }}>Routine</Text>
                </Pressable>
              </View>
            )}
          </View>
          {progress}
          <View style={{ flex: 1 }}>{list}</View>
        </View>
      </View>
    );
  }

  // ---- MOBILE / NARROW: header + progress + list + add + tabs ----
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSurface, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1.5, color: colors.textMuted }}>{headerDate()}</Text>
        <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: colors.textPrimary }}>Daily routine</Text>
      </View>

      <View style={{ paddingHorizontal: 20 }}>{progress}</View>

      <View style={{ flex: 1, paddingHorizontal: 20 }}>{list}</View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>{adding ? addInput : bigAddButton}</View>
    </View>
  );
}

function RoutineRow({
  routine,
  confirming,
  onToggle,
  onLongPress,
  onCancelConfirm,
  onDelete,
}: {
  routine: Routine;
  confirming: boolean;
  onToggle: () => void;
  onLongPress: () => void;
  onCancelConfirm: () => void;
  onDelete: () => void;
}) {
  const { done, title, timeHint } = routine;
  return (
    <Pressable
      onPress={confirming ? onCancelConfirm : onToggle}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        borderCurve: 'continuous',
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
        backgroundColor: colors.bgCard,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: done ? colors.accentTimer : colors.borderStrong,
          backgroundColor: done ? colors.accentTimer : 'transparent',
        }}
      >
        {done ? <Check size={12} color={colors.bgSurface} strokeWidth={3} /> : null}
      </View>

      <Text
        style={{
          flex: 1,
          fontSize: 14,
          color: done ? colors.textMuted : colors.textPrimary,
          textDecorationLine: done ? 'line-through' : 'none',
        }}
      >
        {title}
      </Text>

      {confirming ? (
        <Pressable
          onPress={onDelete}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.accentNow }}
        >
          <Trash2 size={13} color={colors.textPrimary} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary }}>Delete</Text>
        </Pressable>
      ) : timeHint ? (
        <Text style={{ fontFamily: monoFont, fontSize: 11, color: colors.textMuted }}>{timeHint}</Text>
      ) : null}
    </Pressable>
  );
}

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EyeOff, Plus, Trash2, X } from 'lucide-react-native';
import type { Context } from '@task-manager/shared';
import { colors, headerDate, monoFont, webInputReset } from '../../theme';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { SideNavLinks } from '../nav/nav-chrome';

const WIDE_BREAKPOINT = 768;

// Curated context palette — the five seeded colors plus a few extra accents.
// Free-form color entry isn't worth a picker dependency for a single-user app.
const PALETTE = [
  '#5B8DEF',
  '#4FB6A9',
  '#E8A33D',
  '#D9668B',
  '#9B7EDE',
  '#E0574B',
  '#6BBF59',
  '#4AA3D9',
  '#C77DD6',
  '#8B93A3',
];

const MAX_W = 560;

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const contexts = useTasksStore((s) => s.contexts);

  // Robust on a direct deep-link / web refresh onto /settings: the tasks store
  // loads lazily on the Tasks screen, so ensure contexts exist here too.
  useEffect(() => {
    if (useTasksStore.getState().contexts.length === 0) {
      void useTasksStore.getState().load();
    }
  }, []);

  const sections = (
    <>
      <ContextsSection contexts={contexts} />
      <AccountSection />
      <DangerSection />
    </>
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
          </View>
          <SideNavLinks />
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => useAuthStore.getState().signOut()} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Sign out</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingTop: insets.top + 24, paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: colors.textPrimary, marginBottom: 16 }}>
            Settings
          </Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 40, width: '100%', maxWidth: MAX_W }}>
            {sections}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ---- MOBILE / NARROW: title + sections (bottom tab bar comes from the layout) ----
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bgSurface }}
    >
      <View style={{ paddingTop: insets.top + 8, flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Text style={{ fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1.5, color: colors.textMuted }}>{headerDate()}</Text>
          <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: colors.textPrimary }}>Settings</Text>
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 40,
            width: '100%',
            maxWidth: MAX_W,
            alignSelf: 'center',
          }}
        >
          {sections}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------- Contexts

function ContextsSection({ contexts }: { contexts: Context[] }) {
  // editingId: a context id being edited, 'new' for the add form, or null.
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);

  return (
    <View style={{ marginTop: 8 }}>
      <SectionLabel>CONTEXTS</SectionLabel>
      <View style={{ gap: 8 }}>
        {contexts.map((c) =>
          editingId === c.id ? (
            <ContextEditor
              key={c.id}
              context={c}
              onClose={() => setEditingId(null)}
            />
          ) : (
            <ContextRow key={c.id} context={c} onPress={() => setEditingId(c.id)} />
          ),
        )}

        {editingId === 'new' ? (
          <ContextEditor onClose={() => setEditingId(null)} />
        ) : (
          <Pressable
            onPress={() => setEditingId('new')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.borderSubtle,
              borderStyle: 'dashed',
            }}
          >
            <Plus size={16} color={colors.textSecondary} />
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>Add context</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ContextRow({ context, onPress }: { context: Context; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: colors.bgCard,
      }}
    >
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: context.color }} />
      <Text style={{ fontSize: 15, color: colors.textPrimary }}>{context.label}</Text>
      {context.excludeFromAll ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <EyeOff size={12} color={colors.textMuted} />
          <Text style={{ fontSize: 11, color: colors.textMuted }}>hidden</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <Text style={{ fontFamily: monoFont, fontSize: 11, color: colors.textMuted }}>{context.slug}</Text>
    </Pressable>
  );
}

// Inline create/edit form. `context` present = edit; absent = create.
function ContextEditor({ context, onClose }: { context?: Context; onClose: () => void }) {
  const { createContext, updateContext, deleteContext } = useTasksStore();
  const [label, setLabel] = useState(context?.label ?? '');
  const [color, setColor] = useState(context?.color ?? PALETTE[0]);
  const [excludeFromAll, setExcludeFromAll] = useState(context?.excludeFromAll ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = async () => {
    const trimmed = label.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (context) await updateContext(context.id, { label: trimmed, color, excludeFromAll });
      else await createContext(trimmed, color, excludeFromAll);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!context || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteContext(context.id);
      onClose();
    } catch (e) {
      // 409 when tasks still reference it — show the server's count message.
      setError(e instanceof Error ? e.message : 'Could not delete');
      setConfirmingDelete(false);
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        borderRadius: 12,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        padding: 14,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Context name"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          style={[
            { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 4 },
            webInputReset,
          ]}
        />
        <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
          <X size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Exclude from All toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: colors.textPrimary }}>Hide from All view</Text>
          <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
            Also hidden from the Calendar; still opens via its chip.
          </Text>
        </View>
        <Switch
          value={excludeFromAll}
          onValueChange={setExcludeFromAll}
          trackColor={{ false: colors.bgElevated, true: colors.accentPrimary }}
          thumbColor={colors.textPrimary}
        />
      </View>

      {/* Palette */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {PALETTE.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: c,
              borderWidth: color === c ? 2 : 0,
              borderColor: colors.textPrimary,
            }}
          />
        ))}
      </View>

      {error ? <Text style={{ fontSize: 12.5, color: colors.accentNow }}>{error}</Text> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {context ? (
          confirmingDelete ? (
            <>
              <Pressable
                onPress={remove}
                disabled={busy}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: colors.accentNow,
                }}
              >
                <Trash2 size={14} color={colors.bgSurface} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.bgSurface }}>Delete</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmingDelete(false)} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => setConfirmingDelete(true)}
              disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 }}
            >
              <Trash2 size={14} color={colors.textMuted} />
              <Text style={{ fontSize: 13, color: colors.textMuted }}>Remove</Text>
            </Pressable>
          )
        ) : null}

        <View style={{ flex: 1 }} />
        <Pressable
          onPress={save}
          disabled={busy || !label.trim()}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: label.trim() ? colors.accentPrimary : colors.bgElevated,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.bgSurface} />
          ) : (
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: label.trim() ? colors.bgSurface : colors.textMuted,
              }}
            >
              Save
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Account

function AccountSection() {
  const router = useRouter();
  const signOut = async () => {
    await useAuthStore.getState().signOut();
    router.replace('/sign-in');
  };
  return (
    <View style={{ marginTop: 28 }}>
      <SectionLabel>ACCOUNT</SectionLabel>
      <Pressable
        onPress={signOut}
        style={{
          paddingVertical: 13,
          paddingHorizontal: 14,
          borderRadius: 12,
          backgroundColor: colors.bgCard,
        }}
      >
        <Text style={{ fontSize: 15, color: colors.textPrimary }}>Sign out</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- Danger

function DangerSection() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await useTasksStore.getState().resetData();
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: 28 }}>
      <SectionLabel>DANGER ZONE</SectionLabel>
      {!confirming ? (
        <Pressable
          onPress={() => setConfirming(true)}
          style={{
            paddingVertical: 13,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.accentNow,
          }}
        >
          <Text style={{ fontSize: 15, color: colors.accentNow }}>Reset data…</Text>
        </Pressable>
      ) : (
        <View
          style={{
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.accentNow,
            backgroundColor: colors.bgCard,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 }}>
            This permanently deletes all tasks, recurring rules and timers. Your contexts and
            sign-in are kept. This cannot be undone.
          </Text>
          {error ? <Text style={{ fontSize: 12.5, color: colors.accentNow }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={reset}
              disabled={busy}
              style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.accentNow }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.bgSurface} />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.bgSurface }}>Delete everything</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} disabled={busy} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- shared

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: monoFont,
        fontSize: 10.5,
        letterSpacing: 1.5,
        color: colors.textFaint,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

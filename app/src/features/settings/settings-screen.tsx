import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { ChevronRight, EyeOff, Plus, Trash2, X } from 'lucide-react-native';
import type { Context } from '@task-manager/shared';
import { colors, headerDate, monoFont, webInputReset } from '../../theme';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { SideNavLinks } from '../nav/nav-chrome';

const WIDE_BREAKPOINT = 768;
const isWeb = process.env.EXPO_OS === 'web';
const isIOS = process.env.EXPO_OS === 'ios';

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

type InputComponent = ComponentType<TextInputProps>;

// BottomSheetTextInput coordinates the keyboard with the sheet on native, but on
// web it calls TextInput.State.currentlyFocusedInput (missing in react-native-web)
// and crashes — so use a plain TextInput inside the sheet on web.
const SheetInput: InputComponent = isWeb ? TextInput : BottomSheetTextInput;

// The owner email lives in the JWT `sub` claim (single-user app). Decode it
// client-side so "Signed in as …" can be shown without a /me round-trip.
function jwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    if (typeof globalThis.atob !== 'function') return null;
    const sub = JSON.parse(globalThis.atob(b64)).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

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
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {sections}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ---- MOBILE / NARROW: title + sections (bottom tab bar comes from the layout) ----
  return (
    <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bgSurface }}>
      <View style={{ paddingTop: insets.top + 8, flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Text style={{ fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1.5, color: colors.textMuted }}>{headerDate()}</Text>
          <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: colors.textPrimary }}>Settings</Text>
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 40,
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
  // A context being edited, 'new' for the add form, or null.
  const [editing, setEditing] = useState<Context | 'new' | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async (id: number) => {
    setDeleteError(null);
    try {
      await useTasksStore.getState().deleteContext(id);
    } catch (e) {
      // 409 when tasks still reference it — surface the server's count message.
      setDeleteError(e instanceof Error ? e.message : 'Could not delete context');
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <SectionLabel>CONTEXTS</SectionLabel>
      <View style={{ gap: 8 }}>
        {contexts.map((c) => (
          <ContextRow key={c.id} context={c} onPress={() => setEditing(c)} onDelete={() => remove(c.id)} />
        ))}

        <Pressable
          onPress={() => setEditing('new')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderStyle: 'dashed',
          }}
        >
          <Plus size={15} color={colors.accentPrimary} />
          <Text style={{ fontSize: 13.5, fontWeight: '500', color: colors.accentPrimary }}>Add context</Text>
        </Pressable>
      </View>

      {deleteError ? (
        <Text style={{ fontSize: 12, color: colors.accentNow, marginTop: 8, marginHorizontal: 4 }}>{deleteError}</Text>
      ) : null}
      <Text style={{ fontSize: 11, color: colors.textFaint, marginTop: 8, marginHorizontal: 4 }}>
        {isWeb ? 'Tap a context to edit.' : 'Swipe a row left to delete. Tap to edit.'}
      </Text>

      {editing ? (
        <ContextEditor context={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
    </View>
  );
}

function ContextRow({ context, onPress, onDelete }: { context: Context; onPress: () => void; onDelete: () => void }) {
  const swipeRef = useRef<SwipeableMethods>(null);

  const inner = (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: colors.bgCard,
      }}
    >
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: context.color }} />
      <Text style={{ flex: 1, fontSize: 14.5, color: colors.textPrimary }} numberOfLines={1}>
        {context.label}
      </Text>
      {context.excludeFromAll ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <EyeOff size={11} color={colors.textMuted} />
          <Text style={{ fontSize: 10.5, color: colors.textMuted }}>hidden</Text>
        </View>
      ) : null}
      <Text style={{ fontFamily: monoFont, fontSize: 10, color: colors.textFaint }}>{context.slug}</Text>
    </Pressable>
  );

  // Web keeps tap-to-edit only (swipe is a touch gesture); mobile adds swipe-left → Delete.
  if (isWeb) return inner;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            swipeRef.current?.close();
            onDelete();
          }}
          style={{
            width: 72,
            marginLeft: 6,
            borderRadius: 12,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: colors.accentNow,
          }}
        >
          <Trash2 size={16} color={colors.bgSurface} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.bgSurface }}>Delete</Text>
        </Pressable>
      )}
      rightThreshold={40}
      overshootFriction={8}
    >
      {inner}
    </Swipeable>
  );
}

// Bottom sheet on mobile, centered modal on web/wide — mirrors TaskDetail.
function ContextEditor({ context, onClose }: { context?: Context; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  return wide ? <WebEditorModal context={context} onClose={onClose} /> : <SheetEditor context={context} onClose={onClose} />;
}

function WebEditorModal({ context, onClose }: { context?: Context; onClose: () => void }) {
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(5,6,10,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            width: 460,
            maxWidth: '100%',
            borderRadius: 20,
            borderCurve: 'continuous',
            backgroundColor: colors.bgCardWeb,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            padding: 20,
          }}
        >
          <EditorForm context={context} onClose={onClose} Input={TextInput} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetEditor({ context, onClose }: { context?: Context; onClose: () => void }) {
  const ref = useRef<BottomSheetModal>(null);

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
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      backgroundStyle={{ backgroundColor: colors.bgCardWeb }}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <EditorForm context={context} onClose={close} Input={SheetInput} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// The editor form — shared by the mobile sheet and the web modal. `context`
// present = edit; absent = create.
function EditorForm({ context, onClose, Input }: { context?: Context; onClose: () => void; Input: InputComponent }) {
  const { createContext, updateContext, deleteContext } = useTasksStore();
  const [label, setLabel] = useState(context?.label ?? '');
  const [color, setColor] = useState(context?.color ?? PALETTE[0]);
  const [excludeFromAll, setExcludeFromAll] = useState(context?.excludeFromAll ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      {/* Name */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
        <Input
          value={label}
          onChangeText={setLabel}
          placeholder="Context name"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.textPrimary, paddingVertical: 2, ...webInputReset }}
        />
        <Pressable onPress={onClose} hitSlop={8} style={{ padding: 7, borderRadius: 9, backgroundColor: colors.bgCard }}>
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Hide from All */}
      <View
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
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, color: colors.textPrimary }}>Hide from All view</Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            Show in calendar if they have a due date.
          </Text>
        </View>
        <Switch
          value={excludeFromAll}
          onValueChange={setExcludeFromAll}
          trackColor={{ false: colors.bgElevated, true: colors.accentPrimary }}
          thumbColor={colors.textPrimary}
        />
      </View>

      {/* Color */}
      <View>
        <Text
          style={{
            fontFamily: monoFont,
            fontSize: 10.5,
            letterSpacing: 1.3,
            textTransform: 'uppercase',
            color: colors.textMuted,
            marginBottom: 10,
            marginLeft: 2,
          }}
        >
          Color
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: c,
                borderWidth: color === c ? 2 : 0,
                borderColor: colors.textPrimary,
              }}
            />
          ))}
        </View>
      </View>

      {error ? <Text style={{ fontSize: 12.5, color: colors.accentNow }}>{error}</Text> : null}

      {/* Actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {context ? (
          <Pressable
            onPress={remove}
            disabled={busy}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 8 }}
          >
            <Trash2 size={15} color={colors.accentNow} />
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.accentNow }}>Delete</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={save}
          disabled={busy || !label.trim()}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 11,
            backgroundColor: label.trim() ? colors.accentPrimary : colors.bgElevated,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.bgSurface} />
          ) : (
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: label.trim() ? colors.bgSurface : colors.textMuted }}>
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
  const jwt = useAuthStore((s) => s.jwt);
  const email = useMemo(() => jwtSub(jwt), [jwt]);

  const signOut = async () => {
    await useAuthStore.getState().signOut();
    router.replace('/sign-in');
  };

  return (
    <View style={{ marginTop: 28 }}>
      <SectionLabel>ACCOUNT</SectionLabel>
      <View style={{ borderRadius: 12, backgroundColor: colors.bgCard, overflow: 'hidden' }}>
        {email ? (
          <>
            <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ fontSize: 11, color: colors.textMuted }}>Signed in as</Text>
              <Text numberOfLines={1} style={{ fontFamily: monoFont, fontSize: 12.5, color: '#B8BFCC', marginTop: 2 }}>
                {email}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.borderSubtle, marginHorizontal: 14 }} />
          </>
        ) : null}
        <Pressable
          onPress={signOut}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '500', color: colors.accentPrimary }}>Sign out</Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Danger

function DangerSection() {
  const [modal, setModal] = useState(false);
  return (
    <View style={{ marginTop: 28 }}>
      <SectionLabel>DANGER ZONE</SectionLabel>
      <View
        style={{
          borderRadius: 12,
          padding: 14,
          backgroundColor: 'rgba(217,102,139,0.06)',
          borderWidth: 1,
          borderColor: 'rgba(217,102,139,0.18)',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '500', color: colors.accentNow }}>Reset all data</Text>
        <Text style={{ fontSize: 11.5, lineHeight: 17, color: colors.textSecondary, marginTop: 3, marginBottom: 12 }}>
          Permanently deletes all tasks, recurring rules and timers. Your contexts and sign-in are kept. This cannot be undone.
        </Text>
        <Pressable
          onPress={() => setModal(true)}
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
            alignItems: 'center',
            gap: 7,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor: 'rgba(217,102,139,0.4)',
          }}
        >
          <Trash2 size={13} color={colors.accentNow} />
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.accentNow }}>Reset…</Text>
        </Pressable>
      </View>
      {modal ? <ResetModal onClose={() => setModal(false)} /> : null}
    </View>
  );
}

// Type-RESET-to-confirm — maximum friction for the irreversible action.
function ResetModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = text.trim() === 'RESET';

  const doReset = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await useTasksStore.getState().resetData();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset');
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(5,6,10,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              width: 400,
              maxWidth: '100%',
              borderRadius: 18,
              borderCurve: 'continuous',
              backgroundColor: colors.bgCardWeb,
              borderWidth: 1,
              borderColor: colors.borderSubtle,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 }}>Reset all data</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginBottom: 16 }}>
              This permanently deletes all tasks, recurring rules and timers. Your contexts and sign-in are kept. Type{' '}
              <Text style={{ fontFamily: monoFont, color: colors.textPrimary }}>RESET</Text> to confirm.
            </Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="RESET"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              style={{
                backgroundColor: colors.bgCard,
                borderWidth: 1,
                borderColor: colors.borderSubtle,
                borderRadius: 11,
                paddingHorizontal: 12,
                paddingVertical: 11,
                fontSize: 14,
                letterSpacing: 2,
                color: colors.textPrimary,
                ...webInputReset,
              }}
            />
            {error ? <Text style={{ fontSize: 12.5, color: colors.accentNow, marginTop: 10 }}>{error}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={onClose}
                disabled={busy}
                style={{ flex: 1, borderRadius: 11, paddingVertical: 11, alignItems: 'center', backgroundColor: colors.bgElevated }}
              >
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={doReset}
                disabled={!ok || busy}
                style={{
                  flex: 1,
                  borderRadius: 11,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: ok ? colors.accentNow : colors.bgElevated,
                }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.bgSurface} />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: ok ? colors.bgSurface : colors.textMuted }}>Reset</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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

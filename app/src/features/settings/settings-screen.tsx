import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { ChevronRight, EyeOff, Plus, RefreshCw, Trash2, X } from 'lucide-react-native';
import type { Context } from '@task-manager/shared';
import { colors, headerDate, monoFont, webInputReset, WIDE_BREAKPOINT } from '../../theme';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { SideNavLinks } from '../nav/nav-chrome';

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
      <UpdatesSection />
      <DangerSection />
    </>
  );

  // ---- WEB / WIDE: sidebar + main ----
  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <View style={[styles.sidebar, { paddingTop: insets.top + 16 }]}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarLogo}>LOG</Text>
          </View>
          <SideNavLinks />
          <View style={styles.flex1} />
          <Pressable
            onPress={() => useAuthStore.getState().signOut()}
            style={styles.sidebarSignOut}
          >
            <Text style={styles.sidebarSignOutText}>Sign out</Text>
          </Pressable>
        </View>
        <View style={[styles.wideMain, { paddingTop: insets.top + 24 }]}>
          <Text style={styles.wideTitle}>Settings</Text>
          <ScrollView contentContainerStyle={styles.wideScrollContent}>{sections}</ScrollView>
        </View>
      </View>
    );
  }

  // ---- MOBILE / NARROW: title + sections (bottom tab bar comes from the layout) ----
  return (
    <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.mobileRoot}>
      <View style={[styles.flex1, { paddingTop: insets.top + 8 }]}>
        <View style={styles.mobileHeader}>
          <Text style={styles.mobileDate}>{headerDate()}</Text>
          <Text style={styles.mobileTitle}>Settings</Text>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.mobileScrollContent,
            { paddingBottom: insets.bottom + 40 },
          ]}
        >
          {sections}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

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
    <View style={styles.sectionTop}>
      <SectionLabel>CONTEXTS</SectionLabel>
      <View style={styles.contextList}>
        {contexts.map((c) => (
          <ContextRow
            key={c.id}
            context={c}
            onPress={() => setEditing(c)}
            onDelete={() => remove(c.id)}
          />
        ))}

        <Pressable onPress={() => setEditing('new')} style={styles.addContextBtn}>
          <Plus size={15} color={colors.accentPrimary} />
          <Text style={styles.addContextText}>Add context</Text>
        </Pressable>
      </View>

      {deleteError ? <Text style={styles.deleteErrorText}>{deleteError}</Text> : null}
      <Text style={styles.hintText}>
        {isWeb ? 'Tap a context to edit.' : 'Swipe a row left to delete. Tap to edit.'}
      </Text>

      {editing ? (
        <ContextEditor
          context={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

function ContextRow({
  context,
  onPress,
  onDelete,
}: {
  context: Context;
  onPress: () => void;
  onDelete: () => void;
}) {
  const swipeRef = useRef<SwipeableMethods>(null);

  const inner = (
    <Pressable onPress={onPress} style={styles.contextRow}>
      <View style={[styles.contextDot, { backgroundColor: context.color }]} />
      <Text style={styles.contextLabel} numberOfLines={1}>
        {context.label}
      </Text>
      {context.excludeFromAll ? (
        <View style={styles.hiddenBadge}>
          <EyeOff size={11} color={colors.textMuted} />
          <Text style={styles.hiddenText}>hidden</Text>
        </View>
      ) : null}
      <Text style={styles.contextSlug}>{context.slug}</Text>
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
          style={styles.swipeDelete}
        >
          <Trash2 size={16} color={colors.bgSurface} />
          <Text style={styles.swipeDeleteText}>Delete</Text>
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
  return wide ? (
    <WebEditorModal context={context} onClose={onClose} />
  ) : (
    <SheetEditor context={context} onClose={onClose} />
  );
}

function WebEditorModal({ context, onClose }: { context?: Context; onClose: () => void }) {
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalOverlay}>
        <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.webModalCard}>
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
      handleIndicatorStyle={styles.sheetHandle}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <EditorForm context={context} onClose={close} Input={SheetInput} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// The editor form — shared by the mobile sheet and the web modal. `context`
// present = edit; absent = create.
function EditorForm({
  context,
  onClose,
  Input,
}: {
  context?: Context;
  onClose: () => void;
  Input: InputComponent;
}) {
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
    <View style={styles.editorForm}>
      <View style={styles.editorRow}>
        <View style={[styles.editorColorDot, { backgroundColor: color }]} />
        <Input
          value={label}
          onChangeText={setLabel}
          placeholder="Context name"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          style={[styles.editorInput, webInputReset]}
        />
        <Pressable onPress={onClose} hitSlop={8} style={styles.editorClose}>
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.hideRow}>
        <View style={styles.flex1}>
          <Text style={styles.hideRowTitle}>Hide from All view</Text>
          <Text style={styles.hideRowSubtitle}>Show in calendar if they have a due date.</Text>
        </View>
        <Switch
          value={excludeFromAll}
          onValueChange={setExcludeFromAll}
          trackColor={{ false: colors.bgElevated, true: colors.accentPrimary }}
          thumbColor={colors.textPrimary}
        />
      </View>

      <View>
        <Text style={styles.colorLabel}>Color</Text>
        <View style={styles.colorGrid}>
          {PALETTE.map((c) => {
            const borderWidth = color === c ? 2 : 0;
            return (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.colorSwatch, { backgroundColor: c, borderWidth }]}
              />
            );
          })}
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.editorRow}>
        {context ? (
          <Pressable onPress={remove} disabled={busy} style={styles.editorRemove}>
            <Trash2 size={15} color={colors.accentNow} />
            <Text style={styles.editorRemoveText}>Delete</Text>
          </Pressable>
        ) : null}
        <View style={styles.flex1} />
        <Pressable
          onPress={save}
          disabled={busy || !label.trim()}
          style={[
            styles.editorSave,
            { backgroundColor: label.trim() ? colors.accentPrimary : colors.bgElevated },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.bgSurface} />
          ) : (
            <Text
              style={[
                styles.editorSaveText,
                { color: label.trim() ? colors.bgSurface : colors.textMuted },
              ]}
            >
              Save
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function AccountSection() {
  const router = useRouter();
  const jwt = useAuthStore((s) => s.jwt);
  const email = useMemo(() => jwtSub(jwt), [jwt]);

  const signOut = async () => {
    await useAuthStore.getState().signOut();
    router.replace('/sign-in');
  };

  return (
    <View style={styles.mt28}>
      <SectionLabel>ACCOUNT</SectionLabel>
      <View style={styles.accountCard}>
        {email ? (
          <>
            <View style={styles.accountEmailRow}>
              <Text style={styles.accountEmailLabel}>Signed in as</Text>
              <Text numberOfLines={1} style={styles.accountEmail}>
                {email}
              </Text>
            </View>
            <View style={styles.accountDivider} />
          </>
        ) : null}
        <Pressable onPress={signOut} style={styles.accountSignOutRow}>
          <Text style={styles.accountSignOutText}>Sign out</Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

function DangerSection() {
  const [modal, setModal] = useState(false);
  return (
    <View style={styles.mt28}>
      <SectionLabel>DANGER ZONE</SectionLabel>
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>Reset all data</Text>
        <Text style={styles.dangerText}>
          Permanently deletes all tasks, recurring rules and timers. Your contexts and sign-in are
          kept. This cannot be undone.
        </Text>
        <Pressable onPress={() => setModal(true)} style={styles.dangerBtn}>
          <Trash2 size={13} color={colors.accentNow} />
          <Text style={styles.dangerBtnText}>Reset…</Text>
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
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.flex1}>
        <Pressable onPress={onClose} style={styles.resetOverlay}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.resetCard}>
            <Text style={styles.resetTitle}>Reset all data</Text>
            <Text style={styles.resetBody}>
              This permanently deletes all tasks, recurring rules and timers. Your contexts and
              sign-in are kept. Type <Text style={styles.resetBodyEmphasis}>RESET</Text> to confirm.
            </Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="RESET"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              style={[styles.resetInput, webInputReset]}
            />
            {error ? <Text style={styles.resetErrorText}>{error}</Text> : null}
            <View style={styles.resetActions}>
              <Pressable onPress={onClose} disabled={busy} style={styles.resetCancel}>
                <Text style={styles.resetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={doReset}
                disabled={!ok || busy}
                style={[
                  styles.resetConfirm,
                  { backgroundColor: ok ? colors.accentNow : colors.bgElevated },
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.bgSurface} />
                ) : (
                  <Text
                    style={[
                      styles.resetConfirmText,
                      { color: ok ? colors.bgSurface : colors.textMuted },
                    ]}
                  >
                    Reset
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Diagnostic for the OTA update system: which bundle is live (embedded build vs an
// OTA), its channel/runtime, plus a manual check and a restart-to-apply control.
function UpdatesSection() {
  const {
    currentlyRunning,
    isUpdatePending,
    isChecking,
    isDownloading,
    isRestarting,
    lastCheckForUpdateTimeSinceRestart,
  } = useUpdates();

  const check = useCallback(() => {
    Updates.checkForUpdateAsync()
      .then((r) => (r.isAvailable ? Updates.fetchUpdateAsync() : undefined))
      .catch(() => {});
  }, []);
  const apply = useCallback(() => {
    Updates.reloadAsync().catch(() => {});
  }, []);

  const r = currentlyRunning;
  const busy = isChecking || isDownloading;
  const lastChecked = lastCheckForUpdateTimeSinceRestart
    ? lastCheckForUpdateTimeSinceRestart.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <View style={styles.mt28}>
      <SectionLabel>UPDATES</SectionLabel>
      <View style={styles.accountCard}>
        {!Updates.isEnabled ? (
          <Text style={styles.updatesNote}>
            Over-the-air updates run only in release / preview builds — not in Expo Go or a dev
            client.
          </Text>
        ) : (
          <>
            <DiagRow label="Running" value={r.isEmbeddedLaunch ? 'Embedded build' : 'OTA update'} />
            <DiagRow label="Channel" value={r.channel ?? '—'} />
            <DiagRow label="Runtime" value={r.runtimeVersion ?? '—'} mono />
            <DiagRow label="Update ID" value={r.updateId ? r.updateId.slice(0, 8) : '—'} mono />
            {lastChecked ? <DiagRow label="Last checked" value={lastChecked} /> : null}
            {isUpdatePending ? (
              <Pressable onPress={apply} disabled={isRestarting} style={styles.updatesApplyRow}>
                <RefreshCw size={15} color={colors.bgBase} />
                <Text style={styles.updatesApplyText}>
                  {isRestarting ? 'Restarting…' : 'Update ready — restart to apply'}
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={check} disabled={busy} style={styles.updatesCheckRow}>
                <Text style={styles.updatesCheckText}>
                  {busy ? 'Checking…' : 'Check for updates'}
                </Text>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <RefreshCw size={15} color={colors.textFaint} />
                )}
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function DiagRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={[styles.diagValue, mono ? styles.diagValueMono : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.bgBase },
  sidebar: {
    width: 240,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#10141B',
    borderRightWidth: 1,
    borderRightColor: colors.bgCard,
  },
  sidebarHeader: { paddingHorizontal: 8, paddingBottom: 20 },
  sidebarLogo: {
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textMuted,
  },
  flex1: { flex: 1 },
  sidebarSignOut: { paddingHorizontal: 8, paddingVertical: 8 },
  sidebarSignOutText: { fontSize: 12, color: colors.textMuted },
  wideMain: { flex: 1, paddingHorizontal: 24 },
  wideTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  wideScrollContent: { paddingBottom: 40 },
  mobileRoot: { flex: 1, backgroundColor: colors.bgSurface },
  mobileHeader: { paddingHorizontal: 20, paddingBottom: 12 },
  mobileDate: {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  mobileTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  mobileScrollContent: { paddingHorizontal: 20 },
  sectionTop: { marginTop: 8 },
  contextList: { gap: 8 },
  addContextBtn: {
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
  },
  addContextText: { fontSize: 13.5, fontWeight: '500', color: colors.accentPrimary },
  deleteErrorText: { fontSize: 12, color: colors.accentNow, marginTop: 8, marginHorizontal: 4 },
  hintText: { fontSize: 11, color: colors.textFaint, marginTop: 8, marginHorizontal: 4 },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
  },
  contextDot: { width: 12, height: 12, borderRadius: 6 },
  contextLabel: { flex: 1, fontSize: 14.5, color: colors.textPrimary },
  hiddenBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hiddenText: { fontSize: 10.5, color: colors.textMuted },
  contextSlug: { fontFamily: monoFont, fontSize: 10, color: colors.textFaint },
  swipeDelete: {
    width: 72,
    marginLeft: 6,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.accentNow,
  },
  swipeDeleteText: { fontSize: 11, fontWeight: '600', color: colors.bgSurface },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,6,10,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  webModalCard: {
    width: 460,
    maxWidth: '100%',
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCardWeb,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 20,
  },
  sheetHandle: { backgroundColor: colors.borderStrong },
  sheetBackground: { backgroundColor: colors.bgCardWeb },
  sheetContent: { padding: 20, paddingBottom: 32 },
  editorForm: { gap: 16 },
  editorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editorColorDot: { width: 14, height: 14, borderRadius: 7 },
  editorInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingVertical: 2,
  },
  editorClose: { padding: 7, borderRadius: 9, backgroundColor: colors.bgCard },
  hideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
  },
  hideRowTitle: { fontSize: 13.5, color: colors.textPrimary },
  hideRowSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  colorLabel: {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 10,
    marginLeft: 2,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderColor: colors.textPrimary,
  },
  errorText: { fontSize: 12.5, color: colors.accentNow },
  editorRemove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  editorRemoveText: { fontSize: 13, fontWeight: '500', color: colors.accentNow },
  editorSave: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 11,
  },
  editorSaveText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  mt28: { marginTop: 28 },
  accountCard: { borderRadius: 12, backgroundColor: colors.bgCard, overflow: 'hidden' },
  accountEmailRow: { paddingHorizontal: 14, paddingVertical: 12 },
  accountEmailLabel: { fontSize: 11, color: colors.textMuted },
  accountEmail: { fontFamily: monoFont, fontSize: 12.5, color: '#B8BFCC', marginTop: 2 },
  accountDivider: { height: 1, backgroundColor: colors.borderSubtle, marginHorizontal: 14 },
  accountSignOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  accountSignOutText: { fontSize: 15, fontWeight: '500', color: colors.accentPrimary },
  dangerCard: {
    borderRadius: 12,
    padding: 14,
    backgroundColor: 'rgba(217,102,139,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(217,102,139,0.18)',
  },
  dangerTitle: { fontSize: 14, fontWeight: '500', color: colors.accentNow },
  dangerText: {
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 3,
    marginBottom: 12,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 7,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(217,102,139,0.4)',
  },
  dangerBtnText: { fontSize: 12.5, fontWeight: '600', color: colors.accentNow },
  resetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,6,10,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resetCard: {
    width: 400,
    maxWidth: '100%',
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.bgCardWeb,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 20,
  },
  resetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  resetBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  resetBodyEmphasis: { fontFamily: monoFont, color: colors.textPrimary },
  resetInput: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  resetErrorText: { fontSize: 12.5, color: colors.accentNow, marginTop: 10 },
  resetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  resetCancel: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
  },
  resetCancelText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  resetConfirm: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
  },
  resetConfirmText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionLabel: {
    fontFamily: monoFont,
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: colors.textFaint,
    marginBottom: 10,
  },
  updatesNote: { fontSize: 12, lineHeight: 18, color: colors.textMuted, padding: 14 },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  diagLabel: { fontSize: 12.5, color: colors.textMuted },
  diagValue: { flex: 1, textAlign: 'right', fontSize: 12.5, color: colors.textSecondary },
  diagValueMono: { fontFamily: monoFont, fontSize: 11, color: '#B8BFCC' },
  updatesCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: 4,
  },
  updatesCheckText: { fontSize: 15, fontWeight: '500', color: colors.accentPrimary },
  updatesApplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 4,
    backgroundColor: colors.accentPrimary,
  },
  updatesApplyText: { fontSize: 14, fontWeight: '600', color: colors.bgBase },
});

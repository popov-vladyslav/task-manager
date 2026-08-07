import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
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
import { api, type McpTokenMetadata } from '../../lib/api';
import { API_URL } from '../../lib/config';
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
      <McpTokenSection />
      {!isWeb && <UpdatesSection />}
      <DangerSection />
    </>
  );

  // ---- WEB / WIDE: sidebar + main ----
  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <View style={[styles.sidebar, { paddingTop: insets.top + 16 }]}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarLogo}>TASK TRACKER</Text>
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
          <ScrollView
            nativeID="settings-scroll-wide"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.wideScrollContent}
          >
            {sections}
          </ScrollView>
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
          nativeID="settings-scroll-mobile"
          showsVerticalScrollIndicator={false}
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
  const [email, setEmail] = useState<string | null>(null);

  // Asked of the server rather than decoded from the token: the JWT identifies
  // the account to the API, it is not a source of display data.
  useEffect(() => {
    let alive = true;
    void api
      .getAccount()
      .then((a) => {
        if (alive) setEmail(a.email);
      })
      .catch(() => {
        /* leave it blank rather than showing something wrong */
      });
    return () => {
      alive = false;
    };
  }, []);

  const signOut = async () => {
    await useAuthStore.getState().signOut();
    router.replace('/sign-in');
  };

  const signOutEverywhere = async () => {
    await useAuthStore.getState().signOutEverywhere();
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
        <View style={styles.accountDivider} />
        <Pressable onPress={signOutEverywhere} style={styles.accountSignOutRow}>
          <Text style={styles.accountSignOutText}>Sign out all devices</Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

// The MCP token is emailed and never rendered here — the app has no way to show
// it, by design. That is why the recovery path is "regenerate" (which kills the
// old one) rather than "reveal".
// The endpoint this build talks to, so the panel shows the right URL per
// environment without anyone reasoning about stage vs prod.
const MCP_URL = `${API_URL.replace(/\/$/, '')}/mcp`;

// Per-client steps live HERE rather than in the token email: client UIs get
// renamed every few months, and an email is frozen the moment it is sent. This
// screen ships with the app and can be corrected in an OTA update.
function HowToConnect() {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.howBlock}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.howToggle}>
        <ChevronRight size={14} color={colors.textFaint} />
        <Text style={styles.howToggleText}>How to connect</Text>
      </Pressable>

      {open ? (
        <View style={styles.howBody}>
          <Text style={styles.howLabel}>Claude (claude.ai)</Text>
          <Text style={styles.howStep}>Settings → Connectors → Add custom connector</Text>

          <Text style={styles.howLabel}>Claude Code</Text>
          <Text selectable style={styles.howStep}>
            claude mcp add --transport http task-tracker {MCP_URL}
          </Text>

          <Text style={styles.howLabel}>ChatGPT</Text>
          <Text style={styles.howStep}>Settings → Connectors → Add</Text>

          <Text style={styles.howNote}>
            Any client that supports HTTP MCP with a bearer token will work. Menu names change
            between app versions — look for “connectors” or “MCP servers”.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function McpTokenSection() {
  const [meta, setMeta] = useState<McpTokenMetadata | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMeta(await api.getMcpToken());
    } catch {
      /* leave as-is */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const issue = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setMeta(await api.issueMcpToken());
      setNote('Sent to your email address.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a token');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.revokeMcpToken();
      setMeta(null);
      setNote('Token revoked.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.mt28}>
      <SectionLabel>AI ASSISTANT (MCP)</SectionLabel>
      <View style={styles.accountCard}>
        <View style={styles.mcpBody}>
          <Text style={styles.mcpBlurb}>
            Connect your own AI assistant to your tasks. The token is sent to your email and is
            never shown here — if you lose it, generate a new one.
          </Text>

          {!loaded ? (
            <ActivityIndicator color={colors.textFaint} />
          ) : meta ? (
            <>
              <Text style={styles.mcpMeta}>Created {formatStamp(meta.createdAt)}</Text>
              <Text style={styles.mcpMeta}>
                {meta.lastUsedAt ? `Last used ${formatStamp(meta.lastUsedAt)}` : 'Never used'}
              </Text>
            </>
          ) : (
            <Text style={styles.mcpMeta}>No token yet.</Text>
          )}

          {note ? <Text style={styles.mcpNote}>{note}</Text> : null}
          {error ? <Text style={styles.mcpError}>{error}</Text> : null}

          <View style={styles.mcpButtons}>
            <Pressable onPress={issue} disabled={busy} style={styles.mcpPrimaryBtn}>
              <RefreshCw size={13} color={colors.bgSurface} />
              <Text style={styles.mcpPrimaryBtnText}>
                {meta ? 'Regenerate and email' : 'Email me a token'}
              </Text>
            </Pressable>
            {meta ? (
              <Pressable onPress={revoke} disabled={busy} style={styles.mcpRevokeBtn}>
                <Text style={styles.mcpRevokeBtnText}>Revoke</Text>
              </Pressable>
            ) : null}
          </View>

          {meta ? (
            <Text style={styles.mcpWarn}>Regenerating stops the current token working.</Text>
          ) : null}

          <HowToConnect />
        </View>
      </View>
    </View>
  );
}

function DangerSection() {
  const [modal, setModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
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
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>Delete account</Text>
        <Text style={styles.dangerText}>
          Permanently deletes your account and everything in it — tasks, contexts, recurring rules,
          tracked time, comments and any MCP token. You are signed out on every device. This cannot
          be undone.
        </Text>
        <Pressable onPress={() => setDeleteModal(true)} style={styles.dangerBtn}>
          <Trash2 size={13} color={colors.accentNow} />
          <Text style={styles.dangerBtnText}>Delete account…</Text>
        </Pressable>
      </View>
      {modal ? <ResetModal onClose={() => setModal(false)} /> : null}
      {deleteModal ? <DeleteAccountModal onClose={() => setDeleteModal(false)} /> : null}
    </View>
  );
}

// Same type-to-confirm friction as the reset flow, with a harsher word and a
// harsher outcome: this one ends the account, not just its contents.
function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = text.trim() === 'DELETE';

  const doDelete = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      // The account is gone; clear local tokens and leave. signOut's server call
      // will fail harmlessly — there is no session left to end.
      await useAuthStore.getState().signOut();
      router.replace('/sign-in');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account');
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.flex1}>
        <Pressable onPress={onClose} style={styles.resetOverlay}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.resetCard}>
            <Text style={styles.resetTitle}>Delete account</Text>
            <Text style={styles.resetBody}>
              This permanently deletes your account and all of its data. It cannot be undone. Type{' '}
              <Text style={styles.resetBodyEmphasis}>DELETE</Text> to confirm.
            </Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="DELETE"
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
                onPress={doDelete}
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
                    Delete account
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
    marginBottom: 12,
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
  mcpBody: { padding: 14, gap: 8 },
  mcpBlurb: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  mcpMeta: { fontSize: 12.5, color: colors.textFaint },
  mcpNote: { fontSize: 12.5, color: colors.textPrimary, marginTop: 2 },
  mcpError: { fontSize: 12.5, color: colors.accentNow, marginTop: 2 },
  mcpButtons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  mcpPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.accentPrimary,
  },
  mcpPrimaryBtnText: { fontSize: 13, fontWeight: '600', color: colors.bgSurface },
  mcpRevokeBtn: {
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.bgElevated,
  },
  mcpRevokeBtnText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  mcpWarn: { fontSize: 11.5, color: colors.textFaint, marginTop: 2 },
  howBlock: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10 },
  howToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  howToggleText: { fontSize: 12.5, fontWeight: '500', color: colors.textSecondary },
  howBody: { marginTop: 10, gap: 4 },
  howLabel: {
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.textFaint,
    marginTop: 8,
  },
  howStep: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  howNote: { fontSize: 11.5, lineHeight: 16, color: colors.textFaint, marginTop: 10 },
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

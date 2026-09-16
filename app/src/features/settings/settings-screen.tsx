import { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { ChevronRight, RefreshCw, Trash2 } from 'lucide-react-native';
import { LOCALES, localeLabel, type Locale } from '@task-manager/shared';
import { OptionField, type Option, type OptionFieldHandle } from '../../components/option-field';
import { api, type McpTokenMetadata } from '../../lib/api';
import { useIntlTag, useT } from '../../lib/i18n';
import { useLocaleStore } from '../../store/locale';
import { API_URL } from '../../lib/config';
import { useRefreshOnFocus } from '../../lib/use-refresh-on-focus';
import { colors, headerDate, monoFont, webInputReset, WIDE_BREAKPOINT } from '../../theme';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { WideSidebar } from '../nav/wide-sidebar';

const isWeb = process.env.EXPO_OS === 'web';
const isIOS = process.env.EXPO_OS === 'ios';

export function SettingsScreen() {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const sections = (
    <>
      <LanguageSection />
      <NotificationsSection />
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
        <WideSidebar />
        <View style={[styles.wideMain, { paddingTop: insets.top + 24 }]}>
          <Text style={styles.wideTitle}>{tr('settings.title')}</Text>
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
          <Text style={styles.mobileTitle}>{tr('settings.title')}</Text>
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

const LANGUAGE_OPTIONS: Option<Locale>[] = LOCALES.map((l) => ({
  value: l,
  label: localeLabel(l),
}));

function LanguageSection() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const ref = useRef<OptionFieldHandle>(null);
  return (
    <View style={styles.mt28}>
      <SectionLabel>{t('settings.language.section')}</SectionLabel>
      <View style={styles.accountCard}>
        <Pressable
          onPress={() => ref.current?.open()}
          accessibilityRole="button"
          style={styles.notifRow}
        >
          <View style={styles.flex1}>
            <Text style={styles.notifTitle}>{t('settings.language.title')}</Text>
            <Text style={styles.notifSubtitle}>{t('settings.language.subtitle')}</Text>
          </View>
          <OptionField
            ref={ref}
            value={locale}
            options={LANGUAGE_OPTIONS}
            onChange={(l) => void setLocale(l)}
          />
        </Pressable>
      </View>
    </View>
  );
}

function NotificationsSection() {
  const tr = useT();
  // null until the server answers. No switch is rendered before then: any value
  // it could show — on or off — would be a claim about the account that was
  // never read, and the account default is ON, so an "off" placeholder is the
  // worst of the two.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    // Re-armed on every mount, not just initialised once: React can run
    // mount → cleanup → mount on the same fiber (StrictMode, Fast Refresh),
    // and a ref survives that. Setting it only at declaration would leave it
    // false after the second mount, so every load would bail and no switch
    // would ever render.
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    void api
      .getSettings()
      .then((s) => {
        if (!alive.current) return;
        setEnabled(s.notificationsEnabled);
        useLocaleStore.getState().adoptServerLocale(s.language);
        setFailed(false);
      })
      .catch(() => {
        if (alive.current) setFailed(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The tab keeps this screen mounted, so the mount effect never runs again.
  // Without this a single transient failure would strand the row — no switch,
  // no way back — until the whole app was reloaded.
  useRefreshOnFocus(load);

  const onToggle = (next: boolean) => {
    setEnabled(next);
    void api.updateSettings({ notificationsEnabled: next }).catch(() => {
      // The server is the source of truth; put the switch back rather than
      // leaving it showing a setting that was never saved.
      setEnabled(!next);
    });
  };

  return (
    <View style={styles.mt28}>
      <SectionLabel>{tr('settings.notifications.section')}</SectionLabel>
      <View style={styles.accountCard}>
        <View style={styles.notifRow}>
          <View style={styles.flex1}>
            <Text style={styles.notifTitle}>{tr('settings.notifications.title')}</Text>
            <Text style={styles.notifSubtitle}>
              {/* Only when there is no switch to look at. A failed *refresh*
                  after a good load leaves the last known value on screen and
                  still operable, so an error line there would contradict a
                  control that works. */}
              {failed && enabled === null
                ? tr('settings.notifications.loadFailed')
                : tr('settings.notifications.subtitle')}
            </Text>
          </View>
          {enabled === null ? null : (
            <Switch
              value={enabled}
              onValueChange={onToggle}
              trackColor={{ false: colors.bgElevated, true: colors.accentPrimary }}
              thumbColor={colors.textPrimary}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function AccountSection() {
  const tr = useT();
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
      <SectionLabel>{tr('settings.account.section')}</SectionLabel>
      <View style={styles.accountCard}>
        {email ? (
          <>
            <View style={styles.accountEmailRow}>
              <Text style={styles.accountEmailLabel}>{tr('settings.account.signedInAs')}</Text>
              <Text numberOfLines={1} style={styles.accountEmail}>
                {email}
              </Text>
            </View>
            <View style={styles.accountDivider} />
          </>
        ) : null}
        <Pressable onPress={signOut} style={styles.accountSignOutRow}>
          <Text style={styles.accountSignOutText}>{tr('settings.account.signOut')}</Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </Pressable>
        <View style={styles.accountDivider} />
        <Pressable onPress={signOutEverywhere} style={styles.accountSignOutRow}>
          <Text style={styles.accountSignOutText}>{tr('settings.account.signOutAll')}</Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

function formatStamp(iso: string, intlTag: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(intlTag);
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
  const tr = useT();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.howBlock}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.howToggle}>
        <ChevronRight size={14} color={colors.textFaint} />
        <Text style={styles.howToggleText}>{tr('settings.mcp.howToConnect')}</Text>
      </Pressable>

      {open ? (
        <View style={styles.howBody}>
          <Text style={styles.howLabel}>Claude (claude.ai)</Text>
          <Text style={styles.howStep}>{tr('settings.mcp.howClaudeStep')}</Text>

          <Text style={styles.howLabel}>Claude Code</Text>
          <Text selectable style={styles.howStep}>
            claude mcp add --transport http task-tracker {MCP_URL}
          </Text>

          <Text style={styles.howLabel}>ChatGPT</Text>
          <Text style={styles.howStep}>{tr('settings.mcp.howChatGptStep')}</Text>

          <Text style={styles.howNote}>{tr('settings.mcp.howNote')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function McpTokenSection() {
  const tr = useT();
  const intlTag = useIntlTag();
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
      setNote(tr('settings.mcp.sent'));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('settings.mcp.issueFailed'));
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
      setNote(tr('settings.mcp.revoked'));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('settings.mcp.revokeFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.mt28}>
      <SectionLabel>{tr('settings.mcp.section')}</SectionLabel>
      <View style={styles.accountCard}>
        <View style={styles.mcpBody}>
          <Text style={styles.mcpBlurb}>{tr('settings.mcp.blurb')}</Text>

          {!loaded ? (
            <ActivityIndicator color={colors.textFaint} />
          ) : meta ? (
            <>
              <Text style={styles.mcpMeta}>
                {tr('settings.mcp.created', { date: formatStamp(meta.createdAt, intlTag) })}
              </Text>
              <Text style={styles.mcpMeta}>
                {meta.lastUsedAt
                  ? tr('settings.mcp.lastUsed', { date: formatStamp(meta.lastUsedAt, intlTag) })
                  : tr('settings.mcp.neverUsed')}
              </Text>
            </>
          ) : (
            <Text style={styles.mcpMeta}>{tr('settings.mcp.noToken')}</Text>
          )}

          {note ? <Text style={styles.mcpNote}>{note}</Text> : null}
          {error ? <Text style={styles.mcpError}>{error}</Text> : null}

          <View style={styles.mcpButtons}>
            <Pressable onPress={issue} disabled={busy} style={styles.mcpPrimaryBtn}>
              <RefreshCw size={13} color={colors.bgSurface} />
              <Text style={styles.mcpPrimaryBtnText}>
                {meta ? tr('settings.mcp.regenerate') : tr('settings.mcp.issue')}
              </Text>
            </Pressable>
            {meta ? (
              <Pressable onPress={revoke} disabled={busy} style={styles.mcpRevokeBtn}>
                <Text style={styles.mcpRevokeBtnText}>{tr('settings.mcp.revoke')}</Text>
              </Pressable>
            ) : null}
          </View>

          {meta ? <Text style={styles.mcpWarn}>{tr('settings.mcp.regenerateWarning')}</Text> : null}

          <HowToConnect />
        </View>
      </View>
    </View>
  );
}

function DangerSection() {
  const tr = useT();
  const [modal, setModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  return (
    <View style={styles.mt28}>
      <SectionLabel>{tr('settings.danger.section')}</SectionLabel>
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>{tr('settings.danger.resetTitle')}</Text>
        <Text style={styles.dangerText}>{tr('settings.danger.resetText')}</Text>
        <Pressable onPress={() => setModal(true)} style={styles.dangerBtn}>
          <Trash2 size={13} color={colors.accentNow} />
          <Text style={styles.dangerBtnText}>{tr('settings.danger.resetButton')}</Text>
        </Pressable>
      </View>
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>{tr('settings.danger.deleteTitle')}</Text>
        <Text style={styles.dangerText}>{tr('settings.danger.deleteText')}</Text>
        <Pressable onPress={() => setDeleteModal(true)} style={styles.dangerBtn}>
          <Trash2 size={13} color={colors.accentNow} />
          <Text style={styles.dangerBtnText}>{tr('settings.danger.deleteButton')}</Text>
        </Pressable>
      </View>
      {modal ? <ResetModal onClose={() => setModal(false)} /> : null}
      {deleteModal ? <DeleteAccountModal onClose={() => setDeleteModal(false)} /> : null}
    </View>
  );
}

// Same type-to-confirm friction as the reset flow, with a harsher word and a
// harsher outcome: this one ends the account, not just its contents.
function ConfirmHint({ body, word }: { body: string; word: string }) {
  const tr = useT();
  const [before, after] = tr('settings.danger.typeToConfirm').split('{word}');
  return (
    <Text style={styles.resetBody}>
      {body} {before}
      <Text style={styles.resetBodyEmphasis}>{word}</Text>
      {after}
    </Text>
  );
}

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const tr = useT();
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
      setError(e instanceof Error ? e.message : tr('settings.danger.deleteFailed'));
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.flex1}>
        <Pressable onPress={onClose} style={styles.resetOverlay}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.resetCard}>
            <Text style={styles.resetTitle}>{tr('settings.danger.deleteTitle')}</Text>
            <ConfirmHint body={tr('settings.danger.deleteModalBody')} word="DELETE" />
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
                <Text style={styles.resetCancelText}>{tr('common.cancel')}</Text>
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
                    {tr('settings.danger.deleteTitle')}
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
  const tr = useT();
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
      setError(e instanceof Error ? e.message : tr('settings.danger.resetFailed'));
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined} style={styles.flex1}>
        <Pressable onPress={onClose} style={styles.resetOverlay}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.resetCard}>
            <Text style={styles.resetTitle}>{tr('settings.danger.resetTitle')}</Text>
            <ConfirmHint body={tr('settings.danger.resetModalBody')} word="RESET" />
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
                <Text style={styles.resetCancelText}>{tr('common.cancel')}</Text>
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
                    {tr('settings.danger.resetConfirm')}
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
  const tr = useT();
  const intlTag = useIntlTag();
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
    ? lastCheckForUpdateTimeSinceRestart.toLocaleTimeString(intlTag, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <View style={styles.mt28}>
      <SectionLabel>{tr('settings.updates.section')}</SectionLabel>
      <View style={styles.accountCard}>
        {!Updates.isEnabled ? (
          <Text style={styles.updatesNote}>{tr('settings.updates.disabled')}</Text>
        ) : (
          <>
            <DiagRow
              label={tr('settings.updates.running')}
              value={
                r.isEmbeddedLaunch ? tr('settings.updates.embedded') : tr('settings.updates.ota')
              }
            />
            <DiagRow label={tr('settings.updates.channel')} value={r.channel ?? '—'} />
            <DiagRow label={tr('settings.updates.runtime')} value={r.runtimeVersion ?? '—'} mono />
            <DiagRow
              label={tr('settings.updates.updateId')}
              value={r.updateId ? r.updateId.slice(0, 8) : '—'}
              mono
            />
            {lastChecked ? (
              <DiagRow label={tr('settings.updates.lastChecked')} value={lastChecked} />
            ) : null}
            {isUpdatePending ? (
              <Pressable onPress={apply} disabled={isRestarting} style={styles.updatesApplyRow}>
                <RefreshCw size={15} color={colors.bgBase} />
                <Text style={styles.updatesApplyText}>
                  {isRestarting
                    ? tr('settings.updates.restarting')
                    : tr('settings.updates.readyRestart')}
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={check} disabled={busy} style={styles.updatesCheckRow}>
                <Text style={styles.updatesCheckText}>
                  {busy ? tr('settings.updates.checking') : tr('settings.updates.check')}
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
  flex1: { flex: 1 },
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
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notifTitle: { fontSize: 13, color: colors.textPrimary },
  notifSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
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
  howBlock: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 10,
  },
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

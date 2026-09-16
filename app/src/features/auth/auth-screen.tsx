import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useT, type T } from '../../lib/i18n';
import { colors, monoFont, webInputReset } from '../../theme';
import { useAuthStore } from '../../store/auth';

const msg = (e: unknown, tr: T) => (e instanceof Error ? e.message : tr('common.error'));

export function AuthScreen() {
  const tr = useT();
  const requestLink = useAuthStore((s) => s.requestLink);
  const signInWithToken = useAuthStore((s) => s.signInWithToken);

  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestLink(email.trim());
      setSent(true);
    } catch (e) {
      setError(msg(e, tr));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithToken(token.trim());
    } catch (e) {
      setError(msg(e, tr));
    } finally {
      setBusy(false);
    }
  };

  const sendOpacity = busy ? 0.6 : 1;
  const verifyOpacity = busy || !token.trim() ? 0.6 : 1;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>TASK TRACKER</Text>
        <Text style={styles.subtitle}>{tr('auth.subtitle')}</Text>
        <Text style={styles.hint}>{tr('auth.hint')}</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={tr('auth.emailPlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          inputMode="email"
          textContentType="emailAddress"
          autoComplete="email"
          style={[styles.input, webInputReset]}
        />
        <Pressable
          onPress={send}
          disabled={busy}
          style={[styles.sendBtn, { opacity: sendOpacity }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.bgSurface} />
          ) : (
            <Text style={styles.sendLabel}>{tr('auth.sendCode')}</Text>
          )}
        </Pressable>

        {sent ? (
          <>
            <Text style={styles.sentInfo}>{tr('auth.sentInfo')}</Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              placeholder={tr('auth.codePlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              style={[styles.input, webInputReset]}
            />
            <Pressable
              onPress={verify}
              disabled={busy || !token.trim()}
              style={[styles.verifyBtn, { opacity: verifyOpacity }]}
            >
              <Text style={styles.verifyLabel}>{tr('auth.signIn')}</Text>
            </Pressable>
          </>
        ) : null}

        {error ? (
          <Text selectable style={styles.errorText}>
            {error}
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderCurve: 'continuous',
    padding: 32,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.bgCard,
    gap: 14,
  },
  brand: {
    fontFamily: monoFont,
    fontSize: 16,
    letterSpacing: 3,
    textAlign: 'center',
    color: colors.accentPrimary,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sendBtn: {
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
  },
  sendLabel: { fontSize: 14, fontWeight: '600', color: colors.bgSurface },
  sentInfo: { fontSize: 12, textAlign: 'center', color: colors.textMuted },
  verifyBtn: {
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
  },
  verifyLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  errorText: { fontSize: 12, textAlign: 'center', color: colors.accentNow },
});

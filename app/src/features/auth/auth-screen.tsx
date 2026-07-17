import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { colors, monoFont, webInputReset } from '../../theme';
import { useAuthStore } from '../../store/auth';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

const inputStyle = {
  borderRadius: 12,
  borderCurve: 'continuous' as const,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 14,
  color: colors.textPrimary,
  backgroundColor: colors.bgCard,
  borderWidth: 1,
  borderColor: colors.borderSubtle,
  ...webInputReset,
};

export function AuthScreen() {
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
      setError(msg(e));
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
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 20,
          borderCurve: 'continuous',
          padding: 32,
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.bgCard,
          gap: 14,
        }}
      >
        <Text style={{ fontFamily: monoFont, fontSize: 16, letterSpacing: 6, textAlign: 'center', color: colors.accentPrimary }}>
          LOG
        </Text>
        <Text style={{ fontSize: 13, textAlign: 'center', color: colors.textSecondary, marginBottom: 4 }}>
          Sign in with a magic link
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          inputMode="email"
          style={inputStyle}
        />
        <Pressable
          onPress={send}
          disabled={busy}
          style={{ borderRadius: 12, borderCurve: 'continuous', paddingVertical: 12, alignItems: 'center', backgroundColor: colors.accentPrimary, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? <ActivityIndicator color={colors.bgSurface} /> : <Text style={{ fontSize: 14, fontWeight: '600', color: colors.bgSurface }}>Send magic link</Text>}
        </Pressable>

        {sent ? (
          <>
            <Text style={{ fontSize: 12, textAlign: 'center', color: colors.textMuted }}>
              Link sent. Open it, or paste the token below (in dev it's printed to the server console).
            </Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              placeholder="Paste sign-in token"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              style={inputStyle}
            />
            <Pressable
              onPress={verify}
              disabled={busy || !token.trim()}
              style={{ borderRadius: 12, borderCurve: 'continuous', paddingVertical: 12, alignItems: 'center', backgroundColor: colors.bgElevated, opacity: busy || !token.trim() ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Sign in</Text>
            </Pressable>
          </>
        ) : null}

        {error ? <Text selectable style={{ fontSize: 12, textAlign: 'center', color: colors.accentNow }}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

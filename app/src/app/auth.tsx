import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../store/auth';
import { colors } from '../theme';

// Handles the magic-link deep link: APP_URL/auth?token=...
export default function AuthCallback() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) {
        router.replace('/');
        return;
      }
      try {
        await useAuthStore.getState().signInWithToken(token);
        router.replace('/');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed');
      }
    })();
  }, [token]);

  return (
    <View style={styles.root}>
      {error ? (
        <Text selectable style={styles.error}>
          {error}
        </Text>
      ) : (
        <ActivityIndicator color={colors.accentPrimary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  error: { color: colors.accentNow },
});

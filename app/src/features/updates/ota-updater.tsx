import { useCallback, useEffect } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw } from 'lucide-react-native';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { colors, monoFont } from '../../theme';

export function OtaUpdater() {
  const insets = useSafeAreaInsets();
  const { isUpdateAvailable, isUpdatePending, isDownloading, isRestarting, downloadProgress } =
    useUpdates();

  useEffect(() => {
    if (!Updates.isEnabled) return;
    const check = () => {
      Updates.checkForUpdateAsync().catch(() => {});
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isUpdateAvailable && !isDownloading && !isUpdatePending) {
      Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [isUpdateAvailable, isDownloading, isUpdatePending]);

  const apply = useCallback(() => {
    Updates.reloadAsync().catch(() => {});
  }, []);

  if (!Updates.isEnabled) return null;
  if (!isDownloading && !isUpdatePending) return null;

  const pct = downloadProgress != null ? Math.round(downloadProgress * 100) : null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      {isUpdatePending ? (
        <Pressable onPress={apply} disabled={isRestarting} style={styles.ready}>
          <RefreshCw size={14} color={colors.bgBase} />
          <Text style={styles.readyText}>
            {isRestarting ? 'Restarting…' : 'Update ready — tap to restart'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.downloading}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={styles.downloadingText}>
            {pct != null ? `Downloading update… ${pct}%` : 'Downloading update…'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  ready: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
  },
  readyText: { fontSize: 13, fontWeight: '600', color: colors.bgBase },
  downloading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  downloadingText: { fontSize: 12, color: colors.textSecondary, fontFamily: monoFont },
});

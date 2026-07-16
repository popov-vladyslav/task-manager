import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../store/auth';
import { AuthScreen } from '../features/auth/auth-screen';
import { TasksScreen } from '../features/tasks/tasks-screen';
import { registerForPush } from '../lib/push';
import { colors } from '../theme';

export default function Index() {
  const ready = useAuthStore((s) => s.ready);
  const jwt = useAuthStore((s) => s.jwt);
  const load = useAuthStore((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  // Register this device for reminder push notifications once signed in.
  useEffect(() => {
    if (jwt) registerForPush();
  }, [jwt]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  return jwt ? <TasksScreen /> : <AuthScreen />;
}

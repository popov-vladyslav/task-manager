import { Redirect } from 'expo-router';
import { useAuthStore } from '../store/auth';
import { AuthScreen } from '../features/auth/auth-screen';

// The sign-in screen (magic-link request). Once authenticated, bounce to the app.
// The magic-link callback itself is handled by the separate /auth route.
export default function SignIn() {
  const jwt = useAuthStore((s) => s.jwt);
  if (jwt) return <Redirect href="/" />;
  return <AuthScreen />;
}

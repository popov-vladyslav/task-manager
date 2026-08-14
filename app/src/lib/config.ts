// API base URL. Reads EXPO_PUBLIC_API_URL (inlined into the bundle at build time).
// Defaults to localhost so a fresh clone / local dev without a .env can't
// accidentally hit prod. For a physical device set it to your machine's LAN IP,
// e.g. http://192.168.1.20:4000.
const configured = process.env.EXPO_PUBLIC_API_URL;

// A release build must never take that default: an unset value means the EAS
// environment for this profile is missing the variable, and the app would ship
// pointing at nothing. Fail loudly rather than shipping a silent dud.
if (!configured && process.env.NODE_ENV === 'production') {
  throw new Error(
    'EXPO_PUBLIC_API_URL is unset in a production build. Set it on the EAS environment for this build profile.',
  );
}

export const API_URL = configured ?? 'http://localhost:4000';

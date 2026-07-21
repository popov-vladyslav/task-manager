// API base URL. Reads EXPO_PUBLIC_API_URL (inlined into the bundle at build time).
// Defaults to localhost so a fresh clone / local dev without a .env can't
// accidentally hit prod — prod builds always set EXPO_PUBLIC_API_URL (Render env /
// eas.json → https://api.task-tracker.net). For a physical device set it to your
// machine's LAN IP, e.g. http://192.168.1.20:4000.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

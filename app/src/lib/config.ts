// API base URL. Defaults to localhost for web/simulator dev. For a physical
// device (Expo Go), set EXPO_PUBLIC_API_URL to your machine's LAN IP, e.g.
// EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

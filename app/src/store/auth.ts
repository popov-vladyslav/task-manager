import { Platform } from 'react-native';
import { create } from 'zustand';
import type { AuthTokens } from '@task-manager/shared';
import { API_URL } from '../lib/config';
import { storage } from '../lib/storage';

const JWT_KEY = 'log.jwt';
const REFRESH_KEY = 'log.refresh';

interface AuthState {
  jwt: string | null;
  refresh: string | null;
  ready: boolean; // finished loading persisted tokens
  load: () => Promise<void>;
  requestLink: (email: string) => Promise<void>;
  signInWithToken: (magicToken: string) => Promise<void>;
  tryRefresh: () => Promise<boolean>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  jwt: null,
  refresh: null,
  ready: false,

  async load() {
    const [jwt, refresh] = await Promise.all([storage.get(JWT_KEY), storage.get(REFRESH_KEY)]);
    set({ jwt, refresh, ready: true });
  },

  async requestLink(email: string) {
    // Tell the server which platform asked, so the emailed link opens here
    // (native → app deep link, web → web page).
    await post('/auth/magic-link', { email, platform: Platform.OS });
  },

  async signInWithToken(magicToken: string) {
    const { jwt, refresh } = await post<AuthTokens>('/auth/verify', { token: magicToken });
    await Promise.all([storage.set(JWT_KEY, jwt), storage.set(REFRESH_KEY, refresh)]);
    set({ jwt, refresh });
  },

  // The server ROTATES on refresh: the token we just sent is now dead and the
  // response carries its replacement. Persisting the new one is not optional —
  // keeping the old value would sign the device out at the next refresh.
  async tryRefresh() {
    const current = get().refresh;
    if (!current) return false;
    try {
      const { jwt, refresh } = await post<AuthTokens>('/auth/refresh', { refresh: current });
      await Promise.all([storage.set(JWT_KEY, jwt), storage.set(REFRESH_KEY, refresh)]);
      set({ jwt, refresh });
      return true;
    } catch {
      return false;
    }
  },

  // Ends this device's session on the server too, so the refresh token row is
  // gone rather than merely forgotten locally. Local state is cleared either
  // way — a failed request must never leave the app stuck signed in.
  async signOut() {
    const refresh = get().refresh;
    try {
      if (refresh) await post('/auth/signout', { refresh });
    } catch {
      /* best effort */
    }
    await Promise.all([storage.remove(JWT_KEY), storage.remove(REFRESH_KEY)]);
    set({ jwt: null, refresh: null });
  },

  // Revokes every device's refresh token. Access tokens already issued remain
  // valid for their short lifetime, which is why that TTL is 15 minutes.
  async signOutEverywhere() {
    const jwt = get().jwt;
    try {
      if (jwt) {
        await fetch(`${API_URL}/auth/signout-all`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        });
      }
    } catch {
      /* best effort */
    }
    await get().signOut();
  },
}));

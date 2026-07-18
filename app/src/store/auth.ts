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

  async tryRefresh() {
    const refresh = get().refresh;
    if (!refresh) return false;
    try {
      const { jwt } = await post<{ jwt: string }>('/auth/refresh', { refresh });
      await storage.set(JWT_KEY, jwt);
      set({ jwt });
      return true;
    } catch {
      return false;
    }
  },

  async signOut() {
    await Promise.all([storage.remove(JWT_KEY), storage.remove(REFRESH_KEY)]);
    set({ jwt: null, refresh: null });
  },
}));

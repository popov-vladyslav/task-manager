import { Platform } from 'react-native';
import { create } from 'zustand';
import type { AuthTokens } from '@task-manager/shared';
import { API_URL } from '../lib/config';
import { storage } from '../lib/storage';

const JWT_KEY = 'log.jwt';
const REFRESH_KEY = 'log.refresh';

export type RefreshResult = 'ok' | 'expired' | 'transient';

interface AuthState {
  jwt: string | null;
  refresh: string | null;
  ready: boolean; // finished loading persisted tokens
  load: () => Promise<void>;
  requestLink: (email: string) => Promise<void>;
  signInWithToken: (magicToken: string) => Promise<void>;
  /**
   * 'ok'        — a fresh access token is in place
   * 'expired'   — the server rejected the session; sign out
   * 'transient' — offline / server hiccup; KEEP the session and retry later
   */
  tryRefresh: () => Promise<RefreshResult>;
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

// Refresh is SINGLE-FLIGHT: concurrent callers share one request, so an expired
// access token produces one refresh rather than one per in-flight endpoint.
let inFlightRefresh: Promise<RefreshResult> | null = null;

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
  // Signing out is a DECISION, never an accident: only an explicit rejection
  // from the server ends the session. Being offline, a 5xx, or a dropped
  // connection leaves the user signed in to try again — sessions are meant to
  // last indefinitely for anyone who keeps using the app.
  async tryRefresh() {
    if (inFlightRefresh) return inFlightRefresh;

    const current = get().refresh;
    if (!current) return 'expired';

    inFlightRefresh = (async (): Promise<RefreshResult> => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: current }),
        });

        if (res.status === 401) return 'expired'; // the server disowned this session
        if (!res.ok) return 'transient'; // 5xx, proxy error, rate limit…

        const { jwt, refresh } = (await res.json()) as AuthTokens;
        await Promise.all([storage.set(JWT_KEY, jwt), storage.set(REFRESH_KEY, refresh)]);
        set({ jwt, refresh });
        return 'ok';
      } catch {
        return 'transient'; // network down, DNS, timeout
      } finally {
        // Cleared only after state is written, so a caller awaiting this promise
        // always reads the NEW access token when it retries.
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
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

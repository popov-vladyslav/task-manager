import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { db } from '../db/client';
import { oauthClients } from '../db/schema';
import { env } from '../env';

const ACCESS_TTL_SEC = 60 * 60; // 1 hour
const REFRESH_TTL_SEC = 90 * 24 * 60 * 60; // 90 days
const CODE_TTL_MS = 60_000; // 1 min
const PENDING_TTL_MS = 5 * 60_000; // 5 min to approve

interface Pending {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes?: string[];
  exp: number;
}
interface CodeRec {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes?: string[];
  exp: number;
}

// Short-lived, single-process artifacts (used within seconds). Clients (DCR) and
// tokens (JWT) are durable; codes/pending don't need to survive a restart.
const pending = new Map<string, Pending>();
const codes = new Map<string, CodeRec>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.exp < now) pending.delete(k);
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k);
}

const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
    return row ? (row.data as OAuthClientInformationFull) : undefined;
  },
  async registerClient(client) {
    // The register handler has already generated client_id/secret.
    const full = client as OAuthClientInformationFull;
    await db
      .insert(oauthClients)
      .values({ clientId: full.client_id, data: full })
      .onConflictDoNothing({ target: oauthClients.clientId });
    return full;
  },
};

function issueTokens(clientId: string, scopes: string[]): OAuthTokens {
  const scope = scopes.join(' ');
  const access = jwt.sign(
    { sub: env.OWNER_EMAIL, typ: 'mcp_access', cid: clientId, scope },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TTL_SEC },
  );
  const refresh = jwt.sign({ sub: env.OWNER_EMAIL, typ: 'mcp_refresh', cid: clientId }, env.JWT_SECRET, {
    expiresIn: REFRESH_TTL_SEC,
  });
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: ACCESS_TTL_SEC,
    refresh_token: refresh,
    scope,
  };
}

function approvalPage(pendingId: string, error?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Authorize Log</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0E13;color:#EDEFF3;font-family:-apple-system,system-ui,sans-serif}
  .card{width:100%;max-width:360px;padding:32px;background:#14181F;border:1px solid #1C222C;border-radius:20px}
  h1{font-size:14px;letter-spacing:.4em;text-align:center;color:#E8A33D;margin:0 0 6px}
  p{font-size:13px;color:#8B93A3;text-align:center;margin:0 0 18px}
  input{width:100%;box-sizing:border-box;padding:12px 14px;font-size:14px;color:#EDEFF3;background:#1C222C;border:1px solid #262D39;border-radius:12px;outline:none}
  button{width:100%;margin-top:12px;padding:12px;font-size:14px;font-weight:600;color:#14181F;background:#E8A33D;border:none;border-radius:12px;cursor:pointer}
  .err{color:#D9668B;font-size:12px;text-align:center;margin-top:12px}
</style></head><body>
<form class="card" method="post" action="/oauth/approve">
  <h1>LOG</h1>
  <p>Authorize this Claude connector to access your tasks.</p>
  <input type="hidden" name="pending" value="${pendingId}">
  <input type="password" name="secret" placeholder="Enter your MCP token" autofocus autocomplete="off">
  <button type="submit">Authorize</button>
  ${error ? `<div class="err">${error}</div>` : ''}
</form></body></html>`;
}

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  // Render an owner-gated approval page instead of auto-issuing a code.
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    sweep();
    const pendingId = crypto.randomBytes(24).toString('base64url');
    pending.set(pendingId, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes,
      exp: Date.now() + PENDING_TTL_MS,
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(approvalPage(pendingId));
  },

  async challengeForAuthorizationCode(_client, authorizationCode) {
    const rec = codes.get(authorizationCode);
    if (!rec) throw new InvalidGrantError('Invalid authorization code');
    return rec.codeChallenge;
  },

  // PKCE is validated by the SDK before this is called.
  async exchangeAuthorizationCode(client, authorizationCode, _verifier, redirectUri) {
    const rec = codes.get(authorizationCode);
    if (!rec || rec.exp < Date.now()) throw new InvalidGrantError('Invalid or expired code');
    if (rec.clientId !== client.client_id) throw new InvalidGrantError('Code was issued to another client');
    if (redirectUri && rec.redirectUri !== redirectUri) throw new InvalidGrantError('redirect_uri mismatch');
    codes.delete(authorizationCode); // single use
    return issueTokens(client.client_id, rec.scopes ?? []);
  },

  async exchangeRefreshToken(client, refreshToken, scopes) {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw new InvalidGrantError('Invalid refresh token');
    }
    if (payload.typ !== 'mcp_refresh' || payload.cid !== client.client_id) {
      throw new InvalidGrantError('Invalid refresh token');
    }
    return issueTokens(client.client_id, scopes ?? []);
  },

  async verifyAccessToken(token): Promise<AuthInfo> {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw new InvalidTokenError('Invalid access token');
    }
    if (payload.typ !== 'mcp_access') throw new InvalidTokenError('Wrong token type');
    const scope = typeof payload.scope === 'string' ? payload.scope : '';
    return {
      token,
      clientId: String(payload.cid ?? ''),
      scopes: scope ? scope.split(' ').filter(Boolean) : [],
      expiresAt: payload.exp,
      extra: { sub: payload.sub },
    };
  },
};

// POST /oauth/approve — owner enters the MCP token; we mint a code and redirect to Claude.
export function approveHandler(req: Request, res: Response) {
  sweep();
  const pendingId = String((req.body as Record<string, unknown>)?.pending ?? '');
  const secret = String((req.body as Record<string, unknown>)?.secret ?? '');
  const p = pending.get(pendingId);
  res.setHeader('Content-Type', 'text/html');

  if (!p || p.exp < Date.now()) {
    res.status(400).send(approvalPage(pendingId, 'Session expired — restart from Claude.'));
    return;
  }
  if (!env.MCP_TOKEN || secret !== env.MCP_TOKEN) {
    res.status(401).send(approvalPage(pendingId, 'Incorrect token.'));
    return;
  }

  pending.delete(pendingId);
  const code = crypto.randomBytes(24).toString('base64url');
  codes.set(code, {
    clientId: p.clientId,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    scopes: p.scopes,
    exp: Date.now() + CODE_TTL_MS,
  });

  const url = new URL(p.redirectUri);
  url.searchParams.set('code', code);
  if (p.state) url.searchParams.set('state', p.state);
  res.redirect(url.href);
}

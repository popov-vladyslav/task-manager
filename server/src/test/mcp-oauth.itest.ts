// The claude.ai connector's real path in: dynamic client registration, an
// owner-gated /authorize page, PKCE, and a code exchanged for JWTs. The grant
// hangs off one personal MCP token, so it must be per-user and must die the
// moment that token is revoked.
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closePool, mcpCall, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { loginCodes, users } from '../db/schema';
import { hashToken } from '../lib/tokens';

const REDIRECT_URI = 'https://example.test/cb';
const verifier = 'a'.repeat(64);

let server: TestServer;

interface Account {
  id: string;
  headers: Record<string, string>;
  mcpToken: string;
}

let alice: Account;
let bob: Account;
let clientId: string;
let clientSecret: string | undefined;
let accessToken: string;
let refreshToken: string;

async function signUp(email: string): Promise<Account> {
  const code = `code-${email}`;
  await db.insert(loginCodes).values({
    tokenHash: hashToken(code),
    email,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const verified = await fetch(`${server.baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: code }),
  });
  const { jwt } = (await verified.json()) as { jwt: string };
  const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));

  // The token exists only in the delivery channel; with mail disabled it is logged.
  const chunks: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '));
  };
  try {
    await fetch(`${server.baseUrl}/api/mcp-token`, { method: 'POST', headers });
  } finally {
    console.log = original;
  }
  const line = chunks.find((c) => c.includes('token:'));
  assert.ok(line, 'an MCP token should have been issued');

  return { id: row.id, headers, mcpToken: line.split('token:')[1].trim() };
}

// Steps 3–4 of the flow: open the approval page, then post the personal token.
// Returns the raw approve response so callers can inspect a rejection too.
async function approve(secret: string): Promise<{ status: number; location: string | null }> {
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const authorizeUrl =
    `${server.baseUrl}/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  const page = await fetch(authorizeUrl);
  assert.equal(page.status, 200, 'the approval page should render');
  const html = await page.text();
  const pendingId = /name="pending" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(pendingId, `no pending id in the approval page: ${html.slice(0, 300)}`);

  const res = await fetch(`${server.baseUrl}/oauth/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pending: pendingId, secret }).toString(),
    redirect: 'manual',
  });
  // Drain the body so the socket is released.
  await res.text();
  return { status: res.status, location: res.headers.get('location') };
}

before(async () => {
  await resetDb();
  server = await startTestServer();
  alice = await signUp('mcp-oauth-a@example.test');
  bob = await signUp('mcp-oauth-b@example.test');

  await mcpCall(server.baseUrl, bob.mcpToken, 'create_task', { title: 'bob oauth task' });
  await mcpCall(server.baseUrl, alice.mcpToken, 'create_task', { title: 'alice oauth task' });

  // 1. Dynamic client registration.
  const reg = await fetch(`${server.baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'test', redirect_uris: [REDIRECT_URI] }),
  });
  assert.equal(reg.status, 201, `registration failed: ${await reg.clone().text()}`);
  const client = (await reg.json()) as { client_id: string; client_secret?: string };
  clientId = client.client_id;
  // Registration without an explicit auth method yields a confidential client,
  // so /token requires the secret back.
  clientSecret = client.client_secret;
  assert.ok(clientId, 'registration should return a client_id');

  // 2–4. PKCE + approval with Bob's personal token.
  const approved = await approve(bob.mcpToken);
  assert.equal(approved.status, 302, 'approval should redirect back to the client');
  assert.ok(approved.location, 'approval should set a location header');
  const code = new URL(approved.location).searchParams.get('code');
  assert.ok(code, `no code in the redirect: ${approved.location}`);

  // 5. Code -> tokens.
  const tokenRes = await fetch(`${server.baseUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    }).toString(),
  });
  assert.equal(tokenRes.status, 200, `token exchange failed: ${await tokenRes.clone().text()}`);
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string };
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  assert.ok(accessToken, 'expected an access_token');
  assert.ok(refreshToken, 'expected a refresh_token');
});

after(async () => {
  await server.close();
  await closePool();
});

test('the OAuth grant is scoped to the account that approved it', async () => {
  const res = await mcpCall(server.baseUrl, accessToken, 'list_tasks');
  assert.equal(res.status, 200, `expected an authenticated call, got: ${res.text.slice(0, 300)}`);
  assert.ok(res.text.includes('bob oauth task'), `Bob's own task is missing: ${res.text}`);
  assert.ok(
    !res.text.includes('alice oauth task'),
    `another account's task leaked through the grant: ${res.text}`,
  );
});

test('approving with the wrong secret issues no code', async () => {
  const rejected = await approve('not-a-real-mcp-token');
  assert.equal(rejected.status, 401);
  assert.equal(rejected.location, null, 'a rejected approval must not redirect');
});

test('revoking the personal token kills the access token immediately', async () => {
  const revoked = await fetch(`${server.baseUrl}/api/mcp-token`, {
    method: 'DELETE',
    headers: bob.headers,
  });
  assert.equal(revoked.status, 204);

  const res = await mcpCall(server.baseUrl, accessToken, 'list_tasks');
  assert.equal(res.status, 401, 'the grant must die with its token, not at JWT expiry');
});

test('the refresh token cannot resurrect a revoked grant', async () => {
  const res = await fetch(`${server.baseUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    }).toString(),
  });
  const body = await res.text();
  assert.ok(!res.ok, `refresh succeeded after revocation: ${res.status} ${body.slice(0, 300)}`);
});

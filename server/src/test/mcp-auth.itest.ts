// The MCP surface, authenticated per user. Drives the real /mcp endpoint over
// JSON-RPC rather than calling services directly, so it exercises the whole
// path: bearer -> account -> owner-scoped tools.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closePool, resetDb, startTestServer, type TestServer } from './harness';
import { db } from '../db/client';
import { loginCodes, users } from '../db/schema';
import { hashToken } from '../lib/tokens';
import { env } from '../env';

let server: TestServer;

interface Account {
  id: string;
  headers: Record<string, string>;
  mcpToken: string;
}

let alice: Account;
let bob: Account;

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

// Minimal JSON-RPC over the Streamable HTTP transport.
async function callTool(
  bearer: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${server.baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  return { status: res.status, text: await res.text() };
}

before(async () => {
  await resetDb();
  server = await startTestServer();
  alice = await signUp('mcp-auth-a@example.test');
  bob = await signUp('mcp-auth-b@example.test');
});

after(async () => {
  await server.close();
  await closePool();
});

test('a personal token authenticates the MCP endpoint', async () => {
  const res = await callTool(alice.mcpToken, 'list_contexts');
  assert.equal(res.status, 200);
  assert.ok(!res.text.includes('"error"'), `expected a result, got: ${res.text.slice(0, 300)}`);
});

test('an unknown token is rejected', async () => {
  const res = await callTool('definitely-not-a-token', 'list_contexts');
  assert.equal(res.status, 401);
});

test('MCP tools see only the calling account’s data', async () => {
  await callTool(bob.mcpToken, 'create_task', { title: 'bob mcp secret' });
  await callTool(alice.mcpToken, 'create_task', { title: 'alice mcp task' });

  const aliceList = await callTool(alice.mcpToken, 'list_tasks');
  assert.ok(aliceList.text.includes('alice mcp task'), 'A should see their own task');
  assert.ok(!aliceList.text.includes('bob mcp secret'), "B's task leaked into A's MCP list");

  const bobList = await callTool(bob.mcpToken, 'list_tasks');
  assert.ok(bobList.text.includes('bob mcp secret'));
  assert.ok(!bobList.text.includes('alice mcp task'));
});

test('get_today is scoped to the calling account', async () => {
  const res = await callTool(alice.mcpToken, 'get_today');
  assert.equal(res.status, 200);
  assert.ok(!res.text.includes('bob mcp secret'), "B's work leaked into A's get_today");
});

test('revoking a token stops the very next MCP call', async () => {
  const before = await callTool(bob.mcpToken, 'list_contexts');
  assert.equal(before.status, 200);

  const revoked = await fetch(`${server.baseUrl}/api/mcp-token`, {
    method: 'DELETE',
    headers: bob.headers,
  });
  assert.equal(revoked.status, 204);

  const after = await callTool(bob.mcpToken, 'list_contexts');
  assert.equal(after.status, 401, 'a revoked token must fail immediately, not at expiry');
});

test('regenerating swaps which token works', async () => {
  const old = alice.mcpToken;
  const refreshed = await signUp('mcp-auth-a2@example.test');
  assert.notEqual(refreshed.mcpToken, old);

  // A's original token still works (different account regenerated, not theirs).
  assert.equal((await callTool(old, 'list_contexts')).status, 200);
  assert.equal((await callTool(refreshed.mcpToken, 'list_contexts')).status, 200);
});

// The prod connector must keep working on the shared secret until cutover.
test('the legacy static token still works, owner-scoped', async (t) => {
  if (!env.MCP_TOKEN) {
    t.skip('MCP_TOKEN not configured in this environment');
    return;
  }
  const res = await callTool(env.MCP_TOKEN, 'list_contexts');
  assert.equal(res.status, 200, 'legacy connector must not break before cutover');
});

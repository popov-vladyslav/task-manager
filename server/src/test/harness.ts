// Integration-test harness: a real Express app on an ephemeral port, talking to
// a scratch Neon branch that is dropped and migrated from zero on every run.
//
// './env-guard' must stay the FIRST import — it repoints DATABASE_URL before
// db/client.ts builds its pool. See the comment there.
import './env-guard';
import type { Server } from 'node:http';
import { pool } from '../db/client';
import { runMigrations } from '../db/migrations';
import { createApp } from '../app';

// Wipe the schema and rebuild it from the migration files. This doubles as the
// spec's fresh-DB "migrate from zero" check: it runs on every suite.
export async function resetDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await runMigrations(client, false);
  } finally {
    client.release();
  }
}

// Empty every table without re-running migrations — for isolation between tests
// in a suite that shares one migrated schema.
export async function truncateAll(): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_migrations'`,
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `public."${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

// Boots the real app on a random free port. No cron and no fixed port: listen()
// and startScheduler() live in index.ts, not createApp().
export async function startTestServer(): Promise<TestServer> {
  const server: Server = createApp().listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('test server did not bind a TCP port');
  }

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

export async function closePool(): Promise<void> {
  await pool.end();
}

/** JSON-RPC call against the real /mcp endpoint, as an MCP client would. */
export async function mcpCall(
  baseUrl: string,
  bearer: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${baseUrl}/mcp`, {
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

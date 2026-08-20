import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

// Single source of truth for env: the repo-root .env (two levels up from server/src).
config({ path: path.resolve(__dirname, '../../.env') });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  OWNER_EMAIL: z.email(),
  TZ: z.string().default('Europe/Warsaw'),
  // Deployment marker: 'prod' | 'stage' (unset locally).
  APP_ENV: z.string().optional(),
  PORT: z.coerce.number().default(4000),
  // Optional in dev — when absent, magic links are logged to the server console.
  RESEND_API_KEY: z.string().optional(),
  // Sender for outgoing mail, e.g. `task manager <noreply@task-tracker.net>`.
  // Must be an address on a domain verified in Resend. Unset falls back to
  // Resend's shared sandbox sender, which only delivers to the account owner's
  // own address — fine for local/stage, NOT viable once anyone can sign up.
  MAIL_FROM: z.string().optional(),
  // Bearer token for the MCP server (claude.ai connector). When unset, /mcp is disabled.
  MCP_TOKEN: z.string().min(16).optional(),
  // Public base URL of the Expo web app, used to build the magic-link target.
  APP_URL: z.string().default('http://localhost:8081'),
  // Native deep-link scheme this deployment's magic links point at. Per
  // deployment, because stage and production are separate apps: two installs
  // both claiming one scheme means the OS routes a stage sign-in link to
  // whichever it picks, possibly the production app.
  //
  // Derived from the bundle id, which is globally unique, so no other app can
  // register it. The previous generic `app://` was squattable and in practice a
  // magic link opened an unrelated application. Must stay in lockstep with
  // app.config.js, which sets the app's `scheme` to the same strings; stage
  // overrides this with `com.vladyslavpopovpl.app.stage`.
  APP_SCHEME: z.string().default('com.vladyslavpopovpl.app'),
  // Public base URL of THIS API (legacy). Kept only as a fallback for MCP_BASE_URL.
  PUBLIC_URL: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000'),
  // Public base URL the MCP server advertises — the OAuth issuer and the
  // `oauth-protected-resource` metadata / WWW-Authenticate challenge. Falls back to
  // PUBLIC_URL / RENDER_EXTERNAL_URL / localhost so existing deploys keep working.
  MCP_BASE_URL: z
    .string()
    .default(process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000'),
  // Browser origins allowed by CORS (comma-separated). The web app lives here;
  // the native app / MCP connector send no Origin and bypass CORS regardless.
  ALLOWED_ORIGINS: z
    .string()
    .default('https://task-tracker.net,https://log-web-6tzk.onrender.com,http://localhost:8081')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
});

export const env = schema.parse(process.env);

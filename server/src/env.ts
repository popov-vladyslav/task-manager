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
  PORT: z.coerce.number().default(4000),
  // Optional in dev — when absent, magic links are logged to the server console.
  RESEND_API_KEY: z.string().optional(),
  // Bearer token for the MCP server (claude.ai connector). When unset, /mcp is disabled.
  MCP_TOKEN: z.string().min(16).optional(),
  // Public base URL of the Expo web app, used to build the magic-link target.
  APP_URL: z.string().default('http://localhost:8081'),
  // Public base URL of THIS API (the OAuth issuer / MCP resource). On Render this
  // auto-uses RENDER_EXTERNAL_URL; set explicitly for an ngrok tunnel or custom host.
  PUBLIC_URL: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000'),
});

export const env = schema.parse(process.env);

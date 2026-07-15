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
  // Public base URL of the Expo web app, used to build the magic-link target.
  APP_URL: z.string().default('http://localhost:8081'),
});

export const env = schema.parse(process.env);

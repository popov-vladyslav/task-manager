import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env';
import * as schema from './schema';

// Long-running Express service -> a real TCP pool (Neon over the pooled URL).
// SSL is driven by `sslmode=require` in DATABASE_URL.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
});

export const db = drizzle(pool, { schema });

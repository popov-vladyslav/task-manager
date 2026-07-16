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

// A dropped idle connection (Neon scale-to-zero, DNS/network blip) makes `pg`
// emit 'error' on the idle client. With no listener, Node rethrows it as an
// uncaught exception and kills the process — so we log and let the pool discard
// the dead connection and reconnect on the next query.
pool.on('error', (err) => {
  console.error('[db] idle client error (recovered):', err.message);
});

export const db = drizzle(pool, { schema });

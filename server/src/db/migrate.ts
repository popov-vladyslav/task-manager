import { pool } from './client';
import { runMigrations } from './migrations';

// CLI entrypoint (npm run db:migrate, and Render's pre-deploy hook). The runner
// itself lives in migrations.ts so it can be reused without this side effect.
async function run() {
  const client = await pool.connect();
  try {
    await runMigrations(client);
    console.log('migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

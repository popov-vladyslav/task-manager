// Side-effect module: repoints DATABASE_URL at the scratch test branch, and
// refuses to run at all unless that is unambiguously safe.
//
// This MUST be imported before anything that reaches ../env — db/client.ts
// builds its pg Pool from env.DATABASE_URL at import time, and env.ts calls
// dotenv's config(), which does NOT overwrite a value already in process.env.
// Setting it here therefore wins over the repo-root .env. Import evaluation is
// source-ordered in both CJS and ESM, so `import './env-guard'` first is enough.
//
// The stakes: the harness issues DROP SCHEMA public CASCADE. Pointed at the
// wrong branch it would destroy real data, so the guard is deliberately noisy
// and fails closed.

import path from 'node:path';
import { config } from 'dotenv';

// Load the repo-root .env ourselves: env.ts would do it, but it runs too late —
// this module deliberately executes before anything imports env.ts, so without
// this the guard would only ever see an unset TEST_DATABASE_URL. Same path
// env.ts uses, resolved from server/src/test.
config({ path: path.resolve(__dirname, '../../../.env') });

// The only Neon branch this suite may touch: project task-manager, branch
// "test" (br-square-shape-ash5qqw4).
const TEST_ENDPOINT_ID = 'ep-blue-dust-asj4jy45';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    'TEST_DATABASE_URL is not set — refusing to run destructive integration tests.',
  );
}
if (process.env.CONFIRM_DESTRUCTIVE_TESTS !== '1') {
  throw new Error(
    'CONFIRM_DESTRUCTIVE_TESTS=1 is required: these tests DROP SCHEMA on TEST_DATABASE_URL.',
  );
}
if (url === process.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is identical to DATABASE_URL — refusing to drop the working database.',
  );
}
if (!url.includes(TEST_ENDPOINT_ID)) {
  throw new Error(
    `TEST_DATABASE_URL does not point at the test branch (expected endpoint ${TEST_ENDPOINT_ID}).`,
  );
}

process.env.DATABASE_URL = url;

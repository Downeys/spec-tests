// Per-file Postgres fixture. Each test file calls `await pgFixture()` in a
// beforeAll hook; the helper spins a fresh postgres:16 container, runs the
// migrations against it, and returns a connected pg.Pool plus a teardown
// that destroys the container.
//
// Why per-file (not per-test): startup is ~5-10s after the image is cached.
// Per-test would be glacial. Per-file gives clean isolation between test
// files without that cost.
//
// Why Testcontainers: it talks to the same Docker daemon you already use
// for docker-compose. Nothing in the cloud. The image (postgres:16) is
// pinned to match docker-compose.yml so test behavior matches dev.

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'migrations');

export interface PgFixture {
  pool: pg.Pool;
  url: string;
  container: StartedPostgreSqlContainer;
  teardown: () => Promise<void>;
}

export async function pgFixture(): Promise<PgFixture> {
  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('onebrain_test')
    .withUsername('onebrain')
    .withPassword('onebrain')
    .start();

  const url = container.getConnectionUri();

  // Run migrations via the node-pg-migrate CLI. Spawning the CLI is uglier
  // than calling its API but matches what `pnpm migrate:up` does in dev,
  // so the test-vs-dev behavior is identical.
  const migrate = spawnSync(
    'node',
    [
      'node_modules/node-pg-migrate/bin/node-pg-migrate.js',
      'up',
      '--migrations-dir',
      MIGRATIONS_DIR,
    ],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
      shell: false,
    },
  );

  if (migrate.status !== 0) {
    await container.stop();
    throw new Error(`migrations failed (exit ${migrate.status})`);
  }

  const pool = new Pool({ connectionString: url, max: 5 });

  const teardown = async (): Promise<void> => {
    await pool.end();
    await container.stop();
  };

  return { pool, url, container, teardown };
}

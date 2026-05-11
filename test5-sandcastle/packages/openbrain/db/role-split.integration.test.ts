import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';
import { runner } from 'node-pg-migrate';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(HERE, '..', 'migrations');
const ADMIN_PASSWORD = 'admin-test-pw';
const APP_USER = 'openbrain_app';
const APP_PASSWORD = 'openbrain_app';

interface ContainerHandle {
  readonly container: StartedTestContainer;
  readonly adminUrl: string;
  readonly appUrl: string;
}

async function startOpenBrain(): Promise<ContainerHandle> {
  const container = await new GenericContainer('pgvector/pgvector:pg16')
    .withEnvironment({
      POSTGRES_USER: 'openbrain_admin',
      POSTGRES_PASSWORD: ADMIN_PASSWORD,
      POSTGRES_DB: 'openbrain',
    })
    .withExposedPorts(5432)
    .withStartupTimeout(60_000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const adminUrl = `postgres://openbrain_admin:${ADMIN_PASSWORD}@${host}:${String(port)}/openbrain`;
  const appUrl = `postgres://${APP_USER}:${APP_PASSWORD}@${host}:${String(port)}/openbrain`;

  await waitForReady(adminUrl);
  await runner({
    databaseUrl: adminUrl,
    dir: MIGRATIONS_DIR,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    count: Number.POSITIVE_INFINITY,
    checkOrder: true,
    singleTransaction: true,
    log: () => undefined,
  });

  return { container, adminUrl, appUrl };
}

async function waitForReady(adminUrl: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    const pool = new Pool({ connectionString: adminUrl });
    try {
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch (e) {
      lastErr = e;
      await pool.end().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Postgres never became ready: ${String(lastErr)}`);
}

const hasDocker = process.env['DOCKER_HOST'] !== undefined || (await dockerSocketExists());

async function dockerSocketExists(): Promise<boolean> {
  try {
    const fs = await import('node:fs/promises');
    await fs.access('/var/run/docker.sock');
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasDocker)('OpenBrain role split (testcontainers)', () => {
  let handle: ContainerHandle;
  let appPool: Pool;

  beforeAll(async () => {
    handle = await startOpenBrain();
    appPool = new Pool({ connectionString: handle.appUrl });
  }, 120_000);

  afterAll(async () => {
    await appPool.end().catch(() => undefined);
    await handle.container.stop().catch(() => undefined);
  });

  it('openbrain_app may INSERT into _role_assertion', async () => {
    await expect(appPool.query('INSERT INTO _role_assertion (x) VALUES (0)')).resolves.toBeTruthy();
  });

  it('openbrain_app may SELECT from _role_assertion', async () => {
    await expect(appPool.query('SELECT x FROM _role_assertion LIMIT 1')).resolves.toBeTruthy();
  });

  it('openbrain_app cannot UPDATE _role_assertion (permission denied)', async () => {
    await expect(
      appPool.query('UPDATE _role_assertion SET x = x WHERE false'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('openbrain_app cannot DELETE FROM _role_assertion (permission denied)', async () => {
    await expect(appPool.query('DELETE FROM _role_assertion')).rejects.toMatchObject({
      code: '42501',
    });
  });
});

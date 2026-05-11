// src/cli/commands/db-reset.ts
// D-07: drops schema, re-applies migrations, clears vault/. Explicit dev operation.
// Append-only invariant governs LIVE writes — not whether the DB itself can be reset (CONTEXT.md §specifics).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pool } from '@/onebrain/db.js';
import { resetLog } from '@/compilation/render/log-md.js';
import { logger } from '@/lib/log.js';

export interface DbResetOptions {
  confirm?: boolean;
}

export async function dbReset(opts: DbResetOptions): Promise<void> {
  // commander's requiredOption('--confirm') already enforces this, but defense-in-depth:
  if (!opts.confirm) {
    process.stderr.write('Refusing to reset without --confirm\n');
    process.exit(1);
    return;
  }

  logger.warn('db reset starting — this is destructive');

  // 1. Drop & recreate public schema
  const client = await pool.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    logger.info('public schema recreated');
  } finally {
    client.release();
  }

  // 2. Re-apply migrations via the same path as `bsp db migrate`
  const migrate = spawnSync('npm', ['run', 'migrate'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (migrate.status !== 0) {
    process.stderr.write('migrate after reset failed\n');
    process.exit(migrate.status ?? 1);
    return;
  }

  // 3. Clear vault/ artifacts (topic pages, index.md, log.md)
  const vaultPath = path.resolve(process.cwd(), 'vault');
  const topicsDir = path.join(vaultPath, 'topics');
  try {
    const entries = await fs.readdir(topicsDir);
    for (const e of entries) {
      if (e.endsWith('.md')) {
        await fs.unlink(path.join(topicsDir, e));
      }
    }
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  try {
    await fs.unlink(path.join(vaultPath, 'index.md'));
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  await resetLog(vaultPath); // D-17: log.md wiped on reset

  logger.warn('db reset complete — system pristine');
  process.stdout.write('Reset complete: schema dropped + migrated, vault/ cleared.\n');
}

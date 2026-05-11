// src/cli/commands/db-migrate.ts
// D-06: only `bsp db migrate` — no separate seed (fixtures invoked via `bsp ingest --fixture`).

import { spawnSync } from 'node:child_process';
import { logger } from '@/lib/log.js';

export async function dbMigrate(): Promise<void> {
  logger.info('running migrations');
  // Delegates to npm script per D-24 (Plan 01): "migrate": "node-pg-migrate up --migration-file-language sql"
  const result = spawnSync('npm', ['run', 'migrate'], {
    stdio: 'inherit',
    shell: process.platform === 'win32', // npm is a .cmd shim on Windows
  });
  if (result.status !== 0) {
    process.stderr.write('migrate failed\n');
    process.exit(result.status ?? 1);
    return;
  }
  logger.info('migrations applied');
}

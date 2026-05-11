// tests/setup/db-setup.ts — exports a pure async helper that integration tests opt into.
//
// Contract: integration tests import { resetSchemaAndMigrate } and call it explicitly
// in their own beforeEach hook. This module does NOT register a global beforeEach hook —
// that pattern caused implicit cross-suite coupling and broke imports from test files
// that needed the helper as a function.
import { Pool } from 'pg';
import { spawnSync } from 'node:child_process';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Drop the public schema and re-apply node-pg-migrate migrations.
 * Integration tests call this in their own beforeEach for guaranteed clean state.
 */
export async function resetSchemaAndMigrate(): Promise<void> {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  const result = spawnSync('npm', ['run', 'migrate'], {
    stdio: 'pipe',
    env: { ...process.env },
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Migration failed in test setup: ${result.stderr?.toString()}`);
  }
}

process.on('exit', () => {
  pool.end().catch(() => {});
});

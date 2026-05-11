// pg.Pool wrapper. CQ2 — pool sized for one consumer process (max=5). Lazy-init
// so the server can boot without a DB (smoke test path) and tools acquire on
// demand.

import pg from 'pg';
import { log } from './logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill it in.',
    );
  }

  pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err: Error) => {
    log.error('pg_pool_error', { message: err.message });
  });

  return pool;
}

// Acquire a client, run the callback, release on completion (success OR failure).
// Tools call this via the defineTool factory; raw use elsewhere should be rare.
export async function withClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// SIGINT path (A2). Close pool cleanly so connections drain.
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export type { PoolClient } from 'pg';

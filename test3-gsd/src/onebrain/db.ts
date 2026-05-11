// src/onebrain/db.ts
// pg.Pool + Drizzle client. Lazy init so test setup can drop schema before first query.

import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '@/lib/env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

process.on('exit', () => {
  pool.end().catch(() => {});
});

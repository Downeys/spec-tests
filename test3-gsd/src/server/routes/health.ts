// src/server/routes/health.ts
// INFRA-04 (health half) — VALIDATION row INFRA-04 covers this.
// Returns { status, version, db_ok }; mounts at GET /health.
//
// Phase 2 plan 02-01, Task 2 — see .planning/phases/02-agents-and-chat/02-01-PLAN.md
// and .planning/phases/02-agents-and-chat/02-RESEARCH.md §INFRA-04 line 25.

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '@/onebrain/db.js';
import { logger } from '@/lib/log.js';
import pkg from '../../../package.json' with { type: 'json' };

export const healthRoute = new Hono();

healthRoute.get('/health', async (c) => {
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch (err) {
    logger.warn({ err }, 'health: db check failed');
  }
  return c.json({
    status: 'ok',
    version: (pkg as { version: string }).version,
    db_ok: dbOk,
  });
});

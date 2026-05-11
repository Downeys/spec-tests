// tests/server/health.spec.ts
// Wave 0 probe — VALIDATION row INFRA-04 (health half).
// Spec authority: .planning/phases/02-agents-and-chat/02-VALIDATION.md row INFRA-04
// + .planning/phases/02-agents-and-chat/02-RESEARCH.md §INFRA-04.
//
// Uses Hono's app.request() in-memory test harness — no actual port bind required.
// (The integration project would be required for a real socket; this spec lives
// under tests/server/ and runs in the unit project per vitest.config.ts.)
//
// DB is mocked at module top so the probe runs without a live Postgres.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/onebrain/db', () => ({
  db: { execute: vi.fn(async () => ({ rows: [{ '?column?': 1 }] })) },
}));

import { createApp } from '@/server/index.js';

describe('GET /health (INFRA-04)', () => {
  it('returns 200 with {status, version, db_ok} JSON', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
    expect(body.db_ok).toBe(true);
  });

  it('returns db_ok=false when db.execute throws', async () => {
    const { db } = await import('@/onebrain/db');
    (db.execute as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('connection refused'),
    );
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db_ok).toBe(false);
  });
});

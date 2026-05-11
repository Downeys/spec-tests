// Integration test for the add_user_observation MCP tool.
//
// Spins a real Postgres via Testcontainers, runs migrations, seeds a couple
// of pre-existing entries, then invokes the tool through its registered
// `invoke` (so input parsing + error envelope are exercised end-to-end).
//
// Invariants under test:
//   - Happy path with related_entry_ids → entry row + relations exist.
//   - No related_entry_ids                → entry row only, related_count=0.
//   - Idempotent re-call (same content, same relations) → was_new=false,
//     related_count=0 (relations deduped via composite PK).
//   - Re-call with one extra related_entry_id              → was_new=false,
//     related_count=1 (only the new edge inserted).
//   - Dangling related_entry_id (FK violation) → PERMANENT envelope AND no
//     orphaned user_observation row (transaction rolled back).
//   - Empty content                       → INVALID_INPUT (Zod min(1)).
//   - Malformed UUID in related_entry_ids → INVALID_INPUT (Zod uuid()).
//   - Metadata round-trips as JSONB.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';
import { addUserObservation } from '../../src/tools/add-user-observation.js';
import { closePool } from '../../src/lib/db.js';

let fixture: PgFixture;
let seededFindingA: string;
let seededFindingB: string;

beforeAll(async () => {
  fixture = await pgFixture();
  // The tool calls into src/lib/db.ts which reads DATABASE_URL from env.
  // Point it at the fixture container before any tool invocation.
  process.env.DATABASE_URL = fixture.url;

  // Seed two existing entries so we have valid related_entry_ids to point
  // observations at. Raw SQL — we are only exercising add_user_observation
  // here, not store_entry.
  const seedA = await fixture.pool.query<{ id: string }>(
    `INSERT INTO entries (type, content, content_hash, created_by)
     VALUES ('finding', $1, $2, 'agent')
     RETURNING id`,
    ['seed finding A', 'hash-a-' + randomUUID()],
  );
  const seedB = await fixture.pool.query<{ id: string }>(
    `INSERT INTO entries (type, content, content_hash, created_by)
     VALUES ('finding', $1, $2, 'agent')
     RETURNING id`,
    ['seed finding B', 'hash-b-' + randomUUID()],
  );
  if (!seedA.rows[0]?.id || !seedB.rows[0]?.id) {
    throw new Error('failed to seed prerequisite findings');
  }
  seededFindingA = seedA.rows[0].id;
  seededFindingB = seedB.rows[0].id;
}, 120_000);

afterAll(async () => {
  await closePool();
  await fixture?.teardown();
});

interface ObservationResult {
  id: string;
  was_new: boolean;
  related_count: number;
}

// Helper: invoke the tool and decode the JSON success payload. Fails the
// test if the result is an error envelope.
async function invokeOk<T>(input: unknown): Promise<T> {
  const result = await addUserObservation.invoke(input);
  if ('isError' in result && result.isError) {
    throw new Error(
      `expected success, got ${result.errorCategory}: ${result.content[0].text}`,
    );
  }
  return JSON.parse(result.content[0].text) as T;
}

describe('add_user_observation tool', () => {
  it('happy path: content + 2 related_entry_ids creates entry and 2 relations', async () => {
    const out = await invokeOk<ObservationResult>({
      content: 'PRO blanket licenses are the dominant cost driver for streaming radio',
      related_entry_ids: [seededFindingA, seededFindingB],
    });

    expect(out.was_new).toBe(true);
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(out.related_count).toBe(2);

    // Entry row was created with the right type/created_by.
    const entryRows = await fixture.pool.query<{
      type: string;
      created_by: string;
    }>(`SELECT type, created_by FROM entries WHERE id = $1`, [out.id]);
    expect(entryRows.rows).toHaveLength(1);
    expect(entryRows.rows[0]?.type).toBe('user_observation');
    expect(entryRows.rows[0]?.created_by).toBe('user');

    // Both observes_on relations exist.
    const relRows = await fixture.pool.query<{ to_id: string }>(
      `SELECT to_id FROM entry_relations
        WHERE from_id = $1 AND relation_type = 'observes_on'
        ORDER BY to_id`,
      [out.id],
    );
    const targets = relRows.rows.map((r) => r.to_id).sort();
    expect(targets).toEqual([seededFindingA, seededFindingB].sort());
  });

  it('no related_entry_ids: entry only, related_count=0', async () => {
    const out = await invokeOk<ObservationResult>({
      content: 'standalone synthesis with no anchors',
    });
    expect(out.was_new).toBe(true);
    expect(out.related_count).toBe(0);

    const relRows = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entry_relations WHERE from_id = $1`,
      [out.id],
    );
    expect(Number(relRows.rows[0]?.count ?? '0')).toBe(0);
  });

  it('idempotent re-call: same content + same relations → same id, related_count=0', async () => {
    const content = 'idempotent observation body — should dedup';
    const first = await invokeOk<ObservationResult>({
      content,
      related_entry_ids: [seededFindingA],
    });
    expect(first.was_new).toBe(true);
    expect(first.related_count).toBe(1);

    const second = await invokeOk<ObservationResult>({
      content,
      related_entry_ids: [seededFindingA],
    });
    expect(second.was_new).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.related_count).toBe(0);

    // No duplicate entry row.
    const entryCount = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entries
        WHERE type = 'user_observation' AND content = $1`,
      [content],
    );
    expect(Number(entryCount.rows[0]?.count ?? '0')).toBe(1);

    // No duplicate relation row.
    const relCount = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entry_relations
        WHERE from_id = $1 AND to_id = $2 AND relation_type = 'observes_on'`,
      [first.id, seededFindingA],
    );
    expect(Number(relCount.rows[0]?.count ?? '0')).toBe(1);
  });

  it('re-call with one new related_entry_id → same id, related_count=1', async () => {
    const content = 'observation that grows new edges over time';
    const first = await invokeOk<ObservationResult>({
      content,
      related_entry_ids: [seededFindingA],
    });
    expect(first.was_new).toBe(true);
    expect(first.related_count).toBe(1);

    // Add a second target on the second call. The first edge is a dup, the
    // second is new → related_count should be 1, not 2.
    const second = await invokeOk<ObservationResult>({
      content,
      related_entry_ids: [seededFindingA, seededFindingB],
    });
    expect(second.was_new).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.related_count).toBe(1);

    // Both edges now exist.
    const relRows = await fixture.pool.query<{ to_id: string }>(
      `SELECT to_id FROM entry_relations
        WHERE from_id = $1 AND relation_type = 'observes_on'
        ORDER BY to_id`,
      [first.id],
    );
    const targets = relRows.rows.map((r) => r.to_id).sort();
    expect(targets).toEqual([seededFindingA, seededFindingB].sort());
  });

  it('dangling related_entry_id: PERMANENT envelope, transaction rolled back, no orphan row', async () => {
    const content = 'this observation must not leak — dangling FK should rollback';
    const danglingId = randomUUID();

    const result = await addUserObservation.invoke({
      content,
      related_entry_ids: [seededFindingA, danglingId],
    });

    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('PERMANENT');
    }

    // No user_observation row was created — the BEGIN/COMMIT was rolled back.
    const orphanCount = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entries
        WHERE type = 'user_observation' AND content = $1`,
      [content],
    );
    expect(Number(orphanCount.rows[0]?.count ?? '0')).toBe(0);

    // And the partial good edge (from_id → seededFindingA) was rolled back too.
    const orphanRel = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entry_relations
        WHERE to_id = $1 AND relation_type = 'observes_on'
          AND from_id IN (SELECT id FROM entries WHERE content = $2)`,
      [seededFindingA, content],
    );
    expect(Number(orphanRel.rows[0]?.count ?? '0')).toBe(0);
  });

  it('rejects empty content with INVALID_INPUT (Zod min(1))', async () => {
    const result = await addUserObservation.invoke({ content: '' });
    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/content/);
    }
  });

  it('rejects malformed UUID in related_entry_ids with INVALID_INPUT (Zod uuid())', async () => {
    const result = await addUserObservation.invoke({
      content: 'should not reach the db',
      related_entry_ids: ['not-a-uuid'],
    });
    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/related_entry_ids/);
    }
  });

  it('metadata round-trips as JSONB', async () => {
    const metadata = {
      tags: ['licensing', 'pro'],
      source_chat: 'session-2026-04-24',
      nested: { confidence: 0.8, notes: 'gut call, sharpen later' },
    };
    const out = await invokeOk<ObservationResult>({
      content: 'metadata round-trip body for user_observation',
      metadata,
    });

    const rows = await fixture.pool.query<{ metadata: unknown }>(
      `SELECT metadata FROM entries WHERE id = $1`,
      [out.id],
    );
    expect(rows.rows[0]?.metadata).toEqual(metadata);
  });
});

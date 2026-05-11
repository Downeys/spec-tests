// Integration test for the store_entry MCP tool.
//
// Spins a real Postgres via Testcontainers, runs migrations, then invokes the
// tool through its registered `invoke` (so input parsing + error envelope are
// exercised end-to-end) and verifies the schema-level behavior.
//
// Invariants under test (A3 / CMT6):
//   - First insert: was_new=true, row exists.
//   - Re-insert same (type, content): was_new=false, no duplicate rows.
//   - Same content under different type: two distinct rows.
//   - Metadata round-trips as JSONB.
//   - Re-insert with DIFFERENT metadata returns same id and the ORIGINAL
//     metadata is preserved (entries immutable).
//   - created_by='user' honored.
//   - Empty content / invalid type produce INVALID_INPUT envelope.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';
import { storeEntry } from '../../src/tools/store-entry.js';
import { closePool } from '../../src/lib/db.js';

let fixture: PgFixture;

beforeAll(async () => {
  fixture = await pgFixture();
  // The tool calls into src/lib/db.ts which reads DATABASE_URL from env.
  // Point it at the fixture container before any tool invocation.
  process.env.DATABASE_URL = fixture.url;
}, 120_000);

afterAll(async () => {
  // Close the lazy module-level pool so the process can exit.
  await closePool();
  await fixture?.teardown();
});

// Helper: invoke the tool and decode the JSON success payload. Fails the test
// if the result is an error envelope.
async function invokeOk<T>(input: unknown): Promise<T> {
  const result = await storeEntry.invoke(input);
  if ('isError' in result && result.isError) {
    throw new Error(
      `expected success, got ${result.errorCategory}: ${result.content[0].text}`,
    );
  }
  return JSON.parse(result.content[0].text) as T;
}

interface StoreResult {
  id: string;
  was_new: boolean;
}

describe('store_entry tool', () => {
  it('inserts a new entry: returns {id, was_new: true} and persists row', async () => {
    const out = await invokeOk<StoreResult>({
      type: 'finding',
      content: 'mechanical license rate is set by the CRB',
    });
    expect(out.was_new).toBe(true);
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/i);

    const { rows } = await fixture.pool.query<{
      id: string;
      type: string;
      content: string;
      created_by: string;
      content_hash: string;
    }>(
      `SELECT id, type, content, created_by, content_hash
         FROM entries WHERE id = $1`,
      [out.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('finding');
    expect(rows[0]?.content).toBe('mechanical license rate is set by the CRB');
    expect(rows[0]?.created_by).toBe('agent');
    // sha256 hex is 64 chars.
    expect(rows[0]?.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('re-insert same (type, content): returns same id with was_new=false, no duplicate row', async () => {
    const content = 'PRO blanket licenses cover public performance rights';
    const first = await invokeOk<StoreResult>({ type: 'raw_source', content });
    expect(first.was_new).toBe(true);

    const second = await invokeOk<StoreResult>({ type: 'raw_source', content });
    expect(second.was_new).toBe(false);
    expect(second.id).toBe(first.id);

    const { rows } = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entries
        WHERE type = 'raw_source' AND content = $1`,
      [content],
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('same content under different types: two distinct rows + ids (UNIQUE is composite)', async () => {
    const content = 'identical body, different classification';
    const asFinding = await invokeOk<StoreResult>({ type: 'finding', content });
    const asRawSource = await invokeOk<StoreResult>({ type: 'raw_source', content });

    expect(asFinding.was_new).toBe(true);
    expect(asRawSource.was_new).toBe(true);
    expect(asFinding.id).not.toBe(asRawSource.id);

    const { rows } = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entries WHERE content = $1`,
      [content],
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(2);
  });

  it('metadata round-trips as JSONB', async () => {
    const metadata = {
      tags: ['music', 'pro'],
      source_url: 'https://example.test/article',
      nested: { score: 0.92, flagged: false },
    };
    const out = await invokeOk<StoreResult>({
      type: 'search_result',
      content: 'metadata round-trip body',
      metadata,
    });

    const { rows } = await fixture.pool.query<{ metadata: unknown }>(
      `SELECT metadata FROM entries WHERE id = $1`,
      [out.id],
    );
    expect(rows[0]?.metadata).toEqual(metadata);
  });

  it('re-insert with different metadata: same id, ORIGINAL metadata preserved (CMT6 invariant)', async () => {
    const content = 'immutability invariant body';
    const original = { tags: ['original'], priority: 1 };
    const first = await invokeOk<StoreResult>({
      type: 'finding',
      content,
      metadata: original,
    });
    expect(first.was_new).toBe(true);

    const attemptedOverwrite = { tags: ['mutated'], priority: 999, extra: 'should-not-stick' };
    const second = await invokeOk<StoreResult>({
      type: 'finding',
      content,
      metadata: attemptedOverwrite,
    });
    expect(second.was_new).toBe(false);
    expect(second.id).toBe(first.id);

    const { rows } = await fixture.pool.query<{ metadata: unknown }>(
      `SELECT metadata FROM entries WHERE id = $1`,
      [first.id],
    );
    // CMT6: the row must NOT be merged or overwritten — the original metadata
    // is exactly what we read back.
    expect(rows[0]?.metadata).toEqual(original);
  });

  it('honors created_by="user"', async () => {
    const out = await invokeOk<StoreResult>({
      type: 'user_observation',
      content: 'user-driven synthesis lives here',
      created_by: 'user',
    });
    expect(out.was_new).toBe(true);

    const { rows } = await fixture.pool.query<{ created_by: string }>(
      `SELECT created_by FROM entries WHERE id = $1`,
      [out.id],
    );
    expect(rows[0]?.created_by).toBe('user');
  });

  it('rejects empty content with INVALID_INPUT envelope (Zod min(1))', async () => {
    const result = await storeEntry.invoke({ type: 'finding', content: '' });
    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/content/);
    }
  });

  it('rejects unknown type with INVALID_INPUT envelope (Zod enum)', async () => {
    const result = await storeEntry.invoke({ type: 'garbage', content: 'whatever' });
    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/type/);
    }
  });
});

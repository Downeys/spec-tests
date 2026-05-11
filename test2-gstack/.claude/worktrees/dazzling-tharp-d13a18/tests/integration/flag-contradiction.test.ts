// Integration test for the flag_contradiction MCP tool.
//
// The load-bearing case: the empty-user_response and missing-user_response
// tests. Premise 7 of the design doc is "confirmation bias is the biggest
// risk", and `flag_contradiction` is the mitigation — it must REFUSE to
// insert anything if the agent hasn't actually asked the user how they
// interpret the conflict. If those two tests ever fail, the architectural
// guardrail is broken; treat them as P0.
//
// Other invariants:
//   - Happy path inserts the contradiction entry + 2 'contradicts' relations.
//   - Idempotent re-call returns same id with relations_inserted=0.
//   - Self-flag rejected at boundary.
//   - Either entry-id missing → PERMANENT, no rows created.
//   - Reason min length / malformed UUID → INVALID_INPUT.

import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';
import { flagContradiction } from '../../src/tools/flag-contradiction.js';
import { closePool } from '../../src/lib/db.js';

let fixture: PgFixture;

// Two seed entries to point contradictions at. Created once via raw SQL so
// the test is independent of store_entry's behavior.
let entryAId: string;
let entryBId: string;

const SEED_A = 'PRO blanket licensing covers all public performance rights for radio.';
const SEED_B = 'PRO blanket licensing does NOT cover digital streaming performance rights.';

beforeAll(async () => {
  fixture = await pgFixture();
  process.env.DATABASE_URL = fixture.url;

  const insert = await fixture.pool.query<{ id: string }>(
    `INSERT INTO entries (type, content, content_hash, created_by)
     VALUES ('finding', $1, $2, 'agent'),
            ('finding', $3, $4, 'agent')
     RETURNING id`,
    [
      SEED_A,
      createHash('sha256').update(SEED_A).digest('hex'),
      SEED_B,
      createHash('sha256').update(SEED_B).digest('hex'),
    ],
  );
  const a = insert.rows[0]?.id;
  const b = insert.rows[1]?.id;
  if (!a || !b) throw new Error('seed insert failed');
  entryAId = a;
  entryBId = b;
}, 120_000);

afterAll(async () => {
  await closePool();
  await fixture?.teardown();
});

async function invokeOk<T>(input: unknown): Promise<T> {
  const result = await flagContradiction.invoke(input);
  if ('isError' in result && result.isError) {
    throw new Error(
      `expected success, got ${result.errorCategory}: ${result.content[0].text}`,
    );
  }
  return JSON.parse(result.content[0].text) as T;
}

async function contradictionCount(): Promise<number> {
  const { rows } = await fixture.pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM entries WHERE type = 'contradiction'`,
  );
  return Number(rows[0]?.count ?? '0');
}

interface FlagResult {
  id: string;
  was_new: boolean;
  relations_inserted: number;
}

describe('flag_contradiction tool', () => {
  it('happy path: inserts contradiction entry (was_new) + 2 contradicts relations', async () => {
    const before = await contradictionCount();
    const out = await invokeOk<FlagResult>({
      entry_a_id: entryAId,
      entry_b_id: entryBId,
      reason: 'A asserts blanket coverage; B carves out streaming explicitly.',
      user_response: 'B is more specific to our use case — treat it as authoritative.',
    });

    expect(out.was_new).toBe(true);
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(out.relations_inserted).toBe(2);

    expect(await contradictionCount()).toBe(before + 1);

    const { rows: entryRows } = await fixture.pool.query<{
      type: string;
      content: string;
      created_by: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT type, content, created_by, metadata FROM entries WHERE id = $1`,
      [out.id],
    );
    expect(entryRows).toHaveLength(1);
    expect(entryRows[0]?.type).toBe('contradiction');
    expect(entryRows[0]?.created_by).toBe('agent');
    // Content carries both reason and user_response in the structured layout.
    expect(entryRows[0]?.content).toMatch(/^Reason: /);
    expect(entryRows[0]?.content).toMatch(/User response: /);
    // Metadata captures both endpoints + the user-response timestamp.
    expect(entryRows[0]?.metadata).toMatchObject({
      entry_a_id: entryAId,
      entry_b_id: entryBId,
    });
    expect(typeof entryRows[0]?.metadata.user_response_recorded_at).toBe('string');

    // Two `contradicts` relations from the contradiction to each side.
    const { rows: relRows } = await fixture.pool.query<{ to_id: string }>(
      `SELECT to_id FROM entry_relations
        WHERE from_id = $1 AND relation_type = 'contradicts'
        ORDER BY to_id`,
      [out.id],
    );
    const targetIds = relRows.map((r) => r.to_id).sort();
    expect(targetIds).toEqual([entryAId, entryBId].sort());
  });

  it('PREMISE 7 invariant: empty user_response is rejected and NO contradiction row is created', async () => {
    const before = await contradictionCount();

    const result = await flagContradiction.invoke({
      entry_a_id: entryAId,
      entry_b_id: entryBId,
      reason: 'a real reason that exceeds ten characters',
      user_response: '',
    });

    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/user_response/);
    }

    // The load-bearing assertion: nothing was inserted.
    expect(await contradictionCount()).toBe(before);
  });

  it('missing user_response (undefined) is rejected as INVALID_INPUT (Zod required field)', async () => {
    const before = await contradictionCount();

    const result = await flagContradiction.invoke({
      entry_a_id: entryAId,
      entry_b_id: entryBId,
      reason: 'a real reason that exceeds ten characters',
      // user_response intentionally omitted
    });

    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/user_response/);
    }

    expect(await contradictionCount()).toBe(before);
  });

  it('rejects entry_a_id == entry_b_id with INVALID_INPUT', async () => {
    const before = await contradictionCount();

    const result = await flagContradiction.invoke({
      entry_a_id: entryAId,
      entry_b_id: entryAId,
      reason: 'cannot contradict yourself, this should fail',
      user_response: 'agreed, this is nonsense',
    });

    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/contradicting itself/);
    }

    expect(await contradictionCount()).toBe(before);
  });

  it('entry_a_id does not exist: PERMANENT, no contradiction row created', async () => {
    const before = await contradictionCount();
    const phantom = '00000000-0000-0000-0000-000000000001';

    const result = await flagContradiction.invoke({
      entry_a_id: phantom,
      entry_b_id: entryBId,
      reason: 'phantom A vs real B - this should be rejected before insert',
      user_response: 'flagging a missing entry should not work',
    });

    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('PERMANENT');
      expect(result.content[0].text).toContain('entry_a_id not found');
      expect(result.content[0].text).toContain(phantom);
    }

    expect(await contradictionCount()).toBe(before);
  });

  it('entry_b_id does not exist: PERMANENT, no contradiction row created', async () => {
    const before = await contradictionCount();
    const phantom = '00000000-0000-0000-0000-000000000002';

    const result = await flagContradiction.invoke({
      entry_a_id: entryAId,
      entry_b_id: phantom,
      reason: 'real A vs phantom B - this should be rejected before insert',
      user_response: 'flagging a missing entry should not work',
    });

    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('PERMANENT');
      expect(result.content[0].text).toContain('entry_b_id not found');
      expect(result.content[0].text).toContain(phantom);
    }

    expect(await contradictionCount()).toBe(before);
  });

  it('idempotent: same reason + user_response returns same id, relations_inserted=0 on re-call', async () => {
    const reason = 'idempotency check: A and B disagree on streaming coverage scope';
    const userResponse = 'we will cite both and flag the ambiguity in the brief';

    const first = await invokeOk<FlagResult>({
      entry_a_id: entryAId,
      entry_b_id: entryBId,
      reason,
      user_response: userResponse,
    });
    expect(first.was_new).toBe(true);
    expect(first.relations_inserted).toBe(2);

    const second = await invokeOk<FlagResult>({
      entry_a_id: entryAId,
      entry_b_id: entryBId,
      reason,
      user_response: userResponse,
    });
    expect(second.was_new).toBe(false);
    expect(second.id).toBe(first.id);
    // Both relations already present from first call → none newly inserted.
    expect(second.relations_inserted).toBe(0);

    // Still exactly two `contradicts` relations from this contradiction id.
    const { rows } = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entry_relations
        WHERE from_id = $1 AND relation_type = 'contradicts'`,
      [first.id],
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(2);
  });

  it('reason shorter than 10 characters is rejected as INVALID_INPUT', async () => {
    const before = await contradictionCount();

    const result = await flagContradiction.invoke({
      entry_a_id: entryAId,
      entry_b_id: entryBId,
      reason: 'short',
      user_response: 'this should not matter because the reason is too short',
    });

    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/reason/);
    }

    expect(await contradictionCount()).toBe(before);
  });

  it('malformed UUID is rejected as INVALID_INPUT', async () => {
    const before = await contradictionCount();

    const result = await flagContradiction.invoke({
      entry_a_id: 'not-a-uuid',
      entry_b_id: entryBId,
      reason: 'malformed uuid should be caught by Zod before any DB work',
      user_response: 'sanity check on input validation',
    });

    expect('isError' in result && result.isError).toBe(true);
    if ('isError' in result && result.isError) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
      expect(result.content[0].text).toMatch(/entry_a_id/);
    }

    expect(await contradictionCount()).toBe(before);
  });
});

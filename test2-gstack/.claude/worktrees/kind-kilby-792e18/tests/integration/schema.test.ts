// Integration test. Spins a real Postgres via Testcontainers, runs the
// initial migration, exercises the schema's load-bearing invariants:
//   - UNIQUE (type, content_hash) rejects duplicates (A3 / CMT6).
//   - CHECK constraints reject unknown enum values.
//   - FK from entry_relations is enforced.
//   - GIN FTS index actually returns matches.
//
// This is the proof that the migration + schema match the design's
// post-review intent. It runs against the same postgres:16 image as
// docker-compose.yml, so dev and test see identical behavior.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';

let fixture: PgFixture;

beforeAll(async () => {
  fixture = await pgFixture();
}, 120_000);

afterAll(async () => {
  await fixture?.teardown();
});

describe('schema', () => {
  it('inserts a basic entry', async () => {
    const { rows } = await fixture.pool.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['raw_source', 'hello world', 'h1', 'agent'],
    );
    expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects duplicate (type, content_hash) via UNIQUE INDEX (A3)', async () => {
    await fixture.pool.query(
      `INSERT INTO entries (type, content, content_hash, created_by)
       VALUES ('raw_source', 'dupe content', 'dupe-hash', 'agent')`,
    );
    await expect(
      fixture.pool.query(
        `INSERT INTO entries (type, content, content_hash, created_by)
         VALUES ('raw_source', 'dupe content', 'dupe-hash', 'agent')`,
      ),
    ).rejects.toMatchObject({ code: '23505' }); // unique_violation
  });

  it('ON CONFLICT DO NOTHING returns no row on duplicate (CMT6)', async () => {
    await fixture.pool.query(
      `INSERT INTO entries (type, content, content_hash, created_by)
       VALUES ('finding', 'finding-x', 'fx-hash', 'agent')`,
    );
    const { rows } = await fixture.pool.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, created_by)
       VALUES ('finding', 'finding-x-again', 'fx-hash', 'agent')
       ON CONFLICT (type, content_hash) DO NOTHING RETURNING id`,
    );
    expect(rows.length).toBe(0);
  });

  it('rejects unknown type values via CHECK constraint', async () => {
    await expect(
      fixture.pool.query(
        `INSERT INTO entries (type, content, content_hash, created_by)
         VALUES ('garbage', 'x', 'x', 'agent')`,
      ),
    ).rejects.toMatchObject({ code: '23514' }); // check_violation
  });

  it('rejects unknown created_by values', async () => {
    await expect(
      fixture.pool.query(
        `INSERT INTO entries (type, content, content_hash, created_by)
         VALUES ('finding', 'x', 'created-by-test', 'robot')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces FK from entry_relations to entries', async () => {
    const { rows } = await fixture.pool.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, created_by)
       VALUES ('finding', 'a', 'fk-a', 'agent') RETURNING id`,
    );
    const realId = rows[0]?.id;
    expect(realId).toBeDefined();

    await expect(
      fixture.pool.query(
        `INSERT INTO entry_relations (from_id, to_id, relation_type)
         VALUES ($1, '00000000-0000-0000-0000-000000000000', 'cites')`,
        [realId],
      ),
    ).rejects.toMatchObject({ code: '23503' }); // foreign_key_violation
  });

  it('FTS index returns matches for to_tsquery', async () => {
    await fixture.pool.query(
      `INSERT INTO entries (type, content, content_hash, created_by)
       VALUES ('raw_source',
               'The mechanical license is governed by 17 USC Section 115.',
               'fts-1', 'agent')`,
    );
    const { rows } = await fixture.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM entries
       WHERE to_tsvector('english', content) @@ to_tsquery('english', 'mechanical & license')`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBeGreaterThan(0);
  });
});

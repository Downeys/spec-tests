// Integration test for the get_entry MCP tool.
//
// Exercises the tool through its registered `invoke` wrapper (the same path
// the MCP server uses), so we cover Zod parsing + error envelope shaping in
// addition to the SQL itself.
//
// Coverage:
//   - Valid UUID, exists           → success envelope, full row returned.
//   - Valid UUID, missing           → PERMANENT envelope with "not found".
//   - Malformed UUID                → INVALID_INPUT envelope (Zod boundary).
//   - JSONB metadata round-trip     → the object goes in and comes out identical.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';
import { getEntry } from '../../src/tools/get-entry.js';

let fixture: PgFixture;

beforeAll(async () => {
  fixture = await pgFixture();
  // The tool acquires its own pg client via withClient(), which reads
  // DATABASE_URL from the environment. Point it at the testcontainers
  // instance for the duration of this file.
  process.env.DATABASE_URL = fixture.url;
}, 120_000);

afterAll(async () => {
  await fixture?.teardown();
});

interface SuccessEnvelope {
  content: [{ type: 'text'; text: string }];
}

interface FailureEnvelope extends SuccessEnvelope {
  isError: true;
  errorCategory: 'TRANSIENT' | 'PERMANENT' | 'INVALID_INPUT';
}

function assertSuccess(result: unknown): asserts result is SuccessEnvelope {
  expect(result).toMatchObject({ content: [{ type: 'text' }] });
  expect((result as { isError?: boolean }).isError).toBeUndefined();
}

function assertFailure(result: unknown): asserts result is FailureEnvelope {
  expect((result as { isError?: boolean }).isError).toBe(true);
}

describe('get_entry', () => {
  it('returns the full row when the UUID exists', async () => {
    const insert = await fixture.pool.query<{ id: string; created_at: string }>(
      `INSERT INTO entries (type, content, content_hash, metadata, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, created_at`,
      [
        'finding',
        'Section 115 governs mechanical licenses for compositions.',
        'hash-section-115',
        JSON.stringify({ source_url: 'https://example.com/115', tags: ['licensing'] }),
        'agent',
      ],
    );
    const row = insert.rows[0];
    expect(row).toBeDefined();
    const id = row!.id;

    const result = await getEntry.invoke({ id });
    assertSuccess(result);

    const payload = JSON.parse(result.content[0].text) as {
      id: string;
      type: string;
      content: string;
      contentHash: string;
      metadata: Record<string, unknown>;
      createdAt: string;
      createdBy: string;
    };

    expect(payload.id).toBe(id);
    expect(payload.type).toBe('finding');
    expect(payload.content).toBe(
      'Section 115 governs mechanical licenses for compositions.',
    );
    expect(payload.contentHash).toBe('hash-section-115');
    expect(payload.metadata).toEqual({
      source_url: 'https://example.com/115',
      tags: ['licensing'],
    });
    expect(payload.createdBy).toBe('agent');
    // ISO 8601 string with timezone.
    expect(payload.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('returns a PERMANENT envelope when no entry matches the UUID', async () => {
    const result = await getEntry.invoke({
      id: '00000000-0000-0000-0000-000000000000',
    });
    assertFailure(result);
    expect(result.errorCategory).toBe('PERMANENT');
    expect(result.content[0].text).toMatch(/not found/i);
    expect(result.content[0].text).toContain(
      '00000000-0000-0000-0000-000000000000',
    );
  });

  it('returns an INVALID_INPUT envelope when the UUID is malformed', async () => {
    const result = await getEntry.invoke({ id: 'not-a-uuid' });
    assertFailure(result);
    expect(result.errorCategory).toBe('INVALID_INPUT');
    expect(result.content[0].text).toMatch(/invalid input/i);
  });

  it('round-trips a complex JSONB metadata object unchanged', async () => {
    const richMetadata = {
      source_url: 'https://example.com/article',
      tags: ['licensing', 'mechanical', 'pro'],
      nested: {
        retrieval: {
          via: 'tavily',
          score: 0.87,
          fetched_at: '2026-04-24T10:15:30.000Z',
        },
        flags: [true, false, true],
      },
      counts: { tokens_in: 1234, tokens_out: 567 },
      unicode: 'café — ☕',
    };

    const insert = await fixture.pool.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, metadata, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id`,
      [
        'search_result',
        'The MLC administers blanket mechanical licenses.',
        'hash-mlc-roundtrip',
        JSON.stringify(richMetadata),
        'agent',
      ],
    );
    const id = insert.rows[0]!.id;

    const result = await getEntry.invoke({ id });
    assertSuccess(result);
    const payload = JSON.parse(result.content[0].text) as {
      metadata: Record<string, unknown>;
    };
    expect(payload.metadata).toEqual(richMetadata);
  });
});

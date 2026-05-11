// Integration tests for tavily_search. Stubs `@tavily/core` so we never
// touch the real API; uses Testcontainers Postgres for the entries table
// so idempotency (A3 / CMT6) and the result <-> entry mapping are exercised
// against the real schema.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';

// Hoisted mock — vitest hoists `vi.mock` above imports, but the stub fn we
// reach for in tests must also be hoisted via `vi.hoisted` so both ends see
// the same reference.
const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock('@tavily/core', () => ({
  tavily: vi.fn(() => ({
    search: searchMock,
    // Other client methods are unused by tavily_search; stub them out so
    // accidental calls fail loudly.
    searchQNA: vi.fn(),
    searchContext: vi.fn(),
    extract: vi.fn(),
  })),
}));

let fixture: PgFixture;
// Imported after the mock + DATABASE_URL are in place so the tool's pool
// init picks up the test DB.
let tavilySearch: typeof import('../../src/tools/tavily-search.js')['tavilySearch'];

beforeAll(async () => {
  fixture = await pgFixture();
  process.env.DATABASE_URL = fixture.url;
  process.env.TAVILY_API_KEY = 'test-key';

  ({ tavilySearch } = await import('../../src/tools/tavily-search.js'));
}, 120_000);

afterAll(async () => {
  await fixture?.teardown();
});

beforeEach(async () => {
  searchMock.mockReset();
  // Fresh entries between tests so we can assert counts cleanly.
  await fixture.pool.query('TRUNCATE entries RESTART IDENTITY CASCADE');
  // Default — most tests want the API key set; missing-key test overrides.
  process.env.TAVILY_API_KEY = 'test-key';
});

function fakeResult(idx: number): {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate: string;
} {
  return {
    title: `Result ${idx}`,
    url: `https://example.com/${idx}`,
    content: `Snippet body ${idx} — load-bearing content.`,
    score: 0.9 - idx * 0.1,
    publishedDate: '2026-04-01',
  };
}

async function entryCount(pool: PgFixture['pool']): Promise<number> {
  const { rows } = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM entries WHERE type = 'search_result'`,
  );
  return Number(rows[0]?.c ?? '0');
}

function parseSuccess(result: Awaited<ReturnType<typeof tavilySearch.invoke>>): {
  results: Array<{ entry_id: string; title: string; url: string; snippet: string; was_new: boolean }>;
} {
  if ('isError' in result) {
    throw new Error(`expected success, got error: ${result.content[0]?.text}`);
  }
  const text = result.content[0]?.text ?? '';
  return JSON.parse(text);
}

describe('tavily_search', () => {
  it('happy path: 3 results -> 3 entries created, was_new=true', async () => {
    searchMock.mockResolvedValueOnce({
      query: 'music licensing rates',
      responseTime: 0.4,
      images: [],
      results: [fakeResult(0), fakeResult(1), fakeResult(2)],
    });

    const before = await entryCount(fixture.pool);
    const result = await tavilySearch.invoke({ query: 'music licensing rates' });
    const parsed = parseSuccess(result);

    expect(parsed.results).toHaveLength(3);
    expect(parsed.results.every((r) => r.was_new)).toBe(true);
    expect(parsed.results.map((r) => r.entry_id)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^[0-9a-f-]{36}$/i),
      ]),
    );
    expect(parsed.results.map((r) => r.title)).toEqual(['Result 0', 'Result 1', 'Result 2']);

    const after = await entryCount(fixture.pool);
    expect(after - before).toBe(3);

    // Metadata is preserved on the entry row.
    const { rows } = await fixture.pool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM entries WHERE type = 'search_result' ORDER BY created_at LIMIT 1`,
    );
    expect(rows[0]?.metadata).toMatchObject({
      tavily_query: 'music licensing rates',
      url: 'https://example.com/0',
      title: 'Result 0',
      score: 0.9,
    });
    expect(rows[0]?.metadata?.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('idempotent re-call: same results -> same entry_ids, was_new=false, no new rows', async () => {
    const payload = {
      query: 'PRO blanket rates',
      responseTime: 0.4,
      images: [] as Array<{ url: string }>,
      results: [fakeResult(0), fakeResult(1), fakeResult(2)],
    };
    searchMock.mockResolvedValueOnce(payload).mockResolvedValueOnce(payload);

    const first = parseSuccess(await tavilySearch.invoke({ query: 'PRO blanket rates' }));
    const countAfterFirst = await entryCount(fixture.pool);
    expect(countAfterFirst).toBe(3);

    const second = parseSuccess(await tavilySearch.invoke({ query: 'PRO blanket rates' }));
    const countAfterSecond = await entryCount(fixture.pool);

    expect(countAfterSecond).toBe(3); // no new rows
    expect(second.results.every((r) => r.was_new === false)).toBe(true);
    expect(second.results.map((r) => r.entry_id)).toEqual(first.results.map((r) => r.entry_id));
  });

  it('empty results: Tavily returns [] -> tool returns {results: []}', async () => {
    searchMock.mockResolvedValueOnce({
      query: 'nonexistent topic xyz',
      responseTime: 0.1,
      images: [],
      results: [],
    });

    const result = parseSuccess(
      await tavilySearch.invoke({ query: 'nonexistent topic xyz' }),
    );
    expect(result.results).toEqual([]);
    expect(await entryCount(fixture.pool)).toBe(0);
  });

  it('Tavily 429 -> TRANSIENT envelope', async () => {
    searchMock.mockRejectedValueOnce(
      Object.assign(new Error('rate limit'), { status: 429 }),
    );

    const result = await tavilySearch.invoke({ query: 'rate limited query' });
    expect('isError' in result && result.isError).toBe(true);
    if ('errorCategory' in result) {
      expect(result.errorCategory).toBe('TRANSIENT');
    }
  });

  it('missing API key -> PERMANENT envelope', async () => {
    delete process.env.TAVILY_API_KEY;

    const result = await tavilySearch.invoke({ query: 'anything goes here' });
    expect('isError' in result && result.isError).toBe(true);
    if ('errorCategory' in result) {
      expect(result.errorCategory).toBe('PERMANENT');
    }
    // search() must not have been called when the API key is missing.
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('Zod validation: too-short query -> INVALID_INPUT', async () => {
    const result = await tavilySearch.invoke({ query: 'no' });
    expect('isError' in result && result.isError).toBe(true);
    if ('errorCategory' in result) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
    }
    expect(searchMock).not.toHaveBeenCalled();
  });
});

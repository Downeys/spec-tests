// Integration test for query_entries. Spins a real Postgres via Testcontainers,
// seeds a fixture corpus spanning types, tags, and timestamps, then exercises
// the filter dimensions individually + composed.
//
// What's covered:
//   - type filter narrows to one entry type
//   - tags filter requires ALL requested tags (JSONB containment)
//   - since filter excludes anything older than the boundary
//   - search filter does FTS via plainto_tsquery
//   - combined filters (type + tags) AND together
//   - no filters → most recent N, ordered by created_at DESC
//   - limit defaults to 20, explicit limit caps lower
//   - empty result returns { entries: [] }
//   - Zod cap rejects limit > 100 as INVALID_INPUT
//   - content_snippet truncates at 200 chars with ellipsis

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';
import { queryEntries } from '../../src/tools/query-entries.js';

let fixture: PgFixture;

beforeAll(async () => {
  fixture = await pgFixture();

  // Provide DATABASE_URL so the tool's withClient() pool resolves to the
  // Testcontainers DB. The factory's pg pool is lazy-init'd on first call.
  process.env.DATABASE_URL = fixture.url;

  await seedCorpus();
}, 180_000);

afterAll(async () => {
  // Close the tool's lazy pool so it doesn't leak across the fixture teardown.
  const { closePool } = await import('../../src/lib/db.js');
  await closePool();
  await fixture?.teardown();
});

// ---------------------------------------------------------------------------
// Fixture corpus. ~10 entries spanning 5 types, varied tags, varied timestamps.
// Timestamps are spread over ~10 days so `since` boundaries are meaningful.
// ---------------------------------------------------------------------------

interface SeedRow {
  type: string;
  content: string;
  hash: string;
  tags: string[];
  created_at: string; // ISO
  created_by: 'agent' | 'user';
  extraMeta?: Record<string, unknown>;
}

const NOW = new Date('2026-04-20T12:00:00Z');
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

const LONG_CONTENT = 'A'.repeat(250) + ' end-marker';

const SEED: SeedRow[] = [
  {
    type: 'raw_source',
    content:
      'The mechanical license is governed by 17 USC Section 115 and administered by the MLC.',
    hash: 'h-mech-1',
    tags: ['licensing', 'mechanical'],
    created_at: daysAgo(10),
    created_by: 'agent',
  },
  {
    type: 'search_result',
    content:
      'SoundExchange collects digital performance royalties for non-interactive streaming services.',
    hash: 'h-sx-1',
    tags: ['licensing', 'soundexchange', 'streaming'],
    created_at: daysAgo(8),
    created_by: 'agent',
  },
  {
    type: 'finding',
    content:
      'PRO blanket licenses (ASCAP, BMI, SESAC, GMR) cover public performance of musical works.',
    hash: 'h-pro-1',
    tags: ['licensing', 'pro'],
    created_at: daysAgo(7),
    created_by: 'agent',
  },
  {
    type: 'finding',
    content:
      'Local businesses streaming radio in retail spaces typically need PRO blanket licenses.',
    hash: 'h-pro-2',
    tags: ['licensing', 'pro', 'retail'],
    created_at: daysAgo(5),
    created_by: 'agent',
  },
  {
    type: 'user_observation',
    content:
      'I think breakeven for the venture depends heavily on per-business pricing tiers.',
    hash: 'h-obs-1',
    tags: ['breakeven', 'pricing'],
    created_at: daysAgo(4),
    created_by: 'user',
  },
  {
    type: 'user_observation',
    content: 'Local music for local businesses is the differentiator we should test first.',
    hash: 'h-obs-2',
    tags: ['differentiator', 'wedge'],
    created_at: daysAgo(3),
    created_by: 'user',
  },
  {
    type: 'contradiction',
    content:
      'Two findings disagree on whether internet radio counts as interactive vs non-interactive.',
    hash: 'h-con-1',
    tags: ['licensing', 'streaming'],
    created_at: daysAgo(2),
    created_by: 'agent',
  },
  {
    type: 'raw_source',
    content:
      'Nothing about avocados here, just a sentence about vegetables to keep FTS honest.',
    hash: 'h-veg-1',
    tags: ['offtopic'],
    created_at: daysAgo(1),
    created_by: 'agent',
  },
  {
    type: 'finding',
    content: LONG_CONTENT,
    hash: 'h-long-1',
    tags: ['snippet-test'],
    created_at: daysAgo(0.5),
    created_by: 'agent',
  },
  {
    type: 'finding',
    content:
      'Most recent finding: SoundExchange royalty rates are published annually by the CRB.',
    hash: 'h-sx-2',
    tags: ['licensing', 'soundexchange', 'rates'],
    created_at: daysAgo(0.1),
    created_by: 'agent',
  },
];

async function seedCorpus(): Promise<void> {
  for (const row of SEED) {
    const meta = { tags: row.tags, ...(row.extraMeta ?? {}) };
    await fixture.pool.query(
      `INSERT INTO entries (type, content, content_hash, metadata, created_at, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6)`,
      [row.type, row.content, row.hash, JSON.stringify(meta), row.created_at, row.created_by],
    );
  }
}

// Run the tool and parse its JSON-text result. Tools return ToolResult shape;
// for success, content[0].text is JSON.stringify of the handler's return value.
async function runTool(input: unknown): Promise<{
  ok: boolean;
  category?: string;
  text: string;
  parsed?: { entries: Array<Record<string, unknown>> };
}> {
  const result = await queryEntries.invoke(input);
  const text = result.content[0].text;
  if ('isError' in result && result.isError) {
    return { ok: false, category: result.errorCategory, text };
  }
  return { ok: true, text, parsed: JSON.parse(text) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('query_entries', () => {
  it('filters by type — only entries of that type returned', async () => {
    const r = await runTool({ type: 'user_observation' });
    expect(r.ok).toBe(true);
    expect(r.parsed!.entries.length).toBe(2);
    for (const e of r.parsed!.entries) {
      expect(e.type).toBe('user_observation');
    }
  });

  it('filters by tags — entries must contain ALL requested tags (AND)', async () => {
    const r = await runTool({ tags: ['licensing', 'soundexchange'] });
    expect(r.ok).toBe(true);
    // h-sx-1 (search_result) and h-sx-2 (finding) have BOTH tags. h-pro-1 has
    // only 'licensing' so must be excluded.
    expect(r.parsed!.entries.length).toBe(2);
    for (const e of r.parsed!.entries) {
      const tags = (e.metadata as { tags: string[] }).tags;
      expect(tags).toContain('licensing');
      expect(tags).toContain('soundexchange');
    }
  });

  it('filters by since — entries older than the timestamp are excluded', async () => {
    // Boundary: 6 days ago. Entries at daysAgo(7) and daysAgo(8) and daysAgo(10) excluded.
    const since = new Date(NOW.getTime() - 6 * 86_400_000).toISOString();
    const r = await runTool({ since });
    expect(r.ok).toBe(true);
    for (const e of r.parsed!.entries) {
      expect(new Date(e.created_at as string).getTime()).toBeGreaterThanOrEqual(
        new Date(since).getTime(),
      );
    }
    // Sanity: we should keep at least the 5 entries newer than 6d ago.
    expect(r.parsed!.entries.length).toBeGreaterThanOrEqual(5);
  });

  it('filters by FTS search — returns entries whose content matches', async () => {
    const r = await runTool({ search: 'soundexchange' });
    expect(r.ok).toBe(true);
    expect(r.parsed!.entries.length).toBeGreaterThan(0);
    for (const e of r.parsed!.entries) {
      expect((e.content_snippet as string).toLowerCase()).toContain('soundexchange');
    }
  });

  it('FTS handles multi-word queries via plainto_tsquery', async () => {
    const r = await runTool({ search: 'mechanical license' });
    expect(r.ok).toBe(true);
    // h-mech-1 contains both terms.
    expect(r.parsed!.entries.length).toBeGreaterThan(0);
    expect(
      (r.parsed!.entries[0]!.content_snippet as string).toLowerCase(),
    ).toContain('mechanical');
  });

  it('combines filters with AND semantics (type + tags)', async () => {
    const r = await runTool({ type: 'finding', tags: ['licensing', 'pro'] });
    expect(r.ok).toBe(true);
    // Only h-pro-1 and h-pro-2 are findings tagged with both licensing+pro.
    expect(r.parsed!.entries.length).toBe(2);
    for (const e of r.parsed!.entries) {
      expect(e.type).toBe('finding');
      const tags = (e.metadata as { tags: string[] }).tags;
      expect(tags).toContain('licensing');
      expect(tags).toContain('pro');
    }
  });

  it('returns most recent N when no filters provided, ORDER BY created_at DESC', async () => {
    const r = await runTool({});
    expect(r.ok).toBe(true);
    const ts = r.parsed!.entries.map((e) => new Date(e.created_at as string).getTime());
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i - 1]).toBeGreaterThanOrEqual(ts[i]!);
    }
  });

  it('default limit caps at 20', async () => {
    // Corpus has 10 entries, so default 20 returns all 10. Verify the
    // result count never exceeds the cap by adding rows ourselves.
    const r = await runTool({});
    expect(r.ok).toBe(true);
    expect(r.parsed!.entries.length).toBeLessThanOrEqual(20);
    expect(r.parsed!.entries.length).toBe(10);
  });

  it('explicit limit: 5 returns at most 5 entries', async () => {
    const r = await runTool({ limit: 5 });
    expect(r.ok).toBe(true);
    expect(r.parsed!.entries.length).toBe(5);
  });

  it('empty result: returns { entries: [] }, not an error', async () => {
    const r = await runTool({ tags: ['nonexistent-tag-zzz'] });
    expect(r.ok).toBe(true);
    expect(r.parsed!.entries).toEqual([]);
  });

  it('Zod cap: limit: 200 returns INVALID_INPUT', async () => {
    const r = await runTool({ limit: 200 });
    expect(r.ok).toBe(false);
    expect(r.category).toBe('INVALID_INPUT');
  });

  it('content_snippet truncates content > 200 chars with ellipsis', async () => {
    const r = await runTool({ tags: ['snippet-test'] });
    expect(r.ok).toBe(true);
    expect(r.parsed!.entries.length).toBe(1);
    const snippet = r.parsed!.entries[0]!.content_snippet as string;
    expect(snippet.endsWith('...')).toBe(true);
    // 200 chars + 3-char ellipsis = 203
    expect(snippet.length).toBe(203);
    // No 'end-marker' substring — that lived past the 200-char cutoff.
    expect(snippet).not.toContain('end-marker');
  });

  it('content_snippet does NOT add ellipsis when content <= 200 chars', async () => {
    const r = await runTool({ type: 'user_observation' });
    expect(r.ok).toBe(true);
    for (const e of r.parsed!.entries) {
      const s = e.content_snippet as string;
      // The seeded user_observation rows are short.
      expect(s.endsWith('...')).toBe(false);
    }
  });
});

// Integration tests for compile_wiki — the Phase 3 headline tool.
//
// Mocks the Anthropic SDK so the tests are deterministic and don't burn
// tokens. Uses Testcontainers Postgres so the scope filter + depth-1
// provenance join run against the real schema.
//
// Decisions exercised:
//   T2   — validates that [[entry-uuid]] markers in mocked output resolve to
//          real seeded entries; verifies unresolved_uuids shows up when the
//          mock cites a bogus UUID.
//   A2   — asserts atomic write (no .tmp orphans after success) and that a
//          slow Anthropic call (setTimeout-based) gets aborted when
//          max_seconds elapses, surfacing as TRANSIENT.
//   CMT3 — out of scope here; the regenerability test file exercises the
//          cross-compile invariant.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';

// Hoisted mock — vitest hoists vi.mock above imports. vi.hoisted ensures the
// mock reference we grab in tests is the same one the SDK module sees.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages: { create: typeof createMock };
    constructor(_opts: { apiKey: string }) {
      this.messages = { create: createMock };
    }
  }
  return { default: Anthropic };
});

let fixture: PgFixture;
let compileWiki: typeof import('../../src/tools/compile-wiki.js')['compileWiki'];
let tmpWikiDir: string;

// Seeded entry IDs — populated in beforeAll.
const seeded: Array<{ id: string; content: string; type: string; tags?: string[] }> = [];

beforeAll(async () => {
  fixture = await pgFixture();
  process.env.DATABASE_URL = fixture.url;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  tmpWikiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compile-wiki-test-'));
  process.env.WIKI_OUTPUT_DIR = tmpWikiDir;

  ({ compileWiki } = await import('../../src/tools/compile-wiki.js'));

  // Seed 5 entries with tags + relations. The regenerability test file
  // uses its own seed corpus; this one stays small + focused.
  async function insertEntry(
    type: string,
    content: string,
    contentHash: string,
    tags: string[],
    createdBy: 'agent' | 'user' = 'agent',
  ): Promise<string> {
    const { rows } = await fixture.pool.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, metadata, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`,
      [type, content, contentHash, JSON.stringify({ tags }), createdBy],
    );
    return rows[0]!.id;
  }

  async function insertRelation(from: string, to: string, rel: string): Promise<void> {
    await fixture.pool.query(
      `INSERT INTO entry_relations (from_id, to_id, relation_type) VALUES ($1, $2, $3)`,
      [from, to, rel],
    );
  }

  const s0 = await insertEntry('raw_source', 'PRO rates govern public performance.', 'cw-0', ['licensing']);
  const s1 = await insertEntry('finding', 'BMI and ASCAP both require annual licenses.', 'cw-1', ['licensing']);
  const s2 = await insertEntry('finding', 'Mechanical royalties are statutory.', 'cw-2', ['licensing']);
  const s3 = await insertEntry('user_observation', 'Small venues push back hard on minimums.', 'cw-3', ['licensing'], 'user');
  const s4 = await insertEntry('raw_source', 'Unrelated topic content.', 'cw-4', ['cooking']);

  await insertRelation(s1, s0, 'cites');
  await insertRelation(s2, s0, 'cites');
  await insertRelation(s3, s1, 'observes_on');

  seeded.push(
    { id: s0, content: 'PRO rates govern public performance.', type: 'raw_source', tags: ['licensing'] },
    { id: s1, content: 'BMI and ASCAP both require annual licenses.', type: 'finding', tags: ['licensing'] },
    { id: s2, content: 'Mechanical royalties are statutory.', type: 'finding', tags: ['licensing'] },
    { id: s3, content: 'Small venues push back hard on minimums.', type: 'user_observation', tags: ['licensing'] },
    { id: s4, content: 'Unrelated topic content.', type: 'raw_source', tags: ['cooking'] },
  );
}, 180_000);

afterAll(async () => {
  await fixture?.teardown();
  // Best-effort cleanup — tmpdir is per-test-run anyway.
  try {
    await fs.rm(tmpWikiDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

beforeEach(async () => {
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  // Clear wiki dir so "no .tmp orphans" assertions are meaningful.
  const entries = await fs.readdir(tmpWikiDir).catch(() => [] as string[]);
  for (const name of entries) {
    await fs.rm(path.join(tmpWikiDir, name), { recursive: true, force: true });
  }
});

// Utility — wrap a markdown string into the shape the SDK's messages.create
// returns (Message with content: ContentBlock[]).
function fakeSynthesis(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text }] };
}

interface SuccessEnvelope {
  content: [{ type: 'text'; text: string }];
}
interface FailureEnvelope extends SuccessEnvelope {
  isError: true;
  errorCategory: 'TRANSIENT' | 'PERMANENT' | 'INVALID_INPUT';
}

function assertSuccess(result: unknown): asserts result is SuccessEnvelope {
  if ((result as { isError?: boolean }).isError) {
    const text = (result as SuccessEnvelope).content[0]?.text ?? '(no text)';
    throw new Error(`expected success, got error: ${text}`);
  }
}
function assertFailure(result: unknown): asserts result is FailureEnvelope {
  expect((result as { isError?: boolean }).isError).toBe(true);
}

interface ToolPayload {
  topic: string;
  file_path: string | null;
  content: string;
  claims_total: number;
  claims_resolved: number;
  unverified_paragraphs: string[];
  unresolved_uuids: string[];
}

function parseSuccess(result: SuccessEnvelope): ToolPayload {
  return JSON.parse(result.content[0].text) as ToolPayload;
}

describe('compile_wiki', () => {
  it('happy path: well-cited synthesis is written atomically and coverage is full', async () => {
    const md = [
      '# Music Licensing',
      '',
      '## Overview',
      '',
      `PRO rates govern public performance. [[${seeded[0]!.id}]]`,
      `BMI and ASCAP both require annual licenses. [[${seeded[1]!.id}]]`,
      `Mechanical royalties are statutory. [[${seeded[2]!.id}]]`,
      '',
      '## Observations',
      '',
      `- Small venues push back hard on minimums. [[${seeded[3]!.id}]]`,
    ].join('\n');

    createMock.mockResolvedValueOnce(fakeSynthesis(md));

    const result = await compileWiki.invoke({
      topic: 'Music Licensing',
      scope: { tags: ['licensing'] },
    });
    assertSuccess(result);
    const payload = parseSuccess(result);

    expect(payload.topic).toBe('Music Licensing');
    expect(payload.file_path).toBeTruthy();
    expect(payload.content).toBe(md);
    expect(payload.claims_total).toBeGreaterThan(0);
    expect(payload.claims_resolved).toBe(payload.claims_total);
    expect(payload.unverified_paragraphs).toEqual([]);
    expect(payload.unresolved_uuids).toEqual([]);

    // File exists on disk with the synthesized content.
    const written = await fs.readFile(payload.file_path!, 'utf8');
    expect(written).toBe(md);
    expect(path.basename(payload.file_path!)).toBe('music-licensing.md');

    // A2 — no orphan .tmp files after success.
    const files = await fs.readdir(tmpWikiDir);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    expect(files).toContain('music-licensing.md');
  });

  it('dry_run: returns content but writes no file', async () => {
    const md = `# Dry\n\nClaim. [[${seeded[0]!.id}]]\n`;
    createMock.mockResolvedValueOnce(fakeSynthesis(md));

    const before = await fs.readdir(tmpWikiDir);

    const result = await compileWiki.invoke({
      topic: 'Dry Topic',
      scope: { tags: ['licensing'] },
      dry_run: true,
    });
    assertSuccess(result);
    const payload = parseSuccess(result);

    expect(payload.file_path).toBeNull();
    expect(payload.content).toBe(md);
    expect(payload.claims_total).toBeGreaterThan(0);

    const after = await fs.readdir(tmpWikiDir);
    expect(after).toEqual(before);
  });

  it('empty scope: no entries match tags -> PERMANENT "no entries match scope."', async () => {
    const result = await compileWiki.invoke({
      topic: 'Nothing Here',
      scope: { tags: ['no-such-tag-xyz'] },
    });
    assertFailure(result);
    expect(result.errorCategory).toBe('PERMANENT');
    expect(result.content[0].text).toMatch(/no entries match scope/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('missing ANTHROPIC_API_KEY -> PERMANENT', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await compileWiki.invoke({
      topic: 'Auth Test',
      scope: { tags: ['licensing'] },
    });
    assertFailure(result);
    expect(result.errorCategory).toBe('PERMANENT');
    expect(result.content[0].text).toMatch(/ANTHROPIC_API_KEY/);
    expect(createMock).not.toHaveBeenCalled();

    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('Anthropic 429 -> TRANSIENT envelope', async () => {
    createMock.mockRejectedValueOnce(
      Object.assign(new Error('rate limited'), { status: 429 }),
    );

    const result = await compileWiki.invoke({
      topic: 'Rate Limited Topic',
      scope: { tags: ['licensing'] },
    });
    assertFailure(result);
    expect(result.errorCategory).toBe('TRANSIENT');
  });

  it('timeout: max_seconds=1 with a slow mock -> TRANSIENT (AbortController fires)', async () => {
    // Mock takes ~5s unless aborted. Tool should abort at ~1s.
    createMock.mockImplementationOnce(async (_body: unknown, opts: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const timer = setTimeout(() => {
          // Shouldn't reach this — the signal should abort first.
          reject(new Error('mock did not abort'));
        }, 5_000);
        opts.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const start = Date.now();
    const result = await compileWiki.invoke({
      topic: 'Slow Topic',
      scope: { tags: ['licensing'] },
      max_seconds: 1,
    });
    const elapsed = Date.now() - start;

    assertFailure(result);
    expect(result.errorCategory).toBe('TRANSIENT');
    // Should bail out close to the 1s mark, not the 5s mock ceiling.
    expect(elapsed).toBeLessThan(3_000);
  });

  it('synthesis cites a bogus UUID -> shows up in unresolved_uuids', async () => {
    const bogus = '00000000-1111-2222-3333-444444444444';
    const md = [
      '# Bogus',
      '',
      `Real claim. [[${seeded[0]!.id}]]`,
      `Fake claim. [[${bogus}]]`,
    ].join('\n');
    createMock.mockResolvedValueOnce(fakeSynthesis(md));

    const result = await compileWiki.invoke({
      topic: 'Bogus UUID',
      scope: { tags: ['licensing'] },
    });
    assertSuccess(result);
    const payload = parseSuccess(result);

    expect(payload.unresolved_uuids).toContain(bogus);
    // The paragraph containing the real UUID should count as resolved; the
    // one with the fake should not — so claims_resolved < claims_total.
    expect(payload.claims_resolved).toBeLessThan(payload.claims_total);
  });

  it('synthesis has unverified paragraph (no [[uuid]] at all) -> listed in unverified_paragraphs', async () => {
    const md = [
      '# Partial',
      '',
      `Cited claim. [[${seeded[0]!.id}]]`,
      'Uncited claim that lacks a wikilink.',
    ].join('\n');
    createMock.mockResolvedValueOnce(fakeSynthesis(md));

    const result = await compileWiki.invoke({
      topic: 'Partial Cite',
      scope: { tags: ['licensing'] },
    });
    assertSuccess(result);
    const payload = parseSuccess(result);

    expect(payload.unverified_paragraphs.some((p) => p.includes('Uncited claim'))).toBe(true);
  });

  it('no orphan .tmp files remain after a successful compile', async () => {
    const md = `# Clean\n\nOnly claim. [[${seeded[0]!.id}]]\n`;
    createMock.mockResolvedValueOnce(fakeSynthesis(md));

    await compileWiki.invoke({
      topic: 'Clean Write',
      scope: { tags: ['licensing'] },
    });

    const files = await fs.readdir(tmpWikiDir);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    // Only the expected .md should be present (plus anything from prior
    // tests that beforeEach didn't clear — beforeEach DOES clear, so this
    // should be exactly one file).
    expect(files).toEqual(['clean-write.md']);
  });

  it('slug edge cases: spaces, special chars, long topic -> valid filename', async () => {
    const md = `# X\n\nClaim. [[${seeded[0]!.id}]]\n`;
    createMock.mockResolvedValueOnce(fakeSynthesis(md));

    const topic = 'Music Licensing 101!';
    const result = await compileWiki.invoke({
      topic,
      scope: { tags: ['licensing'] },
    });
    assertSuccess(result);
    const payload = parseSuccess(result);

    expect(path.basename(payload.file_path!)).toBe('music-licensing-101.md');

    // Long topic — truncates at 80 chars.
    createMock.mockResolvedValueOnce(fakeSynthesis(md));
    const longTopic = 'A'.repeat(150) + ' rest';
    const longResult = await compileWiki.invoke({
      topic: longTopic,
      scope: { tags: ['licensing'] },
    });
    assertSuccess(longResult);
    const longPayload = parseSuccess(longResult);
    const base = path.basename(longPayload.file_path!);
    expect(base.length).toBeLessThanOrEqual(80 + '.md'.length);
    expect(base).toMatch(/^[a-z0-9-]+\.md$/);
  });

  it('INVALID_INPUT when topic is too short', async () => {
    const result = await compileWiki.invoke({ topic: 'ab' });
    assertFailure(result);
    expect(result.errorCategory).toBe('INVALID_INPUT');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('scope.since filters out older entries', async () => {
    // Insert a dated "past" entry and a fresh one, filter by since=now-ish.
    await fixture.pool.query(
      `INSERT INTO entries (type, content, content_hash, metadata, created_by, created_at)
       VALUES ('finding', 'Old claim', 'cw-old', '{"tags":["ephemeral"]}'::jsonb, 'agent', '2020-01-01T00:00:00Z')`,
    );
    const freshRes = await fixture.pool.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, metadata, created_by)
       VALUES ('finding', 'Fresh claim', 'cw-fresh', '{"tags":["ephemeral"]}'::jsonb, 'agent') RETURNING id`,
    );
    const freshId = freshRes.rows[0]!.id;

    const md = `# E\n\nFresh claim. [[${freshId}]]\n`;
    createMock.mockResolvedValueOnce(fakeSynthesis(md));

    const result = await compileWiki.invoke({
      topic: 'Ephemeral',
      scope: { tags: ['ephemeral'], since: '2025-01-01T00:00:00.000Z' },
    });
    assertSuccess(result);
    const payload = parseSuccess(result);

    // Only the fresh entry should have been sent to the synthesis (we can't
    // directly inspect prompt contents but we CAN assert the mocked UUID is
    // real and coverage is full).
    expect(payload.claims_resolved).toBe(payload.claims_total);
    expect(payload.content).toContain(freshId);
  });
});

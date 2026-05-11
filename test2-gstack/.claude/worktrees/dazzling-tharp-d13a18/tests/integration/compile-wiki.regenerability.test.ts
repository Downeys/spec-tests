// T2 regenerability invariant test — the load-bearing proof of the project's
// central claim: "no claim without provenance."
//
// Separate file from compile-wiki.test.ts because the decision doc (T2) calls
// it out specifically, and because if this test regresses we want a laser
// focus on what broke.
//
// Invariant: every [[entry-uuid]] wikilink in every compiled output resolves
// to a real row in entries.id. The content of the output may differ between
// compilations (Anthropic is not deterministic; even our mock happens to be
// deterministic for test purposes, but the invariant MUST NOT depend on byte
// equality). What MUST hold across both runs:
//   - claims_total > 0
//   - claims_resolved == claims_total
//   - every parsed UUID resolves via SELECT id FROM entries WHERE id = $1
// Bonus: at least one UUID appears in BOTH runs (sanity on seed corpus use).
//
// We mock the Anthropic SDK (same pattern as the other test) so runs are
// deterministic in CI — real SDK calls are covered in the manual Windows
// smoke gate, not here.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { PgFixture } from '../setup-pg.js';
import { pgFixture } from '../setup-pg.js';
import { UUID_WIKILINK_RE } from '../../src/lib/wiki-compiler.js';

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

// 10-entry seed corpus — all tagged 'regenerability'.
const CORPUS: string[] = [];

beforeAll(async () => {
  fixture = await pgFixture();
  process.env.DATABASE_URL = fixture.url;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  tmpWikiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compile-wiki-regen-'));
  process.env.WIKI_OUTPUT_DIR = tmpWikiDir;

  ({ compileWiki } = await import('../../src/tools/compile-wiki.js'));

  for (let i = 0; i < 10; i++) {
    const { rows } = await fixture.pool.query<{ id: string }>(
      `INSERT INTO entries (type, content, content_hash, metadata, created_by)
       VALUES ('finding', $1, $2, $3::jsonb, 'agent') RETURNING id`,
      [
        `Seed finding ${i}: load-bearing claim number ${i}.`,
        `regen-${i}`,
        JSON.stringify({ tags: ['regenerability'], idx: i }),
      ],
    );
    CORPUS.push(rows[0]!.id);
  }

  // Sprinkle a few outbound relations so the prompt surface exercises the
  // depth-1 edge join.
  await fixture.pool.query(
    `INSERT INTO entry_relations (from_id, to_id, relation_type) VALUES ($1, $2, 'cites')`,
    [CORPUS[1], CORPUS[0]],
  );
  await fixture.pool.query(
    `INSERT INTO entry_relations (from_id, to_id, relation_type) VALUES ($1, $2, 'paraphrases')`,
    [CORPUS[3], CORPUS[2]],
  );
}, 180_000);

afterAll(async () => {
  await fixture?.teardown();
  try {
    await fs.rm(tmpWikiDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

interface SuccessEnvelope {
  content: [{ type: 'text'; text: string }];
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

function assertSuccess(result: unknown): asserts result is SuccessEnvelope {
  if ((result as { isError?: boolean }).isError) {
    const text = (result as SuccessEnvelope).content[0]?.text ?? '(no text)';
    throw new Error(`expected success, got error: ${text}`);
  }
}
function parseSuccess(result: SuccessEnvelope): ToolPayload {
  return JSON.parse(result.content[0].text) as ToolPayload;
}

// Build a plausible mocked synthesis that cites a subset of the corpus.
// Deliberately vary the ordering between runs to demonstrate the invariant
// doesn't depend on byte equality.
function buildMock(subset: string[], seed: number): { content: Array<{ type: 'text'; text: string }> } {
  const lines = [
    '# test-corpus',
    '',
    '## Key claims',
    '',
  ];
  // Rotate the subset by `seed` so runs are different order-wise.
  const rotated = subset.map((_, i) => subset[(i + seed) % subset.length]!);
  for (let i = 0; i < rotated.length; i++) {
    lines.push(`Claim ${i}: load-bearing claim backed by source. [[${rotated[i]}]]`);
  }
  lines.push('');
  lines.push('## Related');
  lines.push('');
  lines.push(`- Bullet claim referencing the first source. [[${rotated[0]}]]`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// Helper — extract [[uuid]] markers exactly the way parseClaims does, then
// verify each resolves to entries.id in the real DB.
async function assertAllUuidsResolve(
  markdown: string,
  pool: PgFixture['pool'],
): Promise<{ uuidsFound: string[] }> {
  const uuidsFound: string[] = [];
  const re = new RegExp(UUID_WIKILINK_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    uuidsFound.push(m[1]!.toLowerCase());
  }
  expect(uuidsFound.length).toBeGreaterThan(0);

  for (const uuid of uuidsFound) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM entries WHERE id = $1::uuid`,
      [uuid],
    );
    expect(rows).toHaveLength(1);
  }
  return { uuidsFound };
}

describe('compile_wiki regenerability (T2)', () => {
  it('compiles twice, wiki dir wiped between runs, every [[uuid]] resolves each time', async () => {
    // Subsets overlap — guarantees the "at least one UUID in both" assertion
    // has a feasible truth.
    const subset1 = [CORPUS[0]!, CORPUS[1]!, CORPUS[2]!, CORPUS[3]!, CORPUS[4]!];
    const subset2 = [CORPUS[2]!, CORPUS[3]!, CORPUS[5]!, CORPUS[6]!, CORPUS[7]!];

    // ---- Run 1 ----
    createMock.mockResolvedValueOnce(buildMock(subset1, 0));
    const result1 = await compileWiki.invoke({
      topic: 'test-corpus',
      scope: { tags: ['regenerability'] },
    });
    assertSuccess(result1);
    const payload1 = parseSuccess(result1);

    expect(payload1.file_path).toBeTruthy();
    expect(payload1.claims_total).toBeGreaterThan(0);
    expect(payload1.claims_resolved).toBe(payload1.claims_total);

    const { uuidsFound: uuids1 } = await assertAllUuidsResolve(
      payload1.content,
      fixture.pool,
    );

    // File on disk contains the synthesis.
    const onDisk1 = await fs.readFile(payload1.file_path!, 'utf8');
    expect(onDisk1).toBe(payload1.content);

    // ---- Nuke the wiki dir ----
    await fs.rm(tmpWikiDir, { recursive: true, force: true });
    // recreate so the next run's mkdir recursive isn't the first to do it
    // — but actually the tool already mkdir's recursive, so this is fine
    // either way. Leave it fully absent to exercise the "deleting wiki/"
    // path from the spec.
    const before = await fs.readdir(tmpWikiDir).catch(() => null);
    expect(before).toBeNull();

    // ---- Run 2 ----
    createMock.mockResolvedValueOnce(buildMock(subset2, 2));
    const result2 = await compileWiki.invoke({
      topic: 'test-corpus',
      scope: { tags: ['regenerability'] },
    });
    assertSuccess(result2);
    const payload2 = parseSuccess(result2);

    expect(payload2.file_path).toBeTruthy();
    expect(payload2.claims_total).toBeGreaterThan(0);
    expect(payload2.claims_resolved).toBe(payload2.claims_total);

    const { uuidsFound: uuids2 } = await assertAllUuidsResolve(
      payload2.content,
      fixture.pool,
    );

    const onDisk2 = await fs.readFile(payload2.file_path!, 'utf8');
    expect(onDisk2).toBe(payload2.content);

    // ---- Bonus invariant: at least one UUID appears in BOTH runs ----
    const set1 = new Set(uuids1);
    const intersection = uuids2.filter((u) => set1.has(u));
    expect(intersection.length).toBeGreaterThan(0);

    // ---- Outputs MAY differ byte-for-byte (they do, because we rotated) ----
    // We don't assert equality — we assert the invariant is independent of
    // byte equality. This line is documentary but kept as an assertion so
    // accidental byte-equality regressions get flagged (it would still be
    // fine — the invariant holds — but it would signal the mock changed).
    expect(payload1.content).not.toBe(payload2.content);
  });
});

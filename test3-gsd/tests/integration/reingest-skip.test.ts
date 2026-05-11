// tests/integration/reingest-skip.test.ts
// D-04: re-ingest on duplicate raw_text_hash is idempotent — skip & report.
// P3 prevention: re-running ingest must NOT duplicate claims/edges/entities or call Voyage again.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// vi.hoisted ensures the spy reference exists when vi.mock's factory runs
// (vi.mock is hoisted above imports — without vi.hoisted, the factory would
// try to read embedMock before its `const` is initialized).
const { embedMock } = vi.hoisted(() => ({
  embedMock: vi.fn(
    async (_text: string) =>
      new Array(1024).fill(0).map((_, i) => (i % 7) / 7),
  ),
}));

vi.mock('@/onebrain/embed', () => ({
  embed: embedMock,
  EMBEDDING_DIMENSION: 1024,
}));

import { ingest } from '@/cli/commands/ingest';
import {
  findAllClaims,
  findAllSources,
  findAllEdges,
  findAllEntities,
  writeClaim,
} from '@/onebrain/repo';
import { pool } from '@/onebrain/db';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';

let tmpRoot: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let origCwd: string; // WARNING 4 fix — capture/restore cwd so vitest --pool=threads is safe

beforeEach(async () => {
  origCwd = process.cwd(); // WARNING 4 fix
  await resetSchemaAndMigrate();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reingest-root-'));
  // ingest writes vault/log.md to cwd's vault/ — set cwd to tmpRoot for isolation:
  await fs.mkdir(path.join(tmpRoot, 'vault'), { recursive: true });
  process.chdir(tmpRoot);
  embedMock.mockClear();
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(async () => {
  process.chdir(origCwd); // WARNING 4 fix — restore before any rm
  stdoutSpy.mockRestore();
  await fs.rm(tmpRoot, { recursive: true, force: true });
  // Don't restoreAllMocks — that would reset the embedMock implementation
  // (we manage it manually with mockClear in beforeEach).
});
afterAll(async () => {
  await pool.end();
});

describe('D-04 re-ingest skip (P3 prevention)', () => {
  // WARNING 2 fix — prove canonicalize-at-write production path runs.
  // Plan 03's tag-canonicalize.test.ts proves the canonicalizer in isolation;
  // this test proves writeClaim() actually invokes it on the way to the DB.
  it('writeClaim canonicalizes framework_tags on the production write path (WARNING 2)', async () => {
    const written = await writeClaim({
      text: 'A test claim that exercises the canonicalize-at-write path.',
      rationale: 'WARNING 2 regression — tags must be normalized by writeClaim.',
      kind: 'fact',
      status: 'hypothesis',
      confidence: 0.5,
      topic_tags: ['Strategic Positioning'],
      framework_tags: ["Porter's 5 Forces"],
      created_by: 'reingest-skip-test',
    });
    // Round-trip via DB to ensure canonicalization is persisted, not just returned.
    const all = await findAllClaims();
    const persisted = all.find((c) => c.id === written.id);
    expect(persisted?.framework_tags).toEqual(['porter-s-5-forces']);
    expect(persisted?.topic_tags).toEqual(['strategic-positioning']);
  });

  it('second ingest of the same fixture writes ZERO new claim/edge/entity rows', async () => {
    // First ingest
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const sources1 = await findAllSources();
    const claims1 = await findAllClaims();
    const edges1 = await findAllEdges();
    const entities1 = await findAllEntities();

    expect(sources1).toHaveLength(1);
    expect(claims1).toHaveLength(7);
    expect(edges1).toHaveLength(10);
    expect(entities1).toHaveLength(2);

    // Second ingest — SAME fixture
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const sources2 = await findAllSources();
    const claims2 = await findAllClaims();
    const edges2 = await findAllEdges();
    const entities2 = await findAllEntities();

    // D-04: counts unchanged
    expect(sources2).toHaveLength(1);
    expect(claims2).toHaveLength(7);
    expect(edges2).toHaveLength(10);
    expect(entities2).toHaveLength(2);

    // The source ID is unchanged across both ingests (same row, not a new row with same hash)
    expect(sources2[0].id).toBe(sources1[0].id);
  });

  it('second ingest prints D-04 skip message ("already ingested as <id> on <date>")', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    stdoutSpy.mockClear();
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const out = stdoutSpy.mock.calls.flat().join('');
    expect(out).toMatch(/already ingested as [0-9A-HJKMNP-TV-Z]{26} on \d{4}-\d{2}-\d{2}/);
    expect(out).toContain('What Is Strategy?'); // D-04 + Open Question #4: include title
  });

  it('second ingest does NOT call Voyage embed at all (cost + correctness — D-04)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    // First ingest calls embed once per source + once per entity + once per claim = 1+2+7 = 10 calls
    const callsAfterFirst = embedMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    embedMock.mockClear();
    await ingest(undefined, { fixture: 'strategic-positioning' });
    // D-04: duplicate source path returns BEFORE writing entities/claims, so embed is called 0 times
    expect(embedMock.mock.calls.length).toBe(0);
  });

  it('second ingest with --json emits {skipped:true, source_id, ...}', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    stdoutSpy.mockClear();
    await ingest(undefined, { fixture: 'strategic-positioning', json: true });
    const out = stdoutSpy.mock.calls.flat().join('');
    const parsed = JSON.parse(out.trim());
    expect(parsed.skipped).toBe(true);
    expect(parsed.source_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(parsed.title).toBe('What Is Strategy?');
    expect(parsed.claim_count).toBe(0); // no new claims written
    expect(parsed.edge_count).toBe(0);
    expect(parsed.entity_count).toBe(0);
  });
});

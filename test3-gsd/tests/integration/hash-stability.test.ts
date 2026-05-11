// tests/integration/hash-stability.test.ts
// Phase 1 Success Criterion #4: "User runs the renderer twice on unchanged inputs and the
// canonical content hash is identical (no generated_at drift)."
//
// P3 prevention test: this fails if (a) generated_at leaks into hash, (b) frontmatter
// key order is non-deterministic, (c) claim ordering is non-stable, or (d) any other
// source of nondeterminism in the renderer.

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
import matter from 'gray-matter';
import { eq } from 'drizzle-orm';

vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));

import { ingest } from '@/cli/commands/ingest';
import { runCompile } from '@/compilation/runner';
import { db, pool } from '@/onebrain/db';
import * as schema from '@/onebrain/schema';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';

let tmpRoot: string;
let tmpVault: string;
let origCwd: string;

beforeEach(async () => {
  origCwd = process.cwd();
  await resetSchemaAndMigrate();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hash-root-'));
  tmpVault = path.join(tmpRoot, 'vault');
  await fs.mkdir(tmpVault, { recursive: true });
  process.chdir(tmpRoot);
});

afterEach(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe('Phase 1 Success Criterion #4 — content_hash stable across runs (COMP-07, P3 prevention)', () => {
  it('two compiles on unchanged inputs produce identical content_hash AND second compile writes 0 pages', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });

    // First compile — uses now=T1
    const T1 = new Date('2026-04-25T12:00:00Z');
    const r1 = await runCompile({ vaultPath: tmpVault, now: T1 });
    expect(r1.pagesWritten).toBe(1);
    expect(r1.pagesSkipped).toBe(0);
    expect(r1.topicPages[0].written).toBe(true);

    // Read first-run hash from on-disk frontmatter
    const md1 = await fs.readFile(
      path.join(tmpVault, 'topics', 'strategic-positioning.md'),
      'utf-8',
    );
    const hash1 = matter(md1).data.content_hash as string;

    // Second compile — DIFFERENT now (T2) but unchanged DB inputs
    const T2 = new Date('2027-01-01T08:30:00Z');
    const r2 = await runCompile({ vaultPath: tmpVault, now: T2 });

    // SC #4 assertion (1): second run wrote 0 pages
    expect(r2.pagesWritten).toBe(0);
    expect(r2.pagesSkipped).toBe(1);
    expect(r2.topicPages[0].written).toBe(false); // P3 keystone

    // SC #4 assertion (2): runCompile returned same hash for both runs
    expect(r2.topicPages[0].hash).toBe(r1.topicPages[0].hash);

    // SC #4 assertion (3): on-disk frontmatter content_hash unchanged (and IS the runCompile hash)
    const md2 = await fs.readFile(
      path.join(tmpVault, 'topics', 'strategic-positioning.md'),
      'utf-8',
    );
    const hash2 = matter(md2).data.content_hash as string;
    expect(hash2).toBe(hash1);
    expect(hash1).toBe(r1.topicPages[0].hash);
  });

  it('compile_artifacts rows reflect both runs with same content_hash + correct written flags (P3 audit)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });

    const r1 = await runCompile({
      vaultPath: tmpVault,
      now: new Date('2026-04-25T12:00:00Z'),
    });
    const r2 = await runCompile({
      vaultPath: tmpVault,
      now: new Date('2027-01-01T08:30:00Z'),
    });

    const a1 = await db
      .select()
      .from(schema.compile_artifacts)
      .where(eq(schema.compile_artifacts.run_id, r1.runId));
    const a2 = await db
      .select()
      .from(schema.compile_artifacts)
      .where(eq(schema.compile_artifacts.run_id, r2.runId));

    expect(a1).toHaveLength(1);
    expect(a2).toHaveLength(1);
    expect(a1[0].written).toBe(true);
    expect(a2[0].written).toBe(false); // SC #4 (1) audit form
    expect(a1[0].content_hash).toBe(a2[0].content_hash); // SC #4 (2) audit form
    expect(a1[0].page_path).toBe(a2[0].page_path);
  });

  it('compile_runs counters reflect the skip on second run', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const r1 = await runCompile({
      vaultPath: tmpVault,
      now: new Date('2026-04-25T12:00:00Z'),
    });
    const r2 = await runCompile({
      vaultPath: tmpVault,
      now: new Date('2027-01-01T08:30:00Z'),
    });

    const run1 = (
      await db
        .select()
        .from(schema.compile_runs)
        .where(eq(schema.compile_runs.id, r1.runId))
    )[0];
    const run2 = (
      await db
        .select()
        .from(schema.compile_runs)
        .where(eq(schema.compile_runs.id, r2.runId))
    )[0];

    expect(run1.pages_written).toBe(1);
    expect(run1.pages_skipped).toBe(0);
    expect(run2.pages_written).toBe(0);
    expect(run2.pages_skipped).toBe(1);
  });

  it('changing a claim invalidates the hash (proves the hash is content-sensitive)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const r1 = await runCompile({
      vaultPath: tmpVault,
      now: new Date('2026-04-25T12:00:00Z'),
    });

    // Mutate one claim's text to simulate evidence promotion / supersedence content change.
    // (Direct UPDATE violates append-only; T-06-05 in the threat register accepts this for
    //  the narrow purpose of proving the HASH is content-sensitive. DATA-06 invariant is
    //  tested separately by tests/integration/append-only.test.ts.)
    const claims = await db.select().from(schema.claims).limit(1);
    await db
      .update(schema.claims)
      .set({ text: claims[0].text + ' [edited for hash test]' })
      .where(eq(schema.claims.id, claims[0].id));

    const r2 = await runCompile({
      vaultPath: tmpVault,
      now: new Date('2026-04-25T12:00:00Z'),
    });

    expect(r2.topicPages[0].hash).not.toBe(r1.topicPages[0].hash);
    expect(r2.pagesWritten).toBe(1); // hash changed → write happened
  });
});

// tests/integration/pipeline.test.ts
// The Phase 1 keystone integration test: drives the full ingest→compile pipeline
// against live Docker Postgres + mocked Voyage embed, then asserts every Success
// Criterion behavior is observable in the resulting DB rows + vault filesystem.
//
// Bound REQs: COMP-01 (vault dirs), COMP-03 (index.md), COMP-04 (log.md),
//              COMP-09 + CRIT-05 (contradiction callout, both sides), parts of CRIT-04.
//
// Voyage embed is mocked via vi.mock at module top (no live API call here;
// see tests/integration/voyage-live.test.ts for the gated live check).

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

// IMPORTANT: voyage mock must be wired before any module that imports embed.
// The integration project does NOT register the unit-suite voyage-mock setup file,
// so we mock here explicitly to keep CI self-contained (no VOYAGE_API_KEY needed).
vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));

import { ingest } from '@/cli/commands/ingest';
import { runCompile } from '@/compilation/runner';
import {
  findAllClaims,
  findAllSources,
  findAllEntities,
  findAllEdges,
} from '@/onebrain/repo';
import { db, pool } from '@/onebrain/db';
import * as schema from '@/onebrain/schema';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';

let tmpRoot: string;
let tmpVault: string;
let origCwd: string;

beforeEach(async () => {
  origCwd = process.cwd();
  await resetSchemaAndMigrate();
  // Single tmp root used as both cwd and vault parent so ingest's appendLogEntry
  // (which writes to cwd/vault/log.md) lands in the same vault as runCompile.
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-root-'));
  tmpVault = path.join(tmpRoot, 'vault');
  await fs.mkdir(tmpVault, { recursive: true });
  process.chdir(tmpRoot);
});

afterEach(async () => {
  // Restore cwd BEFORE removing the tmp dir so the rm doesn't run from inside it
  process.chdir(origCwd);
  await fs.rm(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe('Phase 1 Success Criteria #2 + #3 + CRIT-05 (full pipeline)', () => {
  it('ingest --fixture strategic-positioning writes 1 source + 7 claims + 10 edges + 2 entities', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });

    const sources = await findAllSources();
    const claims = await findAllClaims();
    const edges = await findAllEdges();
    const entities = await findAllEntities();

    expect(sources).toHaveLength(1); // SC #2: one source row
    expect(claims).toHaveLength(7); // D-11: 7 claims
    expect(entities).toHaveLength(2); // D-11: 2 entities

    // Edge counts by kind (D-11)
    const cites = edges.filter((e) => e.kind === 'cites_source');
    const about = edges.filter((e) => e.kind === 'about_entity');
    const contradicts = edges.filter((e) => e.kind === 'contradicts');
    expect(cites).toHaveLength(7);
    expect(about).toHaveLength(2);
    expect(contradicts).toHaveLength(1); // CRIT-05 keystone seed
  });

  it('every claim has ULID + confidence ∈ [0,1] + status=hypothesis + 1024-dim embedding (SC #2)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const claims = await findAllClaims();
    expect(claims.length).toBeGreaterThan(0);
    for (const c of claims) {
      expect(c.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID format (DATA-05)
      expect(Number(c.confidence)).toBeGreaterThanOrEqual(0); // CRIT-03
      expect(Number(c.confidence)).toBeLessThanOrEqual(1); // CRIT-03
      expect(c.status).toBe('hypothesis'); // CRIT-02
      expect(Array.isArray(c.embedding)).toBe(true);
      expect(c.embedding.length).toBe(1024); // DATA-08
    }
  });

  it('cites_source edges link every claim back to the source row (provenance — SC #2)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const sources = await findAllSources();
    const claims = await findAllClaims();
    const edges = await findAllEdges();
    const sourceId = sources[0].id;
    const cites = edges.filter((e) => e.kind === 'cites_source');
    expect(cites).toHaveLength(7);
    for (const e of cites) {
      expect(e.to_table).toBe('sources');
      expect(e.to_id).toBe(sourceId);
      expect(e.from_table).toBe('claims');
      expect(claims.some((c) => c.id === e.from_id)).toBe(true);
    }
  });

  it('runCompile produces vault/topics/<slug>.md + vault/index.md + vault/log.md (SC #3)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const result = await runCompile({ vaultPath: tmpVault });

    expect(result.pagesPlanned).toBe(1);
    expect(result.pagesWritten).toBe(1);
    expect(result.topicPages).toHaveLength(1);

    // COMP-01: directory + files exist
    const topicPath = path.join(tmpVault, 'topics', 'strategic-positioning.md');
    const indexPath = path.join(tmpVault, 'index.md');
    const logPath = path.join(tmpVault, 'log.md');
    await expect(fs.access(topicPath)).resolves.toBeUndefined();
    await expect(fs.access(indexPath)).resolves.toBeUndefined();
    await expect(fs.access(logPath)).resolves.toBeUndefined();
  });

  it('rendered topic page frontmatter contains every D-15 key (SC #3, COMP-02)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    await runCompile({ vaultPath: tmpVault });
    const md = await fs.readFile(
      path.join(tmpVault, 'topics', 'strategic-positioning.md'),
      'utf-8',
    );
    const fm = matter(md).data;
    const requiredKeys = [
      'id',
      'kind',
      'title',
      'slug',
      'generated_at',
      'generated_by',
      'compile_run_id',
      'content_hash',
      'claim_ids',
      'entity_ids',
      'topic_tags',
      'framework_tags',
      'confidence_avg',
      'confidence_min',
      'contradictions',
      'last_evidence_at',
      'stale',
      'status_breakdown',
    ];
    for (const k of requiredKeys) {
      expect(fm, `frontmatter missing key '${k}'`).toHaveProperty(k);
    }
    expect(fm.generated_by).toBe('compilation-agent'); // D-15 forward-compat
    expect(fm.kind).toBe('topic');
    expect(fm.contradictions).toBe(1); // 1 contradicts edge → 1 callout
    expect(Array.isArray(fm.claim_ids)).toBe(true);
    expect((fm.claim_ids as unknown[]).length).toBe(7);
  });

  it('contradiction callout is rendered with EXACT Obsidian syntax + BOTH claim ids (CRIT-05/COMP-09 keystone)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    await runCompile({ vaultPath: tmpVault });
    const md = await fs.readFile(
      path.join(tmpVault, 'topics', 'strategic-positioning.md'),
      'utf-8',
    );

    // The exact Obsidian callout marker (Plan 04 task 1; D-15)
    expect(md).toContain('> [!warning] Contradiction');

    // Both contradicting claim wikilinks present (CRIT-05 — never smoothed)
    const claims = await findAllClaims();
    const claimA = claims.find((c) => c.text.startsWith('Operational effectiveness'));
    const claimG = claims.find((c) =>
      c.text.startsWith('Continuous improvement (kaizen)'),
    );
    expect(claimA, 'fixture claim-A not found in DB').toBeDefined();
    expect(claimG, 'fixture claim-G not found in DB').toBeDefined();
    expect(md).toContain(`[[claim:${claimA!.id}]]`);
    expect(md).toContain(`[[claim:${claimG!.id}]]`);

    // Both claim TEXTS visible (no side dropped — CRIT-05)
    expect(md).toContain('Operational effectiveness');
    expect(md).toContain('Continuous improvement (kaizen)');

    // The callout is rendered exactly ONCE (D-15: one pair → one callout)
    const calloutCount = (md.match(/> \[!warning\] Contradiction/g) || []).length;
    expect(calloutCount).toBe(1);
  });

  it('vault/index.md contains Topics + Sources sections per D-16 (COMP-03)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    await runCompile({ vaultPath: tmpVault });
    const indexMd = await fs.readFile(path.join(tmpVault, 'index.md'), 'utf-8');

    expect(indexMd).toContain('# Index');
    expect(indexMd).toContain('## Topics');
    expect(indexMd).toContain('## Sources (1)');
    expect(indexMd).toContain('What Is Strategy?'); // source title in Sources section
    expect(indexMd).toContain('topics/strategic-positioning'); // topic-page wikilink
  });

  it('vault/log.md has both an ingest and a compile entry per D-17 (COMP-04)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    await runCompile({ vaultPath: tmpVault });
    const logMd = await fs.readFile(path.join(tmpVault, 'log.md'), 'utf-8');

    // Each entry starts with `## [YYYY-MM-DD HH:MM] <kind> | <summary>`
    const ingestEntries =
      logMd.match(/## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] ingest \|/g) || [];
    const compileEntries =
      logMd.match(/## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] compile \|/g) || [];
    expect(ingestEntries.length).toBeGreaterThanOrEqual(1);
    expect(compileEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('compile_runs + compile_artifacts audit rows reflect the run (P3 audit trail)', async () => {
    await ingest(undefined, { fixture: 'strategic-positioning' });
    const result = await runCompile({ vaultPath: tmpVault });

    // compile_runs row
    const runs = await db
      .select()
      .from(schema.compile_runs)
      .where(eq(schema.compile_runs.id, result.runId));
    expect(runs).toHaveLength(1);
    expect(runs[0].pages_planned).toBe(1);
    expect(runs[0].pages_written).toBe(1);
    expect(runs[0].pages_skipped).toBe(0);
    expect(runs[0].finished_at).not.toBeNull();

    // compile_artifacts row
    const artifacts = await db
      .select()
      .from(schema.compile_artifacts)
      .where(eq(schema.compile_artifacts.run_id, result.runId));
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].written).toBe(true);
    expect(artifacts[0].page_path).toBe('topics/strategic-positioning.md');
    expect(artifacts[0].page_kind).toBe('topic');
    expect((artifacts[0].source_claim_ids as string[]).length).toBe(7);
  });
});

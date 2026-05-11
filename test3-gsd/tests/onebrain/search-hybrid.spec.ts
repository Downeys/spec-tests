// tests/onebrain/search-hybrid.spec.ts
// Wave 0 probe — VALIDATION row DATA-09.
//
// Seeds the strategic-positioning Phase 1 fixture and asserts that hybrid search
// returns the relevant claim ULID in the top-5 for a known query. Records FTS-only
// and vector-only baselines so the planner-chosen 0.4/0.6 weighted-sum is auditable.
//
// Test infrastructure notes:
//   - Routed through the integration project (vitest.config.ts include glob extended
//     to `tests/onebrain/**/*.spec.ts`) — that project sets fileParallelism: false
//     so resetSchemaAndMigrate() doesn't fight the node-pg-migrate advisory lock.
//   - This file's own vi.mock of '@/onebrain/embed' uses a STABLE hash-based vector
//     (not the unit-suite voyage-mock's random vectors) so vector cosine ranking is
//     deterministic across runs. Without determinism the top-K assertion would flake.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Stable embed mock (must precede any import that touches embed) ─────────
// Same input text → same vector. Content-similar inputs get vector-similar outputs.
// vi.mock is hoisted to module top, so the factory function runs in isolation —
// declare helpers INSIDE the factory (vi.mock factories cannot reference outer
// const declarations per Phase 1 plan 01-06 landmine).
vi.mock('@/onebrain/embed', () => {
  function stableHash(s: string): number[] {
    const v = new Array<number>(1024).fill(0);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      v[c % 1024] += 1;
      v[(c * 7 + i) % 1024] += 0.5;
    }
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    return v.map((x) => x / norm);
  }
  return {
    embed: vi.fn(async (text: string) => stableHash(text)),
    EMBEDDING_DIMENSION: 1024,
  };
});

import { ingest } from '@/cli/commands/ingest';
import { embed } from '@/onebrain/embed';
import { searchClaims } from '@/onebrain/search';
import { findAllClaims } from '@/onebrain/repo';
import { pool } from '@/onebrain/db';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';

let tmpRoot: string;
let origCwd: string;

beforeAll(async () => {
  origCwd = process.cwd();
  await resetSchemaAndMigrate();
  // ingest() appends to cwd/vault/log.md — give it an isolated tmp cwd so it
  // doesn't pollute the project root while the suite runs.
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hybrid-'));
  await fs.mkdir(path.join(tmpRoot, 'vault'), { recursive: true });
  process.chdir(tmpRoot);

  await ingest(undefined, { fixture: 'strategic-positioning' });
});

afterAll(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await pool.end();
});

describe('searchClaims hybrid (DATA-09)', () => {
  it('weighted-sum: returns the operational-effectiveness claim in top-5 for query "operational effectiveness"', async () => {
    const allClaims = await findAllClaims();
    const opEffClaim = allClaims.find((c) =>
      /operational effectiveness/i.test(c.text),
    );
    expect(
      opEffClaim,
      'Porter fixture must include an operational-effectiveness claim',
    ).toBeDefined();

    const queryEmbedding = await embed('operational effectiveness');
    const results = await searchClaims({
      q: 'operational effectiveness',
      embedding: queryEmbedding,
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(
      ids,
      `expected ${opEffClaim!.id} in top-5; got ${ids.join(',')}`,
    ).toContain(opEffClaim!.id);
    // Score must be a real number (regression: Drizzle numerics return as strings without coerce)
    expect(typeof results[0].score).toBe('number');
    expect(Number.isFinite(results[0].score)).toBe(true);
  });

  it('FTS-only baseline: query with a flat embedding still ranks via the FTS lane', async () => {
    // Flat-orthogonal embedding (1/sqrt(1024) per dim, L2-norm = 1) — vector cosine
    // is roughly equal across all claims, so the FTS lane dominates ranking.
    const flat = Array.from({ length: 1024 }, () => 1 / Math.sqrt(1024));
    const results = await searchClaims({
      q: 'operational effectiveness',
      embedding: flat,
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    const allClaims = await findAllClaims();
    const opEffClaim = allClaims.find((c) =>
      /operational effectiveness/i.test(c.text),
    )!;
    expect(ids).toContain(opEffClaim.id);
  });

  it('vector-only baseline: stop-word query falls through to the vector lane', async () => {
    // 'the' under plainto_tsquery('english', ...) is a stop word → empty tsquery
    // → FTS lane returns zero hits. Vector lane still ranks against the embedding.
    const queryEmbedding = await embed('operational effectiveness');
    const results = await searchClaims({
      q: 'the',
      embedding: queryEmbedding,
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it('tag filter (hard intersect): non-existent tag yields empty result', async () => {
    const queryEmbedding = await embed('operational effectiveness');
    const results = await searchClaims({
      q: 'operational effectiveness',
      embedding: queryEmbedding,
      tags: ['nonexistent-tag-xyz-12345'],
      limit: 5,
    });
    expect(results.length).toBe(0);
  });
});

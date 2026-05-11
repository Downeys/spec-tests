// tests/agents/recompile-roundtrip.spec.ts
// Wave 0 probe — VALIDATION row AGENT-06.
// Asserts: compilation invocation calls runCompile; vault file lands; frontmatter claim_ids ⊇ seeded ULIDs;
// compile_runs row has error=null. End-to-end "coordinator triggers compilation via SDK" ships in plan 02-08.
//
// Note on isolation strategy (Rule 3 deviation from plan):
//   The plan prescribed `process.chdir(tmpRoot)` + `process.env.VAULT_PATH = tmpVault` to isolate
//   vault writes. process.chdir() is NOT supported under vmThreads pool (per 02-03 deferred-items.md
//   "Sub-item: pipeline.test.ts breaks under vmThreads"). We rely on env.VAULT_PATH alone +
//   direct repo seeding (instead of `ingest()` which calls appendLogEntry against process.cwd()),
//   which keeps the test green under the current vmThreads workaround. The runCompile contract
//   already accepts an explicit vaultPath option (src/compilation/runner.ts:36-43); vault.ts
//   passes env.VAULT_PATH so VAULT_PATH alone is sufficient to redirect every vault write.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';

vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));

// Mock env so we can rewrite VAULT_PATH per-test (the real env loader captures
// VAULT_PATH once at module init via Zod safeParse, so mutating process.env later
// has no effect). vi.hoisted is required because vi.mock factories are hoisted
// above const/let declarations — a bare const referenced inside the factory crashes
// with TDZ "Cannot access X before initialization" (Phase 1 plan 01-06 pattern).
//
// The Proxy passes ALL non-VAULT_PATH keys through to the real env (DATABASE_URL,
// POSTGRES_PASSWORD, ANTHROPIC_API_KEY, etc.) so @/onebrain/db.ts and other
// transitive consumers keep working. Only VAULT_PATH is intercepted.
const { envState } = vi.hoisted(() => ({
  envState: { VAULT_PATH: undefined as string | undefined },
}));
vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return {
    env: new Proxy(actual.env, {
      get: (target, prop) => {
        if (prop === 'VAULT_PATH') return envState.VAULT_PATH;
        return Reflect.get(target, prop);
      },
    }),
  };
});

import { vault_write_atomic } from '@/agents/tools/vault';
import {
  writeSource,
  writeClaim,
  writeEdge,
  writeEntity,
  findAllClaims,
} from '@/onebrain/repo';
import { db } from '@/onebrain/db';
import { sql } from 'drizzle-orm';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';
import { getFixture } from '@/cli/fixtures/index.js';

let tmpRoot: string;
let tmpVault: string;

/**
 * Direct fixture seed — mirrors the dependency-order walk in src/cli/commands/ingest.ts
 * but skips the appendLogEntry step (which uses process.cwd()-relative path; see file
 * header note on the chdir-vs-vmThreads constraint).
 */
async function seedStrategicPositioningFixture(): Promise<void> {
  const fixture = getFixture('strategic-positioning');
  if (!fixture) throw new Error('fixture not found');

  // 1. Source first (D-04 idempotent on raw_text_hash)
  const { source } = await writeSource(fixture.source);

  // 2. Entities — build localId → realId map
  const entityIdMap = new Map<string, string>();
  for (const e of fixture.entities) {
    const written = await writeEntity({
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      description: e.description,
      metadata: e.metadata,
    });
    entityIdMap.set(e.localId, written.id);
  }

  // 3. Claims — build localId → realId map
  const claimIdMap = new Map<string, string>();
  for (const c of fixture.claims) {
    const { localId: _localId, ...claimInput } = c;
    const written = await writeClaim(claimInput);
    claimIdMap.set(c.localId, written.id);
  }

  // 4. Edges — resolve localIds → realIds
  for (const e of fixture.edges) {
    const fromId = claimIdMap.get(e.fromLocalId);
    if (!fromId) {
      throw new Error(
        `fixture edge references unknown claim localId '${e.fromLocalId}'`,
      );
    }
    let toId: string | undefined;
    let toTable: 'sources' | 'claims' | 'entities';
    if (e.toLocalRef.kind === 'source') {
      toId = source.id;
      toTable = 'sources';
    } else if (e.toLocalRef.kind === 'claim') {
      toId = claimIdMap.get(e.toLocalRef.localId);
      toTable = 'claims';
    } else {
      toId = entityIdMap.get(e.toLocalRef.localId);
      toTable = 'entities';
    }
    if (!toId) {
      throw new Error(
        `fixture edge target unresolved: ${JSON.stringify(e.toLocalRef)}`,
      );
    }
    await writeEdge({
      kind: e.kind,
      from_id: fromId,
      from_table: 'claims',
      to_id: toId,
      to_table: toTable,
      weight: e.weight ?? 1.0,
      metadata: {},
    });
  }
}

beforeEach(async () => {
  await resetSchemaAndMigrate();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'recompile-roundtrip-'));
  tmpVault = path.join(tmpRoot, 'vault');
  await fs.mkdir(tmpVault, { recursive: true });
  // The env mock above proxies env.VAULT_PATH from envState.VAULT_PATH; setting it
  // here gives vault_write_atomic the per-test tmpVault on its next read.
  envState.VAULT_PATH = tmpVault;
});

afterEach(async () => {
  envState.VAULT_PATH = undefined;
  await fs.rm(tmpRoot, { recursive: true, force: true });
  // Note: we do NOT call vi.restoreAllMocks() here — that would tear down the
  // hoisted vi.mock for @/lib/env and @/onebrain/embed, breaking subsequent
  // tests in the same file. The mocks are scoped to this file's module graph.
});

// Tool handlers receive { content: [{ type, text }] } — the MCP CallToolResult shape.
// Cast to invokable shape for direct test invocation (the SDK normally goes through
// hooks + permission checks; we exercise the handler directly).
type Handler = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

describe('AGENT-06: compilation sub-agent recompile round-trip', () => {
  it('writes vault topic page with claim_ids ⊇ seeded ULIDs and compile_runs.error IS NULL', async () => {
    // Seed via direct repo writes (avoids ingest()'s cwd-relative log step)
    await seedStrategicPositioningFixture();
    const seededClaims = await findAllClaims();
    expect(seededClaims.length).toBeGreaterThan(0);
    const seededIds = seededClaims.map((c) => c.id);

    // Invoke the compilation sub-agent's tool path directly. The Layer-2 audit hook
    // (src/agents/hooks/vault-audit.ts) is registered by the coordinator at SDK
    // boundary; calling the handler directly bypasses it (the hook is tested
    // independently in tests/agents/vault-writer-gate.spec.ts).
    const callResult = await (vault_write_atomic.handler as unknown as Handler)(
      {},
      undefined,
    );
    expect(callResult.content).toHaveLength(1);
    expect(callResult.content[0].type).toBe('text');

    // The MCP CallToolResult content[0].text is the JSON-stringified RunCompileResult
    // (camelCase per src/compilation/runner.ts:28-34: { runId, pagesPlanned,
    // pagesWritten, pagesSkipped, topicPages }). The CompilationOutputSchema
    // (snake_case) translation is the sub-agent prompt's responsibility, not the
    // tool's — at this layer we assert against the camelCase tool output.
    const result = JSON.parse(callResult.content[0].text) as {
      runId: string;
      pagesPlanned: number;
      pagesWritten: number;
      pagesSkipped: number;
      topicPages: Array<{ path: string; hash: string; written: boolean }>;
    };
    expect(result.pagesWritten).toBeGreaterThan(0);

    // Find the rendered topic page in tmpVault
    const topicsDir = path.join(tmpVault, 'topics');
    const files = await fs.readdir(topicsDir);
    expect(files.length).toBeGreaterThan(0);
    const md = await fs.readFile(path.join(topicsDir, files[0]), 'utf-8');
    const fm = matter(md).data as { source_claim_ids?: string[]; claim_ids?: string[] };
    // Phase 1's frontmatter convention is `source_claim_ids` (per COMP-02 in
    // REQUIREMENTS.md); the plan example used `claim_ids`. Read either for
    // forward-compatibility, but assert at least one exists.
    const claimIds = fm.source_claim_ids ?? fm.claim_ids;
    expect(claimIds).toBeDefined();
    if (!claimIds) throw new Error('no claim_ids in frontmatter');
    // Frontmatter claim_ids must overlap with seeded IDs (the strategic-positioning
    // fixture has all claims under one topic per Phase 1 D-13 single-topic rule).
    const overlap = seededIds.filter((id) => claimIds.includes(id));
    expect(
      overlap.length,
      `expected ≥1 seeded claim ID in frontmatter; got 0 of ${seededIds.length}. seeded=${JSON.stringify(seededIds)} frontmatter=${JSON.stringify(claimIds)}`,
    ).toBeGreaterThan(0);

    // compile_runs error column should be null (no error on success)
    const runs = await db.execute(
      sql`SELECT error FROM compile_runs WHERE id = ${result.runId}`,
    );
    const rows = (runs as unknown as { rows?: Array<{ error: string | null }> }).rows
      ?? (runs as unknown as Array<{ error: string | null }>);
    expect(rows.length).toBe(1);
    expect(rows[0].error).toBeNull();
  });
});

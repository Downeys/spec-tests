// tests/agents/research-no-vault-write.spec.ts
// Wave 0 probe — VALIDATION row RES-02 (research lands sources/claims; vault unchanged).
// Simulates a research turn by directly invoking onebrain_write_source/claim wrappers
// (the SDK end-to-end is plan 02-05/02-06 territory).
//
// Note on isolation strategy (Rule 3 deviation from plan):
//   The plan prescribed `process.chdir(tmpRoot)` + `process.env.VAULT_PATH = tmpVault`.
//   process.chdir() is NOT supported under vmThreads (per 02-03 deferred-items.md). We
//   isolate vault writes via the env-VAULT_PATH override mock alone — the research
//   wrappers (onebrain_write_source/claim) do not touch the filesystem at all (they
//   only write to Postgres + log via pino), so chdir is unnecessary for this probe.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));

// Same env mock pattern as recompile-roundtrip.spec.ts — VAULT_PATH override
// without disturbing DATABASE_URL etc.
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

import {
  onebrain_write_source,
  onebrain_write_claim,
} from '@/agents/tools/onebrain';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';
import { db } from '@/onebrain/db';
import { sql } from 'drizzle-orm';

let tmpRoot: string;
let tmpVault: string;

beforeEach(async () => {
  await resetSchemaAndMigrate();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'research-no-vault-'));
  tmpVault = path.join(tmpRoot, 'vault');
  await fs.mkdir(tmpVault, { recursive: true });
  // Seed an existing file to verify mtime is unchanged after the research turn
  await fs.writeFile(path.join(tmpVault, 'sentinel.md'), '# sentinel\n', 'utf-8');
  envState.VAULT_PATH = tmpVault;
});

afterEach(async () => {
  envState.VAULT_PATH = undefined;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// Tool handlers receive { content: [{ type, text }] } — the MCP CallToolResult shape.
type Handler = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

describe('RES-02: research turn writes sources/claims, vault filesystem untouched', () => {
  it('after a research turn, sources count ≥ 1 AND vault sentinel mtime unchanged AND no new vault files', async () => {
    const sentinelPath = path.join(tmpVault, 'sentinel.md');
    const sentinelStatBefore = await fs.stat(sentinelPath);

    // Simulate a research turn — directly invoke the onebrain wrappers with a
    // synthetic { agentId: 'research' } extra (the wrappers do not actually read
    // agentId; the Layer-2 vault audit hook is the only consumer of agent_id, and
    // it does not gate onebrain_* tools).
    //
    // Use ACTUAL NewSourceSchema enum values:
    //   - kind: 'web_article' (per src/onebrain/types.ts:39-48 SourceKindSchema)
    //   - NewSource shape (omits id/ingested_at/embedding/raw_text_hash/embedding_model
    //     per types.ts:93-99) → required: kind, url, title, author, published_at,
    //     raw_text, metadata.
    const sourceCallResult = await (onebrain_write_source.handler as unknown as Handler)(
      {
        kind: 'web_article',
        url: 'https://example.com/test-research',
        title: 'Test Research Source',
        author: null,
        published_at: null,
        raw_text:
          'Acme charges $99 per seat per month. The market for SIEM tools is large.',
        metadata: { fixture_origin: 'research-no-vault-write-test' },
      },
      { agentId: 'research' },
    );
    const sourceParsed = JSON.parse(sourceCallResult.content[0].text) as {
      source: { id: string };
      skipped: boolean;
    };

    // Use ACTUAL NewClaimSchema kind value: 'fact' (per types.ts:17-26 ClaimKindSchema).
    // Use a non-quantitative claim text so the (future) Layer-1 schema guard in
    // plan 02-05 (quantitative-claim-guard) won't intercept this case.
    await (onebrain_write_claim.handler as unknown as Handler)(
      {
        kind: 'fact',
        text: 'Strategic positioning matters for long-run defensibility.',
        confidence: 0.7,
        created_by: 'test-research-turn',
        cites_source_ids: [sourceParsed.source.id],
      },
      { agentId: 'research' },
    );

    // Assert sources count ≥ 1
    const sourceRows = await db.execute(
      sql`SELECT count(*)::int AS n FROM sources`,
    );
    const srcRows = (sourceRows as unknown as { rows?: Array<{ n: number }> }).rows
      ?? (sourceRows as unknown as Array<{ n: number }>);
    expect(Number(srcRows[0].n)).toBeGreaterThanOrEqual(1);

    // Assert vault sentinel.md mtime is byte-identical (research turn did NOT
    // touch the vault filesystem)
    const sentinelStatAfter = await fs.stat(sentinelPath);
    expect(sentinelStatAfter.mtimeMs).toBe(sentinelStatBefore.mtimeMs);

    // Assert no NEW files in vault root (research turn did not accidentally
    // write anywhere under tmpVault)
    const files = await fs.readdir(tmpVault);
    expect(files).toEqual(['sentinel.md']);
  });
});

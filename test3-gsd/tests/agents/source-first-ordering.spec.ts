// tests/agents/source-first-ordering.spec.ts
// Wave 0 probe — D-05 protocol-layer enforcement at the onebrain_write_claim wrapper.
// AGENT-08 Layer 2 of two: this catches forward-reference ordering violations
// (a claim citing a source ULID not yet in OneBrain at this moment).
// The schema-layer (Layer 1) probe lives in plan 02-05 as quantitative-claim-guard.spec.ts.
//
// Uses real Postgres via resetSchemaAndMigrate. embed() is mocked because the
// wrapper test exercises only the source-row-first ordering check; embedding
// fidelity is covered by tests/integration/voyage-live.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));

import {
  onebrain_write_claim,
  SourceRowNotFoundError,
} from '@/agents/tools/onebrain';
import { writeSource } from '@/onebrain/repo';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';

// Tool handlers are typed as `unknown` extra; cast to a working shape for tests.
type Handler = (
  args: Record<string, unknown>,
  extra: { agentId?: string } | undefined,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

describe('onebrain_write_claim D-05 source-row-first (AGENT-08 Layer 2)', () => {
  beforeEach(async () => {
    await resetSchemaAndMigrate();
  });

  it('rejects a claim whose cites_source_ids contains a non-existent ULID (forward-reference case)', async () => {
    const fakeULID = '01J9X9999999999999999999XX';
    await expect(
      (onebrain_write_claim.handler as unknown as Handler)(
        {
          kind: 'hypothesis',
          // Use a non-quantitative text so the (future) Layer-1 schema guard in
          // plan 02-05 doesn't intercept this case before our Layer-2 check fires.
          text: 'Strategic positioning matters for long-run defensibility.',
          confidence: 0.5,
          created_by: 'test-research',
          cites_source_ids: [fakeULID],
        },
        { agentId: 'research' },
      ),
    ).rejects.toThrow(SourceRowNotFoundError);
  });

  it('accepts a claim whose cites_source_ids contains a real ULID (source written first)', async () => {
    // Write source first per D-05 ordering — using NewSourceSchema's actual enum
    // values (per src/onebrain/types.ts:39-48: web_article|paper|transcript|pdf|...).
    const { source } = await writeSource({
      kind: 'web_article',
      url: 'https://example.com/siem-2025',
      title: 'SIEM Market 2025',
      author: null,
      published_at: null,
      raw_text: 'The SIEM market is $7.2B per Gartner 2025.',
      metadata: {},
    });

    const result = await (onebrain_write_claim.handler as unknown as Handler)(
      {
        kind: 'fact',
        text: 'Strategic positioning matters for long-run defensibility.',
        confidence: 0.9,
        created_by: 'test-research',
        cites_source_ids: [source.id],
      },
      { agentId: 'research' },
    );

    // Tool returns MCP CallToolResult shape — { content: [{ type, text }] }
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text) as {
      claim: { id: string };
      elapsed_seconds: number;
      claim_count_this_turn: number;
    };
    expect(parsed.claim.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(typeof parsed.elapsed_seconds).toBe('number');
    expect(typeof parsed.claim_count_this_turn).toBe('number');
    expect(parsed.claim_count_this_turn).toBeGreaterThanOrEqual(1);
  });
});

// tests/agents/quantitative-claim-guard.spec.ts
// Wave 0 probe — VALIDATION row AGENT-08 + AI-SPEC §5 dimension #2.
// Cases 1-4: schema-layer (Layer 1) at repo.writeClaim — fail-closed regardless of caller.
// Case 5: protocol-layer (Layer 2) at onebrain_write_claim wrapper — D-05 forward-ref.
//
// The fixture (tests/fixtures/quantitative-claims.ts) declares `hasSource: true`
// for the positive-control case (case 1, sourced ≥$1M numeric claim). Tests that
// pass `hasSource: true` write a real source row first via writeSource() so the
// downstream `cites_source` edge insert in writeClaim() satisfies the FK to
// sources(id). Tests that pass `hasSource: false` pass an empty array.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));

import * as repo from '@/onebrain/repo';
import { QuantitativeClaimRequiresSourceError } from '@/onebrain/repo';
import {
  onebrain_write_claim,
  SourceRowNotFoundError,
} from '@/agents/tools/onebrain';
import { QUANTITATIVE_CLAIM_CASES } from '../fixtures/quantitative-claims.js';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';

// Tool handlers are typed as `unknown` extra; cast to a working shape for tests
// (mirrors the pattern in tests/agents/source-first-ordering.spec.ts).
type Handler = (
  args: Record<string, unknown>,
  extra: { agentId?: string } | undefined,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

beforeEach(async () => {
  await resetSchemaAndMigrate();
});

describe('AGENT-08 Layer 1 — repo.writeClaim() schema-coercive guard', () => {
  // Cases 1-4 from the fixture exercise the schema-layer guard.
  for (let i = 0; i < 4; i++) {
    const c = QUANTITATIVE_CLAIM_CASES[i];
    it(`case ${i + 1}: ${c.label} → ${c.expected}`, async () => {
      let sourceIds: string[] = [];
      if (c.hasSource) {
        // Positive-control path: write a real source first so the cites_source
        // edge insert in writeClaim succeeds (FK to sources.id).
        const { source } = await repo.writeSource({
          kind: 'web_article',
          url: `https://example.com/agent-08-case-${i + 1}`,
          title: `AGENT-08 case ${i + 1} fixture source`,
          author: null,
          published_at: null,
          raw_text: c.text,
          metadata: {},
        });
        sourceIds = [source.id];
      }

      const baseInput = {
        kind: 'fact' as const,
        text: c.text,
        confidence: 0.5,
        created_by: 'agent-08-probe',
        cites_source_ids: sourceIds,
      };

      if (c.expected === 'reject') {
        await expect(repo.writeClaim(baseInput)).rejects.toThrow(
          QuantitativeClaimRequiresSourceError,
        );
      } else {
        // Accept path: must NOT throw QuantitativeClaimRequiresSourceError.
        const claim = await repo.writeClaim(baseInput);
        expect(claim.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(claim.text).toBe(c.text);
      }
    });
  }
});

describe('AGENT-08 Layer 2 — onebrain_write_claim wrapper protocol guard (D-05)', () => {
  it('case 5: forward-reference source ULID → SourceRowNotFoundError', async () => {
    const c = QUANTITATIVE_CLAIM_CASES[4];
    // Phase 2 wrapper-layer probe: cites_source_ids contains a fake ULID not in
    // OneBrain. The wrapper looks it up via findSource() and throws
    // SourceRowNotFoundError BEFORE reaching writeClaim.
    await expect(
      (onebrain_write_claim.handler as unknown as Handler)(
        {
          kind: 'fact',
          text: c.text,
          confidence: 0.5,
          created_by: 'agent-08-probe',
          cites_source_ids: ['01J9X9999999999999999999XX'],
        },
        { agentId: 'research' },
      ),
    ).rejects.toThrow(SourceRowNotFoundError);
  });
});

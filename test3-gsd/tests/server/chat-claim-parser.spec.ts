// tests/server/chat-claim-parser.spec.ts
// CR-01 Bug 2 regression guard for parseClaimIdFromSummary.
//
// The onebrain_write_claim wrapper at src/agents/tools/onebrain.ts emits a
// JSON-stringified object with the full ClaimRow under `claim`. Pre-CR-01 the
// chat route looked for a `claim:<ULID>` literal prefix that the wrapper
// never emitted, so production data-claim-id forwarding silently no-op'd
// even after CR-01 Bug 1 (tool name resolution) was fixed. This test
// verifies the parser handles BOTH the production JSON shape AND the
// legacy literal-prefix shorthand (kept for backward compatibility with
// synthetic test events).

import { describe, it, expect, vi } from 'vitest';

// The parser is co-located in chat.ts but exported. We have to stub the
// transitive coordinator import (no SDK init at module load) and the DB
// import (chat.ts mounts via createApp which imports healthRoute too).
vi.mock('@/agents/coordinator', () => ({
  runCoordinatorTurn: async function* () {
    /* unused */
  },
  coordinatorAllowedTools: [],
}));

vi.mock('@/onebrain/db', () => ({
  db: { execute: vi.fn(async () => ({ rows: [] })) },
}));

import { parseClaimIdFromSummary } from '@/server/routes/chat';

describe('parseClaimIdFromSummary (CR-01 Bug 2)', () => {
  it('extracts claim.id from the production JSON-object wrapper output', () => {
    // Real wrapper shape per src/agents/tools/onebrain.ts:130-137.
    const summary = JSON.stringify({
      claim: {
        id: '01J9X1111111111111111111A1',
        text: 'TAM is $1B per Gartner 2025.',
        status: 'hypothesis',
        confidence: 0.6,
        cites_source_ids: ['01J9XSRC'],
        tags: ['tam'],
      },
      claim_count_this_turn: 1,
      elapsed_seconds: 0.42,
    });
    expect(parseClaimIdFromSummary(summary)).toBe('01J9X1111111111111111111A1');
  });

  it('extracts the ULID from the legacy `claim:<ULID>` literal-prefix shorthand', () => {
    expect(parseClaimIdFromSummary('claim:01J9X2222222222222222222B2')).toBe(
      '01J9X2222222222222222222B2',
    );
  });

  it('returns undefined for a JSON object missing claim.id', () => {
    const summary = JSON.stringify({
      claim_count_this_turn: 1,
      elapsed_seconds: 0.42,
    });
    expect(parseClaimIdFromSummary(summary)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(parseClaimIdFromSummary('')).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(parseClaimIdFromSummary('{not json')).toBeUndefined();
  });

  it('returns undefined for arbitrary non-claim text', () => {
    expect(parseClaimIdFromSummary('search returned 5 results')).toBeUndefined();
  });
});

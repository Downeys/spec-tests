// tests/fixtures/quantitative-claims.ts
// AGENT-08 / Pitfall 19 five-case dataset (per AI-SPEC §5 dimension #2 + VALIDATION row AGENT-08).
//
// Consumed by:
//   - tests/agents/source-first-ordering.spec.ts (plan 02-03 Task 5) — exercises the
//     wrapper-layer (Layer 2) at onebrain_write_claim. Case 5 is the forward-reference
//     case the wrapper test relies on.
//   - tests/agents/quantitative-claim-guard.spec.ts (plan 02-05) — exercises the
//     repo/schema-layer (Layer 1) writeClaim guard.
//
// `expected` semantics:
//   - 'accept' — the call should succeed (either pattern doesn't match OR it does
//     but cites_source_ids is supplied with a real source).
//   - 'reject' — the call should throw (Layer 1: QuantitativeClaimRequiresSourceError
//     for cases 2 + 4; Layer 2: SourceRowNotFoundError for case 5's forward-ref).
//
// `hasSource` semantics:
//   - true  — the test will write a source row first, then pass that source.id in
//     cites_source_ids (positive-control path).
//   - false — the test will pass an empty / fake cites_source_ids (negative-control).

export interface QuantClaimCase {
  readonly label: string;
  readonly text: string;
  readonly hasSource: boolean;
  readonly expected: 'accept' | 'reject';
  readonly reason: string;
}

export const QUANTITATIVE_CLAIM_CASES: ReadonlyArray<QuantClaimCase> = Object.freeze([
  {
    label: 'sourced ≥$1M numeric claim',
    text: 'The SIEM market is $7.2B per Gartner 2025.',
    hasSource: true,
    expected: 'accept',
    reason: 'matches $-prefix M/B/T pattern, but cites_source_ids is non-empty → guard satisfied',
  },
  {
    label: 'unsourced ≥$1M numeric claim',
    text: 'Our TAM is $50B.',
    hasSource: false,
    expected: 'reject',
    reason: 'matches both $-prefix M/B/T AND TAM keyword; no source attached → Layer-1 reject',
  },
  {
    label: 'sub-million unsourced metric',
    text: 'We have $400K ARR.',
    hasSource: false,
    expected: 'accept',
    reason: 'pattern does not match (K is not in the M/B/T suffix list; no TAM/SAM/SOM keyword)',
  },
  {
    label: 'TAM keyword without dollar amount, unsourced',
    text: 'Our TAM is meaningfully constrained by enterprise sales velocity.',
    hasSource: false,
    expected: 'reject',
    reason: 'matches TAM-keyword path of regex; no source attached → Layer-1 reject',
  },
  {
    label: 'forward-reference source',
    text: 'Per source X, the SIEM market is $7.2B.',
    hasSource: false,
    expected: 'reject',
    reason:
      'wrapper-layer (Layer 2) probe: cites_source_ids contains a fake ULID not in OneBrain; ' +
      'the wrapper looks it up via findSource() and throws SourceRowNotFoundError before reaching writeClaim',
  },
] as const);

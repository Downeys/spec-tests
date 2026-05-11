// src/onebrain/quant-pattern.ts
// Pure utility — quantitative-claim regex per AGENT-08 / Pitfall 19.
// No I/O, no class, no side effects. Single regex constant + single named function.
//
// Three consumers (per .planning/phases/02-agents-and-chat/02-RESEARCH.md §3.5):
//   1. src/onebrain/repo.ts writeClaim() Layer-1 schema guard — ships in plan 02-05.
//      Throws QuantitativeClaimRequiresSourceError if pattern matches AND
//      cites_source_ids is empty/absent.
//   2. tests/agents/source-first-ordering.spec.ts (this plan, Task 5) — exercises
//      the protocol-layer (Layer-2) wrapper at onebrain_write_claim using fixture
//      case 5 (forward-reference) from tests/fixtures/quantitative-claims.ts.
//   3. tests/agents/quantitative-claim-guard.spec.ts (plan 02-05) — exercises the
//      Layer-1 schema guard against the full five-case fixture.
//
// The regex matches two disjoint classes per RESEARCH §3.5 line 189:
//   - $-prefixed numeric values with M/B/T or million/billion/trillion suffix
//     (e.g. "$7.2B", "$50M", "$1.5 trillion")
//   - The TAM / SAM / SOM keywords as standalone words (case-insensitive)
//
// What the regex does NOT match (intentional):
//   - Sub-million figures ("$400K ARR") — below the AGENT-08 noise floor.
//   - Plain numeric prose with no $ + M/B/T suffix and no TAM/SAM/SOM keyword.

export const QUANT_PATTERN: RegExp =
  /(\$\s*[\d,]+(\.\d+)?\s*(M|B|T|million|billion|trillion))|(\b(TAM|SAM|SOM)\b)/i;

/**
 * Returns true iff the input text contains a quantitative claim that requires
 * a source per AGENT-08 / Pitfall 19. Pure function — no I/O.
 */
export function matchesQuantitativePattern(text: string): boolean {
  return QUANT_PATTERN.test(text);
}

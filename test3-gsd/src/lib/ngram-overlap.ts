// src/lib/ngram-overlap.ts
// Pure n-gram overlap utility — used by:
//   • runtime: src/agents/coordinator-output-guard.ts (D-06 belt-and-braces)
//   • tests:   tests/agents/prose-smuggling.spec.ts
// Tokenizes on whitespace + punctuation; n=12 default per AI-SPEC §5 dim #3.
// Located under src/lib/ (NOT tests/lib/) so runtime code can import without
// crossing the production-code/tests boundary.

export interface NgramOverlapResult {
  maxOverlapTokens: number;
  matches: string[];
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((t) => t.length > 0);
}

/**
 * Compute the maximum contiguous n-gram overlap between two strings.
 *
 * The algorithm:
 *   1. Tokenize both inputs (lowercase, split on whitespace + Unicode punctuation).
 *   2. If either input has fewer than `n` tokens, return zero overlap.
 *   3. Build the set of n-grams from `a`.
 *   4. Slide an n-token window over `b`. For each window present in `a`'s n-gram
 *      set, extend the match greedily as long as subsequent (n-token) suffix
 *      windows continue to appear in `a`'s set, and record the run's length.
 *   5. Return the longest run plus up to 5 sample matches for debug logging.
 *
 * Used to detect sub-agent prose smuggling (D-06): if a coordinator reply shares
 * a 12+-token contiguous run with the research sub-agent's `summary` field, we
 * treat it as a violation and rewrite the reply to a citation-only fallback.
 */
export function ngramOverlap(
  a: string,
  b: string,
  n: number = 12,
): NgramOverlapResult {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length < n || tokensB.length < n) {
    return { maxOverlapTokens: 0, matches: [] };
  }
  const ngramsA = new Set<string>();
  for (let i = 0; i <= tokensA.length - n; i++) {
    ngramsA.add(tokensA.slice(i, i + n).join(' '));
  }
  const matches: string[] = [];
  let maxLen = 0;
  for (let i = 0; i <= tokensB.length - n; i++) {
    const ngram = tokensB.slice(i, i + n).join(' ');
    if (ngramsA.has(ngram)) {
      let len = n;
      while (
        i + len < tokensB.length &&
        ngramsA.has(tokensB.slice(i + len - n + 1, i + len + 1).join(' '))
      ) {
        len += 1;
      }
      maxLen = Math.max(maxLen, len);
      matches.push(tokensB.slice(i, i + len).join(' '));
      if (matches.length >= 5) break;
    }
  }
  return { maxOverlapTokens: maxLen, matches };
}

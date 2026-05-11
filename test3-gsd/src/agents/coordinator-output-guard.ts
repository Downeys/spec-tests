// src/agents/coordinator-output-guard.ts
// Runtime n-gram-overlap guard — last line of defense against sub-agent prose
// smuggling (D-06 belt-and-braces). RESEARCH §6 guardrail #5 / AI-SPEC §5 dim #3.
//
// Two-layer mitigation for D-06 / Pitfall 18:
//   - Layer 1 (PROMPT-LEVEL):  src/agents/coordinator-identity.md
//                              "Never-Quote-Sub-Agent" clause instructs the
//                              coordinator to re-fetch each claim_ids_written
//                              row from OneBrain and cite the live row instead
//                              of quoting the sub-agent summary verbatim.
//   - Layer 2 (RUNTIME, this file): if the model violates the prompt rule, this
//                              guard detects ≥12-token contiguous overlap
//                              between the coordinator reply and the last
//                              sub-agent summary, then REWRITES the reply to a
//                              fallback that cites the claim ULIDs the sub-agent
//                              wrote. Logs `guardrail.prose_smuggling=true` via
//                              pino so the regression surfaces in pino output.
//
// Wired by the coordinator (src/agents/coordinator.ts) on every turn that
// invoked the research sub-agent. The 02-06 SSE bridge applies this BEFORE
// flushing the assembled coordinator message to the chat client.

import { ngramOverlap } from '@/lib/ngram-overlap.js';
import { logger } from '@/lib/log.js';

export interface OutputGuardResult {
  reply: string;
  violation: boolean;
  replacement?: string;
  maxOverlap?: number;
}

/**
 * Apply the prose-smuggling output guard to a coordinator reply.
 *
 * @param coordinatorReply - The assembled coordinator text reply for this turn.
 * @param lastSubAgentSummary - The most recent sub-agent `summary` field
 *   (ResearchOutput.summary). If undefined, the guard is a no-op.
 * @param claimIds - The claim ULIDs the sub-agent wrote this turn
 *   (ResearchOutput.claim_ids_written). Used in the rewritten fallback.
 * @returns OutputGuardResult: pass-through if no overlap, or rewritten reply
 *   citing the claim ULIDs if a 12+-token contiguous overlap was detected.
 */
export function applyOutputGuard(
  coordinatorReply: string,
  lastSubAgentSummary: string | undefined,
  claimIds: string[] = [],
): OutputGuardResult {
  if (!lastSubAgentSummary) {
    return { reply: coordinatorReply, violation: false };
  }
  const overlap = ngramOverlap(coordinatorReply, lastSubAgentSummary, 12);
  if (overlap.maxOverlapTokens < 12) {
    return { reply: coordinatorReply, violation: false };
  }
  logger.warn(
    {
      guardrail: 'prose_smuggling',
      maxOverlap: overlap.maxOverlapTokens,
      matchSample: overlap.matches[0]?.slice(0, 80),
    },
    'coordinator output rewrite triggered: prose-smuggling guard activated',
  );
  const fallback =
    claimIds.length > 0
      ? `I have ${claimIds.length} claim row(s) from the research turn: ${claimIds
          .map((id) => `[[claim:${id.slice(0, 8)}…]]`)
          .join(', ')}. Want me to walk through any of them?`
      : `The research sub-agent returned a summary, but I'm declining to quote it directly — let me re-check the OneBrain rows it wrote and come back with cited claims.`;
  return {
    reply: fallback,
    violation: true,
    replacement: fallback,
    maxOverlap: overlap.maxOverlapTokens,
  };
}

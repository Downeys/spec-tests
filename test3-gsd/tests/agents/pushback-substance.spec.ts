// tests/agents/pushback-substance.spec.ts
// Wave 0 probe — VALIDATION row CRIT-01 + AI-SPEC §5 dim #4 (pre-gate; full
// LLM-judge ships in Phase 4).
//
// Default mode (RUN_AGENT_TESTS unset): a placeholder it() case so vitest
// reports the file. The full live coordinator-driven assertion runs only when
// `RUN_AGENT_TESTS=1` is set (gated to keep `npm test` quick and offline).
//
// The three-token-set heuristic mirrors the CRIT-01 grading rubric:
//   1. Rule named: hypothesis | TAM | unsourced | "no source" | "source attached"
//   2. Action named: "logging" | confidence | "claim:"
//   3. Path-forward named: "source" | research

import { describe, it, expect } from 'vitest';

const RUN_LIVE = process.env.RUN_AGENT_TESTS === '1';

if (RUN_LIVE) {
  describe('CRIT-01 coordinator pushback substance (LIVE — RUN_AGENT_TESTS=1)', () => {
    it('unsourced TAM-shaped user assertion → reply contains all three token sets', async () => {
      const { runCoordinatorTurn } = await import('@/agents/coordinator');
      const userMsg =
        'Our TAM is $50B based on the obvious upside in the SIEM space.';
      let reply = '';
      for await (const ev of runCoordinatorTurn(userMsg)) {
        const evAny = ev as {
          type?: string;
          text?: unknown;
          content?: unknown;
        };
        if (evAny?.type === 'text-delta' && typeof evAny.text === 'string') {
          reply += evAny.text;
        } else if (typeof evAny?.content === 'string') {
          reply += evAny.content;
        }
      }
      const lower = reply.toLowerCase();
      const ruleMatch =
        /hypothesis|tam|unsourced|no source|source attached/i.test(lower);
      const actionMatch = /logging|confidence|claim:/i.test(lower);
      const pathMatch = /\bsource\b|research/i.test(lower);
      expect(
        ruleMatch,
        `rule-named token missing: ${reply.slice(0, 200)}`,
      ).toBe(true);
      expect(
        actionMatch,
        `action-named token missing: ${reply.slice(0, 200)}`,
      ).toBe(true);
      expect(
        pathMatch,
        `path-forward token missing: ${reply.slice(0, 200)}`,
      ).toBe(true);
    }, 180000);
  });
} else {
  describe('CRIT-01 pre-gate (skipped — RUN_AGENT_TESTS=1 to enable)', () => {
    it('placeholder: gated test ran or skipped explicitly', () => {
      expect(true).toBe(true);
    });
  });
}

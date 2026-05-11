// tests/agents/prose-smuggling.spec.ts
// Wave 0 probe — AI-SPEC §5 dim #3 + RESEARCH §6 guardrail #5.
// Two halves:
//   (a) ngramOverlap pure-function: tokenization + n-gram matching invariants.
//   (b) applyOutputGuard runtime: pass-through when no overlap; rewrite + cite
//       when overlap detected; generic fallback when no claim ULIDs available.
// Runtime + tests both import from @/lib/ngram-overlap.js — same canonical path.
//
// The live coordinator end-to-end (real Opus call assembling reply, then guard
// fires) is deferred to dev-time hand-grading per VALIDATION row CRIT-01.

import { describe, it, expect } from 'vitest';
import { ngramOverlap } from '@/lib/ngram-overlap.js';
import { applyOutputGuard } from '@/agents/coordinator-output-guard';

describe('ngramOverlap pure function', () => {
  it('returns maxOverlapTokens >= 12 when 12+ contiguous tokens match', () => {
    const a =
      'the quick brown fox jumps over the lazy dog and runs fast through the woods today';
    const b =
      'the quick brown fox jumps over the lazy dog and runs fast in the morning';
    const r = ngramOverlap(a, b, 12);
    expect(r.maxOverlapTokens).toBeGreaterThanOrEqual(12);
    expect(r.matches.length).toBeGreaterThan(0);
  });
  it('returns maxOverlapTokens 0 when no 12-token contiguous overlap exists', () => {
    const a =
      'completely different content about strategic positioning and market analysis frameworks';
    const b =
      'unit economics customer acquisition cost lifetime value benchmarks';
    const r = ngramOverlap(a, b, 12);
    expect(r.maxOverlapTokens).toBe(0);
  });
  it('returns 0 when either input shorter than n tokens', () => {
    const r = ngramOverlap('short', 'still short text', 12);
    expect(r.maxOverlapTokens).toBe(0);
  });
  it('lowercase + punctuation tolerant', () => {
    const a =
      'one two three four five six seven eight nine ten eleven twelve';
    const b =
      'ONE, TWO! Three. four; five six seven eight nine ten eleven twelve.';
    const r = ngramOverlap(a, b, 12);
    expect(r.maxOverlapTokens).toBeGreaterThanOrEqual(12);
  });
});

describe('applyOutputGuard runtime guard', () => {
  it('passes through unchanged when no overlap', () => {
    const reply = 'According to claim 01J9X..., the SIEM market is sizeable.';
    const summary =
      'Pricing model varies by tier; enterprise negotiable.';
    const r = applyOutputGuard(reply, summary, [
      '01J9X1111111111111111111A1',
    ]);
    expect(r.violation).toBe(false);
    expect(r.reply).toBe(reply);
  });
  it('rewrites to fallback citing claim ULIDs when overlap detected', () => {
    const longShared =
      'the company achieves market dominance through strategic partnerships and superior unit economics scale fast';
    const reply = `Per the research turn, ${longShared} as the data shows.`;
    const summary = `Notes: ${longShared} which the team confirmed.`;
    const r = applyOutputGuard(reply, summary, [
      '01J9X1111111111111111111A1',
      '01J9X2222222222222222222B2',
    ]);
    expect(r.violation).toBe(true);
    expect(r.reply).not.toBe(reply);
    expect(r.reply).toMatch(/claim:01J9X/);
  });
  it('returns generic fallback when claimIds is empty', () => {
    const longShared =
      'the company achieves market dominance through strategic partnerships and superior unit economics scale fast';
    const reply = longShared;
    const summary = longShared;
    const r = applyOutputGuard(reply, summary, []);
    expect(r.violation).toBe(true);
    expect(r.reply).toMatch(/declining to quote/);
  });
  it('passes through when lastSubAgentSummary is undefined (no-op path)', () => {
    const reply = 'Some coordinator reply';
    const r = applyOutputGuard(reply, undefined, [
      '01J9X1111111111111111111A1',
    ]);
    expect(r.violation).toBe(false);
    expect(r.reply).toBe(reply);
  });
});

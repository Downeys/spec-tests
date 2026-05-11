// tests/unit/quant-pattern.test.ts
// Pure-fn sanity check for QUANT_PATTERN — verifies the regex matches the
// expected outcomes for the five-case fixture cases.
//
// Provisional unit cover for plan 02-03 Task 1; the Layer-1 schema-guard probe
// (which exercises QUANT_PATTERN through repo.writeClaim) ships with plan 02-05.

import { describe, it, expect } from 'vitest';
import {
  QUANT_PATTERN,
  matchesQuantitativePattern,
} from '@/onebrain/quant-pattern';
import { QUANTITATIVE_CLAIM_CASES } from '../fixtures/quantitative-claims.js';

describe('QUANT_PATTERN regex (RESEARCH §3.5 / AGENT-08 Layer 1)', () => {
  it('exports both QUANT_PATTERN and matchesQuantitativePattern', () => {
    expect(QUANT_PATTERN).toBeInstanceOf(RegExp);
    expect(typeof matchesQuantitativePattern).toBe('function');
  });

  it('matches $-prefix M/B/T values', () => {
    expect(matchesQuantitativePattern('Our TAM is $50B.')).toBe(true);
    expect(matchesQuantitativePattern('SIEM market is $7.2B per Gartner.')).toBe(true);
    expect(matchesQuantitativePattern('We need $5M in Series A.')).toBe(true);
    expect(matchesQuantitativePattern('That\'s a $1.5 trillion opportunity.')).toBe(true);
  });

  it('matches TAM/SAM/SOM keywords (case-insensitive)', () => {
    expect(matchesQuantitativePattern('Our TAM is constrained.')).toBe(true);
    expect(matchesQuantitativePattern('the sam grows yearly')).toBe(true);
    expect(matchesQuantitativePattern('a clear SOM definition')).toBe(true);
  });

  it('does NOT match sub-million figures (no M/B/T suffix)', () => {
    expect(matchesQuantitativePattern('We have $400K ARR.')).toBe(false);
    expect(matchesQuantitativePattern('$999.99 per seat.')).toBe(false);
  });

  it('does NOT match plain prose with no $ + M/B/T and no TAM/SAM/SOM', () => {
    expect(matchesQuantitativePattern('Plain claim no money.')).toBe(false);
    expect(matchesQuantitativePattern('Strategy beats execution.')).toBe(false);
  });
});

describe('QUANTITATIVE_CLAIM_CASES fixture (5-case AGENT-08 dataset)', () => {
  it('has exactly five cases', () => {
    expect(QUANTITATIVE_CLAIM_CASES).toHaveLength(5);
  });

  it('regex outcomes align with each case label', () => {
    // Cases 1, 2, 4, 5 contain pattern matches; case 3 does not
    expect(matchesQuantitativePattern(QUANTITATIVE_CLAIM_CASES[0].text)).toBe(true);
    expect(matchesQuantitativePattern(QUANTITATIVE_CLAIM_CASES[1].text)).toBe(true);
    expect(matchesQuantitativePattern(QUANTITATIVE_CLAIM_CASES[2].text)).toBe(false);
    expect(matchesQuantitativePattern(QUANTITATIVE_CLAIM_CASES[3].text)).toBe(true);
    expect(matchesQuantitativePattern(QUANTITATIVE_CLAIM_CASES[4].text)).toBe(true);
  });

  it('all cases are frozen (Object.freeze)', () => {
    expect(Object.isFrozen(QUANTITATIVE_CLAIM_CASES)).toBe(true);
  });
});

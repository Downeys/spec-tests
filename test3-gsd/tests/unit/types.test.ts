import { describe, it, expect } from 'vitest';
import {
  ConfidenceSchema,
  ClaimStatusSchema,
  ClaimKindSchema,
  EdgeKindSchema,
  NewClaimSchema,
} from '@/onebrain/types';

describe('ConfidenceSchema (CRIT-03)', () => {
  it('accepts 0', () => {
    expect(ConfidenceSchema.parse(0)).toBe(0);
  });
  it('accepts 1', () => {
    expect(ConfidenceSchema.parse(1)).toBe(1);
  });
  it('accepts 0.5', () => {
    expect(ConfidenceSchema.parse(0.5)).toBe(0.5);
  });
  it('rejects 1.5', () => {
    expect(() => ConfidenceSchema.parse(1.5)).toThrow();
  });
  it('rejects -0.1', () => {
    expect(() => ConfidenceSchema.parse(-0.1)).toThrow();
  });
  it('rejects null', () => {
    expect(() => ConfidenceSchema.parse(null)).toThrow();
  });
  it('rejects undefined', () => {
    expect(() => ConfidenceSchema.parse(undefined)).toThrow();
  });
});

describe('ClaimStatusSchema', () => {
  it('accepts every defined status', () => {
    for (const s of ['hypothesis', 'tested', 'validated', 'refuted', 'superseded']) {
      expect(ClaimStatusSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown status', () => {
    expect(() => ClaimStatusSchema.parse('done')).toThrow();
  });
});

describe('NewClaimSchema (CRIT-02 default)', () => {
  it('defaults status to hypothesis when omitted', () => {
    const parsed = NewClaimSchema.parse({
      kind: 'fact',
      text: 'A claim.',
      confidence: 0.7,
      created_by: 'cli-fixture',
    });
    expect(parsed.status).toBe('hypothesis');
  });
  it('requires confidence', () => {
    expect(() =>
      NewClaimSchema.parse({
        kind: 'fact',
        text: 'A claim.',
        created_by: 'cli-fixture',
      }),
    ).toThrow();
  });
  it('preserves explicit status', () => {
    const parsed = NewClaimSchema.parse({
      kind: 'fact',
      text: 'A.',
      confidence: 0.5,
      status: 'validated',
      created_by: 'cli',
    });
    expect(parsed.status).toBe('validated');
  });
});

describe('EdgeKindSchema includes contradicts (D-04 fixture requirement)', () => {
  it('accepts contradicts', () => {
    expect(EdgeKindSchema.parse('contradicts')).toBe('contradicts');
  });
  it('accepts cites_source', () => {
    expect(EdgeKindSchema.parse('cites_source')).toBe('cites_source');
  });
});

describe('ClaimKindSchema covers fixture variants (D-11)', () => {
  it('accepts fact', () => {
    expect(ClaimKindSchema.parse('fact')).toBe('fact');
  });
  it('accepts inference', () => {
    expect(ClaimKindSchema.parse('inference')).toBe('inference');
  });
  it('accepts hypothesis', () => {
    expect(ClaimKindSchema.parse('hypothesis')).toBe('hypothesis');
  });
});

import { describe, it, expect } from 'vitest';
import { FIXTURES, getFixture, listFixtures } from '@/cli/fixtures';

describe('FIXTURES registry (D-08, D-10 — security allowlist)', () => {
  it('exposes only the strategic-positioning fixture in Phase 1', () => {
    expect(listFixtures()).toEqual(['strategic-positioning']);
  });

  it('getFixture returns undefined for unknown names (no path traversal)', () => {
    expect(getFixture('../../../etc/passwd')).toBeUndefined();
    expect(getFixture('does-not-exist')).toBeUndefined();
    expect(getFixture('')).toBeUndefined();
  });

  it('getFixture returns the registered fixture for a known name', () => {
    expect(getFixture('strategic-positioning')).toBeDefined();
  });

  it('FIXTURES object is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(FIXTURES)).toBe(true);
  });
});

describe('strategic-positioning fixture (D-09, D-11)', () => {
  const f = FIXTURES['strategic-positioning'];

  it('has exactly 1 source from a real article (D-09)', () => {
    expect(f.source.title).toBe('What Is Strategy?');
    expect(f.source.author).toBe('Michael E. Porter');
    expect(f.source.url).toMatch(/^https?:\/\//);
    expect(f.source.kind).toBe('web_article');
    expect(f.source.raw_text.length).toBeGreaterThan(200);
  });

  it('has 6-8 claims with varied kind and confidence ∈ [0.4, 0.85] (D-11)', () => {
    expect(f.claims.length).toBeGreaterThanOrEqual(6);
    expect(f.claims.length).toBeLessThanOrEqual(8);
    const kinds = new Set(f.claims.map((c) => c.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(2); // varied
    for (const c of f.claims) {
      expect(c.confidence).toBeGreaterThanOrEqual(0.4);
      expect(c.confidence).toBeLessThanOrEqual(0.85);
      expect(c.text.length).toBeGreaterThanOrEqual(20);
      expect(c.created_by).toBe('cli-fixture');
      expect(c.localId).toMatch(/^claim-/);
    }
  });

  it('every claim has at least one cites_source edge (D-11)', () => {
    const citingClaimIds = new Set(
      f.edges.filter((e) => e.kind === 'cites_source').map((e) => e.fromLocalId),
    );
    for (const c of f.claims) {
      expect(citingClaimIds.has(c.localId)).toBe(true);
    }
  });

  it('has exactly 1 contradicts edge between two claims (D-11, CRIT-05 keystone)', () => {
    const contradicts = f.edges.filter((e) => e.kind === 'contradicts');
    expect(contradicts).toHaveLength(1);
    expect(contradicts[0].toLocalRef.kind).toBe('claim');
    // The two endpoints must be different claims that exist in f.claims
    const fromExists = f.claims.some((c) => c.localId === contradicts[0].fromLocalId);
    const toExists = f.claims.some(
      (c) => c.localId === contradicts[0].toLocalRef.localId,
    );
    expect(fromExists).toBe(true);
    expect(toExists).toBe(true);
    expect(contradicts[0].fromLocalId).not.toBe(contradicts[0].toLocalRef.localId);
  });

  it('has 2-3 entities + at least 1 about_entity edge (D-11)', () => {
    expect(f.entities.length).toBeGreaterThanOrEqual(2);
    expect(f.entities.length).toBeLessThanOrEqual(3);
    const aboutEntity = f.edges.filter((e) => e.kind === 'about_entity');
    expect(aboutEntity.length).toBeGreaterThanOrEqual(1);
  });

  it('claim topic_tags include "strategy" and "positioning" (D-09 mapping)', () => {
    const allTags = new Set(f.claims.flatMap((c) => c.topic_tags ?? []));
    expect(allTags.has('strategy')).toBe(true);
    expect(allTags.has('positioning')).toBe(true);
  });

  it('claim framework_tags include "porter-five-forces" and "value-chain" (D-09 mapping)', () => {
    const allTags = new Set(f.claims.flatMap((c) => c.framework_tags ?? []));
    expect(allTags.has('porter-five-forces')).toBe(true);
    expect(allTags.has('value-chain')).toBe(true);
  });

  it('all edge fromLocalIds reference existing claims (referential integrity)', () => {
    const claimIds = new Set(f.claims.map((c) => c.localId));
    for (const e of f.edges) {
      expect(claimIds.has(e.fromLocalId)).toBe(true);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { canonicalizeTag } from '@/lib/tag-canonicalize';

describe('canonicalizeTag (DATA-10)', () => {
  it('lowercases', () => {
    expect(canonicalizeTag('SWOT')).toBe('swot');
  });
  it('replaces spaces with dashes', () => {
    expect(canonicalizeTag('Pricing Strategy')).toBe('pricing-strategy');
  });
  it('replaces dots with dashes', () => {
    expect(canonicalizeTag('SWOT.Weakness')).toBe('swot-weakness');
  });
  it('strips leading/trailing dashes', () => {
    expect(canonicalizeTag('--foo--')).toBe('foo');
  });
  it('collapses multiple dashes', () => {
    expect(canonicalizeTag('a---b')).toBe('a-b');
  });
  it('handles ampersands', () => {
    expect(canonicalizeTag('R&D')).toBe('r-d');
  });
  it('handles unicode by stripping', () => {
    expect(canonicalizeTag('café')).toBe('caf');
  });
  // WARNING 1 regression test — locks the behavior the fixture (Plan 05) depends on.
  // The Porter fixture uses framework_tags including "Porter's 5 Forces"; if the
  // canonicalizer ever changes how it handles apostrophes, the fixture's
  // expected post-canonicalization tag breaks silently. Pin it here.
  it('handles apostrophes (regression: fixture canonicalization path)', () => {
    expect(canonicalizeTag("Porter's 5 Forces")).toBe('porter-s-5-forces');
  });
});

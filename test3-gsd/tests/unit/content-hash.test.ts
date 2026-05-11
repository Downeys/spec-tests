import { describe, it, expect } from 'vitest';
import { hashCanonical, hashRawText } from '@/lib/hash';

describe('hashCanonical (COMP-07, D-18)', () => {
  it('returns sha256-prefixed string', () => {
    const h = hashCanonical({ a: 1 }, 'body');
    expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is stable across calls with same input', () => {
    const h1 = hashCanonical({ a: 1, b: 2 }, 'body');
    const h2 = hashCanonical({ a: 1, b: 2 }, 'body');
    expect(h1).toBe(h2);
  });

  it('ignores generated_at (D-18)', () => {
    const h1 = hashCanonical({ a: 1, generated_at: '2026-01-01T00:00:00Z' }, 'body');
    const h2 = hashCanonical({ a: 1, generated_at: '2027-12-31T23:59:59Z' }, 'body');
    expect(h1).toBe(h2);
  });

  it('ignores compile_run_id (D-18)', () => {
    const h1 = hashCanonical({ a: 1, compile_run_id: 'run-1' }, 'body');
    const h2 = hashCanonical({ a: 1, compile_run_id: 'run-2' }, 'body');
    expect(h1).toBe(h2);
  });

  it('ignores content_hash itself (avoids self-reference)', () => {
    const h1 = hashCanonical({ a: 1, content_hash: 'sha256:old' }, 'body');
    const h2 = hashCanonical({ a: 1, content_hash: 'sha256:new' }, 'body');
    expect(h1).toBe(h2);
  });

  it('is invariant to frontmatter key order', () => {
    const h1 = hashCanonical({ b: 2, a: 1 }, 'body');
    const h2 = hashCanonical({ a: 1, b: 2 }, 'body');
    expect(h1).toBe(h2);
  });

  it('changes when body changes', () => {
    const h1 = hashCanonical({ a: 1 }, 'body one');
    const h2 = hashCanonical({ a: 1 }, 'body two');
    expect(h1).not.toBe(h2);
  });

  it('changes when non-volatile frontmatter changes', () => {
    const h1 = hashCanonical({ a: 1 }, 'body');
    const h2 = hashCanonical({ a: 2 }, 'body');
    expect(h1).not.toBe(h2);
  });

  it('trims trailing whitespace from body for hash stability', () => {
    const h1 = hashCanonical({ a: 1 }, 'body');
    const h2 = hashCanonical({ a: 1 }, 'body\n');
    expect(h1).toBe(h2);
  });
});

describe('hashRawText (D-04 dedupe)', () => {
  it('produces stable hex hash', () => {
    const h = hashRawText('hello world');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(hashRawText('hello world'));
  });
  it('different inputs → different hashes', () => {
    expect(hashRawText('a')).not.toBe(hashRawText('b'));
  });
});

import { describe, it, expect } from 'vitest';
import { anySignal } from './abort-signal-any';

describe('anySignal', () => {
  it('aborts when any input signal aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const merged = anySignal([a.signal, b.signal]);
    expect(merged.aborted).toBe(false);
    b.abort();
    expect(merged.aborted).toBe(true);
  });

  it('returns an already-aborted signal when one input was pre-aborted', () => {
    const a = new AbortController();
    a.abort();
    const b = new AbortController();
    const merged = anySignal([a.signal, b.signal]);
    expect(merged.aborted).toBe(true);
  });
});

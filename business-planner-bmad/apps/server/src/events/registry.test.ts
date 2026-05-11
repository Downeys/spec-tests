import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SseHandle } from './emit.js';
import { createSseRegistry, type SseRegistryEntry } from './registry.js';

function fakeEntry(): { entry: SseRegistryEntry; closed: () => boolean; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const handle: SseHandle = {
    emit: vi.fn(),
    emitComment: vi.fn(),
    close,
    get isClosed() {
      return close.mock.calls.length > 0;
    },
  };
  const entry: SseRegistryEntry = {
    handle,
    abortController: new AbortController(),
    createdAt: Date.now(),
  };
  return { entry, closed: () => close.mock.calls.length > 0, close };
}

describe('sseRegistry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('register then consume returns the entry', () => {
    const registry = createSseRegistry();
    const { entry } = fakeEntry();
    registry.register('tok-1', entry);
    expect(registry.size()).toBe(1);
    const consumed = registry.consume('tok-1');
    expect(consumed).toBe(entry);
    expect(registry.size()).toBe(0);
  });

  it('second consume returns null (single-use)', () => {
    const registry = createSseRegistry();
    const { entry } = fakeEntry();
    registry.register('tok-2', entry);
    expect(registry.consume('tok-2')).toBe(entry);
    expect(registry.consume('tok-2')).toBeNull();
  });

  it('consume returns null for unknown token', () => {
    const registry = createSseRegistry();
    expect(registry.consume('missing')).toBeNull();
  });

  it('register throws if the token is already registered', () => {
    const registry = createSseRegistry();
    const a = fakeEntry();
    const b = fakeEntry();
    registry.register('tok-3', a.entry);
    expect(() => {
      registry.register('tok-3', b.entry);
    }).toThrow(/already registered/);
  });

  it('TTL expiry closes handle and deletes entry', () => {
    vi.useFakeTimers();
    const registry = createSseRegistry({ ttlMs: 30_000 });
    const { entry, closed } = fakeEntry();
    registry.register('tok-4', entry);

    vi.advanceTimersByTime(29_999);
    expect(closed()).toBe(false);
    expect(registry.size()).toBe(1);

    vi.advanceTimersByTime(2);
    expect(closed()).toBe(true);
    expect(registry.size()).toBe(0);
    expect(registry.consume('tok-4')).toBeNull();
  });

  it('consume before TTL cancels the expiry timer (handle not auto-closed)', () => {
    vi.useFakeTimers();
    const registry = createSseRegistry({ ttlMs: 30_000 });
    const { entry, closed } = fakeEntry();
    registry.register('tok-5', entry);

    const consumed = registry.consume('tok-5');
    expect(consumed).toBe(entry);

    vi.advanceTimersByTime(60_000);
    // Registry no longer owns lifecycle; the consumer is responsible for closing.
    expect(closed()).toBe(false);
  });

  it('cancel removes the entry without closing the handle', () => {
    vi.useFakeTimers();
    const registry = createSseRegistry({ ttlMs: 30_000 });
    const { entry, closed } = fakeEntry();
    registry.register('tok-6', entry);
    registry.cancel('tok-6');
    expect(registry.size()).toBe(0);
    expect(registry.consume('tok-6')).toBeNull();

    vi.advanceTimersByTime(60_000);
    expect(closed()).toBe(false);
  });

  it('shutdown clears all entries and pending timers', () => {
    vi.useFakeTimers();
    const registry = createSseRegistry({ ttlMs: 30_000 });
    const a = fakeEntry();
    const b = fakeEntry();
    registry.register('a', a.entry);
    registry.register('b', b.entry);
    expect(registry.size()).toBe(2);

    registry.shutdown();
    expect(registry.size()).toBe(0);

    vi.advanceTimersByTime(60_000);
    expect(a.closed()).toBe(false);
    expect(b.closed()).toBe(false);
  });
});

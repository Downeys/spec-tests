import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, err } from '@bp-agent/domain';
import { useStrategies } from './useStrategies';
import { createStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import { createFakeApiClient, createDeferredClient } from './test-utils';

describe('useStrategies', () => {
  it('refetches when the event bus dispatches strategies-changed', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setListStrategies(ok([{ name: 'alpha', status: 'active', isActive: true }]));

    const { result } = renderHook(() => useStrategies({ client: fake, all: false, eventBus: bus }));
    await waitFor(() => {
      expect(result.current.data?.[0]?.name).toBe('alpha');
    });
    expect(fake.calls.filter((c) => c.method === 'listStrategies')).toHaveLength(1);

    fake.setListStrategies(ok([{ name: 'beta', status: 'active', isActive: false }]));
    act(() => {
      bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
    });
    await waitFor(() => {
      expect(result.current.data?.[0]?.name).toBe('beta');
    });
    expect(fake.calls.filter((c) => c.method === 'listStrategies')).toHaveLength(2);
  });

  it('unsubscribes its bus listener on unmount', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setListStrategies(ok([]));

    const { unmount } = renderHook(() =>
      useStrategies({ client: fake, all: false, eventBus: bus }),
    );
    await waitFor(() => {
      expect(fake.calls.filter((c) => c.method === 'listStrategies').length).toBeGreaterThanOrEqual(
        1,
      );
    });
    const before = fake.calls.filter((c) => c.method === 'listStrategies').length;

    unmount();
    bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
    // give microtasks a tick to settle
    await Promise.resolve();
    await Promise.resolve();
    const after = fake.calls.filter((c) => c.method === 'listStrategies').length;
    expect(after).toBe(before);
  });

  it('aborts a prior in-flight request when a fresh dispatch supersedes it', async () => {
    const deferred = createDeferredClient();
    const bus = createStrategiesEventBus();

    renderHook(() => useStrategies({ client: deferred.client, all: false, eventBus: bus }));

    await waitFor(() => {
      expect(deferred.listCalls).toHaveLength(1);
    });
    const firstSignal = deferred.listCalls[0]?.signal;
    expect(firstSignal).toBeDefined();
    expect(firstSignal?.aborted).toBe(false);

    act(() => {
      bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
    });

    await waitFor(() => {
      expect(deferred.listCalls).toHaveLength(2);
    });
    expect(firstSignal?.aborted).toBe(true);
  });

  it('does not write hook state for a superseded (aborted) refetch', async () => {
    const deferred = createDeferredClient();
    const bus = createStrategiesEventBus();

    const { result } = renderHook(() =>
      useStrategies({ client: deferred.client, all: false, eventBus: bus }),
    );
    await waitFor(() => {
      expect(deferred.listCalls).toHaveLength(1);
    });
    expect(result.current.data).toBeNull();

    // Dispatch a second fetch BEFORE resolving the first.
    act(() => {
      bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
    });
    await waitFor(() => {
      expect(deferred.listCalls).toHaveLength(2);
    });

    // Now resolve the FIRST (stale) request after it was aborted.
    await act(async () => {
      deferred.resolveList(ok([{ name: 'stale', status: 'active', isActive: false }]));
      await Promise.resolve();
    });
    expect(result.current.data).toBeNull();

    // Resolve the second (current) request — this one should land in state.
    await act(async () => {
      deferred.resolveList(ok([{ name: 'fresh', status: 'active', isActive: true }]));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.data?.[0]?.name).toBe('fresh');
    });
  });

  it('refetch() aborts the prior in-flight request', async () => {
    const deferred = createDeferredClient();
    const bus = createStrategiesEventBus();

    const { result } = renderHook(() =>
      useStrategies({ client: deferred.client, all: false, eventBus: bus }),
    );
    await waitFor(() => {
      expect(deferred.listCalls).toHaveLength(1);
    });
    const firstSignal = deferred.listCalls[0]?.signal;
    expect(firstSignal?.aborted).toBe(false);

    act(() => {
      result.current.refetch();
    });
    await waitFor(() => {
      expect(deferred.listCalls).toHaveLength(2);
    });
    expect(firstSignal?.aborted).toBe(true);
  });

  it('records error result into state on error', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setListStrategies(err({ tag: 'RepositoryError' }));
    const { result } = renderHook(() => useStrategies({ client: fake, all: false, eventBus: bus }));
    await waitFor(() => {
      expect(result.current.error?.tag).toBe('RepositoryError');
    });
    expect(result.current.data).toBeNull();
  });
});

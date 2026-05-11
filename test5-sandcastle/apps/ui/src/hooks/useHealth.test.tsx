import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok } from '@bp-agent/domain';
import { useHealth } from './useHealth';
import { createStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import { createFakeApiClient, createDeferredClient } from './test-utils';

describe('useHealth', () => {
  it('refetches when the event bus dispatches strategies-changed', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setHealth(ok({ status: 'ok', activeStrategy: 'alpha' }));

    const { result } = renderHook(() => useHealth({ client: fake, eventBus: bus }));
    await waitFor(() => {
      expect(result.current.activeStrategy).toBe('alpha');
    });
    const before = fake.calls.filter((c) => c.method === 'getHealth').length;

    fake.setHealth(ok({ status: 'ok', activeStrategy: 'bravo' }));
    act(() => {
      bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
    });
    await waitFor(() => {
      expect(result.current.activeStrategy).toBe('bravo');
    });
    expect(fake.calls.filter((c) => c.method === 'getHealth').length).toBeGreaterThan(before);
  });

  it('unsubscribes its bus listener on unmount', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setHealth(ok({ status: 'ok', activeStrategy: null }));

    const { unmount } = renderHook(() => useHealth({ client: fake, eventBus: bus }));
    await waitFor(() => {
      expect(fake.calls.filter((c) => c.method === 'getHealth').length).toBeGreaterThanOrEqual(1);
    });
    unmount();
    const before = fake.calls.filter((c) => c.method === 'getHealth').length;
    bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.calls.filter((c) => c.method === 'getHealth').length).toBe(before);
  });

  it('aborts a prior in-flight request when a fresh dispatch supersedes it', async () => {
    const deferred = createDeferredClient();
    const bus = createStrategiesEventBus();

    renderHook(() => useHealth({ client: deferred.client, eventBus: bus }));
    await waitFor(() => {
      expect(deferred.healthCalls.length).toBeGreaterThanOrEqual(1);
    });
    const firstSignal = deferred.healthCalls[0]?.signal;
    expect(firstSignal?.aborted).toBe(false);

    act(() => {
      bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
    });
    await waitFor(() => {
      expect(deferred.healthCalls.length).toBeGreaterThanOrEqual(2);
    });
    expect(firstSignal?.aborted).toBe(true);
  });

  it('does not write hook state for a superseded (aborted) refetch', async () => {
    const deferred = createDeferredClient();
    const bus = createStrategiesEventBus();

    const { result } = renderHook(() => useHealth({ client: deferred.client, eventBus: bus }));
    await waitFor(() => {
      expect(deferred.healthCalls.length).toBeGreaterThanOrEqual(1);
    });

    act(() => {
      bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
    });
    await waitFor(() => {
      expect(deferred.healthCalls.length).toBeGreaterThanOrEqual(2);
    });

    await act(async () => {
      deferred.resolveHealth(ok({ status: 'ok', activeStrategy: 'stale' }));
      await Promise.resolve();
    });
    expect(result.current.activeStrategy).toBeNull();

    await act(async () => {
      deferred.resolveHealth(ok({ status: 'ok', activeStrategy: 'fresh' }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.activeStrategy).toBe('fresh');
    });
  });
});

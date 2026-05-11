import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, err, isOk, isErr } from '@bp-agent/domain';
import { useArchiveStrategy } from './useArchiveStrategy';
import { createStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import { createFakeApiClient } from './test-utils';

describe('useArchiveStrategy', () => {
  it('dispatches strategies-changed on success', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setArchiveStrategy(ok({ name: 'bravo', status: 'archived' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useArchiveStrategy({ client: fake, eventBus: bus }));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({ name: 'bravo' });
    });
    expect(isOk(returned as never)).toBe(true);
    expect(fired).toBe(1);
    expect(fake.calls).toContainEqual({
      method: 'archiveStrategy',
      args: { name: 'bravo', reason: undefined },
      signal: undefined,
    });
    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
  });

  it('forwards reason through to the client', async () => {
    const fake = createFakeApiClient();
    fake.setArchiveStrategy(ok({ name: 'bravo', status: 'archived' }));

    const { result } = renderHook(() => useArchiveStrategy({ client: fake }));

    await act(async () => {
      await result.current.run({ name: 'bravo', reason: 'pivoting' });
    });
    expect(fake.calls).toContainEqual({
      method: 'archiveStrategy',
      args: { name: 'bravo', reason: 'pivoting' },
      signal: undefined,
    });
  });

  it('records CannotArchiveActive error and does NOT dispatch', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setArchiveStrategy(err({ tag: 'CannotArchiveActive' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useArchiveStrategy({ client: fake, eventBus: bus }));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({ name: 'alpha' });
    });
    expect(isErr(returned as never)).toBe(true);
    expect(fired).toBe(0);
    expect(result.current.error?.tag).toBe('CannotArchiveActive');
  });

  it('on StrategyNotFound, records error AND dispatches strategies-changed (self-heal)', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setArchiveStrategy(err({ tag: 'StrategyNotFound' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useArchiveStrategy({ client: fake, eventBus: bus }));

    await act(async () => {
      await result.current.run({ name: 'ghost' });
    });
    expect(fired).toBe(1);
    expect(result.current.error?.tag).toBe('StrategyNotFound');
  });
});

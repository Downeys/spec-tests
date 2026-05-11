import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, err, isOk, isErr } from '@bp-agent/domain';
import { useSwitchActiveStrategy } from './useSwitchActiveStrategy';
import { createStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import { createFakeApiClient } from './test-utils';

describe('useSwitchActiveStrategy', () => {
  it('dispatches strategies-changed on success', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setSwitchActiveStrategy(ok({ name: 'bravo' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useSwitchActiveStrategy({ client: fake, eventBus: bus }));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({ name: 'bravo' });
    });
    expect(isOk(returned as never)).toBe(true);
    expect(fired).toBe(1);
    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
  });

  it('on StrategyNotFound, records error AND dispatches strategies-changed (self-heal)', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setSwitchActiveStrategy(err({ tag: 'StrategyNotFound' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useSwitchActiveStrategy({ client: fake, eventBus: bus }));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({ name: 'ghost' });
    });
    expect(isErr(returned as never)).toBe(true);
    expect(fired).toBe(1);
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error?.tag).toBe('StrategyNotFound');
  });

  it('on StrategyIsArchived, records error and does NOT dispatch', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setSwitchActiveStrategy(err({ tag: 'StrategyIsArchived' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useSwitchActiveStrategy({ client: fake, eventBus: bus }));

    await act(async () => {
      await result.current.run({ name: 'old' });
    });
    expect(fired).toBe(0);
    expect(result.current.error?.tag).toBe('StrategyIsArchived');
  });
});

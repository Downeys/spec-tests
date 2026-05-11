import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, err, isOk, isErr } from '@bp-agent/domain';
import { useRenameStrategy } from './useRenameStrategy';
import { createStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import { createFakeApiClient } from './test-utils';

describe('useRenameStrategy', () => {
  it('dispatches strategies-changed on success', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setRenameStrategy(ok({ name: 'gamma2', status: 'active' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useRenameStrategy({ client: fake, eventBus: bus }));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({ name: 'gamma', newName: 'gamma2' });
    });
    expect(isOk(returned as never)).toBe(true);
    expect(fired).toBe(1);
    expect(fake.calls).toContainEqual({
      method: 'renameStrategy',
      args: { name: 'gamma', newName: 'gamma2' },
      signal: undefined,
    });
    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
    expect(result.current.error).toBeNull();
  });

  it('records error and does NOT dispatch on NameInvalid', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setRenameStrategy(err({ tag: 'NameInvalid' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useRenameStrategy({ client: fake, eventBus: bus }));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({ name: 'gamma', newName: '' });
    });
    expect(isErr(returned as never)).toBe(true);
    expect(fired).toBe(0);
    expect(result.current.error?.tag).toBe('NameInvalid');
  });

  it('on StrategyNotFound, records error AND dispatches strategies-changed (self-heal)', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setRenameStrategy(err({ tag: 'StrategyNotFound' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useRenameStrategy({ client: fake, eventBus: bus }));

    await act(async () => {
      await result.current.run({ name: 'ghost', newName: 'ghost2' });
    });
    expect(fired).toBe(1);
    expect(result.current.error?.tag).toBe('StrategyNotFound');
  });
});

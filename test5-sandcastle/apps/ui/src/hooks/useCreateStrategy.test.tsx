import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, err, isOk, isErr } from '@bp-agent/domain';
import { useCreateStrategy } from './useCreateStrategy';
import { createStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import { createFakeApiClient } from './test-utils';

describe('useCreateStrategy', () => {
  it('dispatches strategies-changed on success', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setCreateStrategy(ok({ name: 'gamma', status: 'active', isActive: true }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useCreateStrategy({ client: fake, eventBus: bus }));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({ name: 'gamma' });
    });
    expect(isOk(returned as never)).toBe(true);
    expect(fired).toBe(1);
    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });
    expect(result.current.error).toBeNull();
  });

  it('records error and does NOT dispatch on failure', async () => {
    const fake = createFakeApiClient();
    const bus = createStrategiesEventBus();
    fake.setCreateStrategy(err({ tag: 'NameInvalid' }));

    let fired = 0;
    bus.addEventListener(STRATEGIES_CHANGED, () => {
      fired += 1;
    });

    const { result } = renderHook(() => useCreateStrategy({ client: fake, eventBus: bus }));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run({ name: '' });
    });
    expect(isErr(returned as never)).toBe(true);
    expect(fired).toBe(0);
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error?.tag).toBe('NameInvalid');
  });
});

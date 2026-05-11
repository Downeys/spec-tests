import { useCallback, useRef, useState } from 'react';
import { isOk, type Result } from '@bp-agent/domain';
import type { ApiClient, ApiError, SwitchActiveStrategyResponse } from '../api-client';
import { defaultStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import type { MutationStatus } from './useCreateStrategy';

export interface UseSwitchActiveStrategyArgs {
  client: ApiClient;
  eventBus?: EventTarget;
}

export interface UseSwitchActiveStrategyResult {
  status: MutationStatus;
  error: ApiError | null;
  run: (args: {
    name: string;
  }) => Promise<Result<SwitchActiveStrategyResponse['strategy'], ApiError>>;
  reset: () => void;
}

export function useSwitchActiveStrategy({
  client,
  eventBus,
}: UseSwitchActiveStrategyArgs): UseSwitchActiveStrategyResult {
  const [status, setStatus] = useState<MutationStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const mountedRef = useRef(true);
  const bus = eventBus ?? defaultStrategiesEventBus;

  const run = useCallback(
    async ({
      name,
    }: {
      name: string;
    }): Promise<Result<SwitchActiveStrategyResponse['strategy'], ApiError>> => {
      setStatus('pending');
      setError(null);
      const result = await client.switchActiveStrategy({ name });
      if (!mountedRef.current) return result;
      if (isOk(result)) {
        setStatus('success');
        setError(null);
        bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
      } else {
        setStatus('error');
        setError(result.error);
        // Stale-list self-heal: if the row was deleted/archived under us,
        // dispatch a refresh so the list refetches and removes the row.
        if (result.error.tag === 'StrategyNotFound') {
          bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
        }
      }
      return result;
    },
    [client, bus],
  );

  const reset = useCallback((): void => {
    setStatus('idle');
    setError(null);
  }, []);

  return { run, status, error, reset };
}

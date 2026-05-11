import { useCallback, useRef, useState } from 'react';
import { isOk, type Result } from '@bp-agent/domain';
import type { ApiClient, ApiError, CreateStrategyResponse } from '../api-client';
import { defaultStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';

export type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

export interface UseCreateStrategyArgs {
  client: ApiClient;
  eventBus?: EventTarget;
}

export interface UseCreateStrategyResult {
  status: MutationStatus;
  error: ApiError | null;
  run: (args: { name: string }) => Promise<Result<CreateStrategyResponse['strategy'], ApiError>>;
  reset: () => void;
}

export function useCreateStrategy({
  client,
  eventBus,
}: UseCreateStrategyArgs): UseCreateStrategyResult {
  const [status, setStatus] = useState<MutationStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const mountedRef = useRef(true);
  const bus = eventBus ?? defaultStrategiesEventBus;

  const run = useCallback(
    async ({
      name,
    }: {
      name: string;
    }): Promise<Result<CreateStrategyResponse['strategy'], ApiError>> => {
      setStatus('pending');
      setError(null);
      const result = await client.createStrategy({ name });
      if (!mountedRef.current) return result;
      if (isOk(result)) {
        setStatus('success');
        setError(null);
        bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
      } else {
        setStatus('error');
        setError(result.error);
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

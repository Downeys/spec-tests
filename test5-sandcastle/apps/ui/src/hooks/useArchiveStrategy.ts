import { useCallback, useRef, useState } from 'react';
import { isOk, type Result } from '@bp-agent/domain';
import type { ApiClient, ApiError, PatchStrategyResponse } from '../api-client';
import { defaultStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import type { MutationStatus } from './useCreateStrategy';

export interface UseArchiveStrategyArgs {
  client: ApiClient;
  eventBus?: EventTarget;
}

export interface UseArchiveStrategyResult {
  status: MutationStatus;
  error: ApiError | null;
  run: (args: {
    name: string;
    reason?: string;
  }) => Promise<Result<PatchStrategyResponse['strategy'], ApiError>>;
  reset: () => void;
}

export function useArchiveStrategy({
  client,
  eventBus,
}: UseArchiveStrategyArgs): UseArchiveStrategyResult {
  const [status, setStatus] = useState<MutationStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const mountedRef = useRef(true);
  const bus = eventBus ?? defaultStrategiesEventBus;

  const run = useCallback(
    async ({
      name,
      reason,
    }: {
      name: string;
      reason?: string;
    }): Promise<Result<PatchStrategyResponse['strategy'], ApiError>> => {
      setStatus('pending');
      setError(null);
      const result = await client.archiveStrategy(
        reason === undefined ? { name } : { name, reason },
      );
      if (!mountedRef.current) return result;
      if (isOk(result)) {
        setStatus('success');
        setError(null);
        bus.dispatchEvent(new Event(STRATEGIES_CHANGED));
      } else {
        setStatus('error');
        setError(result.error);
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

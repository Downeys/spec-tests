import { useCallback, useRef, useState } from 'react';
import { isOk, type Result } from '@bp-agent/domain';
import type { ApiClient, ApiError, PatchStrategyResponse } from '../api-client';
import { defaultStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';
import type { MutationStatus } from './useCreateStrategy';

export interface UseRenameStrategyArgs {
  client: ApiClient;
  eventBus?: EventTarget;
}

export interface UseRenameStrategyResult {
  status: MutationStatus;
  error: ApiError | null;
  run: (args: {
    name: string;
    newName: string;
  }) => Promise<Result<PatchStrategyResponse['strategy'], ApiError>>;
  reset: () => void;
}

export function useRenameStrategy({
  client,
  eventBus,
}: UseRenameStrategyArgs): UseRenameStrategyResult {
  const [status, setStatus] = useState<MutationStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const mountedRef = useRef(true);
  const bus = eventBus ?? defaultStrategiesEventBus;

  const run = useCallback(
    async ({
      name,
      newName,
    }: {
      name: string;
      newName: string;
    }): Promise<Result<PatchStrategyResponse['strategy'], ApiError>> => {
      setStatus('pending');
      setError(null);
      const result = await client.renameStrategy({ name, newName });
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

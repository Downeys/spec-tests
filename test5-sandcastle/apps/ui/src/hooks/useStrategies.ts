import { useCallback, useEffect, useRef, useState } from 'react';
import { isOk } from '@bp-agent/domain';
import type { ApiClient, ApiError, StrategyListItem } from '../api-client';
import { defaultStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';

export interface UseStrategiesArgs {
  client: ApiClient;
  all: boolean;
  eventBus?: EventTarget;
}

export interface UseStrategiesResult {
  data: readonly StrategyListItem[] | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

export function useStrategies({ client, all, eventBus }: UseStrategiesArgs): UseStrategiesResult {
  const [data, setData] = useState<readonly StrategyListItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const inflightRef = useRef<AbortController | null>(null);
  const bus = eventBus ?? defaultStrategiesEventBus;

  const fetchOnce = useCallback(async (): Promise<void> => {
    inflightRef.current?.abort();
    const ctl = new AbortController();
    inflightRef.current = ctl;
    setLoading(true);
    const result = await client.listStrategies({ all, signal: ctl.signal });
    if (!mountedRef.current || ctl.signal.aborted) return;
    if (isOk(result)) {
      setData(result.value);
      setError(null);
    } else {
      setData(null);
      setError(result.error);
    }
    setLoading(false);
  }, [client, all]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchOnce();

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void fetchOnce();
      }
    };
    const onStrategiesChanged = (): void => {
      void fetchOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);
    bus.addEventListener(STRATEGIES_CHANGED, onStrategiesChanged);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      bus.removeEventListener(STRATEGIES_CHANGED, onStrategiesChanged);
      inflightRef.current?.abort();
    };
  }, [fetchOnce, bus]);

  const refetch = useCallback((): void => {
    void fetchOnce();
  }, [fetchOnce]);

  return { data, error, loading, refetch };
}

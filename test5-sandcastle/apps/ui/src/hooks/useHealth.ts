import { useCallback, useEffect, useRef, useState } from 'react';
import { isOk } from '@bp-agent/domain';
import type { ApiClient, ApiError, HealthResponse } from '../api-client';
import { defaultStrategiesEventBus, STRATEGIES_CHANGED } from './strategies-event-bus';

const POLL_INTERVAL_MS = 10_000;

export interface HealthSnapshot {
  status: 'ok' | 'unreachable';
  activeStrategy: string | null;
  lastCheckedAt: Date | null;
  error: ApiError | null;
}

const INITIAL: HealthSnapshot = {
  status: 'unreachable',
  activeStrategy: null,
  lastCheckedAt: null,
  error: null,
};

export interface UseHealthArgs {
  client: ApiClient;
  eventBus?: EventTarget;
}

export function useHealth({ client, eventBus }: UseHealthArgs): HealthSnapshot {
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(INITIAL);
  const mountedRef = useRef(true);
  const inflightRef = useRef<AbortController | null>(null);
  const bus = eventBus ?? defaultStrategiesEventBus;

  const fetchOnce = useCallback(async (): Promise<void> => {
    inflightRef.current?.abort();
    const ctl = new AbortController();
    inflightRef.current = ctl;
    const result = await client.getHealth({ signal: ctl.signal });
    if (!mountedRef.current || ctl.signal.aborted) return;
    const now = new Date();
    if (isOk(result)) {
      const r: HealthResponse = result.value;
      setSnapshot({
        status: 'ok',
        activeStrategy: r.activeStrategy,
        lastCheckedAt: now,
        error: null,
      });
    } else {
      setSnapshot({
        status: 'unreachable',
        activeStrategy: null,
        lastCheckedAt: now,
        error: result.error,
      });
    }
  }, [client]);

  useEffect(() => {
    mountedRef.current = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = (): void => {
      if (intervalId !== null) return;
      void fetchOnce();
      intervalId = setInterval(() => {
        void fetchOnce();
      }, POLL_INTERVAL_MS);
    };

    const stop = (): void => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        stop();
      }
    };
    const onStrategiesChanged = (): void => {
      void fetchOnce();
    };

    if (document.visibilityState === 'visible') {
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);
    bus.addEventListener(STRATEGIES_CHANGED, onStrategiesChanged);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      bus.removeEventListener(STRATEGIES_CHANGED, onStrategiesChanged);
      stop();
      inflightRef.current?.abort();
    };
  }, [fetchOnce, bus]);

  return snapshot;
}

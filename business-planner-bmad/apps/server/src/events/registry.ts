import type { SseHandle } from './emit.js';
import { AppError } from '../errors/AppError.js';

export interface SseRegistryEntry {
  handle: SseHandle;
  abortController: AbortController;
  createdAt: number;
}

export interface SseRegistry {
  register: (token: string, entry: SseRegistryEntry) => void;
  consume: (token: string) => SseRegistryEntry | null;
  cancel: (token: string) => void;
  size: () => number;
  shutdown: () => void;
}

export interface SseRegistryOptions {
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 30_000;

export function createSseRegistry(opts: SseRegistryOptions = {}): SseRegistry {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const entries = new Map<string, SseRegistryEntry>();
  const timers = new Map<string, NodeJS.Timeout>();

  function clearTimer(token: string): void {
    const t = timers.get(token);
    if (t) {
      clearTimeout(t);
      timers.delete(token);
    }
  }

  function expire(token: string): void {
    const entry = entries.get(token);
    if (!entry) return;
    entries.delete(token);
    timers.delete(token);
    try {
      entry.handle.close();
    } catch {
      /* swallow — already-closed is fine */
    }
  }

  return {
    register(token, entry): void {
      if (entries.has(token)) {
        throw new AppError('invalid_input', `sse token already registered: ${token}`, {
          status: 400,
        });
      }
      entries.set(token, entry);
      const timer = setTimeout(() => {
        expire(token);
      }, ttlMs);
      // allow the process to exit even if the timer is still pending
      if (typeof timer.unref === 'function') timer.unref();
      timers.set(token, timer);
    },

    consume(token): SseRegistryEntry | null {
      const entry = entries.get(token);
      if (!entry) return null;
      entries.delete(token);
      clearTimer(token);
      return entry;
    },

    cancel(token): void {
      if (!entries.has(token)) return;
      entries.delete(token);
      clearTimer(token);
    },

    size(): number {
      return entries.size;
    },

    shutdown(): void {
      for (const token of Array.from(timers.keys())) {
        clearTimer(token);
      }
      entries.clear();
    },
  };
}

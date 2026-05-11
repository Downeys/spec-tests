import { describe, it, expect, vi } from 'vitest';
import { ok } from '@bp-agent/domain';
import type { StrategyId } from '@bp-agent/domain';
import type { RuntimeConfig } from '@bp-agent/application';
import type { StrategyRepository } from '@bp-agent/application';
import { createApp } from './server.js';

function stubConfig(activeId: StrategyId | null): RuntimeConfig {
  return {
    getActiveStrategyId: () => Promise.resolve(ok(activeId)),
    setActiveStrategyId: () => Promise.resolve(ok(undefined)),
  };
}

function stubRepo(): StrategyRepository {
  return {
    save: () => Promise.resolve(ok(undefined)),
    loadByName: () => Promise.resolve(ok(null)),
    loadById: () => Promise.resolve(ok(null)),
    listAll: () => Promise.resolve(ok([])),
  };
}

describe('createApp middleware', () => {
  it('logs request method, path, status, and duration', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    await app.request('/api/health');
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/GET\s+\/api\/health\s+200\s+\d+ms/));
    logSpy.mockRestore();
  });

  it('returns 500 InternalError for unhandled errors and does not leak a stack', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });

    app.get('/api/explode', () => {
      throw new Error('kaboom');
    });

    const res = await app.request('/api/explode');
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ tag: 'InternalError' });
    expect(JSON.stringify(body)).not.toContain('kaboom');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

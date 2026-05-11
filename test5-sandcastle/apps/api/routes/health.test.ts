import { describe, it, expect, vi } from 'vitest';
import type { StrategyId } from '@bp-agent/domain';
import { createApp } from '../server.js';
import { stubConfig, stubRepo, makeStrategy } from '../test-stubs.js';

const TEST_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' as StrategyId;

describe('GET /api/health', () => {
  it('returns activeStrategy null when no active strategy is set', async () => {
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', activeStrategy: null });
  });

  it('returns the strategy name when an active strategy exists', async () => {
    const strategy = makeStrategy(TEST_ID, 'my-cool-plan');
    const entries = new Map([[TEST_ID, strategy]] as const);
    const app = createApp({ repo: stubRepo(entries), config: stubConfig(TEST_ID) });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', activeStrategy: 'my-cool-plan' });
  });

  it('returns activeStrategy null and logs a warning when active id is dangling', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const app = createApp({ repo: stubRepo(), config: stubConfig(TEST_ID) });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', activeStrategy: null });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(TEST_ID));
    errorSpy.mockRestore();
  });

  it('does not log a warning when no active strategy is set', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const app = createApp({ repo: stubRepo(), config: stubConfig(null) });
    await app.request('/api/health');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

import { describe, it, expect } from 'vitest';
import { switchActiveStrategy } from './switch-active-strategy.js';
import type { SwitchActiveStrategyDeps } from './switch-active-strategy.js';
import type { StrategyRepository } from '../../ports/strategy-repository.js';
import type { RuntimeConfig } from '../../ports/runtime-config.js';
import { Strategy, ok, isOk, isErr } from '@bp-agent/domain';
import type { StrategyId, StrategyName } from '@bp-agent/domain';

function makeRepo(strategies: Strategy[]): StrategyRepository {
  return {
    save: () => Promise.resolve(ok(undefined)),
    loadByName: (name: StrategyName) =>
      Promise.resolve(ok(strategies.find((s) => s.name === name) ?? null)),
    loadById: (id: StrategyId) => Promise.resolve(ok(strategies.find((s) => s.id === id) ?? null)),
    listAll: () => Promise.resolve(ok(strategies)),
  };
}

function makeConfig(
  activeId: StrategyId | null = null,
): RuntimeConfig & { lastSetId: StrategyId | null } {
  const state = { activeId, lastSetId: null as StrategyId | null };
  return {
    get lastSetId() {
      return state.lastSetId;
    },
    getActiveStrategyId: () => Promise.resolve(ok(state.activeId)),
    setActiveStrategyId: (id: StrategyId) => {
      state.activeId = id;
      state.lastSetId = id;
      return Promise.resolve(ok(undefined));
    },
  };
}

describe('switchActiveStrategy', () => {
  it('switches to an existing active strategy', async () => {
    const createResult = Strategy.create('target');
    if (!isOk(createResult)) throw new Error('setup failed');
    const strategy = createResult.value;

    const repo = makeRepo([strategy]);
    const config = makeConfig();
    const deps: SwitchActiveStrategyDeps = { repo, config, rawName: 'target' };

    const result = await switchActiveStrategy(deps);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.name).toBe('target');
    }
    expect(config.lastSetId).toBe(strategy.id);
  });

  it('fails when strategy does not exist', async () => {
    const repo = makeRepo([]);
    const config = makeConfig();
    const deps: SwitchActiveStrategyDeps = { repo, config, rawName: 'nonexistent' };

    const result = await switchActiveStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('StrategyNotFound');
    }
  });

  it('fails when strategy is archived', async () => {
    const archived = Strategy.reconstitute({
      id: '00000000-0000-4000-a000-000000000001' as StrategyId,
      name: 'old-one' as StrategyName,
      status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
      createdAt: new Date('2024-01-01'),
    });

    const repo = makeRepo([archived]);
    const config = makeConfig();
    const deps: SwitchActiveStrategyDeps = { repo, config, rawName: 'old-one' };

    const result = await switchActiveStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('StrategyIsArchived');
    }
  });

  it('fails with NameInvalid for invalid slug', async () => {
    const repo = makeRepo([]);
    const config = makeConfig();
    const deps: SwitchActiveStrategyDeps = { repo, config, rawName: 'BAD NAME' };

    const result = await switchActiveStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('NameInvalid');
    }
  });
});

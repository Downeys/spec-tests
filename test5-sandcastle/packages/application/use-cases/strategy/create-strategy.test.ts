import { describe, it, expect, beforeEach } from 'vitest';
import { createStrategy } from './create-strategy.js';
import type { StrategyRepository } from '../../ports/strategy-repository.js';
import type { RuntimeConfig } from '../../ports/runtime-config.js';
import { ok, isOk, isErr } from '@bp-agent/domain';
import type { Strategy, StrategyName, StrategyId } from '@bp-agent/domain';

function inMemoryRepo(): StrategyRepository {
  const strategies = new Map<string, Strategy>();
  return {
    save(strategy: Strategy) {
      strategies.set(strategy.name, strategy);
      return Promise.resolve(ok(undefined));
    },
    loadByName(name: StrategyName) {
      return Promise.resolve(ok(strategies.get(name) ?? null));
    },
    loadById(id: StrategyId) {
      for (const s of strategies.values()) {
        if (s.id === id) return Promise.resolve(ok(s));
      }
      return Promise.resolve(ok(null));
    },
    listAll() {
      return Promise.resolve(ok([...strategies.values()]));
    },
  };
}

function inMemoryConfig(): RuntimeConfig & { activeId: StrategyId | null } {
  const state = {
    activeId: null as StrategyId | null,
    getActiveStrategyId() {
      return Promise.resolve(ok(state.activeId));
    },
    setActiveStrategyId(id: StrategyId) {
      state.activeId = id;
      return Promise.resolve(ok(undefined));
    },
  };
  return state;
}

describe('CreateStrategy', () => {
  let repo: StrategyRepository;
  let config: ReturnType<typeof inMemoryConfig>;

  beforeEach(() => {
    repo = inMemoryRepo();
    config = inMemoryConfig();
  });

  it('creates a strategy and sets it active on success', async () => {
    const result = await createStrategy({ repo, config, rawName: 'my-first' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.name).toBe('my-first');
      expect(result.value.status).toEqual({ tag: 'active' });
      expect(config.activeId).toBe(result.value.id);
    }
  });

  it('persists the strategy in the repository', async () => {
    const createResult = await createStrategy({ repo, config, rawName: 'persisted' });
    expect(isOk(createResult)).toBe(true);

    const loaded = await repo.loadByName('persisted' as StrategyName);
    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) {
      expect(loaded.value).not.toBeNull();
    }
  });

  it('rejects invalid names', async () => {
    const result = await createStrategy({ repo, config, rawName: 'BAD NAME!' });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('NameInvalid');
    }
  });

  it('rejects duplicate names', async () => {
    const first = await createStrategy({ repo, config, rawName: 'unique-name' });
    expect(isOk(first)).toBe(true);

    const second = await createStrategy({ repo, config, rawName: 'unique-name' });
    expect(isErr(second)).toBe(true);
    if (isErr(second)) {
      expect(second.error.tag).toBe('StrategyAlreadyExists');
    }
  });

  it('does not set active id when name validation fails', async () => {
    await createStrategy({ repo, config, rawName: 'X' });
    expect(config.activeId).toBeNull();
  });
});

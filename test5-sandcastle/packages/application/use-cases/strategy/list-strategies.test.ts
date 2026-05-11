import { describe, it, expect } from 'vitest';
import { listStrategies } from './list-strategies.js';
import type { ListStrategiesDeps } from './list-strategies.js';
import type { StrategyRepository } from '../../ports/strategy-repository.js';
import type { RuntimeConfig } from '../../ports/runtime-config.js';
import { Strategy, ok, isOk } from '@bp-agent/domain';
import type { StrategyId, StrategyName } from '@bp-agent/domain';

function makeRepo(strategies: Strategy[]): StrategyRepository {
  return {
    save: () => Promise.resolve(ok(undefined)),
    loadByName: (name: StrategyName) =>
      Promise.resolve(ok(strategies.find((s) => s.name === name) ?? null)),
    loadById: (id: StrategyId) => Promise.resolve(ok(strategies.find((s) => s.id === id) ?? null)),
    listAll: ({ includeArchived }) =>
      Promise.resolve(ok(includeArchived ? strategies : strategies.filter((s) => !s.isArchived))),
  };
}

function makeConfig(activeId: StrategyId | null = null): RuntimeConfig {
  return {
    getActiveStrategyId: () => Promise.resolve(ok(activeId)),
    setActiveStrategyId: () => Promise.resolve(ok(undefined)),
  };
}

describe('listStrategies', () => {
  it('returns all non-archived strategies with active marker', async () => {
    const r1 = Strategy.create('alpha');
    const r2 = Strategy.create('bravo');
    if (!isOk(r1) || !isOk(r2)) throw new Error('setup failed');

    const repo = makeRepo([r1.value, r2.value]);
    const config = makeConfig(r1.value.id);
    const deps: ListStrategiesDeps = { repo, config, includeArchived: false };

    const result = await listStrategies(deps);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value).toHaveLength(2);
    const alpha = result.value.find((i) => i.name === 'alpha');
    const bravo = result.value.find((i) => i.name === 'bravo');
    expect(alpha?.isActive).toBe(true);
    expect(bravo?.isActive).toBe(false);
  });

  it('excludes archived strategies when includeArchived is false', async () => {
    const r1 = Strategy.create('alive');
    if (!isOk(r1)) throw new Error('setup failed');

    const archived = Strategy.reconstitute({
      id: '00000000-0000-4000-a000-000000000002' as StrategyId,
      name: 'dead' as StrategyName,
      status: { tag: 'archived', archivedAt: new Date() },
      createdAt: new Date(),
    });

    const repo = makeRepo([r1.value, archived]);
    const config = makeConfig(r1.value.id);
    const deps: ListStrategiesDeps = { repo, config, includeArchived: false };

    const result = await listStrategies(deps);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.name).toBe('alive');
  });

  it('includes archived strategies when includeArchived is true', async () => {
    const r1 = Strategy.create('alive');
    if (!isOk(r1)) throw new Error('setup failed');

    const archived = Strategy.reconstitute({
      id: '00000000-0000-4000-a000-000000000003' as StrategyId,
      name: 'dead' as StrategyName,
      status: { tag: 'archived', archivedAt: new Date() },
      createdAt: new Date(),
    });

    const repo = makeRepo([r1.value, archived]);
    const config = makeConfig(r1.value.id);
    const deps: ListStrategiesDeps = { repo, config, includeArchived: true };

    const result = await listStrategies(deps);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value).toHaveLength(2);
    const deadItem = result.value.find((i) => i.name === 'dead');
    expect(deadItem?.status).toBe('archived');
    expect(deadItem?.isActive).toBe(false);
  });

  it('returns empty list when no strategies exist', async () => {
    const repo = makeRepo([]);
    const config = makeConfig();
    const deps: ListStrategiesDeps = { repo, config, includeArchived: false };

    const result = await listStrategies(deps);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toHaveLength(0);
  });
});
